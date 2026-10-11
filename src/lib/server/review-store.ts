import { randomUUID } from "node:crypto";
import { getReviewPack, reviewPacks } from "../../content/review-packs.ts";
import {
  getReviewCard,
  getReviewElement,
  reviewElements,
} from "../../content/reviews.ts";
import {
  REVIEW_ANSWER_MAX_LENGTH,
  REVIEW_DAILY_LIMITS,
  type ReviewAttemptView,
  type ReviewCardDefinition,
  type ReviewHistoryEntry,
  type ReviewOverview,
  type ReviewMode,
  type ReviewRating,
} from "../review-types.ts";
import { openDatabase, transaction, type DatabaseOptions } from "./database.ts";
import {
  DAILY_NEW_LIMIT,
  newReviewCard,
  nextReviewDay,
  previewReview,
  reviewDayKey,
  REVIEW_RATINGS,
  REVIEW_SCHEDULER,
  REVIEW_TIME_ZONE,
  type ReviewPreview,
  type StoredReviewCard,
} from "./review-scheduler.ts";

type StoreOptions = DatabaseOptions & { now?: () => Date };
type CardRow = {
  card_id: string;
  element_id: string;
  state: string;
  due_at: string;
  revision: number;
  first_presented_at: string | null;
  buried_until: string | null;
};
type ElementRow = { element_id: string; active: number };
type AttemptRow = {
  id: string;
  mode: ReviewMode;
  card_id: string;
  element_id: string;
  card_revision: number;
  definition: string;
  label: string;
  source_href: string;
  card_before: string;
  status: "presented" | "revealed" | "rated";
  answer_text: string | null;
  preview: string | null;
  rating: ReviewRating | null;
  card_after: string | null;
  rated_at: string | null;
};
type Candidate = CardRow & { memory: StoredReviewCard; order: number };
type ReviewSettings = {
  daily_new_limit: number | null;
  practice_position: number;
};
type PracticeCardRow = {
  card_id: string;
  next_position: number;
  last_position: number;
  success_streak: number;
};
type PracticePreview = Record<
  ReviewRating,
  { gap: number; position: number; successStreak: number }
>;

export class ReviewConflictError extends Error {
  constructor(
    message = "Cette révision a changé. Recharge son état avant de continuer.",
  ) {
    super(message);
    this.name = "ReviewConflictError";
  }
}

export class ReviewNotFoundError extends Error {
  constructor(message = "Cette révision est introuvable.") {
    super(message);
    this.name = "ReviewNotFoundError";
  }
}

function attemptView(row: AttemptRow): ReviewAttemptView {
  const definition = JSON.parse(row.definition) as ReviewCardDefinition;
  const preview = row.preview
    ? (JSON.parse(row.preview) as ReviewPreview | PracticePreview)
    : null;
  return {
    id: row.id,
    mode: row.mode,
    cardId: row.card_id,
    elementId: row.element_id,
    direction: definition.direction,
    definitionVersion: definition.version,
    sourceHref: row.source_href,
    status: row.status === "presented" ? "presented" : "revealed",
    prompt: definition.prompt,
    cue: definition.cue,
    cueLang: definition.cueLang,
    answerText: row.answer_text,
    revealed: preview
      ? {
          answer: definition.answer,
          answerLang: definition.answerLang,
          details: definition.details,
          options: REVIEW_RATINGS.map((rating) => ({
            rating,
            dueAt:
              row.mode === "scheduled"
                ? (preview as ReviewPreview)[rating].card.due
                : null,
            practiceGap:
              row.mode === "practice"
                ? (preview as PracticePreview)[rating].gap
                : null,
          })),
        }
      : null,
  };
}

function priority(card: Candidate) {
  if (card.memory.state === 1 || card.memory.state === 3) return 0;
  return card.memory.state === 2 ? 1 : 2;
}

export function openReviewStore(
  directory?: string,
  options: StoreOptions = {},
) {
  const database = openDatabase(directory, options);
  const clock = () => options.now?.() ?? new Date();
  const catalogOrder = new Map(
    reviewElements
      .flatMap((element) => element.cards)
      .map((card, index) => [card.id, index]),
  );

  function activeAttempt(userId: string) {
    return database
      .prepare(
        "SELECT * FROM review_attempts WHERE user_id = ? AND status <> 'rated'",
      )
      .get(userId) as AttemptRow | undefined;
  }

  function getAttempt(userId: string, attemptId: string) {
    const row = database
      .prepare("SELECT * FROM review_attempts WHERE user_id = ? AND id = ?")
      .get(userId, attemptId) as AttemptRow | undefined;
    if (!row) throw new ReviewNotFoundError();
    return row;
  }

  function getCards(userId: string) {
    return (
      database
        .prepare("SELECT * FROM review_cards WHERE user_id = ?")
        .all(userId) as CardRow[]
    )
      .filter((row) => getReviewCard(row.card_id))
      .map((row): Candidate => ({
        ...row,
        memory: JSON.parse(row.state) as StoredReviewCard,
        order: catalogOrder.get(row.card_id)!,
      }));
  }

  function getSettings(userId: string): ReviewSettings {
    return (
      (database
        .prepare(
          "SELECT daily_new_limit, practice_position FROM review_settings WHERE user_id = ?",
        )
        .get(userId) as ReviewSettings | undefined) ?? {
        daily_new_limit: DAILY_NEW_LIMIT,
        practice_position: 0,
      }
    );
  }

  function getQueue(userId: string, at: Date) {
    const timestamp = at.toISOString();
    const tomorrow = nextReviewDay(at);
    const elements = database
      .prepare(
        "SELECT element_id, active FROM review_elements WHERE user_id = ?",
      )
      .all(userId) as ElementRow[];
    const enabled = new Set(
      elements.filter((row) => row.active).map((row) => row.element_id),
    );
    const cards = getCards(userId);
    const active = activeAttempt(userId);
    const newToday = Number(
      database
        .prepare(
          "SELECT count(*) AS count FROM review_cards WHERE user_id = ? AND first_presented_day = ?",
        )
        .get(userId, reviewDayKey(at))!.count,
    );
    const settings = getSettings(userId);
    let slots =
      settings.daily_new_limit === null
        ? Infinity
        : Math.max(0, settings.daily_new_limit - newToday);
    const availableAt = new Map<string, string>();
    const due: Candidate[] = [];
    const future: string[] = [];
    for (const card of cards) {
      if (!enabled.has(card.element_id)) continue;
      let available = [card.due_at, card.buried_until ?? card.due_at]
        .sort()
        .at(-1)!;
      if (active?.mode === "scheduled" && card.card_id === active.card_id) {
        availableAt.set(card.card_id, timestamp);
        continue;
      }
      if (
        active?.mode === "scheduled" &&
        card.element_id === active.element_id
      ) {
        available = [available, tomorrow].sort().at(-1)!;
      }
      if (card.first_presented_at === null && slots === 0) {
        available = [available, tomorrow].sort().at(-1)!;
      }
      availableAt.set(card.card_id, available);
      if (available <= timestamp) due.push(card);
      else future.push(available);
    }
    due.sort(
      (left, right) =>
        priority(left) - priority(right) ||
        left.due_at.localeCompare(right.due_at) ||
        left.order - right.order,
    );
    const queue: Candidate[] = [];
    const families = new Set<string>();
    for (const card of due) {
      if (
        families.has(card.element_id) ||
        (card.first_presented_at === null && slots === 0)
      ) {
        availableAt.set(card.card_id, tomorrow);
        future.push(tomorrow);
        continue;
      }
      queue.push(card);
      families.add(card.element_id);
      if (card.first_presented_at === null) slots -= 1;
    }
    return {
      timestamp,
      elements,
      settings,
      cards,
      active,
      newToday,
      queue,
      availableAt,
      nextAvailableAt: future.sort()[0] ?? null,
    };
  }

  function getOverview(userId: string, at = clock()): ReviewOverview {
    const state = getQueue(userId, at);
    const activeCard =
      state.active?.mode === "scheduled" &&
      state.cards.find((card) => card.card_id === state.active?.card_id);
    const availableCards = activeCard
      ? [activeCard, ...state.queue]
      : state.queue;
    const recent = (
      database
        .prepare(
          "SELECT * FROM review_attempts WHERE user_id = ? AND status = 'rated' ORDER BY rated_at DESC, rowid DESC LIMIT 20",
        )
        .all(userId) as AttemptRow[]
    ).map((row): ReviewHistoryEntry => ({
      id: row.id,
      mode: row.mode,
      cardId: row.card_id,
      elementId: row.element_id,
      label: row.label,
      direction: (JSON.parse(row.definition) as ReviewCardDefinition).direction,
      rating: row.rating!,
      answerText: row.answer_text!,
      reviewedAt: row.rated_at!,
      dueAt:
        row.mode === "scheduled"
          ? (JSON.parse(row.card_after!) as StoredReviewCard).due
          : null,
    }));
    return {
      now: state.timestamp,
      timeZone: REVIEW_TIME_ZONE,
      dailyNewLimit: state.settings.daily_new_limit,
      newToday: state.newToday,
      eligibleCount: availableCards.length,
      reviewDueCount: availableCards.filter((card) => card.memory.reps > 0)
        .length,
      newAvailableCount: availableCards.filter((card) => card.memory.reps === 0)
        .length,
      selectedCount: state.elements.filter((element) => element.active).length,
      practiceAvailableCount: state.cards.filter((card) =>
        state.elements.some(
          (element) => element.active && element.element_id === card.element_id,
        ),
      ).length,
      packs: reviewPacks.map((pack) => ({
        id: pack.id,
        moduleId: pack.moduleId,
        title: pack.title,
        description: pack.description,
        elementCount: pack.elementIds.length,
        cardCount: pack.elementIds.reduce(
          (count, id) => count + getReviewElement(id)!.cards.length,
          0,
        ),
        activeElementCount: state.elements.filter(
          (element) =>
            element.active && pack.elementIds.includes(element.element_id),
        ).length,
      })),
      nextAvailableAt: state.nextAvailableAt,
      elements: reviewElements.map((element) => {
        const selection = state.elements.find(
          (row) => row.element_id === element.id,
        );
        const cards = state.cards.filter(
          (card) => card.element_id === element.id,
        );
        return {
          id: element.id,
          moduleId: element.moduleId,
          kind: element.kind,
          label: element.label,
          sourceHref: element.sourceHref,
          selected: Boolean(selection),
          active: Boolean(selection?.active),
          cardCount: element.cards.length,
          reviewedCount: cards.filter((card) => card.memory.reps > 0).length,
          nextDueAt: selection?.active
            ? (cards
                .map(
                  (card) => state.availableAt.get(card.card_id) ?? card.due_at,
                )
                .sort()[0] ?? null)
            : null,
        };
      }),
      active: state.active ? attemptView(state.active) : null,
      recent,
    };
  }

  function event(
    userId: string,
    elementId: string,
    attemptId: string | null,
    kind: "activated" | "suspended" | "presented" | "revealed" | "rated",
    timestamp: string,
  ) {
    database
      .prepare(
        `INSERT INTO review_events (user_id, element_id, attempt_id, kind, created_at)
      VALUES (?, ?, ?, ?, ?)`,
      )
      .run(userId, elementId, attemptId, kind, timestamp);
  }

  function checkCard(userId: string, attempt: AttemptRow) {
    const row = database
      .prepare(
        `SELECT c.*, e.active FROM review_cards c JOIN review_elements e
      ON e.user_id = c.user_id AND e.element_id = c.element_id
      WHERE c.user_id = ? AND c.card_id = ?`,
      )
      .get(userId, attempt.card_id) as
      (CardRow & { active: number }) | undefined;
    if (!row || !row.active || row.revision !== attempt.card_revision) {
      throw new ReviewConflictError();
    }
    return row;
  }

  function activateElements(userId: string, elementIds: string[]) {
    const elements = elementIds.map((id) => getReviewElement(id));
    if (elements.some((element) => !element))
      throw new ReviewNotFoundError("Cet élément est introuvable.");
    return transaction(database, () => {
      const at = clock();
      const timestamp = at.toISOString();
      for (const element of elements) {
        if (!element) continue;
        const elementId = element.id;
        const previous = database
          .prepare(
            "SELECT active FROM review_elements WHERE user_id = ? AND element_id = ?",
          )
          .get(userId, elementId);
        database
          .prepare(
            `INSERT INTO review_elements (user_id, element_id, active, created_at, updated_at)
          VALUES (?, ?, 1, ?, ?) ON CONFLICT (user_id, element_id) DO UPDATE SET active = 1, updated_at = excluded.updated_at
          WHERE review_elements.active = 0`,
          )
          .run(userId, elementId, timestamp, timestamp);
        for (const card of element.cards) {
          database
            .prepare(
              `INSERT OR IGNORE INTO review_cards
            (user_id, card_id, element_id, state, due_at, revision, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
            )
            .run(
              userId,
              card.id,
              elementId,
              JSON.stringify(newReviewCard(at)),
              timestamp,
              timestamp,
              timestamp,
            );
        }
        if (!previous?.active)
          event(userId, elementId, null, "activated", timestamp);
      }
      return getOverview(userId, at);
    });
  }

  function practiceCandidate(
    userId: string,
    cards: Candidate[],
    elements: ElementRow[],
  ): Candidate | undefined {
    const enabled = new Set(
      elements
        .filter((element) => element.active)
        .map((element) => element.element_id),
    );
    const states = database
      .prepare("SELECT * FROM review_practice_cards WHERE user_id = ?")
      .all(userId) as PracticeCardRow[];
    const positions = new Map(states.map((state) => [state.card_id, state]));
    const position = getSettings(userId).practice_position + 1;
    const previous = database
      .prepare(
        "SELECT element_id FROM review_attempts WHERE user_id = ? AND status = 'rated' ORDER BY rated_at DESC, rowid DESC LIMIT 1",
      )
      .get(userId) as { element_id: string } | undefined;
    const previousElement = previous?.element_id;
    let candidates = cards.filter((card) => enabled.has(card.element_id));
    const alternatives = candidates.filter(
      (card) => card.element_id !== previousElement,
    );
    if (alternatives.length) candidates = alternatives;
    // Every fourth turn makes room for the least recently practised card, so
    // repeated mistakes cannot permanently crowd out new or stronger cards.
    if (position % 4 === 0) {
      return candidates.toSorted(
        (left, right) =>
          (positions.get(left.card_id)?.last_position ?? 0) -
            (positions.get(right.card_id)?.last_position ?? 0) ||
          left.order - right.order,
      )[0];
    }
    return candidates.toSorted(
      (left, right) =>
        (positions.get(left.card_id)?.next_position ?? position) -
          (positions.get(right.card_id)?.next_position ?? position) ||
        (positions.get(left.card_id)?.last_position ?? 0) -
          (positions.get(right.card_id)?.last_position ?? 0) ||
        left.order - right.order,
    )[0];
  }

  function start(userId: string, practice: boolean): ReviewOverview {
    return transaction(database, () => {
      const at = clock();
      const state = getQueue(userId, at);
      if (state.active) return getOverview(userId, at);
      let mode: ReviewMode = "scheduled";
      let card = state.queue[0];
      if (!card && practice) {
        card = practiceCandidate(userId, state.cards, state.elements);
        mode = "practice";
      }
      if (!card) return getOverview(userId, at);
      const definition = getReviewCard(card.card_id)!;
      const element = getReviewElement(card.element_id)!;
      const id = randomUUID();
      if (mode === "scheduled" && card.first_presented_at === null) {
        database
          .prepare(
            `UPDATE review_cards SET first_presented_at = ?, first_presented_day = ?, updated_at = ?
            WHERE user_id = ? AND card_id = ? AND first_presented_at IS NULL`,
          )
          .run(
            state.timestamp,
            reviewDayKey(at),
            state.timestamp,
            userId,
            card.card_id,
          );
      }
      database
        .prepare(
          `INSERT INTO review_attempts
          (id, user_id, card_id, element_id, card_revision, definition, label, source_href,
           scheduler, card_before, status, created_at, mode)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'presented', ?, ?)`,
        )
        .run(
          id,
          userId,
          card.card_id,
          card.element_id,
          card.revision,
          JSON.stringify(definition),
          element.label,
          element.sourceHref,
          JSON.stringify(
            mode === "scheduled"
              ? REVIEW_SCHEDULER
              : { name: "Practice", version: 1 },
          ),
          card.state,
          state.timestamp,
          mode,
        );
      event(userId, card.element_id, id, "presented", state.timestamp);
      return getOverview(userId, at);
    });
  }

  return {
    getOverview,

    activateElement(userId: string, elementId: string): ReviewOverview {
      return activateElements(userId, [elementId]);
    },

    activatePack(userId: string, packId: string): ReviewOverview {
      const pack = getReviewPack(packId);
      if (!pack) throw new ReviewNotFoundError("Ce pack est introuvable.");
      return activateElements(userId, pack.elementIds);
    },

    setDailyLimit(
      userId: string,
      dailyNewLimit: number | null,
    ): ReviewOverview {
      if (!(REVIEW_DAILY_LIMITS as readonly unknown[]).includes(dailyNewLimit))
        throw new RangeError("Cette limite de nouvelles cartes est invalide.");
      return transaction(database, () => {
        const at = clock();
        database
          .prepare(
            `INSERT INTO review_settings
          (user_id, daily_new_limit, practice_position, updated_at) VALUES (?, ?, 0, ?)
          ON CONFLICT (user_id) DO UPDATE SET daily_new_limit = excluded.daily_new_limit,
          updated_at = excluded.updated_at WHERE review_settings.daily_new_limit IS NOT excluded.daily_new_limit`,
          )
          .run(userId, dailyNewLimit, at.toISOString());
        return getOverview(userId, at);
      });
    },

    suspendElement(userId: string, elementId: string): ReviewOverview {
      if (!getReviewElement(elementId))
        throw new ReviewNotFoundError("Cet élément est introuvable.");
      return transaction(database, () => {
        if (activeAttempt(userId)?.element_id === elementId) {
          throw new ReviewConflictError(
            "Termine la carte en cours avant de mettre cet élément en pause.",
          );
        }
        const at = clock();
        const result = database
          .prepare(
            `UPDATE review_elements SET active = 0, updated_at = ?
          WHERE user_id = ? AND element_id = ? AND active = 1`,
          )
          .run(at.toISOString(), userId, elementId);
        if (result.changes)
          event(userId, elementId, null, "suspended", at.toISOString());
        return getOverview(userId, at);
      });
    },

    startReview(userId: string): ReviewOverview {
      return start(userId, false);
    },

    startPractice(userId: string): ReviewOverview {
      return start(userId, true);
    },

    revealAnswer(
      userId: string,
      attemptId: string,
      answerText: string,
    ): ReviewOverview {
      if (
        typeof answerText !== "string" ||
        answerText.length > REVIEW_ANSWER_MAX_LENGTH
      ) {
        throw new RangeError("La réponse est trop longue.");
      }
      return transaction(database, () => {
        const at = clock();
        const attempt = getAttempt(userId, attemptId);
        if (attempt.status !== "presented") {
          if (attempt.answer_text !== answerText) {
            throw new ReviewConflictError(
              "La réponse a déjà été révélée. Ta première réponse est conservée.",
            );
          }
          return getOverview(userId, at);
        }
        checkCard(userId, attempt);
        let preview: ReviewPreview | PracticePreview;
        if (attempt.mode === "practice") {
          const previous = database
            .prepare(
              "SELECT * FROM review_practice_cards WHERE user_id = ? AND card_id = ?",
            )
            .get(userId, attempt.card_id) as PracticeCardRow | undefined;
          const streak = previous?.success_streak ?? 0;
          const position = getSettings(userId).practice_position + 1;
          preview = {
            again: { gap: 1, position, successStreak: 0 },
            hard: { gap: 3, position, successStreak: 0 },
            good: {
              gap: Math.min(24, 4 + 4 * streak),
              position,
              successStreak: Math.min(6, streak + 1),
            },
            easy: {
              gap: Math.min(40, 8 + 8 * streak),
              position,
              successStreak: Math.min(6, streak + 1),
            },
          };
        } else {
          preview = previewReview(
            JSON.parse(attempt.card_before) as StoredReviewCard,
            at,
          );
        }
        database
          .prepare(
            `UPDATE review_attempts SET status = 'revealed', answer_text = ?, preview = ?, revealed_at = ?
          WHERE user_id = ? AND id = ? AND status = 'presented'`,
          )
          .run(
            answerText,
            JSON.stringify(preview),
            at.toISOString(),
            userId,
            attemptId,
          );
        event(
          userId,
          attempt.element_id,
          attemptId,
          "revealed",
          at.toISOString(),
        );
        return getOverview(userId, at);
      });
    },

    rateReview(
      userId: string,
      attemptId: string,
      rating: ReviewRating,
    ): ReviewOverview {
      if (!REVIEW_RATINGS.includes(rating))
        throw new RangeError("Cette évaluation est invalide.");
      return transaction(database, () => {
        const at = clock();
        const timestamp = at.toISOString();
        const attempt = getAttempt(userId, attemptId);
        if (attempt.status === "rated") {
          if (attempt.rating !== rating) {
            throw new ReviewConflictError(
              "Cette carte a déjà été évaluée. La première évaluation est conservée.",
            );
          }
          return getOverview(userId, at);
        }
        if (attempt.status !== "revealed") {
          throw new ReviewConflictError(
            "Révèle la réponse avant d’évaluer ton rappel.",
          );
        }
        checkCard(userId, attempt);
        if (attempt.mode === "practice") {
          const result = (JSON.parse(attempt.preview!) as PracticePreview)[
            rating
          ];
          const settings = getSettings(userId);
          if (result.position !== settings.practice_position + 1)
            throw new ReviewConflictError();
          database
            .prepare(
              `INSERT INTO review_settings
            (user_id, daily_new_limit, practice_position, updated_at) VALUES (?, ?, ?, ?)
            ON CONFLICT (user_id) DO UPDATE SET practice_position = excluded.practice_position, updated_at = excluded.updated_at`,
            )
            .run(userId, settings.daily_new_limit, result.position, timestamp);
          database
            .prepare(
              `INSERT INTO review_practice_cards
            (user_id, card_id, next_position, last_position, success_streak, last_rating, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, card_id) DO UPDATE SET
            next_position = excluded.next_position, last_position = excluded.last_position,
            success_streak = excluded.success_streak, last_rating = excluded.last_rating,
            updated_at = excluded.updated_at`,
            )
            .run(
              userId,
              attempt.card_id,
              result.position + result.gap + 1,
              result.position,
              result.successStreak,
              rating,
              timestamp,
            );
          database
            .prepare(
              `UPDATE review_attempts SET status = 'rated', rating = ?, card_after = ?, review_log = ?, rated_at = ?
            WHERE user_id = ? AND id = ? AND status = 'revealed'`,
            )
            .run(
              rating,
              attempt.card_before,
              JSON.stringify({ mode: "practice", ...result }),
              timestamp,
              userId,
              attemptId,
            );
          event(userId, attempt.element_id, attemptId, "rated", timestamp);
          return getOverview(userId, at);
        }
        const result = (JSON.parse(attempt.preview!) as ReviewPreview)[rating];
        database
          .prepare(
            `UPDATE review_cards SET state = ?, due_at = ?, revision = revision + 1, updated_at = ?
          WHERE user_id = ? AND card_id = ? AND revision = ?`,
          )
          .run(
            JSON.stringify(result.card),
            result.card.due,
            timestamp,
            userId,
            attempt.card_id,
            attempt.card_revision,
          );
        const tomorrow = nextReviewDay(at);
        database
          .prepare(
            `UPDATE review_cards SET buried_until = ?, updated_at = ?
          WHERE user_id = ? AND element_id = ? AND card_id <> ? AND (buried_until IS NULL OR buried_until < ?)`,
          )
          .run(
            tomorrow,
            timestamp,
            userId,
            attempt.element_id,
            attempt.card_id,
            tomorrow,
          );
        database
          .prepare(
            `UPDATE review_attempts SET status = 'rated', rating = ?, card_after = ?, review_log = ?, rated_at = ?
          WHERE user_id = ? AND id = ? AND status = 'revealed'`,
          )
          .run(
            rating,
            JSON.stringify(result.card),
            JSON.stringify(result.log),
            timestamp,
            userId,
            attemptId,
          );
        event(userId, attempt.element_id, attemptId, "rated", timestamp);
        return getOverview(userId, at);
      });
    },

    close() {
      database.close();
    },
  };
}

export type ReviewStore = ReturnType<typeof openReviewStore>;
