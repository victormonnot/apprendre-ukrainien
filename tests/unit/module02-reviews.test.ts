import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { openLearningStore } from "../../src/lib/server/learning-store.ts";
import { openReviewStore } from "../../src/lib/server/review-store.ts";

test("new module cards start only when selected and preserve the first module's review history", () => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "ukrainian-module02-reviews-"),
  );
  const learning = openLearningStore(directory);
  const reviews = openReviewStore(directory, {
    now: () => new Date("2026-10-01T10:00:00.000Z"),
  });
  try {
    const user = learning.getLocalUserId();
    reviews.activateElement(user, "01-mot-kava");
    const oldCard = reviews.startReview(user).active!;
    reviews.revealAnswer(user, oldCard.id, "café");
    reviews.rateReview(user, oldCard.id, "good");
    const before = reviews.getOverview(user);
    assert.ok(
      before.elements
        .filter((element) => element.moduleId === "02")
        .every((element) => !element.selected && element.reviewedCount === 0),
    );
    const selected = reviews.activateElement(user, "02-mot-student");
    assert.deepEqual(
      selected.elements.filter((element) => element.moduleId === "01"),
      before.elements.filter((element) => element.moduleId === "01"),
    );
    assert.deepEqual(selected.recent, before.recent);
    const next = reviews.startReview(user).active!;
    assert.equal(next.elementId, "02-mot-student");
    assert.equal(next.revealed, null);
    const revealed = reviews.revealAnswer(user, next.id, "étudiant");
    assert.ok(revealed.active?.revealed);
    const result = reviews.rateReview(user, next.id, "good");
    assert.equal(result.recent.length, 2);
    assert.equal(result.newToday, 2);
    assert.deepEqual(
      result.elements.filter((element) => element.moduleId === "01"),
      before.elements.filter((element) => element.moduleId === "01"),
    );
  } finally {
    reviews.close();
    learning.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
