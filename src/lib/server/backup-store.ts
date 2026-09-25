import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import {
  BACKUP_MAX_BYTES,
  type BackupFile,
  type BackupInspection,
  type BackupSummary,
  type RestoreCommand,
  type RestoreResult,
} from "../backup-types.ts";
import {
  applyMigrations,
  openDatabase,
  transaction,
  type DatabaseOptions,
} from "./database.ts";

type StoreOptions = DatabaseOptions & { now?: () => Date };
type SchemaObject = {
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
};
const tables = [
  "schema_migrations",
  "profiles",
  "document_progress",
  "document_notes",
  "learning_events",
  "exercise_attempts",
  "exercise_events",
  "review_elements",
  "review_cards",
  "review_attempts",
  "review_events",
  "language_results",
  "language_saved_references",
  "audio_clips",
  "scene_drafts",
  "scene_attempts",
  "scene_requests",
  "resource_states",
  "resource_requests",
] as const;
const sequenceTables = ["learning_events", "exercise_events", "review_events"];
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const digest = /^[0-9a-f]{64}$/;
const generationPattern = /^[0-9a-f]{32}$/;
const inspectionLifetime = 60 * 60 * 1000;

export class BackupError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "BackupError";
    this.status = status;
  }
}

function requireId(id: unknown): asserts id is string {
  if (typeof id !== "string" || !uuid.test(id))
    throw new BackupError("Cet identifiant de sauvegarde est invalide.");
}
function schema(database: DatabaseSync) {
  return database
    .prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name",
    )
    .all() as SchemaObject[];
}
function generation(database: DatabaseSync) {
  const row = database
    .prepare("SELECT generation FROM workspace_state WHERE id = 1")
    .get();
  if (
    typeof row?.generation !== "string" ||
    !generationPattern.test(row.generation)
  )
    throw new BackupError("L’état de cet espace est indisponible.", 503);
  return row.generation;
}
function summary(database: DatabaseSync): BackupSummary {
  const count = (query: string) => Number(database.prepare(query).get()!.value);
  return {
    documentNotes: count(
      "SELECT count(*) AS value FROM document_notes WHERE text <> ''",
    ),
    submittedExercises: count(
      "SELECT count(*) AS value FROM exercise_attempts WHERE status = 'submitted'",
    ),
    activeCards: count(
      "SELECT count(*) AS value FROM review_cards c JOIN review_elements e ON e.user_id = c.user_id AND e.element_id = c.element_id WHERE e.active = 1",
    ),
    reviewAttempts: count(
      "SELECT count(*) AS value FROM review_attempts WHERE status = 'rated'",
    ),
    savedLanguageItems: count(
      "SELECT (SELECT count(*) FROM language_results WHERE saved_at IS NOT NULL) + (SELECT count(*) FROM language_saved_references) AS value",
    ),
    audioClips: count("SELECT count(*) AS value FROM audio_clips"),
    audioBytes: count(
      "SELECT coalesce(sum(length(bytes)), 0) AS value FROM audio_clips",
    ),
    sceneAttempts: count("SELECT count(*) AS value FROM scene_attempts"),
    resourceNotes: count(
      "SELECT count(*) AS value FROM resource_states WHERE notes <> ''",
    ),
    resourceBookmarks: count(
      "SELECT count(*) AS value FROM resource_states WHERE position_seconds IS NOT NULL",
    ),
  };
}
function privateDirectory(directory: string) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
}
function writePrivate(filename: string, value: string | Uint8Array) {
  writeFileSync(filename, value, { flag: "wx", mode: 0o600 });
}
function hash(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
function validHeader(bytes: Uint8Array) {
  if (bytes.byteLength > BACKUP_MAX_BYTES)
    throw new BackupError("Le fichier dépasse la limite de 256 Mio.", 413);
  if (
    bytes.byteLength < 100 ||
    Buffer.from(bytes.subarray(0, 16)).toString("binary") !==
      "SQLite format 3\0"
  )
    throw new BackupError(
      "Choisis un fichier de sauvegarde SQLite créé par l’application.",
    );
}
function reader(filename: string) {
  const database = new DatabaseSync(filename, {
    readOnly: true,
    enableForeignKeyConstraints: true,
    enableDoubleQuotedStringLiterals: false,
    allowExtension: false,
    defensive: true,
    timeout: 5000,
  });
  try {
    database.exec(
      "PRAGMA trusted_schema = OFF; PRAGMA cell_size_check = ON; PRAGMA mmap_size = 0;",
    );
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function openBackupStore(
  directory = process.env.APP_DATA_DIR || path.join(process.cwd(), ".data"),
  options: StoreOptions = {},
) {
  const database = openDatabase(directory, options);
  const canonical = new DatabaseSync(":memory:", {
    allowExtension: false,
    defensive: true,
  });
  try {
    applyMigrations(
      canonical,
      options.migrationsDirectory || path.join(process.cwd(), "migrations"),
    );
  } catch (error) {
    canonical.close();
    database.close();
    throw error;
  }
  const expectedSchema = schema(canonical);
  const migrationQuery =
    "SELECT version, filename, checksum FROM schema_migrations ORDER BY version";
  const expectedMigrations = canonical.prepare(migrationQuery).all();
  const columns = Object.fromEntries(
    tables.map((table) => [
      table,
      (
        canonical.prepare(`PRAGMA table_info("${table}")`).all() as {
          name: string;
        }[]
      ).map((column) => column.name),
    ]),
  );
  const deleteTriggers = expectedSchema.filter(
    (item) =>
      item.type === "trigger" &&
      /\bBEFORE DELETE\b/i.test(item.sql!) &&
      tables.includes(item.tbl_name as (typeof tables)[number]),
  );
  canonical.close();
  const backups = path.join(directory, "backups");
  const pending = path.join(backups, "pending");
  privateDirectory(backups);
  privateDirectory(pending);
  const now = () => options.now?.() ?? new Date();

  function validate(input: DatabaseSync) {
    if (!isDeepStrictEqual(schema(input), expectedSchema))
      throw new BackupError(
        "Cette sauvegarde utilise une structure différente. Seules les sauvegardes de la version actuelle sont acceptées.",
      );
    if (
      !isDeepStrictEqual(
        input.prepare(migrationQuery).all(),
        expectedMigrations,
      )
    )
      throw new BackupError(
        "Cette sauvegarde provient d’une version antérieure, future ou modifiée de l’application.",
      );
    const integrity = input.prepare("PRAGMA integrity_check").all();
    if (
      integrity.length !== 1 ||
      Object.values(integrity[0]!)[0] !== "ok" ||
      input.prepare("PRAGMA foreign_key_check").all().length
    )
      throw new BackupError(
        "Cette sauvegarde est endommagée ou contient des liens de données invalides.",
      );
    if (
      input
        .prepare("SELECT count(*) AS value FROM profiles WHERE is_local = 1")
        .get()!.value !== 1
    )
      throw new BackupError(
        "Cette sauvegarde doit contenir exactement un profil personnel.",
      );
    const sequences = input
      .prepare("SELECT name, seq FROM sqlite_sequence")
      .all();
    const names = new Set<string>();
    for (const row of sequences) {
      if (
        typeof row.name !== "string" ||
        !sequenceTables.includes(row.name) ||
        names.has(row.name) ||
        typeof row.seq !== "number" ||
        !Number.isSafeInteger(row.seq) ||
        row.seq < 0
      )
        throw new BackupError(
          "Les identifiants de cette sauvegarde sont invalides.",
        );
      names.add(row.name);
      const max = input
        .prepare(`SELECT coalesce(max(id), 0) AS value FROM "${row.name}"`)
        .get()!.value;
      if (row.seq < Number(max))
        throw new BackupError("L’historique des identifiants est incohérent.");
    }
    return summary(input);
  }

  function files(): BackupFile[] {
    return readdirSync(backups)
      .filter((name) => name.endsWith(".json") && uuid.test(name.slice(0, -5)))
      .flatMap((name) => {
        try {
          const file = JSON.parse(
            readFileSync(path.join(backups, name), "utf8"),
          ) as BackupFile;
          const filename = path.join(backups, `${name.slice(0, -5)}.sqlite3`);
          if (
            file.id !== name.slice(0, -5) ||
            !["manual", "safety"].includes(file.kind) ||
            !Number.isFinite(Date.parse(file.createdAt)) ||
            !lstatSync(filename).isFile() ||
            lstatSync(filename).size !== file.sizeBytes
          )
            return [];
          return [file];
        } catch {
          return [];
        }
      })
      .sort(
        (first, second) =>
          second.createdAt.localeCompare(first.createdAt) ||
          second.id.localeCompare(first.id),
      );
  }

  function snapshot(kind: BackupFile["kind"], source = database): BackupFile {
    const id = randomUUID();
    const filename = path.join(backups, `${id}.sqlite3`);
    try {
      source.prepare("VACUUM INTO ?").run(filename);
      chmodSync(filename, 0o600);
      const sizeBytes = lstatSync(filename).size;
      if (sizeBytes > BACKUP_MAX_BYTES)
        throw new BackupError(
          "La sauvegarde dépasse 256 Mio ; la restauration n’a pas été lancée.",
          413,
        );
      const verification = reader(filename);
      try {
        validate(verification);
      } finally {
        verification.close();
      }
      const file: BackupFile = {
        id,
        createdAt: now().toISOString(),
        sizeBytes,
        kind,
      };
      writePrivate(path.join(backups, `${id}.json`), JSON.stringify(file));
      return file;
    } catch (error) {
      rmSync(filename, { force: true });
      if (error instanceof BackupError) throw error;
      throw new BackupError(
        "La sauvegarde n’a pas pu être créée. Aucune donnée n’a été remplacée.",
        503,
      );
    }
  }

  function cleanupInspections() {
    const active: BackupInspection[] = [];
    for (const name of readdirSync(pending)) {
      if (name.endsWith(".sqlite3") && uuid.test(name.slice(0, -8))) {
        const filename = path.join(pending, name);
        if (
          existsSync(filename) &&
          !existsSync(path.join(pending, `${name.slice(0, -8)}.json`)) &&
          lstatSync(filename).mtimeMs + inspectionLifetime <= now().getTime()
        )
          rmSync(filename, { force: true });
        continue;
      }
      if (!name.endsWith(".json") || !uuid.test(name.slice(0, -5))) continue;
      const id = name.slice(0, -5);
      let inspection: BackupInspection | null = null;
      try {
        inspection = JSON.parse(
          readFileSync(path.join(pending, name), "utf8"),
        ) as BackupInspection;
      } catch {
        /* Remove incomplete inspection files. */
      }
      if (
        inspection?.id === id &&
        Number.isFinite(Date.parse(inspection.expiresAt)) &&
        Date.parse(inspection.expiresAt) > now().getTime() &&
        existsSync(path.join(pending, `${id}.sqlite3`))
      ) {
        active.push(inspection);
      } else {
        rmSync(path.join(pending, name), { force: true });
        rmSync(path.join(pending, `${id}.sqlite3`), { force: true });
      }
    }
    return active;
  }

  function receipt(command: RestoreCommand): RestoreResult | null {
    const row = database
      .prepare(
        "SELECT command, result FROM restore_receipts WHERE request_id = ?",
      )
      .get(command.requestId);
    if (!row) return null;
    if (!isDeepStrictEqual(JSON.parse(String(row.command)), command))
      throw new BackupError(
        "Cette demande a déjà été utilisée pour une autre restauration.",
        409,
      );
    return JSON.parse(String(row.result)) as RestoreResult;
  }

  return {
    getOverview() {
      return {
        generation: generation(database),
        current: summary(database),
        files: files(),
      };
    },
    createBackup() {
      return snapshot("manual");
    },
    readBackup(id: string) {
      requireId(id);
      const file = files().find((candidate) => candidate.id === id);
      if (!file)
        throw new BackupError("Cette sauvegarde est introuvable.", 404);
      return { file, bytes: readFileSync(path.join(backups, `${id}.sqlite3`)) };
    },
    inspectBackup(bytes: Uint8Array): BackupInspection {
      validHeader(bytes);
      if (cleanupInspections().length >= 5)
        throw new BackupError(
          "Cinq fichiers sont déjà en attente. Réessaie après l’expiration des inspections (une heure).",
          429,
        );
      const id = randomUUID();
      const filename = path.join(pending, `${id}.sqlite3`);
      try {
        writePrivate(filename, bytes);
        const input = reader(filename);
        let inspected: BackupSummary;
        try {
          inspected = validate(input);
        } finally {
          input.close();
        }
        const inspection: BackupInspection = {
          id,
          sha256: hash(bytes),
          sizeBytes: bytes.byteLength,
          summary: inspected,
          expiresAt: new Date(
            now().getTime() + inspectionLifetime,
          ).toISOString(),
        };
        writePrivate(
          path.join(pending, `${id}.json`),
          JSON.stringify(inspection),
        );
        return inspection;
      } catch (error) {
        rmSync(filename, { force: true });
        if (error instanceof BackupError) throw error;
        throw new BackupError(
          "Ce fichier ne peut pas être lu comme une sauvegarde valide de l’application.",
        );
      }
    },
    restoreBackup(command: RestoreCommand): RestoreResult {
      if (
        !command ||
        typeof command !== "object" ||
        Object.keys(command).sort().join(",") !==
          "expectedGeneration,inspectionId,requestId,sha256"
      )
        throw new BackupError("Cette demande de restauration est invalide.");
      requireId(command.inspectionId);
      requireId(command.requestId);
      if (
        typeof command.sha256 !== "string" ||
        !digest.test(command.sha256) ||
        typeof command.expectedGeneration !== "string" ||
        !generationPattern.test(command.expectedGeneration)
      )
        throw new BackupError("Cette demande de restauration est invalide.");
      const previous = receipt(command);
      if (previous) return previous;
      if (generation(database) !== command.expectedGeneration)
        throw new BackupError(
          "Les données ont été restaurées depuis l’ouverture de cette page. Recharge l’espace avant de poursuivre.",
          409,
        );
      const inspection = cleanupInspections().find(
        (item) => item.id === command.inspectionId,
      );
      if (!inspection)
        throw new BackupError(
          "Cette inspection a expiré. Sélectionne à nouveau le fichier.",
          410,
        );
      const filename = path.join(pending, `${command.inspectionId}.sqlite3`);
      const bytes = readFileSync(filename);
      validHeader(bytes);
      if (
        inspection.sha256 !== command.sha256 ||
        hash(bytes) !== command.sha256 ||
        bytes.length !== inspection.sizeBytes
      )
        throw new BackupError(
          "Le fichier ne correspond plus à celui qui a été vérifié.",
          409,
        );
      const input = reader(filename);
      try {
        validate(input);
        if (!isDeepStrictEqual(schema(database), expectedSchema))
          throw new BackupError(
            "La structure des données actuelles a changé. La restauration est annulée.",
            409,
          );
        const result = transaction(database, () => {
          const concurrent = receipt(command);
          if (concurrent) return concurrent;
          if (generation(database) !== command.expectedGeneration)
            throw new BackupError(
              "Une restauration vient déjà de modifier cet espace. Recharge la page.",
              409,
            );
          // Another read connection can snapshot the committed state while this writer holds the lock.
          const source = reader(path.join(directory, "learning.sqlite3"));
          let safety: BackupFile;
          try {
            safety = snapshot("safety", source);
          } finally {
            source.close();
          }
          database.exec("PRAGMA defer_foreign_keys = ON");
          for (const trigger of deleteTriggers)
            database.exec(`DROP TRIGGER "${trigger.name}"`);
          for (const table of [...tables].reverse())
            database.exec(`DELETE FROM "${table}"`);
          for (const table of tables) {
            const names = columns[table]!;
            const select = input.prepare(
              `SELECT rowid AS __backup_rowid, ${names.map((name) => `"${name}"`).join(", ")} FROM "${table}" ORDER BY ${table === "exercise_attempts" ? "attempt_number, rowid" : "rowid"}`,
            );
            select.setReadBigInts(true);
            const insert = database.prepare(
              `INSERT INTO "${table}" (rowid, ${names.map((name) => `"${name}"`).join(", ")}) VALUES (${names
                .map(() => "?")
                .concat("?")
                .join(", ")})`,
            );
            for (const row of select.iterate()) {
              const values = [
                row.__backup_rowid,
                ...names.map((name) => row[name]),
              ] as SQLInputValue[];
              if (
                values.some(
                  (value) =>
                    typeof value === "bigint" &&
                    (value > BigInt(Number.MAX_SAFE_INTEGER) ||
                      value < BigInt(Number.MIN_SAFE_INTEGER)),
                )
              )
                throw new BackupError(
                  "La sauvegarde contient des identifiants ou des compteurs hors limites.",
                );
              insert.run(...values);
            }
          }
          database.exec("DELETE FROM sqlite_sequence");
          const sequenceInsert = database.prepare(
            "INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)",
          );
          for (const row of input
            .prepare("SELECT name, seq FROM sqlite_sequence")
            .all())
            sequenceInsert.run(row.name as string, row.seq as number);
          for (const trigger of deleteTriggers) database.exec(trigger.sql!);
          if (database.prepare("PRAGMA foreign_key_check").all().length)
            throw new BackupError(
              "Les données importées ne peuvent pas être reliées correctement.",
            );
          const nextGeneration = randomBytes(16).toString("hex");
          const result: RestoreResult = {
            requestId: command.requestId,
            generation: nextGeneration,
            safetyBackupId: safety.id,
            restoredAt: now().toISOString(),
          };
          database
            .prepare("UPDATE workspace_state SET generation = ? WHERE id = 1")
            .run(nextGeneration);
          database
            .prepare(
              "INSERT INTO restore_receipts (request_id, command, result, created_at) VALUES (?, ?, ?, ?)",
            )
            .run(
              command.requestId,
              JSON.stringify(command),
              JSON.stringify(result),
              result.restoredAt,
            );
          return result;
        });
        try {
          rmSync(filename, { force: true });
          rmSync(path.join(pending, `${command.inspectionId}.json`), {
            force: true,
          });
        } catch {
          // The committed receipt remains authoritative if temporary cleanup fails.
        }
        return result;
      } catch (error) {
        if (error instanceof BackupError) throw error;
        throw new BackupError(
          "La restauration a été annulée ; les données précédentes sont conservées.",
          503,
        );
      } finally {
        input.close();
      }
    },
    close() {
      database.close();
    },
  };
}
