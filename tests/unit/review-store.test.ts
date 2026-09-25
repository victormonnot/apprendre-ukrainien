import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { getExercise } from "../../src/content/exercises.ts";
import { getReviewElement, reviewElements } from "../../src/content/reviews.ts";
import { REVIEW_ANSWER_MAX_LENGTH } from "../../src/lib/review-types.ts";
import { openExerciseStore } from "../../src/lib/server/exercise-store.ts";
import { openLearningStore } from "../../src/lib/server/learning-store.ts";
import { REVIEW_SCHEDULER } from "../../src/lib/server/review-scheduler.ts";
import {
  openReviewStore,
  ReviewConflictError,
  ReviewNotFoundError,
  type ReviewStore,
} from "../../src/lib/server/review-store.ts";

const word = getReviewElement("01-mot-kava")!;
const letters = reviewElements.filter((element) => element.kind === "letter");

function fixture(t: TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), "ukrainian-reviews-"));
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
      const store = openReviewStore(directory, {
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

function grade(
  store: ReviewStore,
  userId: string,
  rating: "again" | "hard" | "good" | "easy" = "good",
) {
  const attempt = store.startReview(userId).active;
  assert.ok(attempt);
  store.revealAnswer(userId, attempt.id, "Mon rappel avant la réponse");
  return store.rateReview(userId, attempt.id, rating);
}

test("selecting is idempotent and read-only views never present or grade a card", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const empty = store.getOverview(userId);
  assert.equal(empty.selectedCount, 0);
  assert.equal(empty.eligibleCount, 0);
  assert.equal(empty.active, null);
  assert.deepEqual(store.startReview(userId), empty);
  const selected = store.activateElement(userId, word.id);
  assert.equal(selected.selectedCount, 1);
  assert.equal(selected.eligibleCount, 1);
  assert.equal(selected.newAvailableCount, 1);
  assert.equal(selected.newToday, 0);
  assert.equal(selected.active, null);
  assert.deepEqual(store.activateElement(userId, word.id), selected);
  assert.deepEqual(store.getOverview(userId), selected);
  const database = context.inspect();
  assert.equal(
    database.prepare("SELECT count(*) AS count FROM review_cards").get()!.count,
    2,
  );
  assert.equal(
    database.prepare("SELECT count(*) AS count FROM review_attempts").get()!
      .count,
    0,
  );
  assert.equal(
    database.prepare("SELECT count(*) AS count FROM review_events").get()!
      .count,
    1,
  );
  assert.equal(
    JSON.stringify(selected).includes(word.cards[0]!.details),
    false,
  );
});

test("a single reserved attempt resumes across tabs and restarts without exposing its answer", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const first = openReviewStore(context.directory, { now: context.now });
  first.activateElement(userId, word.id);
  const started = first.startReview(userId);
  assert.ok(started.active);
  assert.equal(started.newToday, 1);
  assert.equal(started.eligibleCount, 1);
  assert.equal(started.active.revealed, null);
  assert.equal(started.active.answerText, null);
  assert.equal("answer" in started.active, false);
  assert.equal(
    JSON.stringify(started.active).includes(word.cards[0]!.details),
    false,
  );
  const second = context.open();
  assert.deepEqual(second.startReview(userId), started);
  first.close();
  assert.deepEqual(context.open().getOverview(userId), started);
  assert.equal(
    context
      .inspect()
      .prepare("SELECT count(*) AS count FROM review_attempts")
      .get()!.count,
    1,
  );
  assert.throws(
    () => second.suspendElement(userId, word.id),
    ReviewConflictError,
  );
  assert.throws(
    () => second.rateReview(userId, started.active!.id, "good"),
    ReviewConflictError,
  );
});

test("revelation freezes the real answer, correction and FSRS choices until rating", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  store.activateElement(userId, word.id);
  const id = store.startReview(userId).active!.id;
  const typed = "  Ma réponse originale\navec une hésitation.  ";
  const revealed = store.revealAnswer(userId, id, typed);
  assert.equal(revealed.active!.answerText, typed);
  assert.equal(revealed.active!.revealed!.answer, word.cards[0]!.answer);
  assert.equal(revealed.active!.revealed!.details, word.cards[0]!.details);
  assert.equal(revealed.active!.revealed!.options.length, 4);
  assert.equal(revealed.recent.length, 0);
  assert.deepEqual(store.revealAnswer(userId, id, typed), revealed);
  assert.throws(
    () => store.revealAnswer(userId, id, "Réponse remplacée"),
    ReviewConflictError,
  );
  assert.deepEqual(context.open().getOverview(userId), revealed);
  context.setTime("2026-09-25T10:03:00.000Z");
  const rated = store.rateReview(userId, id, "good");
  assert.equal(rated.active, null);
  assert.equal(rated.recent[0]!.answerText, typed);
  assert.equal(rated.recent[0]!.reviewedAt, "2026-09-25T10:03:00.000Z");
  assert.equal(
    rated.recent[0]!.dueAt,
    revealed.active!.revealed!.options.find(
      (option) => option.rating === "good",
    )!.dueAt,
  );
  const row = context
    .inspect()
    .prepare("SELECT * FROM review_attempts WHERE id = ?")
    .get(id)!;
  assert.deepEqual(JSON.parse(String(row.scheduler)), REVIEW_SCHEDULER);
  assert.deepEqual(JSON.parse(String(row.definition)), word.cards[0]);
  assert.equal(
    JSON.parse(String(row.review_log)).review,
    "2026-09-25T10:00:00.000Z",
  );
  assert.equal(JSON.parse(String(row.card_before)).reps, 0);
  assert.equal(JSON.parse(String(row.card_after)).reps, 1);
  assert.deepEqual(context.open().getOverview(userId), rated);
});

test("the introduction cap never blocks a due learning card", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  for (const element of letters.slice(0, 6))
    store.activateElement(userId, element.id);
  grade(store, userId, "again");
  for (let count = 0; count < 4; count += 1) grade(store, userId, "easy");
  const capped = store.getOverview(userId);
  assert.equal(capped.newToday, 5);
  assert.equal(capped.eligibleCount, 0);
  assert.equal(capped.nextAvailableAt, "2026-09-25T10:01:00.000Z");
  context.setTime("2026-09-25T10:01:00.000Z");
  const due = store.getOverview(userId);
  assert.equal(due.newAvailableCount, 0);
  assert.equal(due.reviewDueCount, 1);
  const attempt = store.startReview(userId).active!;
  assert.equal(attempt.elementId, letters[0]!.id);
  assert.equal(store.getOverview(userId).newToday, 5);
});

test("rating is idempotent across connections and a competing value cannot rewrite history", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const first = context.open();
  const second = context.open();
  first.activateElement(userId, word.id);
  first.activateElement(userId, letters[0]!.id);
  const id = first.startReview(userId).active!.id;
  first.revealAnswer(userId, id, "a");
  const rated = first.rateReview(userId, id, "good");
  assert.deepEqual(second.rateReview(userId, id, "good"), rated);
  assert.throws(
    () => second.rateReview(userId, id, "easy"),
    ReviewConflictError,
  );
  const next = first.startReview(userId);
  assert.notEqual(next.active!.id, id);
  assert.deepEqual(second.rateReview(userId, id, "good"), next);
  assert.equal(
    context
      .inspect()
      .prepare(
        "SELECT count(*) AS count FROM review_events WHERE kind = 'rated'",
      )
      .get()!.count,
    1,
  );
});

test("siblings wait for tomorrow while the same forgotten card returns after one minute", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  store.activateElement(userId, word.id);
  const rated = grade(store, userId, "again");
  assert.equal(rated.eligibleCount, 0);
  assert.equal(rated.newAvailableCount, 0);
  assert.equal(rated.nextAvailableAt, "2026-09-25T10:01:00.000Z");
  assert.equal(store.startReview(userId).active, null);
  context.setTime("2026-09-25T10:01:00.000Z");
  const due = store.getOverview(userId);
  assert.equal(due.reviewDueCount, 1);
  assert.equal(due.newAvailableCount, 0);
  const repeated = store.startReview(userId);
  assert.equal(repeated.active!.cardId, word.cards[0]!.id);
  assert.equal(repeated.newToday, 1);
  store.revealAnswer(userId, repeated.active!.id, "café");
  store.rateReview(userId, repeated.active!.id, "easy");
  context.setTime("2026-09-25T22:00:00.000Z");
  assert.equal(store.getOverview(userId).newToday, 0);
  const tomorrow = store.startReview(userId);
  assert.equal(tomorrow.active!.cardId, word.cards[1]!.id);
  assert.equal(tomorrow.newToday, 1);
});

test("the five-card limit reserves introductions and resets at Paris midnight", (t) => {
  const context = fixture(t);
  context.setTime("2026-03-28T22:58:00.000Z");
  const userId = context.profile();
  const store = context.open();
  for (const element of letters.slice(0, 7))
    store.activateElement(userId, element.id);
  assert.equal(store.getOverview(userId).newAvailableCount, 5);
  for (let count = 1; count <= 5; count += 1) {
    const attempt = store.startReview(userId).active!;
    assert.equal(store.getOverview(userId).newToday, count);
    assert.equal(context.open().startReview(userId).active!.id, attempt.id);
    store.revealAnswer(userId, attempt.id, "");
    store.rateReview(userId, attempt.id, "easy");
  }
  const capped = store.getOverview(userId);
  assert.equal(capped.newToday, 5);
  assert.equal(capped.eligibleCount, 0);
  assert.equal(capped.nextAvailableAt, "2026-03-28T23:00:00.000Z");
  assert.equal(store.startReview(userId).active, null);
  context.setTime("2026-03-28T23:00:00.000Z");
  const tomorrow = store.getOverview(userId);
  assert.equal(tomorrow.newToday, 0);
  assert.equal(tomorrow.newAvailableCount, 2);
  assert.ok(store.startReview(userId).active);
  context.setTime("2026-03-29T22:00:00.000Z");
  assert.equal(store.getOverview(userId).newToday, 0);
});

test("learning cards precede due reviews, which precede new cards", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const learningElement = letters[2]!;
  const reviewElement = letters[1]!;
  const newElement = letters[0]!;
  store.activateElement(userId, learningElement.id);
  grade(store, userId, "again");
  store.activateElement(userId, reviewElement.id);
  const reviewed = grade(store, userId, "easy");
  context.setTime(reviewed.recent[0]!.dueAt);
  store.activateElement(userId, newElement.id);
  const first = store.startReview(userId).active!;
  assert.equal(first.elementId, learningElement.id);
  store.revealAnswer(userId, first.id, "");
  store.rateReview(userId, first.id, "easy");
  const second = store.startReview(userId).active!;
  assert.equal(second.elementId, reviewElement.id);
  store.revealAnswer(userId, second.id, "");
  store.rateReview(userId, second.id, "easy");
  assert.equal(store.startReview(userId).active!.elementId, newElement.id);
});

test("pausing and reactivating retain planning, revisions, introductions and historical answers", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  store.activateElement(userId, word.id);
  grade(store, userId);
  const database = context.inspect();
  const cards = database
    .prepare("SELECT * FROM review_cards ORDER BY card_id")
    .all();
  const history = store.getOverview(userId).recent;
  const paused = store.suspendElement(userId, word.id);
  assert.equal(paused.selectedCount, 0);
  assert.equal(paused.eligibleCount, 0);
  assert.equal(paused.nextAvailableAt, null);
  assert.equal(
    paused.elements.find((element) => element.id === word.id)!.selected,
    true,
  );
  assert.deepEqual(store.suspendElement(userId, word.id), paused);
  context.setTime("2026-09-25T11:00:00.000Z");
  const active = store.activateElement(userId, word.id);
  assert.equal(active.reviewDueCount, 1);
  assert.equal(active.newAvailableCount, 0);
  assert.equal(active.newToday, 1);
  assert.deepEqual(active.recent, history);
  assert.deepEqual(
    database.prepare("SELECT * FROM review_cards ORDER BY card_id").all(),
    cards,
  );
});

test("another profile cannot reveal, rate or reuse a reserved attempt", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const otherUser = randomUUID();
  context
    .inspect()
    .prepare("INSERT INTO profiles (id, created_at) VALUES (?, ?)")
    .run(otherUser, context.now().toISOString());
  const store = context.open();
  store.activateElement(userId, word.id);
  const id = store.startReview(userId).active!.id;
  assert.equal(store.getOverview(otherUser).selectedCount, 0);
  assert.equal(store.getOverview(otherUser).active, null);
  assert.throws(
    () => store.revealAnswer(otherUser, id, "volé"),
    ReviewNotFoundError,
  );
  assert.throws(
    () => store.rateReview(otherUser, id, "good"),
    ReviewNotFoundError,
  );
  store.activateElement(otherUser, word.id);
  const theirs = store.startReview(otherUser).active!;
  assert.notEqual(theirs.id, id);
  store.revealAnswer(otherUser, theirs.id, "autre réponse");
  assert.equal(store.getOverview(userId).active!.revealed, null);
  assert.throws(
    () => store.activateElement(userId, "missing"),
    ReviewNotFoundError,
  );
  assert.throws(
    () => store.suspendElement(userId, "missing"),
    ReviewNotFoundError,
  );
});

test("stale card revisions and invalid inputs do not overwrite a pending review", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  store.activateElement(userId, word.id);
  const attempt = store.startReview(userId).active!;
  assert.throws(
    () =>
      store.revealAnswer(
        userId,
        attempt.id,
        "x".repeat(REVIEW_ANSWER_MAX_LENGTH + 1),
      ),
    RangeError,
  );
  assert.throws(
    () => store.rateReview(userId, attempt.id, "bad" as "good"),
    RangeError,
  );
  const database = context.inspect();
  database
    .prepare(
      "UPDATE review_cards SET revision = revision + 1 WHERE card_id = ?",
    )
    .run(attempt.cardId);
  assert.throws(
    () => store.revealAnswer(userId, attempt.id, "essai"),
    ReviewConflictError,
  );
  assert.equal(store.getOverview(userId).active!.status, "presented");
});

test("a failed history insert rolls back presentation, reveal and rating atomically", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  store.activateElement(userId, word.id);
  const database = context.inspect();
  const reject = () =>
    database.exec(`CREATE TRIGGER reject_review_event BEFORE INSERT ON review_events
    BEGIN SELECT RAISE(ABORT, 'Injected review failure'); END;`);
  const allow = () => database.exec("DROP TRIGGER reject_review_event");
  reject();
  assert.throws(() => store.startReview(userId), /Injected review failure/);
  assert.equal(store.getOverview(userId).active, null);
  assert.equal(store.getOverview(userId).newToday, 0);
  allow();
  const id = store.startReview(userId).active!.id;
  reject();
  assert.throws(
    () => store.revealAnswer(userId, id, "original"),
    /Injected review failure/,
  );
  assert.equal(store.getOverview(userId).active!.status, "presented");
  allow();
  const revealed = store.revealAnswer(userId, id, "original");
  const cardsBefore = database
    .prepare("SELECT * FROM review_cards ORDER BY card_id")
    .all();
  reject();
  assert.throws(
    () => store.rateReview(userId, id, "good"),
    /Injected review failure/,
  );
  assert.deepEqual(store.getOverview(userId), revealed);
  assert.deepEqual(
    database.prepare("SELECT * FROM review_cards ORDER BY card_id").all(),
    cardsBefore,
  );
  allow();
  assert.equal(store.rateReview(userId, id, "good").recent.length, 1);
});

test("database constraints freeze definitions, revealed answers, rated reviews and events", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  store.activateElement(userId, word.id);
  const id = store.startReview(userId).active!.id;
  const database = context.inspect();
  assert.throws(
    () => database.exec("UPDATE review_attempts SET definition = '{}'"),
    /immutable/,
  );
  assert.throws(
    () =>
      database.exec(
        "UPDATE review_cards SET first_presented_day = '2000-01-01'",
      ),
    /immutable/,
  );
  store.revealAnswer(userId, id, "intact");
  assert.throws(
    () => database.exec("UPDATE review_attempts SET answer_text = 'remplacée'"),
    /immutable/,
  );
  store.rateReview(userId, id, "good");
  assert.throws(
    () => database.exec("UPDATE review_attempts SET rating = 'easy'"),
    /immutable/,
  );
  assert.throws(
    () => database.exec("DELETE FROM review_attempts"),
    /cannot be deleted/,
  );
  assert.throws(
    () => database.exec("UPDATE review_events SET kind = 'rated'"),
    /append-only/,
  );
  assert.throws(
    () => database.exec("DELETE FROM review_events"),
    /append-only/,
  );
  assert.equal(
    JSON.stringify(
      database.prepare("SELECT * FROM review_events").all(),
    ).includes("intact"),
    false,
  );
});

test("migration three preserves notes, checkpoints, exercise drafts and both older event histories", (t) => {
  const context = fixture(t);
  const migrationsDirectory = path.join(context.directory, "old-migrations");
  mkdirSync(migrationsDirectory);
  for (const name of ["001_learning.sql", "002_exercises.sql"]) {
    copyFileSync(
      path.join(process.cwd(), "migrations", name),
      path.join(migrationsDirectory, name),
    );
  }
  const learning = openLearningStore(context.directory, {
    migrationsDirectory,
  });
  const userId = learning.getLocalUserId();
  learning.saveCheckpoint(userId, "01", "cours", "premiers-mots");
  const note = learning.saveNote(
    userId,
    "01",
    "cours",
    "Note privée à conserver",
    0,
  );
  learning.close();
  const exercises = openExerciseStore(context.directory, {
    migrationsDirectory,
  });
  const draft = exercises.startAttempt(userId, getExercise("01-1")!);
  exercises.close();
  const database = context.inspect();
  const events = database
    .prepare("SELECT * FROM learning_events ORDER BY id")
    .all();
  const exerciseEvents = database
    .prepare("SELECT * FROM exercise_events ORDER BY id")
    .all();
  context.open().activateElement(userId, word.id);
  const upgradedLearning = openLearningStore(context.directory);
  assert.equal(upgradedLearning.getLocalUserId(), userId);
  assert.deepEqual(upgradedLearning.getDocument(userId, "01", "cours"), note);
  upgradedLearning.close();
  const upgradedExercises = openExerciseStore(context.directory);
  assert.deepEqual(upgradedExercises.getWorkspace(userId, "01-1"), draft);
  upgradedExercises.close();
  assert.deepEqual(
    database.prepare("SELECT * FROM learning_events ORDER BY id").all(),
    events,
  );
  assert.deepEqual(
    database.prepare("SELECT * FROM exercise_events ORDER BY id").all(),
    exerciseEvents,
  );
  assert.equal(
    database.prepare("SELECT count(*) AS count FROM schema_migrations").get()!
      .count,
    4,
  );
});
