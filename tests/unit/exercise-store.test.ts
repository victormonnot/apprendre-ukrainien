import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import {
  EXERCISE_WORK_NOTE_MAX_LENGTH,
  type ExerciseAnswers,
  type ExerciseAssessment,
  type ExerciseDefinition,
} from "../../src/lib/exercise-types.ts";
import {
  ExerciseAttemptNotFoundError,
  ExerciseConflictError,
  openExerciseStore,
} from "../../src/lib/server/exercise-store.ts";
import { openLearningStore } from "../../src/lib/server/learning-store.ts";

const definition: ExerciseDefinition = {
  id: "01-1",
  moduleId: "01",
  number: 1,
  title: "Lire les premiers mots",
  version: 1,
  items: [
    {
      id: "word",
      label: "Écris le mot ukrainien pour maman.",
      fields: [{ id: "answer", label: "Mot ukrainien" }],
    },
  ],
};
const blankAnswers: ExerciseAnswers = {
  word: { fields: { answer: "" }, aid: null },
};
const answers: ExerciseAnswers = {
  word: { fields: { answer: "мама" }, aid: "none" },
};
const assessment: ExerciseAssessment = {
  status: "corrected",
  items: [
    {
      itemId: "word",
      fields: [{ fieldId: "answer", status: "correct", feedback: "Juste." }],
    },
  ],
};

function fixture(t: TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), "ukrainian-exercises-"));
  const resources: { close(): void }[] = [];
  t.after(() => {
    for (const resource of resources.reverse()) resource.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    directory,
    open(options?: Parameters<typeof openExerciseStore>[1]) {
      const store = openExerciseStore(directory, options);
      resources.push(store);
      return store;
    },
    profile() {
      const learning = openLearningStore(directory);
      try {
        return learning.getLocalUserId();
      } finally {
        learning.close();
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

test("starting an exercise creates one blank draft and repeats safely", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  assert.deepEqual(store.getWorkspace(userId, definition.id), {
    exerciseId: definition.id,
    draft: null,
    attempts: [],
  });
  const started = store.startAttempt(userId, definition);
  assert.ok(started.draft);
  assert.equal(started.draft.number, 1);
  assert.equal(started.draft.revision, 1);
  assert.equal(started.draft.status, "draft");
  assert.equal(started.draft.retryOf, null);
  assert.equal(started.draft.assessment, null);
  assert.equal(started.draft.submittedAt, null);
  assert.equal(started.draft.workNote, "");
  assert.deepEqual(started.draft.definition, definition);
  assert.deepEqual(started.draft.answers, blankAnswers);
  assert.deepEqual(store.startAttempt(userId, definition), started);
  assert.equal(
    context
      .inspect()
      .prepare("SELECT count(*) AS count FROM exercise_events")
      .get()?.count,
    1,
  );
});

test("draft answers, notes and a frozen submission survive a restart", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const timestamp = "2026-09-25T11:00:00.000Z";
  const store = openExerciseStore(context.directory, {
    now: () => new Date(timestamp),
  });
  const draft = store.startAttempt(userId, definition).draft!;
  const saved = store.saveDraft(
    userId,
    definition,
    draft.id,
    draft.revision,
    answers,
    "Sur papier.",
  );
  assert.equal(saved.draft?.assessment, null);
  store.close();
  const reopened = openExerciseStore(context.directory, {
    now: () => new Date(timestamp),
  });
  assert.deepEqual(reopened.getWorkspace(userId, definition.id), saved);
  const submittedAnswers: ExerciseAnswers = {
    word: { fields: { answer: "мама!" }, aid: "resource" },
  };
  const submitted = reopened.submitAttempt(
    userId,
    definition,
    draft.id,
    saved.draft!.revision,
    submittedAnswers,
    "Dernière réponse à conserver.",
    assessment,
  );
  reopened.close();
  assert.equal(submitted.draft, null);
  assert.equal(submitted.attempts.length, 1);
  assert.equal(submitted.attempts[0]!.id, draft.id);
  assert.equal(submitted.attempts[0]!.revision, 3);
  assert.equal(submitted.attempts[0]!.submittedAt, timestamp);
  assert.deepEqual(submitted.attempts[0]!.answers, submittedAnswers);
  assert.deepEqual(submitted.attempts[0]!.assessment, assessment);
  assert.deepEqual(
    context.open().getWorkspace(userId, definition.id),
    submitted,
  );
});

test("two editors cannot overwrite or submit a stale draft", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const first = context.open();
  const second = context.open();
  const draft = first.startAttempt(userId, definition).draft!;
  const saved = first.saveDraft(
    userId,
    definition,
    draft.id,
    draft.revision,
    answers,
    "Premier éditeur",
  );
  for (const operation of [
    () =>
      second.saveDraft(
        userId,
        definition,
        draft.id,
        draft.revision,
        blankAnswers,
        "Autre éditeur",
      ),
    () =>
      second.submitAttempt(
        userId,
        definition,
        draft.id,
        draft.revision,
        blankAnswers,
        "Autre éditeur",
        assessment,
      ),
  ]) {
    assert.throws(operation, (error: unknown) => {
      assert.ok(error instanceof ExerciseConflictError);
      assert.deepEqual(error.currentWorkspace, saved);
      return true;
    });
  }
  assert.deepEqual(second.getWorkspace(userId, definition.id), saved);
  const reconciled = second.saveDraft(
    userId,
    definition,
    draft.id,
    saved.draft!.revision,
    answers,
    "Réconcilié",
  );
  assert.equal(reconciled.draft?.revision, 3);
});

test("exercise and user identities isolate drafts, submissions and retries", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const otherUser = randomUUID();
  context
    .inspect()
    .prepare("INSERT INTO profiles (id, created_at) VALUES (?, ?)")
    .run(otherUser, new Date().toISOString());
  const store = context.open();
  const otherDefinition = { ...definition, id: "01-2", number: 2 };
  const draft = store.startAttempt(userId, definition).draft!;
  const otherExerciseDraft = store.startAttempt(userId, otherDefinition).draft!;
  assert.equal(store.getWorkspace(otherUser, definition.id).draft, null);
  for (const [owner, exercise, attemptId] of [
    [otherUser, definition, draft.id],
    [userId, otherDefinition, draft.id],
    [userId, definition, randomUUID()],
  ] as const) {
    assert.throws(
      () => store.saveDraft(owner, exercise, attemptId, 1, answers, ""),
      ExerciseAttemptNotFoundError,
    );
    assert.throws(
      () =>
        store.submitAttempt(
          owner,
          exercise,
          attemptId,
          1,
          answers,
          "",
          assessment,
        ),
      ExerciseAttemptNotFoundError,
    );
    assert.throws(
      () => store.startAttempt(owner, exercise, attemptId),
      ExerciseAttemptNotFoundError,
    );
  }
  assert.throws(
    () => store.startAttempt(userId, definition, draft.id),
    ExerciseConflictError,
  );
  const submitted = store.submitAttempt(
    userId,
    definition,
    draft.id,
    1,
    answers,
    "",
    assessment,
  );
  assert.throws(
    () => store.startAttempt(otherUser, definition, submitted.attempts[0]!.id),
    ExerciseAttemptNotFoundError,
  );
  assert.equal(
    store.getWorkspace(userId, otherDefinition.id).draft?.id,
    otherExerciseDraft.id,
  );
  assert.throws(
    () => store.startAttempt(randomUUID(), definition),
    /FOREIGN KEY/,
  );
});

test("resubmitting the same payload is idempotent and cannot replace a frozen correction", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const draft = store.startAttempt(userId, definition).draft!;
  const submitted = store.submitAttempt(
    userId,
    definition,
    draft.id,
    1,
    answers,
    "À conserver",
    assessment,
  );
  const reversedAnswers: ExerciseAnswers = {
    word: { aid: "none", fields: { answer: "мама" } },
  };
  const changedAssessment: ExerciseAssessment = {
    status: "pending",
    items: [],
  };
  assert.deepEqual(
    store.submitAttempt(
      userId,
      definition,
      draft.id,
      1,
      reversedAnswers,
      "À conserver",
      changedAssessment,
    ),
    submitted,
  );
  assert.throws(
    () =>
      store.submitAttempt(
        userId,
        definition,
        draft.id,
        1,
        blankAnswers,
        "À conserver",
        assessment,
      ),
    ExerciseConflictError,
  );
  assert.throws(
    () =>
      store.submitAttempt(
        userId,
        definition,
        draft.id,
        1,
        answers,
        "Note modifiée",
        assessment,
      ),
    ExerciseConflictError,
  );
  assert.throws(
    () =>
      store.saveDraft(userId, definition, draft.id, 2, answers, "À conserver"),
    ExerciseConflictError,
  );
  assert.deepEqual(store.getWorkspace(userId, definition.id), submitted);
  assert.equal(
    context
      .inspect()
      .prepare(
        "SELECT count(*) AS count FROM exercise_events WHERE kind = 'submitted'",
      )
      .get()?.count,
    1,
  );
});

test("retrying starts blank and retains every earlier answer and definition snapshot", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const draft = store.startAttempt(userId, definition).draft!;
  const first = store.submitAttempt(
    userId,
    definition,
    draft.id,
    1,
    answers,
    "Première remise",
    assessment,
  ).attempts[0]!;
  const updatedDefinition = {
    ...definition,
    version: 2,
    title: "Nouvelle consigne",
  };
  const retry = store.startAttempt(userId, updatedDefinition, first.id);
  assert.ok(retry.draft);
  assert.equal(retry.draft.number, 2);
  assert.equal(retry.draft.retryOf, first.id);
  assert.equal(retry.draft.definitionVersion, 2);
  assert.equal(retry.draft.definition.title, "Nouvelle consigne");
  assert.deepEqual(retry.draft.answers, blankAnswers);
  assert.equal(retry.draft.workNote, "");
  assert.equal(retry.draft.assessment, null);
  assert.deepEqual(retry.attempts, [first]);
  assert.deepEqual(
    store.startAttempt(userId, updatedDefinition, first.id),
    retry,
  );
  const second = store.submitAttempt(
    userId,
    updatedDefinition,
    retry.draft.id,
    1,
    answers,
    "Deuxième remise",
    assessment,
  );
  assert.deepEqual(
    second.attempts.map((attempt) => attempt.number),
    [2, 1],
  );
  assert.deepEqual(second.attempts[1], first);
  assert.equal(store.startAttempt(userId, updatedDefinition).draft?.number, 3);
});

test("a version conflict preserves work rather than reinterpreting old fields", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const initial = store.startAttempt(userId, definition);
  const updated = { ...definition, version: 2 };
  for (const operation of [
    () => store.startAttempt(userId, updated),
    () => store.saveDraft(userId, updated, initial.draft!.id, 1, answers, ""),
    () =>
      store.submitAttempt(
        userId,
        updated,
        initial.draft!.id,
        1,
        answers,
        "",
        assessment,
      ),
  ]) {
    assert.throws(operation, (error: unknown) => {
      assert.ok(error instanceof ExerciseConflictError);
      assert.deepEqual(error.currentWorkspace, initial);
      return true;
    });
  }
  assert.deepEqual(store.getWorkspace(userId, definition.id), initial);
});

test("exercise migration preserves existing notes, checkpoints and learning history", (t) => {
  const context = fixture(t);
  const migrationsDirectory = path.join(context.directory, "old-migrations");
  mkdirSync(migrationsDirectory);
  copyFileSync(
    path.join(process.cwd(), "migrations/001_learning.sql"),
    path.join(migrationsDirectory, "001_learning.sql"),
  );
  const original = openLearningStore(context.directory, {
    migrationsDirectory,
  });
  const userId = original.getLocalUserId();
  original.saveCheckpoint(userId, "01", "cours", "premiers-mots");
  const document = original.saveNote(
    userId,
    "01",
    "cours",
    "Ma note privée existante",
    0,
  );
  const overview = original.getOverview(userId);
  original.close();
  const eventsBefore = context
    .inspect()
    .prepare("SELECT * FROM learning_events ORDER BY id")
    .all();
  const exercises = context.open();
  exercises.startAttempt(userId, definition);
  const learning = openLearningStore(context.directory);
  assert.equal(learning.getLocalUserId(), userId);
  assert.deepEqual(learning.getDocument(userId, "01", "cours"), document);
  assert.deepEqual(learning.getOverview(userId), overview);
  learning.close();
  const inspected = context.inspect();
  assert.deepEqual(
    inspected.prepare("SELECT * FROM learning_events ORDER BY id").all(),
    eventsBefore,
  );
  assert.equal(
    inspected.prepare("SELECT count(*) AS count FROM schema_migrations").get()
      ?.count,
    9,
  );
});

test("an event failure rolls back attempt creation, draft edits and submission together", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const database = context.inspect();
  database.exec(`CREATE TRIGGER reject_exercise_event BEFORE INSERT ON exercise_events
    BEGIN SELECT RAISE(ABORT, 'Injected event failure'); END;`);
  assert.throws(
    () => store.startAttempt(userId, definition),
    /Injected event failure/,
  );
  assert.equal(store.getWorkspace(userId, definition.id).draft, null);
  database.exec("DROP TRIGGER reject_exercise_event");
  const started = store.startAttempt(userId, definition);
  database.exec(`CREATE TRIGGER reject_exercise_event BEFORE INSERT ON exercise_events
    BEGIN SELECT RAISE(ABORT, 'Injected event failure'); END;`);
  assert.throws(
    () =>
      store.saveDraft(
        userId,
        definition,
        started.draft!.id,
        1,
        answers,
        "Brouillon interrompu",
      ),
    /Injected event failure/,
  );
  assert.throws(
    () =>
      store.submitAttempt(
        userId,
        definition,
        started.draft!.id,
        1,
        answers,
        "Remise interrompue",
        assessment,
      ),
    /Injected event failure/,
  );
  assert.deepEqual(store.getWorkspace(userId, definition.id), started);
  assert.equal(
    database.prepare("SELECT count(*) AS count FROM exercise_events").get()
      ?.count,
    1,
  );
  database.exec("DROP TRIGGER reject_exercise_event");
  assert.equal(
    store.submitAttempt(
      userId,
      definition,
      started.draft!.id,
      1,
      answers,
      "Remise complète",
      assessment,
    ).attempts[0]!.revision,
    2,
  );
});

test("database constraints protect submitted work, identity, corrections and event history", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const draft = store.startAttempt(userId, definition).draft!;
  const database = context.inspect();
  assert.throws(
    () =>
      database
        .prepare("UPDATE exercise_attempts SET assessment = ? WHERE id = ?")
        .run(JSON.stringify(assessment), draft.id),
    /CHECK/,
  );
  assert.throws(
    () =>
      database
        .prepare("UPDATE exercise_attempts SET definition = '{}' WHERE id = ?")
        .run(draft.id),
    /identity is immutable/,
  );
  assert.throws(
    () =>
      database
        .prepare(
          "UPDATE exercise_attempts SET exercise_id = '01-13' WHERE id = ?",
        )
        .run(draft.id),
    /identity is immutable/,
  );
  store.submitAttempt(
    userId,
    definition,
    draft.id,
    1,
    answers,
    "Réponse à garder",
    assessment,
  );
  assert.throws(
    () => database.exec("UPDATE exercise_attempts SET work_note = 'Écrasé'"),
    /immutable/,
  );
  assert.throws(
    () => database.exec("DELETE FROM exercise_attempts"),
    /immutable/,
  );
  assert.throws(
    () => database.exec("UPDATE exercise_events SET revision = 99"),
    /append-only/,
  );
  assert.throws(
    () => database.exec("DELETE FROM exercise_events"),
    /append-only/,
  );
  const events = database.prepare("SELECT * FROM exercise_events").all();
  assert.equal(JSON.stringify(events).includes("Réponse à garder"), false);
  assert.equal(JSON.stringify(events).includes("мама"), false);
});

test("invalid draft revisions and note lengths do not change saved work", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const initial = store.startAttempt(userId, definition);
  for (const revision of [
    0,
    -1,
    0.5,
    Number.NaN,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.throws(
      () =>
        store.saveDraft(
          userId,
          definition,
          initial.draft!.id,
          revision,
          answers,
          "",
        ),
      RangeError,
    );
    assert.throws(
      () =>
        store.submitAttempt(
          userId,
          definition,
          initial.draft!.id,
          revision,
          answers,
          "",
          assessment,
        ),
      RangeError,
    );
  }
  assert.throws(
    () =>
      store.saveDraft(
        userId,
        definition,
        initial.draft!.id,
        1,
        answers,
        "x".repeat(EXERCISE_WORK_NOTE_MAX_LENGTH + 1),
      ),
    RangeError,
  );
  assert.deepEqual(store.getWorkspace(userId, definition.id), initial);
});
