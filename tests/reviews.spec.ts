import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import type { ReviewCommand, ReviewOverview } from "../src/lib/review-types";

const endpoint = "/api/reviews";
const reviewsPath = "/revisions";

async function overview(request: APIRequestContext) {
  const response = await request.get(endpoint);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toMatch(/\bno-store\b/);
  return (await response.json()) as ReviewOverview;
}

function post(
  request: APIRequestContext,
  baseURL: string | undefined,
  command: unknown,
) {
  if (!baseURL) throw new Error("The application base URL must be configured.");
  return request.post(endpoint, {
    headers: { Origin: new URL(baseURL).origin },
    data: command,
  });
}

async function update(
  request: APIRequestContext,
  baseURL: string | undefined,
  command: ReviewCommand,
) {
  const response = await post(request, baseURL, command);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toMatch(/\bno-store\b/);
  return (await response.json()) as ReviewOverview;
}

function commandResponse(
  page: Page,
  type: ReviewCommand["type"],
  status = 200,
) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === endpoint &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.type === type &&
      response.status() === status,
  );
}

async function clickCommand(
  page: Page,
  type: ReviewCommand["type"],
  button: Locator,
) {
  const response = commandResponse(page, type);
  await button.click();
  return (await (await response).json()) as ReviewOverview;
}

function element(page: Page, id: string) {
  return page.locator(`[data-review-element-id="${id}"]`);
}

function activeCard(page: Page) {
  return page.locator("[data-review-attempt-id]");
}

function persistedState(state: ReviewOverview) {
  return {
    active: state.active,
    recent: state.recent,
    elements: state.elements,
    selectedCount: state.selectedCount,
    newToday: state.newToday,
  };
}

test.describe("native spaced reviews", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    ({ isMobile }) => isMobile,
    "These checks share one server profile.",
  );

  test("shows the course catalogue without enrolling items or inventing previous reviews", async ({
    page,
    request,
  }) => {
    const initial = await overview(request);
    expect(initial.elements).toHaveLength(31);
    expect(
      initial.elements.reduce((total, item) => total + item.cardCount, 0),
    ).toBe(50);
    expect(
      initial.elements.every(
        (item) => !item.selected && !item.active && item.reviewedCount === 0,
      ),
    ).toBe(true);
    expect(initial.selectedCount).toBe(0);
    expect(initial.newToday).toBe(0);
    expect(initial.dailyNewLimit).toBe(5);
    expect(initial.active).toBeNull();
    expect(initial.recent).toEqual([]);

    await page.goto(reviewsPath);
    await expect(
      page.getByRole("heading", { name: "Mes révisions", exact: true }),
    ).toBeVisible();
    await expect(page.locator("[data-review-element-id]")).toHaveCount(31);
    await expect(element(page, "01-mot-kava")).toContainText("кава");
    await expect(activeCard(page)).toHaveCount(0);
    await page.goto("/parcours/01/vocabulaire");
    await expect(
      page.getByRole("link", { name: /révisions/i }).first(),
    ).toBeVisible();
    expect(persistedState(await overview(request))).toEqual(
      persistedState(initial),
    );
  });

  test("activates once, hides the answer until recall, resumes the same card and records one rating", async ({
    page,
    request,
    baseURL,
  }) => {
    await page.goto(reviewsPath);
    const activated = await clickCommand(
      page,
      "activate",
      element(page, "01-mot-kava").getByRole("button", {
        name: "Ajouter кава à mes révisions",
        exact: true,
      }),
    );
    expect(activated.selectedCount).toBe(1);
    const duplicated = await update(request, baseURL, {
      type: "activate",
      elementId: "01-mot-kava",
    });
    expect(persistedState(duplicated)).toEqual(persistedState(activated));
    expect(
      duplicated.elements.find((item) => item.id === "01-mot-kava")?.cardCount,
    ).toBe(2);

    const started = await clickCommand(
      page,
      "start",
      page.getByRole("button", { name: "Commencer une carte", exact: true }),
    );
    const attempt = started.active!;
    expect(attempt.elementId).toBe("01-mot-kava");
    expect(attempt.status).toBe("presented");
    expect(attempt.revealed).toBeNull();
    expect(attempt.answerText).toBeNull();
    for (const state of [started, await overview(request)]) {
      expect(JSON.stringify(state)).not.toMatch(
        /"(?:answer|details|options|snapshot|definition)":/,
      );
    }
    const tooEarly = await post(request, baseURL, {
      type: "rate",
      attemptId: attempt.id,
      rating: "good",
    });
    expect(tooEarly.status()).toBe(409);
    expect((await overview(request)).recent).toEqual([]);
    await expect(activeCard(page)).toHaveAttribute(
      "data-review-attempt-id",
      attempt.id,
    );
    await expect(
      activeCard(page).getByRole("button", { name: /^Bien/ }),
    ).toHaveCount(0);

    await page.reload();
    await expect(activeCard(page)).toHaveAttribute(
      "data-review-attempt-id",
      attempt.id,
    );
    await page.goto("/parcours");
    await page.getByRole("link", { name: /Reprendre ma carte/ }).click();
    await expect(page).toHaveURL(reviewsPath);
    await expect(activeCard(page)).toHaveAttribute(
      "data-review-attempt-id",
      attempt.id,
    );
    const answer = "café, la boisson";
    await activeCard(page).getByRole("textbox").fill(answer);
    const revealed = await clickCommand(
      page,
      "reveal",
      activeCard(page).getByRole("button", {
        name: "Révéler la réponse",
        exact: true,
      }),
    );
    expect(revealed.active?.answerText).toBe(answer);
    expect(revealed.active?.revealed?.answer).toContain("café");
    expect(revealed.active?.revealed?.details).toContain("**ка**-ва");
    expect(
      revealed.active?.revealed?.options.map((option) => option.rating),
    ).toEqual(["again", "hard", "good", "easy"]);
    expect(revealed.recent).toEqual([]);
    await expect(activeCard(page)).toContainText(
      "Repère français approximatif",
    );
    await page.reload();
    await expect(activeCard(page)).toContainText(answer);
    await expect(activeCard(page)).toHaveAttribute(
      "data-review-attempt-id",
      attempt.id,
    );

    const rated = await clickCommand(
      page,
      "rate",
      activeCard(page).getByRole("button", { name: /^Bien/ }),
    );
    expect(rated.active).toBeNull();
    expect(rated.recent).toHaveLength(1);
    expect(rated.recent[0]).toMatchObject({
      id: attempt.id,
      answerText: answer,
      rating: "good",
    });
    expect(rated.newToday).toBe(1);
    const repeated = await update(request, baseURL, {
      type: "rate",
      attemptId: attempt.id,
      rating: "good",
    });
    expect(persistedState(repeated)).toEqual(persistedState(rated));
    const changed = await post(request, baseURL, {
      type: "rate",
      attemptId: attempt.id,
      rating: "easy",
    });
    expect(changed.status()).toBe(409);
    expect((await overview(request)).recent).toEqual(rated.recent);
  });

  test("defers the paired direction and preserves its schedule when paused and reactivated", async ({
    page,
    request,
    baseURL,
  }) => {
    const before = await overview(request);
    expect(before.newAvailableCount).toBe(0);
    expect(before.nextAvailableAt).not.toBeNull();
    expect(
      (await update(request, baseURL, { type: "start" })).active,
    ).toBeNull();
    await page.goto(reviewsPath);
    const paused = await clickCommand(
      page,
      "suspend",
      element(page, "01-mot-kava").getByRole("button", {
        name: "Mettre кава en pause",
        exact: true,
      }),
    );
    expect(
      paused.elements.find((item) => item.id === "01-mot-kava"),
    ).toMatchObject({ selected: true, active: false, reviewedCount: 1 });
    await page.reload();
    const resumed = await clickCommand(
      page,
      "activate",
      element(page, "01-mot-kava").getByRole("button", {
        name: "Réactiver кава",
        exact: true,
      }),
    );
    expect(resumed.elements.find((item) => item.id === "01-mot-kava")).toEqual(
      before.elements.find((item) => item.id === "01-mot-kava"),
    );
    expect(resumed.recent).toEqual(before.recent);
    expect(resumed.newToday).toBe(1);
    expect(
      (await update(request, baseURL, { type: "start" })).active,
    ).toBeNull();
  });

  test("keeps the first submitted recall and rating when two tabs act on the same card", async ({
    page,
    context,
    request,
    baseURL,
  }) => {
    await update(request, baseURL, {
      type: "activate",
      elementId: "01-mot-mova",
    });
    const attempt = (await update(request, baseURL, { type: "start" })).active!;
    await page.goto(reviewsPath);
    const other = await context.newPage();
    try {
      await other.goto(reviewsPath);
      await expect(activeCard(other)).toHaveAttribute(
        "data-review-attempt-id",
        attempt.id,
      );
      await activeCard(page)
        .getByRole("textbox")
        .fill("une langue, le langage");
      const secondAnswer = "Ma réponse indépendante dans le second onglet.";
      await activeCard(other).getByRole("textbox").fill(secondAnswer);
      await clickCommand(
        page,
        "reveal",
        activeCard(page).getByRole("button", {
          name: "Révéler la réponse",
          exact: true,
        }),
      );
      const conflict = commandResponse(other, "reveal", 409);
      await activeCard(other)
        .getByRole("button", { name: "Révéler la réponse", exact: true })
        .click();
      await conflict;
      await expect(other.locator(".review-error[role=alert]")).toBeVisible();
      await expect(activeCard(other).getByRole("textbox")).toHaveValue(
        secondAnswer,
      );
      expect((await overview(request)).active?.answerText).toBe(
        "une langue, le langage",
      );
      await other
        .getByRole("button", { name: "Actualiser les révisions", exact: true })
        .click();
      await expect(activeCard(other)).toContainText("une langue, le langage");
      await other
        .getByText("Une saisie locale est conservée en copie", { exact: true })
        .click();
      await expect(
        other.getByLabel("Saisie conservée", { exact: true }),
      ).toHaveValue(secondAnswer);
      await clickCommand(
        page,
        "rate",
        activeCard(page).getByRole("button", { name: /^Bien/ }),
      );
      const ratingConflict = commandResponse(other, "rate", 409);
      await activeCard(other)
        .getByRole("button", { name: /^Difficile/ })
        .click();
      await ratingConflict;
      await expect(other.locator(".review-error[role=alert]")).toContainText(
        "déjà été évaluée",
      );
      const current = await overview(request);
      expect(
        current.recent.filter((entry) => entry.id === attempt.id),
      ).toHaveLength(1);
      expect(
        current.recent.find((entry) => entry.id === attempt.id)?.rating,
      ).toBe("good");
      expect(current.newToday).toBe(2);
    } finally {
      await other.close();
    }
  });

  test("recovers the exact stored answer and a single review after POST responses are lost", async ({
    page,
    request,
    baseURL,
  }) => {
    await update(request, baseURL, {
      type: "activate",
      elementId: "01-mot-mama",
    });
    const attempt = (await update(request, baseURL, { type: "start" })).active!;
    await page.goto(reviewsPath);
    const answer = "maman — réponse écrite avant la coupure";
    await activeCard(page).getByRole("textbox").fill(answer);
    let loseType: "reveal" | "rate" | null = "reveal";
    await page.route("**/api/reviews", async (route) => {
      if (
        route.request().method() === "POST" &&
        route.request().postDataJSON()?.type === loseType
      ) {
        loseType = null;
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        await route.abort("failed");
      } else await route.continue();
    });
    await activeCard(page)
      .getByRole("button", { name: "Révéler la réponse", exact: true })
      .click();
    await expect(page.locator(".review-error[role=alert]")).toContainText(
      "injoignable",
    );
    await expect(activeCard(page).getByRole("textbox")).toHaveValue(answer);
    expect((await overview(request)).active).toMatchObject({
      id: attempt.id,
      status: "revealed",
      answerText: answer,
    });
    page.once("dialog", (dialog) => dialog.accept());
    await page.reload();
    await expect(activeCard(page)).toHaveAttribute(
      "data-review-attempt-id",
      attempt.id,
    );
    await expect(activeCard(page)).toContainText(answer);

    loseType = "rate";
    await activeCard(page).getByRole("button", { name: /^Bien/ }).click();
    await expect(page.locator(".review-error[role=alert]")).toContainText(
      "injoignable",
    );
    const persisted = await overview(request);
    expect(persisted.active).toBeNull();
    expect(
      persisted.recent.filter((entry) => entry.id === attempt.id),
    ).toHaveLength(1);
    expect(
      persisted.recent.find((entry) => entry.id === attempt.id)?.answerText,
    ).toBe(answer);
    await page.reload();
    await expect(activeCard(page)).toHaveCount(0);
    const repeated = await update(request, baseURL, {
      type: "rate",
      attemptId: attempt.id,
      rating: "good",
    });
    expect(repeated.recent).toEqual(persisted.recent);
    expect(repeated.newToday).toBe(3);
  });

  test("introduces at most five new cards in a day and leaves the next selected item for later", async ({
    page,
    request,
    baseURL,
  }) => {
    for (const elementId of ["01-lettre-a", "01-lettre-m"]) {
      await update(request, baseURL, { type: "activate", elementId });
      const attempt = (await update(request, baseURL, { type: "start" }))
        .active!;
      expect(attempt.elementId).toBe(elementId);
      await update(request, baseURL, {
        type: "reveal",
        attemptId: attempt.id,
        answerText: elementId === "01-lettre-a" ? "a" : "m",
      });
      await update(request, baseURL, {
        type: "rate",
        attemptId: attempt.id,
        rating: "good",
      });
    }
    const selected = await update(request, baseURL, {
      type: "activate",
      elementId: "01-lettre-t",
    });
    expect(selected.newToday).toBe(5);
    expect(selected.dailyNewLimit).toBe(5);
    expect(selected.eligibleCount).toBe(0);
    expect(selected.nextAvailableAt).not.toBeNull();
    const blocked = await update(request, baseURL, { type: "start" });
    expect(blocked.active).toBeNull();
    expect(blocked.recent).toHaveLength(5);
    expect(
      blocked.elements.find((item) => item.id === "01-lettre-t"),
    ).toMatchObject({ active: true, reviewedCount: 0 });
    await page.goto(reviewsPath);
    await expect(activeCard(page)).toHaveCount(0);
    await expect(
      page
        .getByText(/5 nouvelles cartes au maximum par jour ; 5 déjà présentées/)
        .first(),
    ).toBeVisible();
    await expect(element(page, "01-lettre-t")).toContainText("Т т");
  });

  test("rejects foreign requests and client-controlled schedules without changing progress", async ({
    request,
    baseURL,
  }) => {
    const before = await overview(request);
    const priorAttemptId = before.recent[0]!.id;
    for (const command of [
      { type: ["start"] },
      { type: "start", userId: "another-profile" },
      {
        type: "activate",
        elementId: "01-mot-kava",
        dueAt: "2020-01-01T00:00:00Z",
      },
      { type: "rate", attemptId: priorAttemptId, rating: "perfect" },
      { type: "rate", attemptId: priorAttemptId, rating: ["good"] },
      { type: "rate", attemptId: priorAttemptId, rating: "good", interval: 1 },
      { type: "reveal", attemptId: priorAttemptId, answerText: 123 },
      {
        type: "reveal",
        attemptId: priorAttemptId,
        answerText: "a".repeat(2001),
      },
      { type: "suspend", elementId: "../01-mot-kava" },
    ])
      expect((await post(request, baseURL, command)).status()).toBe(400);
    expect(
      (
        await post(request, baseURL, {
          type: "activate",
          elementId: "unknown-item",
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await post(request, baseURL, {
          type: "reveal",
          attemptId: "unknown-attempt",
          answerText: "test",
        })
      ).status(),
    ).toBe(404);
    const foreignHeaders: Record<string, string>[] = [
      {},
      { Origin: "https://outside.example" },
      { Origin: baseURL!, "Sec-Fetch-Site": "cross-site" },
    ];
    for (const headers of foreignHeaders)
      expect(
        (
          await request.post(endpoint, { headers, data: { type: "start" } })
        ).status(),
      ).toBe(403);
    expect(
      (
        await request.get(endpoint, {
          headers: { Origin: "https://outside.example" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.post(endpoint, {
          headers: { Origin: baseURL!, "Content-Type": "text/plain" },
          data: '{"type":"start"}',
        })
      ).status(),
    ).toBe(415);
    expect(
      (
        await request.post(endpoint, {
          headers: { Origin: baseURL!, "Content-Type": "application/json" },
          data: "{",
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await post(request, baseURL, {
          type: "reveal",
          attemptId: priorAttemptId,
          answerText: "a".repeat(140_000),
        })
      ).status(),
    ).toBe(413);
    expect(persistedState(await overview(request))).toEqual(
      persistedState(before),
    );
  });
});
