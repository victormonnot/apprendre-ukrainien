import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { getExercise } from "../../src/content/exercises.ts";
import type {
  LanguageInput,
  LanguageResultContent,
} from "../../src/lib/language-types.ts";
import { openExerciseStore } from "../../src/lib/server/exercise-store.ts";
import {
  LanguageReferenceNotFoundError,
  LanguageRequestConflictError,
  LanguageResultNotFoundError,
  openLanguageStore,
} from "../../src/lib/server/language-store.ts";
import { openLearningStore } from "../../src/lib/server/learning-store.ts";
import { openReviewStore } from "../../src/lib/server/review-store.ts";

const input: LanguageInput = {
  mode: "translate",
  text: "Un café, s’il vous plaît.",
  context: "Je commande une boisson.",
  source: {
    kind: "document",
    moduleId: "01",
    view: "vocabulaire",
    anchor: "premiers-mots",
  },
};
const content: LanguageResultContent = {
  title: "Commander un café",
  summary: "Une demande polie.",
  ambiguity: "",
  entries: [
    {
      ukrainian: "Каву, будь ласка.",
      french: "Un café, s’il vous plaît.",
      usage: "Une commande au café.",
      pronunciation: "KA-vou, boud LASS-ka",
      syllables: [],
      stressIndex: null,
      examples: [
        { ukrainian: "Каву, будь ласка.", french: "Un café, s’il vous plaît." },
      ],
    },
  ],
  feedback: [],
  practice: "Reprends la demande de mémoire.",
};

function request(
  changes: Partial<
    Parameters<ReturnType<typeof openLanguageStore>["recordResult"]>[1]
  > = {},
) {
  return {
    requestId: randomUUID(),
    input: structuredClone(input),
    content: structuredClone(content),
    model: "language-test-model",
    ...changes,
  };
}

function fixture(t: TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), "ukrainian-language-"));
  const resources: { close(): void }[] = [];
  let timestamp = "2026-09-25T10:00:00.000Z";
  t.after(() => {
    for (const resource of resources.reverse()) resource.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    directory,
    setTime(value: string) {
      timestamp = value;
    },
    now: () => new Date(timestamp),
    open() {
      const store = openLanguageStore(directory, {
        now: () => new Date(timestamp),
      });
      resources.push(store);
      return store;
    },
    profile() {
      const store = openLearningStore(directory);
      try {
        return store.getLocalUserId();
      } finally {
        store.close();
      }
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

test("a retried request preserves its original result, input and model across restarts", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = openLanguageStore(context.directory, { now: context.now });
  const original = request({
    input: { ...input, text: "  Un café,\ns’il vous plaît.  " },
  });
  const result = store.recordResult(userId, original);
  assert.equal(result.savedAt, null);
  assert.equal(result.createdAt, "2026-09-25T10:00:00.000Z");
  assert.deepEqual(result.input, original.input);
  assert.deepEqual(result.content, content);
  assert.deepEqual(store.listSavedResults(userId), []);
  original.input.text = "Muté après enregistrement";
  original.content.summary = "Muté après enregistrement";
  assert.deepEqual(store.getResult(userId, result.id), result);
  store.close();
  context.setTime("2026-09-26T10:00:00.000Z");
  const reopened = context.open();
  assert.deepEqual(reopened.getByRequestId(userId, result.requestId), result);
  assert.deepEqual(
    reopened.recordResult(
      userId,
      request({
        requestId: result.requestId,
        input,
        content: { ...content, summary: "Autre réponse du service" },
        model: "new-model",
      }),
    ),
    result,
  );
  assert.equal(
    context
      .inspect()
      .prepare("SELECT count(*) AS count FROM language_results")
      .get()!.count,
    1,
  );
});

test("request identifiers cannot be reused for another mode, text, context or source", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const result = store.recordResult(userId, request());
  const variations: LanguageInput[] = [
    { ...input, mode: "explain" },
    { ...input, text: "Du thé, s’il vous plaît." },
    { ...input, context: "Je parle du lieu." },
    { ...input, source: null },
    {
      ...input,
      source: {
        kind: "document",
        moduleId: "01",
        view: "cours",
        anchor: "premiers-mots",
      },
    },
    {
      ...input,
      source: {
        kind: "exercise",
        exerciseId: "01-1",
        attemptId: "another-attempt",
      },
    },
  ];
  for (const variation of variations) {
    assert.throws(
      () =>
        store.recordResult(
          userId,
          request({ requestId: result.requestId, input: variation }),
        ),
      LanguageRequestConflictError,
    );
  }
  assert.deepEqual(store.getResult(userId, result.id), result);
});

test("saving equivalent inputs once retains their original context and output", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const first = store.recordResult(userId, request());
  const equivalent = store.recordResult(
    userId,
    request({
      input: {
        ...input,
        text: "  Un cafe\u0301,\ns’il vous plaît. ",
        context: "Je   commande une boisson.  ",
        source: {
          anchor: "premiers-mots",
          view: "vocabulaire",
          moduleId: "01",
          kind: "document",
        },
      },
      content: { ...content, summary: "Une nouvelle génération" },
    }),
  );
  assert.notEqual(first.id, equivalent.id);
  context.setTime("2026-09-25T11:00:00.000Z");
  const saved = store.saveResult(userId, first.id);
  assert.equal(saved.savedAt, "2026-09-25T11:00:00.000Z");
  context.setTime("2026-09-26T11:00:00.000Z");
  assert.deepEqual(store.saveResult(userId, first.id), saved);
  assert.deepEqual(store.saveResult(userId, equivalent.id), saved);
  assert.equal(store.getResult(userId, equivalent.id)!.savedAt, null);
  assert.deepEqual(store.listSavedResults(userId), [saved]);
  assert.deepEqual(saved.input, input);
  assert.deepEqual(saved.content, content);
});

test("distinct meanings, modes and originating passages remain separate saved results", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const variations: LanguageInput[] = [
    input,
    { ...input, context: "Je parle du lieu." },
    { ...input, mode: "explain" },
    { ...input, source: null },
    {
      ...input,
      source: {
        kind: "document",
        moduleId: "01",
        view: "cours",
        anchor: "expressions",
      },
    },
    {
      ...input,
      source: {
        kind: "exercise",
        exerciseId: "01-4",
        attemptId: "first-attempt",
      },
    },
    {
      ...input,
      source: {
        kind: "exercise",
        exerciseId: "01-4",
        attemptId: "second-attempt",
      },
    },
  ];
  for (const variation of variations) {
    const result = store.recordResult(userId, request({ input: variation }));
    assert.equal(store.saveResult(userId, result.id).id, result.id);
  }
  assert.equal(store.listSavedResults(userId).length, variations.length);
});

test("results, request retries and reference selections remain isolated by profile", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const otherUserId = randomUUID();
  context
    .inspect()
    .prepare("INSERT INTO profiles (id, created_at) VALUES (?, ?)")
    .run(otherUserId, context.now().toISOString());
  const store = context.open();
  const original = request();
  const first = store.recordResult(userId, original);
  store.saveResult(userId, first.id);
  store.saveReference(userId, "01-mot-kava");
  assert.equal(store.getResult(otherUserId, first.id), null);
  assert.equal(store.getByRequestId(otherUserId, first.requestId), null);
  assert.deepEqual(store.listSavedResults(otherUserId), []);
  assert.deepEqual(store.listSavedReferenceIds(otherUserId), []);
  assert.throws(
    () => store.saveResult(otherUserId, first.id),
    LanguageResultNotFoundError,
  );
  assert.throws(
    () => store.saveResult(userId, randomUUID()),
    LanguageResultNotFoundError,
  );
  const second = store.recordResult(otherUserId, original);
  assert.notEqual(second.id, first.id);
  assert.equal(store.saveResult(otherUserId, second.id).id, second.id);
});

test("reference saving validates the catalog and never duplicates or changes its save date", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  assert.throws(
    () => store.saveReference(userId, "unknown-element"),
    LanguageReferenceNotFoundError,
  );
  assert.deepEqual(store.listSavedReferenceIds(userId), []);
  assert.deepEqual(store.saveReference(userId, "01-mot-kava"), ["01-mot-kava"]);
  const database = context.inspect();
  const first = database
    .prepare("SELECT * FROM language_saved_references")
    .all();
  context.setTime("2026-09-26T10:00:00.000Z");
  assert.deepEqual(store.saveReference(userId, "01-mot-kava"), ["01-mot-kava"]);
  assert.deepEqual(
    database.prepare("SELECT * FROM language_saved_references").all(),
    first,
  );
  assert.deepEqual(store.saveReference(userId, "01-mot-mova"), [
    "01-mot-mova",
    "01-mot-kava",
  ]);
});

test("database guards preserve generated snapshots and original save dates", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const result = store.recordResult(userId, request());
  const saved = store.saveResult(userId, result.id);
  const database = context.inspect();
  for (const statement of [
    "UPDATE language_results SET input = '{}'",
    "UPDATE language_results SET content = '{}'",
    "UPDATE language_results SET model = 'changed'",
    "UPDATE language_results SET request_id = 'changed'",
    "UPDATE language_results SET input_key = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'",
    "UPDATE language_results SET created_at = 'changed'",
    "UPDATE language_results SET saved_at = NULL",
    "UPDATE language_results SET saved_at = 'changed'",
    "DELETE FROM language_results",
  ]) {
    assert.throws(
      () => database.exec(statement),
      /immutable|cannot be deleted/,
    );
  }
  assert.deepEqual(store.getResult(userId, result.id), saved);
  store.saveReference(userId, "01-mot-kava");
  assert.throws(
    () =>
      database.exec(
        "UPDATE language_saved_references SET saved_at = 'changed'",
      ),
    /immutable/,
  );
  assert.throws(
    () => database.exec("DELETE FROM language_saved_references"),
    /cannot be deleted/,
  );
});

test("migration four preserves previous notes, exercise answers, active reviews and event histories", (t) => {
  const context = fixture(t);
  const migrationsDirectory = path.join(context.directory, "old-migrations");
  mkdirSync(migrationsDirectory);
  for (const filename of [
    "001_learning.sql",
    "002_exercises.sql",
    "003_reviews.sql",
  ]) {
    copyFileSync(
      path.join(process.cwd(), "migrations", filename),
      path.join(migrationsDirectory, filename),
    );
  }
  const options = { migrationsDirectory, now: context.now };
  const learning = openLearningStore(context.directory, options);
  const userId = learning.getLocalUserId();
  learning.saveCheckpoint(userId, "01", "cours", "premiers-mots");
  const note = learning.saveNote(userId, "01", "cours", "Ma note existante", 0);
  learning.close();
  const exercises = openExerciseStore(context.directory, options);
  const draft = exercises.startAttempt(userId, getExercise("01-1")!);
  exercises.close();
  const reviews = openReviewStore(context.directory, options);
  reviews.activateElement(userId, "01-mot-kava");
  const attempt = reviews.startReview(userId).active!;
  const review = reviews.revealAnswer(userId, attempt.id, "Mon rappel réel");
  reviews.close();
  const database = context.inspect();
  const events = ["learning_events", "exercise_events", "review_events"].map(
    (table) => ({
      table,
      rows: database.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
    }),
  );
  const store = context.open();
  store.saveReference(userId, "01-mot-kava");
  const upgradedLearning = openLearningStore(context.directory, {
    now: context.now,
  });
  assert.equal(upgradedLearning.getLocalUserId(), userId);
  assert.deepEqual(upgradedLearning.getDocument(userId, "01", "cours"), note);
  upgradedLearning.close();
  const upgradedExercises = openExerciseStore(context.directory, {
    now: context.now,
  });
  assert.deepEqual(upgradedExercises.getWorkspace(userId, "01-1"), draft);
  upgradedExercises.close();
  const upgradedReviews = openReviewStore(context.directory, {
    now: context.now,
  });
  assert.deepEqual(upgradedReviews.getOverview(userId), review);
  upgradedReviews.close();
  for (const { table, rows } of events) {
    assert.deepEqual(
      database.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
      rows,
    );
  }
  assert.equal(
    database.prepare("SELECT count(*) AS count FROM schema_migrations").get()!
      .count,
    8,
  );
});
