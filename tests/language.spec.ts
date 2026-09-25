import { expect, test, type APIRequestContext } from "./fixtures";
import { randomUUID } from "node:crypto";
import type {
  LanguageInput,
  LanguageResultContent,
} from "../src/lib/language-types";
import { openLanguageStore } from "../src/lib/server/language-store";
import { openLearningStore } from "../src/lib/server/learning-store";

const input: LanguageInput = {
  mode: "translate",
  text: "café",
  context: "Commander une boisson",
  source: null,
};
const content: LanguageResultContent = {
  title: "Le café, la boisson",
  summary: "Une fiche de test pour la boisson.",
  ambiguity: "Le lieu se traduit différemment.",
  entries: [
    {
      ukrainian: "кава",
      french: "café (boisson)",
      usage: "Nom de la boisson.",
      pronunciation: "KA-va",
      syllables: ["ка", "ва"],
      stressIndex: 0,
      examples: [{ ukrainian: "Це кава.", french: "C’est du café." }],
    },
  ],
  feedback: [],
  practice: "Retrouve le mot sans regarder.",
};
function seed(requestId = randomUUID(), value = input) {
  const directory = process.env.PLAYWRIGHT_DATA_DIR;
  if (!directory) throw new Error("The test database must be isolated.");
  const learning = openLearningStore(directory);
  const store = openLanguageStore(directory);
  try {
    return store.recordResult(learning.getLocalUserId(), {
      requestId,
      input: value,
      content,
      model: "test-fixture",
    });
  } finally {
    store.close();
    learning.close();
  }
}
function post(
  request: APIRequestContext,
  baseURL: string | undefined,
  data: unknown,
) {
  return request.post("/api/language", { headers: { Origin: baseURL! }, data });
}

test.describe("language workshop", () => {
  test("local search, saved references and unavailable assistance remain usable", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/atelier");
    await expect(
      page.getByRole("heading", { name: "Mon atelier de langue" }),
    ).toBeVisible();
    await expect(
      page.getByText("L’assistance n’est pas encore connectée."),
    ).toBeVisible();
    await page.getByLabel("Un mot en français ou en ukrainien").fill("cafe");
    const card = page.locator('[data-language-reference-id="01-mot-kava"]');
    await card.locator("summary").click();
    await expect(card.getByText(/Repère français approximatif/)).toBeVisible();
    if (!isMobile) {
      await card
        .getByRole("button", { name: "Enregistrer la référence" })
        .click();
      await expect(
        card.getByRole("button", { name: "Fiche enregistrée" }),
      ).toBeDisabled();
      await page.reload();
      await page.getByLabel("Mes références enregistrées seulement").check();
      await expect(card).toBeVisible();
    }
    await page
      .getByLabel("Mot ou phrase à traduire", { exact: true })
      .fill("Un texte à retrouver");
    await expect(
      page.getByRole("button", { name: "Traduire ce texte" }),
    ).toBeDisabled();
    await page.reload();
    await expect(
      page.getByLabel("Mot ou phrase à traduire", { exact: true }),
    ).toHaveValue("Un texte à retrouver");
    if (isMobile) {
      await page.setViewportSize({ width: 320, height: 800 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });

  test("selection opens a local contextual lookup without generating a response", async ({
    page,
  }) => {
    let generations = 0;
    page.on("request", (request) => {
      if (
        request.url().includes("/api/language") &&
        request.method() === "POST"
      )
        generations++;
    });
    await page.goto("/parcours/01/vocabulaire");
    await page
      .locator(".prose td [lang=uk]")
      .filter({ hasText: /^кава$/ })
      .first()
      .evaluate((element) => {
        const selection = window.getSelection()!;
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
      });
    const link = page.getByRole("link", { name: "Chercher ou traduire" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(
      page.getByLabel("Mot ou phrase à traduire", { exact: true }),
    ).toHaveValue("кава");
    await expect(
      page.getByLabel("Un mot en français ou en ukrainien"),
    ).toHaveValue("кава");
    await expect(
      page.getByRole("link", { name: "Revenir au passage du cours" }),
    ).toHaveAttribute("href", /vocabulaire#premiers-mots/);
    expect(generations).toBe(0);
  });

  test("rejects invalid sources, drafts, unexpected fields and external requests", async ({
    request,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, "Server validation is independent of viewport.");
    for (const bad of [
      {
        type: "generate",
        requestId: randomUUID(),
        input: { ...input, mode: ["translate"] },
      },
      {
        type: "generate",
        requestId: randomUUID(),
        input: {
          ...input,
          source: {
            kind: "document",
            moduleId: "01",
            view: "cours",
            anchor: "missing",
          },
        },
      },
      { type: "save-reference", elementId: "unknown" },
      { type: "save-result", resultId: "unknown" },
      { type: "save-reference", elementId: "01-mot-kava", userId: "someone" },
    ]) {
      expect([400, 404]).toContain(
        (await post(request, baseURL, bad)).status(),
      );
    }
    expect(
      (
        await request.get("/api/language?exercise=01-6&attempt=missing")
      ).status(),
    ).toBe(404);
    expect(
      (
        await request.post("/api/language", {
          headers: { Origin: "https://external.invalid" },
          data: { type: "save-reference", elementId: "01-mot-kava" },
        })
      ).status(),
    ).toBe(403);
    const missing = await post(request, baseURL, {
      type: "generate",
      requestId: randomUUID(),
      input,
    });
    expect(missing.status()).toBe(503);
    expect(await missing.text()).toContain("pas encore configuré");
  });

  test("cached generation replays and saving deduplicates with context intact", async ({
    request,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, "These checks share one server profile.");
    const original = seed();
    const replay = await post(request, baseURL, {
      type: "generate",
      requestId: original.requestId,
      input,
    });
    expect(replay.status()).toBe(200);
    expect(await replay.json()).toEqual(original);
    const mismatch = await post(request, baseURL, {
      type: "generate",
      requestId: original.requestId,
      input: { ...input, context: "Autre sens" },
    });
    expect(mismatch.status()).toBe(409);
    const first = await (
      await post(request, baseURL, {
        type: "save-result",
        resultId: original.id,
      })
    ).json();
    const duplicate = seed();
    const saved = await (
      await post(request, baseURL, {
        type: "save-result",
        resultId: duplicate.id,
      })
    ).json();
    expect(saved).toEqual(first);
    const read = await request.get(`/api/language?result=${first.id}`);
    expect(read.headers()["cache-control"]).toMatch(/no-store/);
    expect(await read.json()).toEqual(first);
    expect(first.input.context).toBe(input.context);
  });

  test("lost response preserves the draft and retries the exact request before saving", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Mutation and recovery are verified once.");
    const identifiers: string[] = [];
    let failed = false;
    await page.route("**/api/language", async (route) => {
      if (route.request().method() === "GET") {
        const response = await route.fetch();
        const body = await response.json();
        await route.fulfill({ response, json: { ...body, configured: true } });
        return;
      }
      const command = route.request().postDataJSON();
      if (command.type === "generate") {
        identifiers.push(command.requestId);
        if (!failed) {
          failed = true;
          seed(command.requestId, command.input);
          await route.fetch();
          await route.abort("failed");
          return;
        }
      }
      await route.continue();
    });
    await page.goto("/atelier");
    await page
      .getByLabel("Mot ou phrase à traduire", { exact: true })
      .fill("café");
    await page
      .getByLabel("Contexte ou question")
      .fill("Reprise après une coupure réseau");
    await page.getByRole("button", { name: "Traduire ce texte" }).click();
    await expect(page.locator(".language-error")).toContainText("injoignable");
    await page.reload();
    await expect(page.getByLabel("Contexte ou question")).toHaveValue(
      "Reprise après une coupure réseau",
    );
    await page.getByRole("button", { name: "Traduire ce texte" }).click();
    const result = page.locator(".language-result");
    await expect(
      result.getByRole("heading", { name: "Le café, la boisson" }),
    ).toBeVisible();
    expect(identifiers).toHaveLength(2);
    expect(identifiers[0]).toBe(identifiers[1]);
    await expect(result.getByText("Aide générée · à vérifier")).toBeVisible();
    await expect(result.locator('[lang="uk"] strong')).toHaveText("ка");
    await expect(result.getByText(/accent sur la 1re syllabe/)).toBeVisible();
    await result
      .getByRole("button", { name: "Enregistrer cette fiche" })
      .click();
    await expect(
      result.getByRole("button", { name: "Fiche enregistrée" }),
    ).toBeDisabled();
    await page.reload();
    await expect(
      page
        .locator(".language-result")
        .getByRole("button", { name: "Fiche enregistrée" }),
    ).toBeDisabled();
  });
  test("assistance reads the original submitted exercise and cannot replace it with client text", async ({
    page,
    request,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, "Submission ownership is verified once.");
    const headers = { Origin: baseURL! };
    const started = await request.post("/api/exercises/01-6", {
      headers,
      data: { type: "start" },
    });
    expect(started.status()).toBe(200);
    const workspace = await started.json();
    const draft = workspace.draft;
    const answers = Object.fromEntries(
      Object.entries(draft.answers).map(([id, answer]) => [
        id,
        {
          aid: "none",
          fields: Object.fromEntries(
            Object.keys((answer as { fields: object }).fields).map((field) => [
              field,
              "Ma réponse originale",
            ]),
          ),
        },
      ]),
    );
    const submitted = await request.post("/api/exercises/01-6", {
      headers,
      data: {
        type: "submit",
        attemptId: draft.id,
        expectedRevision: draft.revision,
        answers,
        workNote: "Note personnelle à ne pas transmettre",
      },
    });
    expect(submitted.status()).toBe(200);
    const before = await submitted.json();
    const attempt = before.attempts[0];
    const query = new URLSearchParams({
      exercise: "01-6",
      attempt: attempt.id,
    });
    const resolved = await request.get(`/api/language?${query}`);
    expect(resolved.status()).toBe(200);
    const snapshot = await resolved.json();
    expect(snapshot.text).toContain("Ma réponse originale");
    expect(snapshot.text).not.toContain("Note personnelle");
    const cached = seed(randomUUID(), snapshot);
    const replay = await post(request, baseURL, {
      type: "generate",
      requestId: cached.requestId,
      input: { ...snapshot, text: "Une réponse falsifiée" },
    });
    expect(replay.status()).toBe(200);
    expect((await replay.json()).input).toEqual(snapshot);
    expect(await (await request.get("/api/exercises/01-6")).json()).toEqual(
      before,
    );
    let failLoad = true;
    await page.route("**/api/language?exercise=**", async (route) => {
      if (failLoad) {
        failLoad = false;
        await route.abort("failed");
      } else await route.continue();
    });
    await page.goto(`/atelier?${query}`);
    await expect(page.locator(".language-error")).toContainText("injoignable");
    await page.getByRole("button", { name: "Réessayer le chargement" }).click();
    await expect(page.getByLabel("Mes réponses remises")).toHaveValue(
      snapshot.text,
    );
    await expect(page.getByLabel("Mes réponses remises")).toHaveAttribute(
      "readonly",
      "",
    );
    await expect(
      page.getByRole("radio", { name: "Relire un texte" }),
    ).toBeChecked();
  });
});
