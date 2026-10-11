import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { getExercise } from "../../src/content/exercises.ts";
import { getReviewElement, reviewElements } from "../../src/content/reviews.ts";
import { reviewPacks } from "../../src/content/review-packs.ts";
import { REVIEW_ANSWER_MAX_LENGTH } from "../../src/lib/review-types.ts";
import { openExerciseStore } from "../../src/lib/server/exercise-store.ts";
import { openLearningStore } from "../../src/lib/server/learning-store.ts";
import { openDatabase } from "../../src/lib/server/database.ts";
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
  store.setDailyLimit(userId, 5);
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
  store.setDailyLimit(userId, 5);
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
  context.setTime(reviewed.recent[0]!.dueAt!);
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
    10,
  );
});

function cardRows(context: ReturnType<typeof fixture>) {
  return context
    .inspect()
    .prepare("SELECT * FROM review_cards ORDER BY card_id")
    .all();
}

function practiceReady(context: ReturnType<typeof fixture>, count = 7) {
  const userId = context.profile();
  const store = context.open();
  store.setDailyLimit(userId, 5);
  for (const element of letters.slice(0, count))
    store.activateElement(userId, element.id);
  for (let index = 0; index < 5; index++) grade(store, userId, "easy");
  assert.equal(store.getOverview(userId).eligibleCount, 0);
  return { userId, store };
}

test("packs activate atomically, repeat without duplicates and restore suspended elements without resetting cards", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const initial = store.getOverview(userId);
  assert.deepEqual(
    initial.packs.map((pack) => pack.id),
    ["module-01", "module-02"],
  );
  assert.equal(initial.dailyNewLimit, 20);
  const pack = reviewPacks[0]!;
  store.activateElement(userId, word.id);
  grade(store, userId, "good");
  store.suspendElement(userId, word.id);
  const before = cardRows(context);
  const history = store.getOverview(userId).recent;
  const active = store.activatePack(userId, pack.id);
  assert.equal(active.selectedCount, pack.elementIds.length);
  assert.equal(active.packs[0]!.activeElementCount, pack.elementIds.length);
  assert.equal(active.practiceAvailableCount, active.packs[0]!.cardCount);
  assert.deepEqual(
    cardRows(context).filter((row) => row.element_id === word.id),
    before,
  );
  assert.deepEqual(active.recent, history);
  const events = context
    .inspect()
    .prepare("SELECT * FROM review_events ORDER BY id")
    .all();
  assert.deepEqual(context.open().activatePack(userId, pack.id), active);
  assert.deepEqual(
    context.inspect().prepare("SELECT * FROM review_events ORDER BY id").all(),
    events,
  );
  assert.throws(
    () => store.activatePack(userId, "missing"),
    ReviewNotFoundError,
  );
  const database = context.inspect();
  database.exec(`CREATE TRIGGER fail_pack BEFORE INSERT ON review_events
    WHEN NEW.element_id = '02-mot-ty'
    BEGIN SELECT RAISE(ABORT, 'Injected pack failure'); END;`);
  assert.throws(
    () => store.activatePack(userId, "module-02"),
    /Injected pack failure/,
  );
  assert.deepEqual(store.getOverview(userId), active);
  assert.equal(
    database
      .prepare(
        "SELECT count(*) AS count FROM review_elements WHERE element_id LIKE '02-%'",
      )
      .get()!.count,
    0,
  );
});

test("daily limits default to twenty and can change or become unlimited without erasing introductions", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  store.activatePack(userId, "module-01");
  store.activatePack(userId, "module-02");
  assert.equal(store.getOverview(userId).newAvailableCount, 20);
  store.setDailyLimit(userId, 5);
  for (let index = 0; index < 5; index++) grade(store, userId, "easy");
  assert.equal(store.getOverview(userId).newAvailableCount, 0);
  assert.equal(store.setDailyLimit(userId, 10).newAvailableCount, 5);
  assert.equal(context.open().getOverview(userId).dailyNewLimit, 10);
  assert.ok(store.setDailyLimit(userId, null).newAvailableCount > 20);
  for (let index = 0; index < 18; index++) grade(store, userId, "easy");
  assert.equal(store.getOverview(userId).newToday, 23);
  const cards = cardRows(context);
  const limited = store.setDailyLimit(userId, 20);
  assert.equal(limited.newToday, 23);
  assert.equal(limited.newAvailableCount, 0);
  assert.deepEqual(cardRows(context), cards);
  for (const invalid of [-1, 0, 7, 20.5, Infinity, NaN, "20", undefined])
    assert.throws(
      () => store.setDailyLimit(userId, invalid as number),
      RangeError,
    );
  assert.equal(context.open().getOverview(userId).dailyNewLimit, 20);
});

test("practice persists, hides answers, preserves all FSRS card data and does not consume new introductions", (t) => {
  const context = fixture(t);
  const { userId, store } = practiceReady(context);
  const before = cardRows(context);
  const first = store.startPractice(userId);
  assert.equal(first.active!.mode, "practice");
  assert.equal(first.active!.revealed, null);
  assert.equal(first.active!.answerText, null);
  assert.equal(first.active!.elementId === first.recent[0]!.elementId, false);
  const other = context.open();
  assert.deepEqual(other.startReview(userId), first);
  assert.deepEqual(other.startPractice(userId), first);
  const id = first.active!.id;
  const revealed = store.revealAnswer(userId, id, "Ma vraie réponse");
  assert.deepEqual(
    revealed.active!.revealed!.options.map((option) => option.dueAt),
    [null, null, null, null],
  );
  assert.deepEqual(
    revealed.active!.revealed!.options.map((option) => option.practiceGap),
    [1, 3, 4, 8],
  );
  assert.deepEqual(
    other.revealAnswer(userId, id, "Ma vraie réponse"),
    revealed,
  );
  assert.throws(
    () => other.revealAnswer(userId, id, "autre"),
    ReviewConflictError,
  );
  const rated = store.rateReview(userId, id, "again");
  assert.equal(rated.newToday, 5);
  assert.equal(rated.recent[0]!.mode, "practice");
  assert.equal(rated.recent[0]!.dueAt, null);
  assert.deepEqual(cardRows(context), before);
  assert.deepEqual(other.rateReview(userId, id, "again"), rated);
  assert.throws(
    () => other.rateReview(userId, id, "easy"),
    ReviewConflictError,
  );
  const database = context.inspect();
  const state = database
    .prepare("SELECT * FROM review_practice_cards WHERE card_id = ?")
    .get(first.active!.cardId)!;
  assert.equal(state.last_position, 1);
  assert.equal(state.next_position, 3); // One intervening card, then return.
  const row = database
    .prepare("SELECT * FROM review_attempts WHERE id = ?")
    .get(id)!;
  assert.equal(row.card_before, row.card_after);
  assert.equal(JSON.parse(String(row.review_log)).mode, "practice");
  assert.equal(
    database
      .prepare(
        "SELECT practice_position FROM review_settings WHERE user_id = ?",
      )
      .get(userId)!.practice_position,
    1,
  );
  assert.throws(
    () =>
      database
        .prepare("UPDATE review_attempts SET mode = 'scheduled' WHERE id = ?")
        .run(id),
    /immutable/,
  );
});

test("practice continues indefinitely, repeats difficult cards more and eventually visits every active card", (t) => {
  const context = fixture(t);
  const { userId, store } = practiceReady(context, 10);
  const before = cardRows(context);
  const counts = new Map<string, number>();
  const fragile = new Set(letters.slice(0, 2).map((element) => element.id));
  let previousElement = store.getOverview(userId).recent[0]!.elementId;
  for (let index = 0; index < 100; index++) {
    const attempt = store.startPractice(userId).active!;
    assert.ok(attempt);
    assert.equal(attempt.mode, "practice");
    assert.notEqual(attempt.elementId, previousElement);
    counts.set(attempt.elementId, (counts.get(attempt.elementId) ?? 0) + 1);
    store.revealAnswer(userId, attempt.id, "rappel");
    store.rateReview(
      userId,
      attempt.id,
      fragile.has(attempt.elementId) ? "again" : "easy",
    );
    previousElement = attempt.elementId;
  }
  assert.equal(counts.size, 10);
  const weak = [...counts]
    .filter(([id]) => fragile.has(id))
    .map(([, count]) => count);
  const easy = [...counts]
    .filter(([id]) => !fragile.has(id))
    .map(([, count]) => count);
  assert.ok(Math.min(...weak) > Math.max(...easy), JSON.stringify([...counts]));
  assert.equal(store.getOverview(userId).newToday, 5);
  assert.deepEqual(cardRows(context), before);
  assert.equal(
    store
      .getOverview(userId)
      .elements.filter((element) => element.reviewedCount > 0).length,
    5,
  );
});

test("practice successes gradually increase bounded gaps, mistakes reset them and a single card can keep repeating", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  store.activateElement(userId, letters[0]!.id);
  grade(store, userId, "easy");
  const gaps: number[] = [];
  for (let index = 0; index < 12; index++) {
    const id = store.startPractice(userId).active!.id;
    const revealed = store.revealAnswer(userId, id, "a");
    gaps.push(
      revealed.active!.revealed!.options.find(
        (option) => option.rating === "easy",
      )!.practiceGap!,
    );
    store.rateReview(userId, id, index === 10 ? "again" : "easy");
  }
  assert.deepEqual(gaps.slice(0, 6), [8, 16, 24, 32, 40, 40]);
  assert.equal(gaps[11], 8);
});

test("scheduled cards regain priority when due while practice never shows two directions of an element consecutively", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  store.activateElement(userId, word.id);
  store.activateElement(userId, letters[0]!.id);
  const first = store.startPractice(userId).active!;
  assert.equal(first.mode, "scheduled");
  store.revealAnswer(userId, first.id, "a");
  store.rateReview(userId, first.id, "again");
  grade(store, userId, "easy");
  let previous = store.getOverview(userId).recent[0]!.elementId;
  const seen = new Set<string>();
  for (let index = 0; index < 12; index++) {
    const attempt = store.startPractice(userId).active!;
    assert.equal(attempt.mode, "practice");
    assert.notEqual(attempt.elementId, previous);
    seen.add(attempt.cardId);
    store.revealAnswer(userId, attempt.id, "rappel");
    store.rateReview(userId, attempt.id, "good");
    previous = attempt.elementId;
  }
  assert.equal(seen.size, 3);
  context.setTime("2026-09-25T10:01:00.000Z");
  const due = store.startPractice(userId).active!;
  assert.equal(due.mode, "scheduled");
  assert.equal(due.cardId, first.cardId);
});

test("practice writes and pack settings are isolated by profile and failed ratings roll back all practice state", (t) => {
  const context = fixture(t);
  const { userId, store } = practiceReady(context);
  const otherUser = randomUUID();
  const database = context.inspect();
  database
    .prepare("INSERT INTO profiles (id, created_at) VALUES (?, ?)")
    .run(otherUser, context.now().toISOString());
  const other = store.getOverview(otherUser);
  assert.equal(other.dailyNewLimit, 20);
  assert.equal(other.practiceAvailableCount, 0);
  assert.equal(store.startPractice(otherUser).active, null);
  const id = store.startPractice(userId).active!.id;
  assert.throws(
    () => store.revealAnswer(otherUser, id, "volé"),
    ReviewNotFoundError,
  );
  const revealed = store.revealAnswer(userId, id, "réponse originale");
  assert.throws(
    () => store.suspendElement(userId, revealed.active!.elementId),
    ReviewConflictError,
  );
  database.exec(`CREATE TRIGGER reject_practice_rating BEFORE INSERT ON review_events
    WHEN NEW.kind = 'rated' BEGIN SELECT RAISE(ABORT, 'Injected practice failure'); END;`);
  assert.throws(
    () => store.rateReview(userId, id, "hard"),
    /Injected practice failure/,
  );
  assert.deepEqual(store.getOverview(userId), revealed);
  assert.equal(
    database
      .prepare("SELECT count(*) AS count FROM review_practice_cards")
      .get()!.count,
    0,
  );
  assert.equal(
    database
      .prepare(
        "SELECT practice_position FROM review_settings WHERE user_id = ?",
      )
      .get(userId)!.practice_position,
    0,
  );
  database.exec("DROP TRIGGER reject_practice_rating");
  store.rateReview(userId, id, "hard");
  store.activatePack(otherUser, "module-02");
  store.setDailyLimit(otherUser, null);
  assert.equal(store.getOverview(userId).dailyNewLimit, 5);
  assert.equal(store.getOverview(otherUser).recent.length, 0);
});

test("migration ten preserves scheduled histories, the active revealed answer and every existing FSRS card", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  store.activateElement(userId, letters[0]!.id);
  grade(store, userId, "easy");
  store.activateElement(userId, word.id);
  const id = store.startReview(userId).active!.id;
  const previous = store.revealAnswer(
    userId,
    id,
    "Une réponse conservée pendant la migration",
  );
  const source = context.inspect();
  const oldDirectory = path.join(context.directory, "old-version");
  const oldMigrations = path.join(context.directory, "migrations-nine");
  mkdirSync(oldMigrations);
  for (const name of readdirSync(path.join(process.cwd(), "migrations")).filter(
    (name) => /^00[1-9]_/.test(name),
  )) {
    copyFileSync(
      path.join(process.cwd(), "migrations", name),
      path.join(oldMigrations, name),
    );
  }
  const old = openDatabase(oldDirectory, {
    migrationsDirectory: oldMigrations,
  });
  const tables = [
    "profiles",
    "review_elements",
    "review_cards",
    "review_attempts",
    "review_events",
  ];
  const selections = new Map<string, string>();
  const snapshots = new Map<string, unknown>();
  try {
    for (const table of tables) {
      const names = old
        .prepare(`PRAGMA table_info("${table}")`)
        .all()
        .map((column) => String(column.name));
      const selection = names.map((name) => `"${name}"`).join(", ");
      const rows = source
        .prepare(`SELECT ${selection} FROM "${table}" ORDER BY rowid`)
        .all();
      const insert = old.prepare(
        `INSERT INTO "${table}" (${selection}) VALUES (${names.map(() => "?").join(", ")})`,
      );
      for (const row of rows)
        insert.run(...names.map((name) => row[name] as SQLInputValue));
      selections.set(table, selection);
      snapshots.set(
        table,
        old.prepare(`SELECT ${selection} FROM "${table}" ORDER BY rowid`).all(),
      );
    }
    assert.equal(
      old.prepare("SELECT count(*) AS count FROM schema_migrations").get()!
        .count,
      9,
    );
  } finally {
    old.close();
  }
  const upgraded = openReviewStore(oldDirectory, { now: context.now });
  const database = new DatabaseSync(
    path.join(oldDirectory, "learning.sqlite3"),
  );
  try {
    const next = upgraded.getOverview(userId);
    assert.equal(next.dailyNewLimit, 20);
    assert.deepEqual(next.active, previous.active);
    assert.deepEqual(next.recent, previous.recent);
    for (const table of tables) {
      assert.deepEqual(
        database
          .prepare(
            `SELECT ${selections.get(table)} FROM "${table}" ORDER BY rowid`,
          )
          .all(),
        snapshots.get(table),
      );
    }
    assert.equal(
      database
        .prepare(
          "SELECT count(*) AS count FROM review_attempts WHERE mode = 'scheduled'",
        )
        .get()!.count,
      2,
    );
    assert.equal(
      database
        .prepare("SELECT count(*) AS count FROM review_practice_cards")
        .get()!.count,
      0,
    );
    assert.equal(upgraded.rateReview(userId, id, "good").active, null);
  } finally {
    database.close();
    upgraded.close();
  }
});
