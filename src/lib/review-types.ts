export type ReviewRating = "again" | "hard" | "good" | "easy";
export type ReviewMode = "scheduled" | "practice";
export const REVIEW_DAILY_LIMITS = [5, 10, 20, 50, null] as const;
export type ReviewDirection = "recognition" | "comprehension" | "production";

export type ReviewCardDefinition = {
  id: string;
  elementId: string;
  version: number;
  direction: ReviewDirection;
  prompt: string;
  cue: string;
  cueLang: "fr" | "uk";
  answer: string;
  answerLang: "fr" | "uk";
  /** Trusted pedagogical Markdown, displayed only after revealing the answer. */
  details: string;
};

export type ReviewElement = {
  id: string;
  moduleId: string;
  kind: "letter" | "word" | "expression";
  label: string;
  sourceHref: string;
  cards: ReviewCardDefinition[];
};

export type ReviewElementSummary = Pick<
  ReviewElement,
  "id" | "moduleId" | "kind" | "label" | "sourceHref"
> & {
  selected: boolean;
  active: boolean;
  cardCount: number;
  reviewedCount: number;
  nextDueAt: string | null;
};

export type ReviewAttemptView = {
  id: string;
  mode: ReviewMode;
  cardId: string;
  elementId: string;
  direction: ReviewDirection;
  definitionVersion: number;
  sourceHref: string;
  status: "presented" | "revealed";
  prompt: string;
  cue: string;
  cueLang: "fr" | "uk";
  answerText: string | null;
  revealed: null | {
    answer: string;
    answerLang: "fr" | "uk";
    details: string;
    options: {
      rating: ReviewRating;
      dueAt: string | null;
      practiceGap: number | null;
    }[];
  };
};

export type ReviewHistoryEntry = {
  id: string;
  mode: ReviewMode;
  cardId: string;
  elementId: string;
  label: string;
  direction: ReviewDirection;
  rating: ReviewRating;
  answerText: string;
  reviewedAt: string;
  dueAt: string | null;
};

export type ReviewPackSummary = {
  id: string;
  moduleId: string;
  title: string;
  description: string;
  elementCount: number;
  cardCount: number;
  activeElementCount: number;
};

export type ReviewOverview = {
  now: string;
  timeZone: string;
  dailyNewLimit: number | null;
  newToday: number;
  eligibleCount: number;
  reviewDueCount: number;
  newAvailableCount: number;
  selectedCount: number;
  practiceAvailableCount: number;
  packs: ReviewPackSummary[];
  nextAvailableAt: string | null;
  elements: ReviewElementSummary[];
  active: ReviewAttemptView | null;
  recent: ReviewHistoryEntry[];
};

export type ReviewCommand =
  | { type: "activate" | "suspend"; elementId: string }
  | { type: "activate-pack"; packId: string }
  | { type: "set-daily-limit"; dailyNewLimit: number | null }
  | { type: "start" }
  | { type: "start-practice" }
  | { type: "reveal"; attemptId: string; answerText: string }
  | { type: "rate"; attemptId: string; rating: ReviewRating };

export const REVIEW_ANSWER_MAX_LENGTH = 2_000;
export const reviewRatingLabels: Record<ReviewRating, string> = {
  again: "À revoir",
  hard: "Difficile",
  good: "Bien",
  easy: "Facile",
};
export const reviewDirectionLabels: Record<ReviewDirection, string> = {
  recognition: "Reconnaître une lettre",
  comprehension: "Comprendre l’ukrainien",
  production: "Retrouver l’ukrainien",
};
