import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { getScene } from "../../src/content/scenes.ts";
import { getResource } from "../../src/content/resources.ts";
import type {
  BackupInspection,
  RestoreCommand,
} from "../../src/lib/backup-types.ts";
import type { ExerciseDefinition } from "../../src/lib/exercise-types.ts";
import {
  BackupError,
  openBackupStore,
} from "../../src/lib/server/backup-store.ts";
import { openLearningStore } from "../../src/lib/server/learning-store.ts";
import { openExerciseStore } from "../../src/lib/server/exercise-store.ts";
import { openReviewStore } from "../../src/lib/server/review-store.ts";
import { openLanguageStore } from "../../src/lib/server/language-store.ts";
import { openAudioStore } from "../../src/lib/server/audio-store.ts";
import { openSceneStore } from "../../src/lib/server/scene-store.ts";
import { openResourceStore } from "../../src/lib/server/resource-store.ts";

const exercise: ExerciseDefinition = {
  id: "01-1",
  moduleId: "01",
  number: 1,
  version: 1,
  title: "Écrire maman",
  items: [
    { id: "word", label: "Maman", fields: [{ id: "answer", label: "Mot" }] },
  ],
};

function fixture(t: TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), "ukrainian-backups-"));
  const handles = new Set<{ close(): void }>();
  let timestamp = "2026-09-25T10:00:00.000Z";
  const now = () => new Date(timestamp);
  function track<T extends { close(): void }>(handle: T) {
    handles.add(handle);
    return handle;
  }
  t.after(() => {
    for (const handle of [...handles].reverse()) handle.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    directory,
    now,
    track,
    setTime(value: string) {
      timestamp = value;
    },
    release(handle: { close(): void }) {
      handle.close();
      handles.delete(handle);
    },
    open() {
      return track(openBackupStore(directory, { now }));
    },
    database() {
      return track(new DatabaseSync(path.join(directory, "learning.sqlite3")));
    },
    profile() {
      const learning = track(openLearningStore(directory, { now }));
      return learning.getLocalUserId();
    },
    mutate(bytes: Uint8Array, operation: (database: DatabaseSync) => void) {
      const filename = path.join(directory, `${randomUUID()}.sqlite3`);
      writeFileSync(filename, bytes);
      const database = new DatabaseSync(filename, {
        enableForeignKeyConstraints: false,
      });
      try {
        operation(database);
      } finally {
        database.close();
      }
      return readFileSync(filename);
    },
  };
}
function request(
  inspection: BackupInspection,
  generation: string,
): RestoreCommand {
  return {
    inspectionId: inspection.id,
    sha256: inspection.sha256,
    requestId: randomUUID(),
    expectedGeneration: generation,
  };
}
function snapshot(database: DatabaseSync) {
  return Object.fromEntries(
    (
      database
        .prepare(
          "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT IN ('workspace_state', 'restore_receipts') ORDER BY name",
        )
        .all() as { name: string }[]
    ).map(({ name }) => [
      name,
      database
        .prepare(`SELECT rowid AS __rowid, * FROM "${name}" ORDER BY rowid`)
        .all(),
    ]),
  );
}
function seed(context: ReturnType<typeof fixture>) {
  const learning = context.track(
    openLearningStore(context.directory, { now: context.now }),
  );
  const userId = learning.getLocalUserId();
  learning.saveNote(userId, "01", "cours", "  Ma note\nМої нотатки  ", 0);
  learning.saveCheckpoint(userId, "01", "cours", "premiers-mots");
  const exercises = context.track(
    openExerciseStore(context.directory, { now: context.now }),
  );
  const draft = exercises.startAttempt(userId, exercise).draft!;
  exercises.submitAttempt(
    userId,
    exercise,
    draft.id,
    draft.revision,
    { word: { fields: { answer: "мама" }, aid: "none" } },
    "Sur papier",
    {
      status: "corrected",
      items: [
        {
          itemId: "word",
          fields: [
            { fieldId: "answer", status: "correct", feedback: "Juste." },
          ],
        },
      ],
    },
  );
  const retry = exercises.startAttempt(userId, exercise, draft.id).draft!;
  const reviews = context.track(
    openReviewStore(context.directory, { now: context.now }),
  );
  reviews.activateElement(userId, "01-mot-kava");
  const attempt = reviews.startReview(userId).active!;
  reviews.revealAnswer(userId, attempt.id, "кава");
  reviews.rateReview(userId, attempt.id, "good");
  const language = context.track(
    openLanguageStore(context.directory, { now: context.now }),
  );
  const result = language.recordResult(userId, {
    requestId: randomUUID(),
    input: {
      mode: "translate",
      text: "café",
      context: "une boisson",
      source: null,
    },
    content: {
      title: "Un café",
      summary: "La boisson",
      ambiguity: "",
      entries: [
        {
          ukrainian: "кава",
          french: "café",
          usage: "La boisson",
          pronunciation: "KA-va",
          syllables: [],
          stressIndex: null,
          examples: [],
        },
      ],
      feedback: [],
      practice: "Relire le mot",
    },
    model: "test",
  });
  language.saveResult(userId, result.id);
  language.saveReference(userId, "01-mot-kava");
  const audio = context.track(
    openAudioStore(context.directory, { now: context.now }),
  );
  const bytes = new Uint8Array(417);
  bytes.set([0xff, 0xfb, 0x90, 0]);
  audio.saveClip(
    userId,
    {
      text: "кава",
      voiceId: "openai-nova",
      voiceLabel: "Nova",
      provider: "openai",
      model: "gpt-4o-mini-tts-2025-12-15",
      instructionsVersion: 1,
    },
    bytes,
    "audio/mpeg",
  );
  const scenes = context.track(
    openSceneStore(context.directory, { now: context.now }),
  );
  const scene = getScene("01-cafe", "rencontre")!;
  scenes.applyCommand(userId, scene, {
    type: "submit",
    requestId: randomUUID(),
    sceneId: scene.id,
    variantId: scene.variantId,
    version: scene.version,
    roleId: "maxime",
    expectedRevision: 0,
    answers: Object.fromEntries(
      scene.lines
        .filter((line) => line.speakerId === "maxime")
        .map((line) => [line.id, line.ukrainian]),
    ),
    helpUsed: true,
  });
  const resources = context.track(
    openResourceStore(context.directory, { now: context.now }),
  );
  const resource = getResource("ulp-001")!;
  resources.applyCommand(userId, resource, {
    type: "save-notes",
    requestId: randomUUID(),
    resourceId: resource.id,
    expectedRevision: 0,
    notes: "Ma note d’écoute",
  });
  resources.applyCommand(userId, resource, {
    type: "save-position",
    requestId: randomUUID(),
    resourceId: resource.id,
    expectedRevision: 0,
    positionSeconds: 25.5,
  });
  return {
    userId,
    learning,
    exercises,
    reviews,
    language,
    audio,
    scenes,
    resources,
    firstAttemptId: draft.id,
    retryId: retry.id,
  };
}

test("overview does not create a profile and exports use private paths", (t) => {
  const context = fixture(t);
  const store = context.open();
  assert.match(store.getOverview().generation, /^[a-f0-9]{32}$/);
  assert.deepEqual(store.getOverview().files, []);
  assert.equal(
    context.database().prepare("SELECT count(*) AS count FROM profiles").get()!
      .count,
    0,
  );
  assert.throws(() => store.createBackup(), BackupError);
  context.profile();
  const file = store.createBackup();
  assert.equal(file.kind, "manual");
  assert.ok(file.sizeBytes > 100);
  assert.equal(
    statSync(path.join(context.directory, "backups")).mode & 0o777,
    0o700,
  );
  assert.equal(
    statSync(path.join(context.directory, "backups", `${file.id}.sqlite3`))
      .mode & 0o777,
    0o600,
  );
  assert.equal(
    statSync(path.join(context.directory, "backups", `${file.id}.json`)).mode &
      0o777,
    0o600,
  );
  assert.deepEqual(store.getOverview().files, [file]);
  assert.throws(() => store.readBackup("../learning"), BackupError);
  assert.throws(
    () => store.readBackup(randomUUID()),
    (error: unknown) => error instanceof BackupError && error.status === 404,
  );
});

test("snapshot and restore preserve every domain, raw rows, sequence values and open store connections", (t) => {
  const context = fixture(t);
  const domain = seed(context);
  const store = context.open();
  const database = context.database();
  const before = snapshot(database);
  const overview = store.getOverview();
  assert.deepEqual(overview.current, {
    documentNotes: 1,
    submittedExercises: 1,
    activeCards: 2,
    reviewAttempts: 1,
    savedLanguageItems: 2,
    audioClips: 1,
    audioBytes: 417,
    sceneAttempts: 1,
    resourceNotes: 1,
    resourceBookmarks: 1,
  });
  const exported = store.createBackup();
  const inspection = store.inspectBackup(store.readBackup(exported.id).bytes);
  assert.deepEqual(inspection.summary, overview.current);
  assert.deepEqual(snapshot(database), before);
  context.setTime("2026-09-26T10:00:00.000Z");
  domain.learning.saveNote(
    domain.userId,
    "01",
    "cours",
    "Changed after backup",
    1,
  );
  domain.resources.applyCommand(domain.userId, getResource("ulp-001")!, {
    type: "save-position",
    requestId: randomUUID(),
    resourceId: "ulp-001",
    expectedRevision: 1,
    positionSeconds: 45,
  });
  const changed = snapshot(database);
  // Keep the inspection inside its hour-long validity window.
  context.setTime("2026-09-25T10:30:00.000Z");
  const restored = store.restoreBackup(
    request(inspection, overview.generation),
  );
  assert.notEqual(restored.generation, overview.generation);
  assert.deepEqual(snapshot(database), before);
  assert.equal(
    domain.learning.getDocument(domain.userId, "01", "cours").note.text,
    "  Ma note\nМої нотатки  ",
  );
  assert.equal(
    domain.exercises.getWorkspace(domain.userId, exercise.id).draft!.id,
    domain.retryId,
  );
  assert.equal(
    domain.resources.getWorkspace(domain.userId, getResource("ulp-001")!).state
      .positionSeconds,
    25.5,
  );
  const safety = store.readBackup(restored.safetyBackupId);
  assert.equal(safety.file.kind, "safety");
  const safetyFile = path.join(context.directory, "safety-inspection.sqlite3");
  writeFileSync(safetyFile, safety.bytes);
  const safetyDb = context.track(
    new DatabaseSync(safetyFile, { readOnly: true }),
  );
  assert.deepEqual(snapshot(safetyDb), changed);
  domain.learning.saveNote(
    domain.userId,
    "01",
    "cours",
    "Saved after restore",
    1,
  );
  assert.equal(
    domain.learning.getDocument(domain.userId, "01", "cours").note.revision,
    2,
  );
});

test("restore receipts survive restart, reject tampering and never replay destructive work", (t) => {
  const context = fixture(t);
  const domain = seed(context);
  const store = context.open();
  const backup = store.createBackup();
  const inspection = store.inspectBackup(store.readBackup(backup.id).bytes);
  const command = request(inspection, store.getOverview().generation);
  const result = store.restoreBackup(command);
  domain.learning.saveNote(
    domain.userId,
    "01",
    "cours",
    "New work after restore",
    1,
  );
  context.release(store);
  const reopened = context.open();
  assert.deepEqual(reopened.restoreBackup(command), result);
  assert.equal(
    domain.learning.getDocument(domain.userId, "01", "cours").note.text,
    "New work after restore",
  );
  assert.equal(
    reopened.getOverview().files.filter((file) => file.kind === "safety")
      .length,
    1,
  );
  assert.throws(
    () => reopened.restoreBackup({ ...command, sha256: "0".repeat(64) }),
    (error: unknown) => error instanceof BackupError && error.status === 409,
  );
  assert.throws(
    () => reopened.restoreBackup({ ...command, requestId: randomUUID() }),
    (error: unknown) => error instanceof BackupError && error.status === 409,
  );
});

test("inspection is bounded, expires after an hour and leaves live data unchanged", (t) => {
  const context = fixture(t);
  context.profile();
  const store = context.open();
  const backup = store.readBackup(store.createBackup().id).bytes;
  const before = snapshot(context.database());
  const inspections = Array.from({ length: 5 }, () =>
    store.inspectBackup(backup),
  );
  assert.throws(
    () => store.inspectBackup(backup),
    (error: unknown) => error instanceof BackupError && error.status === 429,
  );
  assert.deepEqual(snapshot(context.database()), before);
  context.setTime("2026-09-25T11:00:00.001Z");
  assert.throws(
    () =>
      store.restoreBackup(
        request(inspections[0]!, store.getOverview().generation),
      ),
    (error: unknown) => error instanceof BackupError && error.status === 410,
  );
  assert.ok(store.inspectBackup(backup));
});

test("corrupt headers, modified schemas, migration history and invalid foreign keys are rejected", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const backup = store.readBackup(store.createBackup().id).bytes;
  const before = snapshot(context.database());
  for (const bad of [
    Buffer.from("not a sqlite database"),
    backup.subarray(0, 100),
    context.mutate(backup, (db) => db.exec("CREATE TABLE extra (value TEXT)")),
    context.mutate(backup, (db) =>
      db.exec(
        "UPDATE schema_migrations SET checksum = 'changed' WHERE version = 1",
      ),
    ),
    context.mutate(backup, (db) =>
      db.exec(
        "INSERT INTO resource_states (user_id, resource_id) VALUES ('missing-user', 'ulp-001')",
      ),
    ),
    context.mutate(backup, (db) =>
      db.prepare("UPDATE profiles SET is_local = 0 WHERE id = ?").run(userId),
    ),
  ])
    assert.throws(() => store.inspectBackup(bad), BackupError);
  assert.deepEqual(snapshot(context.database()), before);
  assert.equal(store.getOverview().files.length, 1);
});

test("an inspected file cannot be replaced or selected with a different checksum", (t) => {
  const context = fixture(t);
  context.profile();
  const store = context.open();
  const bytes = store.readBackup(store.createBackup().id).bytes;
  const inspection = store.inspectBackup(bytes);
  const command = request(inspection, store.getOverview().generation);
  assert.throws(
    () => store.restoreBackup({ ...command, sha256: "0".repeat(64) }),
    (error: unknown) => error instanceof BackupError && error.status === 409,
  );
  const filename = path.join(
    context.directory,
    "backups",
    "pending",
    `${inspection.id}.sqlite3`,
  );
  const changed = Buffer.from(bytes);
  changed[99] = changed[99]! ^ 1;
  writeFileSync(filename, changed);
  assert.throws(
    () => store.restoreBackup(command),
    (error: unknown) => error instanceof BackupError && error.status === 409,
  );
  assert.equal(store.getOverview().files.length, 1);
});

test("insert constraints remain enforced and failed restore rolls back data, triggers, generation and receipts", (t) => {
  const context = fixture(t);
  const domain = seed(context);
  const store = context.open();
  const backup = store.readBackup(store.createBackup().id).bytes;
  const invalid = context.mutate(backup, (db) => {
    const sql = db
      .prepare(
        "SELECT sql FROM sqlite_schema WHERE name = 'exercise_attempts_identity_no_update'",
      )
      .get()!.sql as string;
    const submittedSql = db
      .prepare(
        "SELECT sql FROM sqlite_schema WHERE name = 'exercise_attempts_submitted_no_update'",
      )
      .get()!.sql as string;
    db.exec("DROP TRIGGER exercise_attempts_identity_no_update");
    db.exec("DROP TRIGGER exercise_attempts_submitted_no_update");
    db.prepare(
      "UPDATE exercise_attempts SET attempt_number = 5 WHERE id = ?",
    ).run(domain.firstAttemptId);
    db.exec(sql);
    db.exec(submittedSql);
  });
  const inspection = store.inspectBackup(invalid);
  const before = snapshot(context.database());
  const overview = store.getOverview();
  assert.throws(
    () => store.restoreBackup(request(inspection, overview.generation)),
    BackupError,
  );
  assert.deepEqual(snapshot(context.database()), before);
  assert.equal(store.getOverview().generation, overview.generation);
  assert.equal(
    context
      .database()
      .prepare("SELECT count(*) AS count FROM restore_receipts")
      .get()!.count,
    0,
  );
  assert.equal(
    store.getOverview().files.filter((file) => file.kind === "safety").length,
    1,
  );
  assert.throws(
    () => context.database().exec("DELETE FROM learning_events"),
    /append-only/,
  );
  assert.throws(
    () => context.database().exec("DELETE FROM scene_attempts"),
    /cannot be deleted/,
  );
});

test("restoring a safety backup recovers the displaced work without replacing restore receipts", (t) => {
  const context = fixture(t);
  const domain = seed(context);
  const store = context.open();
  const original = store.readBackup(store.createBackup().id).bytes;
  domain.learning.saveNote(
    domain.userId,
    "01",
    "cours",
    "Recover this note",
    1,
  );
  const firstCommand = request(
    store.inspectBackup(original),
    store.getOverview().generation,
  );
  const first = store.restoreBackup(firstCommand);
  const safety = store.readBackup(first.safetyBackupId).bytes;
  const second = store.restoreBackup(
    request(store.inspectBackup(safety), first.generation),
  );
  assert.equal(
    domain.learning.getDocument(domain.userId, "01", "cours").note.text,
    "Recover this note",
  );
  assert.notEqual(second.generation, first.generation);
  assert.equal(
    context
      .database()
      .prepare("SELECT count(*) AS count FROM restore_receipts")
      .get()!.count,
    2,
  );
  assert.deepEqual(store.restoreBackup(firstCommand), first);
});
