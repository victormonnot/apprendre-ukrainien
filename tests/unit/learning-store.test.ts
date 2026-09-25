import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { NOTE_MAX_LENGTH } from "../../src/lib/learning-types.ts";
import { openDatabase } from "../../src/lib/server/database.ts";
import {
  NoteConflictError,
  openLearningStore,
} from "../../src/lib/server/learning-store.ts";

function fixture(t: TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), "ukrainian-learning-"));
  const resources: { close(): void }[] = [];
  t.after(() => {
    for (const resource of resources.reverse()) resource.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    directory,
    open(options?: Parameters<typeof openLearningStore>[1]) {
      const store = openLearningStore(directory, options);
      resources.push(store);
      return store;
    },
    inspect() {
      const database = new DatabaseSync(
        path.join(directory, "learning.sqlite3"),
      );
      resources.push(database);
      return database;
    },
  };
}

test("a fresh local profile has no inferred knowledge or saved documents", (t) => {
  const context = fixture(t);
  const store = context.open();
  const userId = store.getLocalUserId();
  assert.match(userId, /^[0-9a-f-]{36}$/);
  assert.equal(store.getLocalUserId(), userId);
  assert.deepEqual(store.getOverview(userId), {
    documents: [],
    lastActivity: null,
  });
  assert.deepEqual(store.getDocument(userId, "01", "cours"), {
    moduleId: "01",
    view: "cours",
    lastViewedAt: null,
    checkpoint: null,
    note: { text: "", revision: 0, updatedAt: null },
    selfReport: null,
  });
  assert.equal(
    context
      .inspect()
      .prepare("SELECT count(*) AS count FROM learning_events")
      .get()?.count,
    0,
  );
});

test("profile, notes, checkpoints and reports survive a database restart", (t) => {
  const context = fixture(t);
  const instant = "2026-09-25T10:00:00.000Z";
  const store = openLearningStore(context.directory, {
    now: () => new Date(instant),
  });
  const userId = store.getLocalUserId();
  store.recordVisit(userId, "01", "cours");
  store.saveCheckpoint(userId, "01", "cours", "les-premieres-lettres");
  store.saveNote(userId, "01", "cours", "Revoir и et і. Привіт!", 0);
  const saved = store.saveSelfReport(
    userId,
    "01",
    "cours",
    "with_help",
    "Avec ma fiche.",
  );
  const overview = store.getOverview(userId);
  store.close();

  const reopened = context.open();
  assert.equal(reopened.getLocalUserId(), userId);
  assert.deepEqual(reopened.getDocument(userId, "01", "cours"), saved);
  assert.deepEqual(reopened.getOverview(userId), overview);
  assert.equal(
    reopened.getDocument(userId, "01", "vocabulaire").note.revision,
    0,
  );
  assert.equal(saved.note.updatedAt, instant);
  assert.equal(saved.lastViewedAt, instant);
});

test("a second editor cannot overwrite a newer note and can retry after reconciling it", (t) => {
  const context = fixture(t);
  const first = context.open();
  const second = context.open();
  const userId = first.getLocalUserId();
  const initial = second.getDocument(userId, "01", "cours");
  const saved = first.saveNote(userId, "01", "cours", "Premier brouillon", 0);
  assert.throws(
    () =>
      second.saveNote(
        userId,
        "01",
        "cours",
        "Brouillon concurrent",
        initial.note.revision,
      ),
    (error: unknown) => {
      assert.ok(error instanceof NoteConflictError);
      assert.deepEqual(error.currentNote, saved.note);
      return true;
    },
  );
  assert.deepEqual(first.getDocument(userId, "01", "cours").note, saved.note);
  const reconciled = second.saveNote(
    userId,
    "01",
    "cours",
    "Les deux brouillons réunis",
    saved.note.revision,
  );
  assert.equal(reconciled.note.revision, 2);
  assert.equal(
    first.getDocument(userId, "01", "cours").note.text,
    reconciled.note.text,
  );
  assert.equal(
    context
      .inspect()
      .prepare(
        "SELECT count(*) AS count FROM learning_events WHERE kind = 'note_updated'",
      )
      .get()?.count,
    2,
  );
});

test("document and user identities isolate all personal state", (t) => {
  const context = fixture(t);
  const store = context.open();
  const firstUser = store.getLocalUserId();
  const secondUser = randomUUID();
  context
    .inspect()
    .prepare("INSERT INTO profiles (id, created_at) VALUES (?, ?)")
    .run(secondUser, new Date().toISOString());
  store.saveNote(firstUser, "01", "cours", "Note privée du premier profil", 0);
  store.saveCheckpoint(firstUser, "01", "cours", "section-a");
  store.saveSelfReport(firstUser, "01", "cours", "understood", "Selon moi.");
  assert.equal(store.getDocument(secondUser, "01", "cours").note.text, "");
  assert.deepEqual(store.getOverview(secondUser), {
    documents: [],
    lastActivity: null,
  });
  store.saveNote(secondUser, "01", "cours", "Note du second profil", 0);
  store.saveCheckpoint(secondUser, "01", "cours", "section-b");
  assert.equal(
    store.getDocument(firstUser, "01", "cours").note.text,
    "Note privée du premier profil",
  );
  assert.equal(
    store.getOverview(firstUser).lastActivity?.sectionId,
    "section-a",
  );
  assert.equal(
    store.getOverview(secondUser).lastActivity?.sectionId,
    "section-b",
  );
  assert.equal(store.getDocument(secondUser, "01", "cours").selfReport, null);
  assert.equal(store.getDocument(firstUser, "02", "cours").note.text, "");
  assert.equal(store.getDocument(firstUser, "01", "exercices").note.text, "");
  assert.throws(
    () => store.saveNote(randomUUID(), "01", "cours", "Unknown owner", 0),
    /FOREIGN KEY/,
  );
});

test("visits preserve an explicit checkpoint without inferring success", (t) => {
  const context = fixture(t);
  let instant = new Date("2026-09-25T10:00:00.000Z");
  const store = context.open({ now: () => instant });
  const userId = store.getLocalUserId();
  store.saveNote(
    userId,
    "01",
    "cours",
    "Ma note indépendante du titre du cours",
    0,
  );
  store.saveCheckpoint(userId, "01", "cours", "ancien-titre-de-section");
  instant = new Date("2026-09-26T10:00:00.000Z");
  for (let count = 0; count < 3; count++)
    store.recordVisit(userId, "01", "cours");
  const state = store.getDocument(userId, "01", "cours");
  assert.equal(state.checkpoint?.sectionId, "ancien-titre-de-section");
  assert.equal(state.selfReport, null);
  assert.equal(
    store.getOverview(userId).lastActivity?.sectionId,
    "ancien-titre-de-section",
  );
  store.saveNote(userId, "01", "vocabulaire", "Une autre note", 0);
  assert.equal(store.getOverview(userId).lastActivity?.view, "cours");
  store.saveCheckpoint(userId, "01", "cours", null);
  assert.equal(store.getOverview(userId).lastActivity?.sectionId, null);
  assert.equal(
    store.getDocument(userId, "01", "cours").note.text,
    state.note.text,
  );
  store.saveSelfReport(
    userId,
    "01",
    "cours",
    "first_success",
    "Une seule réussite.",
  );
  instant = new Date("2026-10-26T10:00:00.000Z");
  assert.equal(
    store.recordVisit(userId, "01", "cours").selfReport?.level,
    "first_success",
  );
});

test("a failed event write rolls back both the note and its revision", (t) => {
  const context = fixture(t);
  const store = context.open();
  const userId = store.getLocalUserId();
  const saved = store.saveNote(userId, "01", "cours", "À conserver", 0);
  const database = context.inspect();
  database.exec(`
    CREATE TRIGGER reject_note_event BEFORE INSERT ON learning_events
    WHEN NEW.kind = 'note_updated' BEGIN SELECT RAISE(ABORT, 'Injected event failure'); END;
  `);
  assert.throws(
    () => store.saveNote(userId, "01", "cours", "Écriture interrompue", 1),
    /Injected event failure/,
  );
  assert.deepEqual(store.getDocument(userId, "01", "cours"), saved);
  assert.throws(
    () =>
      store.saveNote(userId, "02", "cours", "Nouveau document interrompu", 0),
    /Injected event failure/,
  );
  assert.equal(store.getOverview(userId).documents.length, 1);
  assert.equal(
    database.prepare("SELECT count(*) AS count FROM learning_events").get()
      ?.count,
    1,
  );
  database.exec("DROP TRIGGER reject_note_event");
  assert.equal(
    store.saveNote(userId, "01", "cours", "Nouvel essai", 1).note.revision,
    2,
  );
});

test("events retain declared learning history without storing the note text", (t) => {
  const context = fixture(t);
  const store = context.open();
  const userId = store.getLocalUserId();
  const privateText = "Texte privé à ne pas dupliquer dans les événements";
  store.recordVisit(userId, "01", "cours");
  store.saveNote(userId, "01", "cours", privateText, 0);
  store.saveSelfReport(
    userId,
    "01",
    "cours",
    "first_success",
    "Contexte personnel",
  );
  store.saveSelfReport(userId, "01", "cours", "to_review", "À reprendre");
  const database = context.inspect();
  const events = database
    .prepare("SELECT * FROM learning_events ORDER BY id")
    .all();
  assert.equal(events.length, 4);
  assert.equal(JSON.stringify(events).includes(privateText), false);
  assert.deepEqual(
    events.map((event) => event.self_report_detail),
    [null, null, "Contexte personnel", "À reprendre"],
  );
  assert.deepEqual(
    events.map((event) => event.self_report_level),
    [null, null, "first_success", "to_review"],
  );
  assert.equal(
    store.getDocument(userId, "01", "cours").selfReport?.level,
    "to_review",
  );
  assert.throws(
    () => database.exec("UPDATE learning_events SET kind = 'visit'"),
    /append-only/,
  );
  assert.throws(
    () => database.exec("DELETE FROM learning_events"),
    /append-only/,
  );
});

test("invalid note sizes and revisions leave no partial document state", (t) => {
  const context = fixture(t);
  const store = context.open();
  const userId = store.getLocalUserId();
  assert.throws(
    () =>
      store.saveNote(userId, "01", "cours", "x".repeat(NOTE_MAX_LENGTH + 1), 0),
    RangeError,
  );
  for (const revision of [-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => store.saveNote(userId, "01", "cours", "Texte", revision),
      RangeError,
    );
  }
  assert.deepEqual(store.getOverview(userId), {
    documents: [],
    lastActivity: null,
  });
  assert.equal(
    store.saveNote(userId, "01", "cours", "і".repeat(NOTE_MAX_LENGTH), 0).note
      .text.length,
    NOTE_MAX_LENGTH,
  );
});

test("migration replay preserves data and rejects modified migration history", (t) => {
  const context = fixture(t);
  const migrations = path.join(context.directory, "migrations");
  mkdirSync(migrations);
  const migrationPath = path.join(migrations, "001_learning.sql");
  copyFileSync(
    path.join(process.cwd(), "migrations", "001_learning.sql"),
    migrationPath,
  );
  const store = openLearningStore(context.directory, {
    migrationsDirectory: migrations,
  });
  const userId = store.getLocalUserId();
  const saved = store.saveNote(userId, "01", "cours", "Toujours là", 0);
  store.close();
  const replayed = openLearningStore(context.directory, {
    migrationsDirectory: migrations,
  });
  assert.deepEqual(replayed.getDocument(userId, "01", "cours"), saved);
  replayed.close();
  assert.equal(
    context
      .inspect()
      .prepare("SELECT count(*) AS count FROM schema_migrations")
      .get()?.count,
    1,
  );
  writeFileSync(migrationPath, "CREATE TABLE changed_history (id INTEGER);\n");
  assert.throws(
    () =>
      openLearningStore(context.directory, { migrationsDirectory: migrations }),
    /differs from the database history/,
  );
  assert.equal(
    context.inspect().prepare("SELECT text FROM document_notes").get()?.text,
    "Toujours là",
  );
});

test("a failed pending migration rolls back its schema changes without losing saved work", (t) => {
  const context = fixture(t);
  const migrations = path.join(context.directory, "migrations");
  mkdirSync(migrations);
  copyFileSync(
    path.join(process.cwd(), "migrations", "001_learning.sql"),
    path.join(migrations, "001_learning.sql"),
  );
  const store = openLearningStore(context.directory, {
    migrationsDirectory: migrations,
  });
  const userId = store.getLocalUserId();
  store.saveNote(userId, "01", "cours", "Travail existant", 0);
  store.close();
  const pending = path.join(migrations, "002_pending.sql");
  writeFileSync(
    pending,
    "CREATE TABLE partial_migration (id INTEGER); INSERT INTO missing_table VALUES (1);\n",
  );
  assert.throws(
    () => openDatabase(context.directory, { migrationsDirectory: migrations }),
    /missing_table/,
  );
  const database = context.inspect();
  assert.equal(
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE name = 'partial_migration'",
      )
      .get(),
    undefined,
  );
  assert.equal(
    database.prepare("SELECT count(*) AS count FROM schema_migrations").get()
      ?.count,
    1,
  );
  assert.equal(
    database.prepare("SELECT text FROM document_notes").get()?.text,
    "Travail existant",
  );
  writeFileSync(pending, "CREATE TABLE completed_migration (id INTEGER);\n");
  const recovered = openDatabase(context.directory, {
    migrationsDirectory: migrations,
  });
  assert.equal(
    recovered.prepare("SELECT count(*) AS count FROM schema_migrations").get()
      ?.count,
    2,
  );
  recovered.close();
});
