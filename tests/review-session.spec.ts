import { expect, test, type Page } from "./fixtures";
import type {
  ReviewAttemptView,
  ReviewCommand,
  ReviewHistoryEntry,
  ReviewOverview,
} from "../src/lib/review-types";

const now = "2026-09-28T10:00:00.000Z";
const dueAt = "2026-09-29T10:00:00.000Z";
const letters = [
  { id: "a", cue: "А а", answer: "a" },
  { id: "m", cue: "М м", answer: "m" },
  { id: "t", cue: "Т т", answer: "t" },
];

function card(index: number, answerText?: string): ReviewAttemptView {
  const letter = letters[index]!;
  return {
    id: `attempt-${letter.id}`,
    mode: "scheduled",
    cardId: `01-lettre-${letter.id}-recognition`,
    elementId: `01-lettre-${letter.id}`,
    direction: "recognition",
    definitionVersion: 1,
    sourceHref: "/parcours/01/cours#les-lettres",
    status: answerText === undefined ? "presented" : "revealed",
    prompt: "Quel son représente cette lettre ?",
    cue: letter.cue,
    cueLang: "uk",
    answerText: answerText ?? null,
    revealed:
      answerText === undefined
        ? null
        : {
            answer: letter.answer,
            answerLang: "fr",
            details: "Repère français approximatif.",
            options: ["again", "hard", "good", "easy"].map((rating) => ({
              rating: rating as "again" | "hard" | "good" | "easy",
              dueAt,
              practiceGap: null,
            })),
          },
  };
}

function history(
  index: number,
  answerText = letters[index]!.answer,
): ReviewHistoryEntry {
  const attempt = card(index);
  return {
    id: attempt.id,
    mode: "scheduled",
    cardId: attempt.cardId,
    elementId: attempt.elementId,
    label: attempt.cue,
    direction: attempt.direction,
    rating: "good",
    answerText,
    reviewedAt: now,
    dueAt,
  };
}

function overview(
  active: ReviewAttemptView | null,
  recent: ReviewHistoryEntry[] = [],
  overrides: Partial<ReviewOverview> = {},
): ReviewOverview {
  const remaining = letters.length - recent.length;
  return {
    now,
    timeZone: "Europe/Paris",
    dailyNewLimit: 5,
    newToday: recent.length + (active ? 1 : 0),
    eligibleCount: remaining,
    reviewDueCount: 0,
    newAvailableCount: remaining,
    selectedCount: letters.length,
    practiceAvailableCount: 0,
    packs: [],
    nextAvailableAt: recent.length ? dueAt : null,
    elements: letters.map((letter) => ({
      id: `01-lettre-${letter.id}`,
      moduleId: "01",
      kind: "letter",
      label: letter.cue,
      sourceHref: "/parcours/01/cours#les-lettres",
      selected: true,
      active: true,
      cardCount: 1,
      reviewedCount: recent.some((entry) => entry.id === `attempt-${letter.id}`)
        ? 1
        : 0,
      nextDueAt: null,
    })),
    active,
    recent,
    ...overrides,
  };
}

type Reply = {
  command: ReviewCommand;
  state: ReviewOverview;
  fail?: "lost-response" | "unavailable";
  wait?: Promise<void>;
};

// Script API boundaries, not scheduling: these snapshots describe cards that
// the server has already selected and recorded.
async function mockReviews(
  page: Page,
  initial: ReviewOverview,
  replies: Reply[],
) {
  const commands: ReviewCommand[] = [];
  let current = initial;
  await page.route("**/api/reviews", async (route) => {
    if (route.request().method() === "POST") {
      const command = route.request().postDataJSON() as ReviewCommand;
      commands.push(command);
      const reply = replies[commands.length - 1];
      expect(
        reply,
        `Unexpected review command: ${JSON.stringify(command)}`,
      ).toBeDefined();
      expect(command).toEqual(reply!.command);
      if (reply!.wait) await reply!.wait;
      current = reply!.state;
      if (reply!.fail === "lost-response") return route.abort("failed");
      if (reply!.fail === "unavailable")
        return route.fulfill({
          status: 503,
          json: { message: "Le serveur est momentanément indisponible." },
        });
    }
    await route.fulfill({ status: 200, json: current });
  });
  return commands;
}

const activeCard = (page: Page) =>
  page.getByRole("region", { name: "Carte de révision" });
const rate = (index: number): ReviewCommand => ({
  type: "rate",
  attemptId: card(index).id,
  rating: "good",
});
const reveal = (index: number, answerText: string): ReviewCommand => ({
  type: "reveal",
  attemptId: card(index).id,
  answerText,
});

async function answerAndReveal(page: Page, answer: string) {
  await activeCard(page).getByRole("textbox").fill(answer);
  await activeCard(page)
    .getByRole("button", { name: "Révéler la réponse", exact: true })
    .click();
  await expect(
    activeCard(page).getByRole("heading", { name: "La réponse", exact: true }),
  ).toBeFocused();
}

test("continues through three cards with a fresh answer and focus, then stops when none are eligible", async ({
  page,
}) => {
  const replies: Reply[] = [];
  const completed: ReviewHistoryEntry[] = [];
  for (let index = 0; index < letters.length; index++) {
    replies.push(
      {
        command: { type: "start" },
        state: overview(card(index), [...completed]),
      },
      {
        command: reveal(index, letters[index]!.answer),
        state: overview(card(index, letters[index]!.answer), [...completed]),
      },
    );
    completed.unshift(history(index));
    replies.push({
      command: rate(index),
      state: overview(null, [...completed]),
    });
  }
  const commands = await mockReviews(page, overview(null), replies);
  await page.goto("/revisions");
  await expect(
    page.getByRole("heading", { name: "Prêt pour un rappel ?" }),
  ).toBeVisible();
  expect(commands).toEqual([]);
  await page.getByRole("button", { name: /^Commencer/ }).click();
  for (let index = 0; index < letters.length; index++) {
    await expect(activeCard(page)).toHaveAttribute(
      "data-review-attempt-id",
      card(index).id,
    );
    await expect(activeCard(page).getByRole("textbox")).toHaveValue("");
    await expect(
      activeCard(page).getByRole("heading", { level: 2 }),
    ).toBeFocused();
    await expect(
      activeCard(page).getByRole("heading", {
        name: "La réponse",
        exact: true,
      }),
    ).toHaveCount(0);
    await answerAndReveal(page, letters[index]!.answer);
    await activeCard(page).getByRole("button", { name: /^Bien/ }).click();
  }
  await expect(activeCard(page)).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Tes révisions sont à jour pour le moment",
    }),
  ).toBeFocused();
  await expect(page.locator(".review-history-list > li")).toHaveCount(3);
  expect(commands).toEqual(replies.map((reply) => reply.command));
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Tes révisions sont à jour pour le moment",
    }),
  ).toBeVisible();
  expect(commands).toHaveLength(9);
});

test("retries only the next card after its start fails, keeping the confirmed rating", async ({
  page,
}) => {
  const rated = overview(null, [history(0)]);
  const commands = await mockReviews(page, overview(card(0, "a")), [
    { command: rate(0), state: rated },
    { command: { type: "start" }, state: rated, fail: "unavailable" },
    { command: { type: "start" }, state: overview(card(1), [history(0)]) },
  ]);
  await page.goto("/revisions");
  await activeCard(page).getByRole("button", { name: /^Bien/ }).click();
  await expect(page.locator(".review-error[role=alert]")).toBeVisible();
  await expect(activeCard(page)).toHaveCount(0);
  await expect(page.locator(".review-history-list > li")).toHaveCount(1);
  await page.getByRole("button", { name: /Réessayer/ }).click();
  await expect(activeCard(page)).toHaveAttribute(
    "data-review-attempt-id",
    card(1).id,
  );
  await expect(activeCard(page).getByRole("textbox")).toHaveValue("");
  expect(commands).toEqual([rate(0), { type: "start" }, { type: "start" }]);
});

test("retries the exact rating after a lost response and then continues once", async ({
  page,
}) => {
  const rated = overview(null, [history(0)]);
  const commands = await mockReviews(page, overview(card(0, "a")), [
    { command: rate(0), state: rated, fail: "lost-response" },
    { command: rate(0), state: rated },
    { command: { type: "start" }, state: overview(card(1), [history(0)]) },
  ]);
  await page.goto("/revisions");
  await activeCard(page).getByRole("button", { name: /^Bien/ }).click();
  await expect(page.locator(".review-error[role=alert]")).toContainText(
    "injoignable",
  );
  await expect(activeCard(page)).toHaveAttribute(
    "data-review-attempt-id",
    card(0).id,
  );
  await expect(
    activeCard(page).getByRole("button", { name: /^Bien/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /Réessayer/ }).click();
  await expect(activeCard(page)).toHaveAttribute(
    "data-review-attempt-id",
    card(1).id,
  );
  expect(commands).toEqual([rate(0), rate(0), { type: "start" }]);
});

test("stops at the daily limit without starting an ineligible card", async ({
  page,
}) => {
  const capped = overview(null, [history(0)], {
    newToday: 5,
    eligibleCount: 0,
    newAvailableCount: 0,
  });
  const commands = await mockReviews(
    page,
    overview(card(0, "a"), [], { newToday: 5 }),
    [{ command: rate(0), state: capped }],
  );
  await page.goto("/revisions");
  await activeCard(page).getByRole("button", { name: /^Bien/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "Tes révisions sont à jour pour le moment",
    }),
  ).toBeFocused();
  await expect(
    page.getByText(/5 nouvelles cartes déjà présentées aujourd’hui/),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", {
      name: "Nouvelles cartes par jour",
      exact: true,
    }),
  ).toHaveValue("5");
  expect(commands).toEqual([rate(0)]);
});

test("does not start another card after leaving while the rating is in flight", async ({
  page,
}) => {
  let releaseRating!: () => void;
  const pending = new Promise<void>((resolve) => {
    releaseRating = resolve;
  });
  const commands = await mockReviews(page, overview(card(0, "a")), [
    { command: rate(0), state: overview(null, [history(0)]), wait: pending },
  ]);
  await page.goto("/revisions");
  await activeCard(page).getByRole("button", { name: /^Bien/ }).click();
  await expect.poll(() => commands.length).toBe(1);
  await activeCard(page)
    .getByRole("link", { name: "Revenir à l’accueil", exact: true })
    .click();
  await expect(page).toHaveURL("/");
  const rated = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/reviews" &&
      response.request().method() === "POST",
  );
  releaseRating();
  await rated;
  await page
    .getByRole("navigation", { name: "Choisir une activité" })
    .getByRole("link", { name: /révisions/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/revisions$/);
  await expect(
    page.getByRole("heading", { name: "Prêt pour un rappel ?" }),
  ).toBeVisible();
  expect(commands).toEqual([rate(0)]);
});

function practiceCard(index: number, answerText?: string): ReviewAttemptView {
  const attempt = card(index, answerText);
  return {
    ...attempt,
    mode: "practice",
    revealed: attempt.revealed
      ? {
          ...attempt.revealed,
          options: attempt.revealed.options.map((option, order) => ({
            rating: option.rating,
            dueAt: null,
            practiceGap: [1, 3, 6, 12][order]!,
          })),
        }
      : null,
  };
}

function practiceHistory(index: number): ReviewHistoryEntry {
  return { ...history(index), mode: "practice", dueAt: null };
}

function practiceOverview(
  active: ReviewAttemptView | null,
  recent: ReviewHistoryEntry[] = [],
) {
  return overview(active, recent, {
    newToday: 5,
    eligibleCount: 0,
    reviewDueCount: 0,
    newAvailableCount: 0,
    practiceAvailableCount: letters.length,
  });
}

test("retries a lost practice rating exactly, resumes after reload and stops after the chosen card", async ({
  page,
}) => {
  const firstRated = practiceOverview(null, [practiceHistory(0)]);
  const secondPresented = practiceOverview(practiceCard(1), [
    practiceHistory(0),
  ]);
  const replies: Reply[] = [
    {
      command: { type: "start-practice" },
      state: practiceOverview(practiceCard(0)),
    },
    {
      command: reveal(0, "a"),
      state: practiceOverview(practiceCard(0, "a")),
    },
    { command: rate(0), state: firstRated, fail: "lost-response" },
    { command: rate(0), state: firstRated },
    { command: { type: "start-practice" }, state: secondPresented },
    {
      command: reveal(1, "m"),
      state: practiceOverview(practiceCard(1, "m"), [practiceHistory(0)]),
    },
    {
      command: rate(1),
      state: practiceOverview(null, [practiceHistory(1), practiceHistory(0)]),
    },
  ];
  const commands = await mockReviews(page, practiceOverview(null), replies);
  await page.goto("/revisions");
  await page
    .getByRole("button", { name: "Continuer à m’entraîner", exact: true })
    .click();
  await answerAndReveal(page, "a");
  await activeCard(page).getByRole("button", { name: /^Bien/ }).click();
  await expect(page.locator(".review-error[role=alert]")).toContainText(
    "injoignable",
  );
  await expect(
    activeCard(page).getByRole("button", { name: /^Bien/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /Réessayer/ }).click();
  await expect(activeCard(page)).toHaveAttribute(
    "data-review-attempt-id",
    card(1).id,
  );
  await page.reload();
  await expect(activeCard(page)).toHaveAttribute(
    "data-review-attempt-id",
    card(1).id,
  );
  await activeCard(page)
    .getByRole("button", { name: "Terminer après cette carte", exact: true })
    .click();
  await answerAndReveal(page, "m");
  await activeCard(page).getByRole("button", { name: /^Bien/ }).click();
  await expect(activeCard(page)).toHaveCount(0);
  await expect(page.locator(".review-history-list > li")).toHaveCount(2);
  await expect(
    page.getByRole("button", {
      name: "Continuer à m’entraîner",
      exact: true,
    }),
  ).toBeVisible();
  expect(commands).toEqual(replies.map((reply) => reply.command));
});

test("retries only start-practice when the next practice card fails to load", async ({
  page,
}) => {
  const rated = practiceOverview(null, [practiceHistory(0)]);
  const replies: Reply[] = [
    {
      command: { type: "start-practice" },
      state: practiceOverview(practiceCard(0)),
    },
    {
      command: reveal(0, "a"),
      state: practiceOverview(practiceCard(0, "a")),
    },
    { command: rate(0), state: rated },
    { command: { type: "start-practice" }, state: rated, fail: "unavailable" },
    {
      command: { type: "start-practice" },
      state: practiceOverview(practiceCard(1), [practiceHistory(0)]),
    },
  ];
  const commands = await mockReviews(page, practiceOverview(null), replies);
  await page.goto("/revisions");
  await page
    .getByRole("button", { name: "Continuer à m’entraîner", exact: true })
    .click();
  await answerAndReveal(page, "a");
  await activeCard(page).getByRole("button", { name: /^Bien/ }).click();
  await expect(page.locator(".review-error[role=alert]")).toBeVisible();
  await expect(activeCard(page)).toHaveCount(0);
  await expect(page.locator(".review-history-list > li")).toHaveCount(1);
  await page.getByRole("button", { name: /Réessayer/ }).click();
  await expect(activeCard(page)).toHaveAttribute(
    "data-review-attempt-id",
    card(1).id,
  );
  expect(commands).toEqual(replies.map((reply) => reply.command));
});
