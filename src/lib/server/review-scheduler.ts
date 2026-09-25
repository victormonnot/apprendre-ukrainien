import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  type Card,
  type CardInput,
  type RecordLogItem,
} from "ts-fsrs";
import type { ReviewRating } from "../review-types.ts";

export const REVIEW_TIME_ZONE = "Europe/Paris";
export const DAILY_NEW_LIMIT = 5;
export const REVIEW_RATINGS: ReviewRating[] = ["again", "hard", "good", "easy"];

const parameters = generatorParameters({
  request_retention: 0.9,
  maximum_interval: 36_500,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ["1m", "10m"],
  relearning_steps: ["10m"],
});
const scheduler = fsrs(parameters);

// Store the complete parameter set with every attempt, including the library's weights.
export const REVIEW_SCHEDULER = {
  name: "FSRS",
  library: "ts-fsrs",
  version: "5.4.2",
  configurationVersion: 1,
  parameters,
};

const grades = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
} as const;

export type StoredReviewCard = Omit<Card, "due" | "last_review"> & {
  due: string;
  last_review?: string;
};
export type StoredReviewResult = {
  card: StoredReviewCard;
  log: Omit<RecordLogItem["log"], "due" | "review"> & {
    due: string;
    review: string;
  };
};
export type ReviewPreview = Record<ReviewRating, StoredReviewResult>;

function storeCard(card: Card): StoredReviewCard {
  return {
    ...card,
    due: card.due.toISOString(),
    last_review: card.last_review?.toISOString(),
  };
}

export function newReviewCard(now: Date): StoredReviewCard {
  return storeCard(createEmptyCard(now));
}

export function previewReview(
  card: StoredReviewCard,
  now: Date,
): ReviewPreview {
  const results = scheduler.repeat(card as CardInput, now);
  return Object.fromEntries(
    REVIEW_RATINGS.map((rating) => {
      const result = results[grades[rating]];
      return [
        rating,
        {
          card: storeCard(result.card),
          log: {
            ...result.log,
            due: result.log.due.toISOString(),
            review: result.log.review.toISOString(),
          },
        },
      ];
    }),
  ) as ReviewPreview;
}

const parisDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: REVIEW_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function reviewDayKey(date: Date): string {
  const parts = parisDay.formatToParts(date);
  const get = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === name)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function nextReviewDay(date: Date): string {
  // Find the next civil-day boundary, rather than adding 24 hours across DST.
  const day = reviewDayKey(date);
  let before = date.getTime();
  let after = before + 36 * 60 * 60 * 1_000;
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2);
    if (reviewDayKey(new Date(middle)) === day) before = middle;
    else after = middle;
  }
  return new Date(after).toISOString();
}
