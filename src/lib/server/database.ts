import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type DatabaseOptions = {
  migrationsDirectory?: string;
};

export function transaction<T>(database: DatabaseSync, operation: () => T): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function applyMigrations(database: DatabaseSync, directory: string) {
  const migrations = readdirSync(directory)
    .filter((filename) => /^\d{3}_[a-z0-9_]+\.sql$/.test(filename))
    .sort()
    .map((filename) => {
      const sql = readFileSync(path.join(directory, filename), "utf8");
      return {
        version: Number(filename.slice(0, 3)),
        filename,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    });

  if (
    migrations.length === 0 ||
    new Set(migrations.map(({ version }) => version)).size !== migrations.length
  ) {
    throw new Error("Expected at least one migration with a unique version.");
  }

  transaction(database, () => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        filename TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT
    `);

    const applied = database.prepare("SELECT * FROM schema_migrations").all();
    for (const row of applied) {
      const migration = migrations.find(
        ({ version }) => version === row.version,
      );
      if (
        !migration ||
        migration.filename !== row.filename ||
        migration.checksum !== row.checksum
      ) {
        throw new Error(
          `Migration ${row.version} differs from the database history.`,
        );
      }
    }

    const record = database.prepare(
      "INSERT INTO schema_migrations (version, filename, checksum, applied_at) VALUES (?, ?, ?, ?)",
    );
    for (const migration of migrations) {
      if (applied.some(({ version }) => version === migration.version))
        continue;
      database.exec(migration.sql);
      record.run(
        migration.version,
        migration.filename,
        migration.checksum,
        new Date().toISOString(),
      );
    }
  });
}

export function openDatabase(
  directory = process.env.APP_DATA_DIR || path.join(process.cwd(), ".data"),
  options: DatabaseOptions = {},
) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, "learning.sqlite3");
  const database = new DatabaseSync(filename, {
    enableForeignKeyConstraints: true,
    enableDoubleQuotedStringLiterals: false,
    allowExtension: false,
    timeout: 5000,
  });

  try {
    chmodSync(filename, 0o600);
    database.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    applyMigrations(
      database,
      options.migrationsDirectory || path.join(process.cwd(), "migrations"),
    );
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
