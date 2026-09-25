import assert from "node:assert/strict";
import test from "node:test";
import {
  newReviewCard,
  nextReviewDay,
  previewReview,
  reviewDayKey,
  REVIEW_SCHEDULER,
} from "../../src/lib/server/review-scheduler.ts";

test("FSRS uses explicit short learning steps and reproducible parameters", () => {
  const now = new Date("2026-09-25T10:00:00.000Z");
  const initial = newReviewCard(now);
  const preview = previewReview(initial, now);
  assert.equal(preview.again.card.due, "2026-09-25T10:01:00.000Z");
  assert.equal(preview.hard.card.due, "2026-09-25T10:06:00.000Z");
  assert.equal(preview.good.card.due, "2026-09-25T10:10:00.000Z");
  assert.equal(preview.easy.card.state, 2);
  assert.ok(preview.easy.card.due > preview.good.card.due);
  assert.deepEqual(previewReview(initial, now), preview);
  assert.equal(initial.reps, 0);
  assert.equal(REVIEW_SCHEDULER.parameters.request_retention, 0.9);
  assert.equal(REVIEW_SCHEDULER.parameters.enable_fuzz, false);
  assert.ok(REVIEW_SCHEDULER.parameters.w.length > 0);
  const reviewAt = new Date(preview.easy.card.due);
  const lapse = previewReview(preview.easy.card, reviewAt).again;
  assert.equal(lapse.card.state, 3);
  assert.equal(
    new Date(lapse.card.due).getTime() - reviewAt.getTime(),
    10 * 60_000,
  );
  assert.equal(lapse.card.lapses, 1);
});

test("review days use Paris civil midnights across summer and winter clock changes", () => {
  for (const [now, day, next] of [
    ["2026-09-25T21:59:59.999Z", "2026-09-25", "2026-09-25T22:00:00.000Z"],
    ["2026-09-25T22:00:00.000Z", "2026-09-26", "2026-09-26T22:00:00.000Z"],
    ["2026-03-28T23:00:00.000Z", "2026-03-29", "2026-03-29T22:00:00.000Z"],
    ["2026-10-24T22:00:00.000Z", "2026-10-25", "2026-10-25T23:00:00.000Z"],
    ["2026-12-31T23:00:00.000Z", "2027-01-01", "2027-01-01T23:00:00.000Z"],
  ]) {
    const date = new Date(now!);
    assert.equal(reviewDayKey(date), day);
    assert.equal(nextReviewDay(date), next);
  }
});
