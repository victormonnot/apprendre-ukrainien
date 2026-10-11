import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getReviewElement } from "../../src/content/reviews.ts";
import {
  newReviewCard,
  previewReview,
  reviewDayKey,
  REVIEW_SCHEDULER,
} from "../../src/lib/server/review-scheduler.ts";

// Seed migration 003 directly: the current store requires the current schema.
export function seedLegacyRevealedReview(
  database: DatabaseSync,
  userId: string,
  at: Date,
  answerText: string,
) {
  const element = getReviewElement("01-mot-kava")!;
  const timestamp = at.toISOString();
  const state = newReviewCard(at);
  database
    .prepare(
      `INSERT INTO review_elements (user_id, element_id, active, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?)`,
    )
    .run(userId, element.id, timestamp, timestamp);
  for (const card of element.cards) {
    database
      .prepare(
        `INSERT INTO review_cards
         (user_id, card_id, element_id, state, due_at, revision, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        userId,
        card.id,
        element.id,
        JSON.stringify(state),
        timestamp,
        timestamp,
        timestamp,
      );
  }
  const card = element.cards[0]!;
  const attemptId = randomUUID();
  database
    .prepare(
      `UPDATE review_cards SET first_presented_at = ?, first_presented_day = ?
       WHERE user_id = ? AND card_id = ?`,
    )
    .run(timestamp, reviewDayKey(at), userId, card.id);
  database
    .prepare(
      `INSERT INTO review_attempts
       (id, user_id, card_id, element_id, card_revision, definition, label, source_href,
        scheduler, card_before, status, answer_text, preview, created_at, revealed_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'revealed', ?, ?, ?, ?)`,
    )
    .run(
      attemptId,
      userId,
      card.id,
      element.id,
      JSON.stringify(card),
      element.label,
      element.sourceHref,
      JSON.stringify(REVIEW_SCHEDULER),
      JSON.stringify(state),
      answerText,
      JSON.stringify(previewReview(state, at)),
      timestamp,
      timestamp,
    );
  const event = database.prepare(
    `INSERT INTO review_events (user_id, element_id, attempt_id, kind, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  event.run(userId, element.id, null, "activated", timestamp);
  event.run(userId, element.id, attemptId, "presented", timestamp);
  event.run(userId, element.id, attemptId, "revealed", timestamp);
  return { attemptId, cardId: card.id, answerText };
}
