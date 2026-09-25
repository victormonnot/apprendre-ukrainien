import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "./fixtures";
import { randomUUID } from "node:crypto";
import type {
  SceneCommand,
  SceneRoleId,
  SceneWorkspace,
} from "../src/lib/scene-types";

type Variant = "rencontre" | "retrouvailles";
const endpoint = "/api/scenes";

async function workspace(
  request: APIRequestContext,
  variant: Variant = "rencontre",
  role: SceneRoleId = "maxime",
): Promise<SceneWorkspace> {
  const query = new URLSearchParams({ scene: "01-cafe", variant, role });
  const response = await request.get(`${endpoint}?${query}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toMatch(/\bno-store\b/);
  return response.json();
}

function post(
  request: APIRequestContext,
  baseURL: string | undefined,
  command: unknown,
) {
  return request.post(endpoint, {
    headers: { Origin: baseURL! },
    data: command,
  });
}

function commandFor(
  value: SceneWorkspace,
  type: SceneCommand["type"],
  answers: Record<string, string>,
): SceneCommand {
  return {
    type,
    requestId: randomUUID(),
    sceneId: value.scene.id,
    variantId: value.scene.variantId,
    version: value.scene.version,
    roleId: value.roleId,
    expectedRevision: value.draft.revision,
    answers,
    helpUsed: false,
  };
}

async function emptyDraft(
  request: APIRequestContext,
  baseURL: string | undefined,
  variant: Variant = "rencontre",
  role: SceneRoleId = "maxime",
) {
  const value = await workspace(request, variant, role);
  const answers = Object.fromEntries(
    Object.keys(value.draft.answers).map((id) => [id, ""]),
  );
  const response = await post(
    request,
    baseURL,
    commandFor(value, "save", answers),
  );
  expect(response.status()).toBe(200);
  return response.json() as Promise<SceneWorkspace>;
}

function commandResponse(page: Page, type: SceneCommand["type"], status = 200) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === endpoint &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.type === type &&
      response.status() === status,
  );
}

async function enterPractice(
  page: Page,
  variant: Variant = "rencontre",
  role: SceneRoleId = "maxime",
) {
  await page
    .getByLabel("Version de la scène", { exact: true })
    .selectOption(variant);
  await page
    .getByRole("button", { name: "Prendre un rôle", exact: true })
    .click();
  const panel = page.locator(".cafe-practice");
  const selector = panel.getByLabel("Mon personnage", { exact: true });
  await expect(selector).toBeEnabled();
  await selector.selectOption(role);
  await expect(selector).toHaveValue(role);
  await expect(selector).toBeEnabled();
  await expect(panel.locator(`#answer-${role}-greeting`)).toBeVisible();
  await expect(panel.getByRole("textbox")).toHaveCount(4);
  return panel;
}

async function openPractice(
  page: Page,
  variant: Variant = "rencontre",
  role: SceneRoleId = "maxime",
) {
  await page.goto("/cafe");
  return enterPractice(page, variant, role);
}

async function save(page: Page, panel: Locator) {
  const response = commandResponse(page, "save");
  await panel
    .getByRole("button", { name: "Enregistrer le brouillon", exact: true })
    .click();
  const value = (await (await response).json()) as SceneWorkspace;
  await expect(
    panel.getByText("Brouillon enregistré.", { exact: true }),
  ).toBeVisible();
  return value;
}

async function fillAnswers(panel: Locator, answers: Record<string, string>) {
  for (const [id, answer] of Object.entries(answers))
    await panel.locator(`#answer-${id}`).fill(answer);
}

function modelAnswers(value: SceneWorkspace) {
  return Object.fromEntries(
    value.scene.lines
      .filter((line) => line.speakerId === value.roleId)
      .map((line) => [line.id, line.ukrainian]),
  );
}

test.describe("café written roles", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    ({ isMobile }) => isMobile,
    "These persistence checks share one server profile.",
  );

  test("saves drafts, restores them after reload and isolates characters and variants", async ({
    page,
    request,
    baseURL,
  }) => {
    for (const variant of ["rencontre", "retrouvailles"] as const)
      for (const role of ["anna", "maxime"] as const)
        await emptyDraft(request, baseURL, variant, role);

    let panel = await openPractice(page);
    await panel.locator("#answer-maxime-greeting").fill("Добрий день!");
    const saved = await save(page, panel);
    expect(saved.draft.answers["maxime-greeting"]).toBe("Добрий день!");
    expect(saved.draft.answers["maxime-introduction"]).toBe("");

    await page.reload();
    panel = await enterPractice(page);
    await expect(panel.locator("#answer-maxime-greeting")).toHaveValue(
      "Добрий день!",
    );
    await panel.locator("#answer-maxime-greeting").fill("Привіт!");
    const leaveRole = commandResponse(page, "save");
    await panel
      .getByLabel("Mon personnage", { exact: true })
      .selectOption("anna");
    await leaveRole;
    await expect(panel.locator("#answer-anna-greeting")).toHaveValue("");
    await panel.locator("#answer-anna-introduction").fill("Мене звати Анна.");

    const leaveVariant = commandResponse(page, "save");
    await page
      .getByLabel("Version de la scène", { exact: true })
      .selectOption("retrouvailles");
    await leaveVariant;
    panel = page.locator(".cafe-practice");
    await expect(
      panel.getByLabel("Mon personnage", { exact: true }),
    ).toHaveValue("maxime");
    await expect(panel.locator("#answer-maxime-greeting")).toHaveValue("");
    await panel.locator("#answer-maxime-greeting").fill("Привіт!");
    await save(page, panel);

    expect(
      (await workspace(request, "rencontre", "maxime")).draft.answers[
        "maxime-greeting"
      ],
    ).toBe("Привіт!");
    expect(
      (await workspace(request, "rencontre", "anna")).draft.answers[
        "anna-introduction"
      ],
    ).toBe("Мене звати Анна.");
    expect(
      Object.values(
        (await workspace(request, "retrouvailles", "anna")).draft.answers,
      ),
    ).toEqual(["", "", "", ""]);

    await page
      .getByLabel("Version de la scène", { exact: true })
      .selectOption("rencontre");
    await expect(panel.locator("#answer-maxime-greeting")).toHaveValue(
      "Привіт!",
    );
    await panel
      .getByLabel("Mon personnage", { exact: true })
      .selectOption("anna");
    await expect(panel.locator("#answer-anna-introduction")).toHaveValue(
      "Мене звати Анна.",
    );
  });

  test("submits a complete attempt once, records help and keeps alternative phrasing for comparison", async ({
    page,
    request,
    baseURL,
  }) => {
    const initial = await emptyDraft(request, baseURL);
    const learningBefore = await (await request.get("/api/learning")).json();
    const panel = await openPractice(page);
    const submit = panel.getByRole("button", {
      name: "Remettre mon essai",
      exact: true,
    });
    await expect(submit).toBeDisabled();
    await panel.locator("#answer-maxime-greeting").fill("Добрий день!");
    await expect(submit).toBeDisabled();
    const answers = {
      ...modelAnswers(initial),
      "maxime-welcome": "Нема за що.",
    };
    await fillAnswers(panel, answers);
    await panel
      .getByRole("button", { name: "Voir le modèle", exact: true })
      .first()
      .click();
    await expect(panel.getByRole("checkbox")).toBeChecked();
    await panel
      .getByRole("button", { name: "Masquer le modèle", exact: true })
      .click();

    const submission = commandResponse(page, "submit");
    await submit.click();
    const response = await submission;
    const command = response.request().postDataJSON() as SceneCommand;
    const result = (await response.json()) as SceneWorkspace;
    expect(result.attempts).toHaveLength(initial.attempts.length + 1);
    const original = result.attempts[0]!;
    expect(original.answers).toEqual(answers);
    expect(original.helpUsed).toBe(true);
    expect(
      original.feedback.filter((entry) => entry.status === "matches"),
    ).toHaveLength(3);
    expect(
      original.feedback.find((entry) => entry.lineId === "maxime-welcome"),
    ).toMatchObject({
      answer: "Нема за що.",
      status: "compare",
      reference: "Будь ласка.",
    });
    await expect(panel.locator(".cafe-history details").first()).toContainText(
      "Avec aide",
    );
    await expect(
      panel
        .locator(".cafe-history details")
        .first()
        .getByText("Formulation à comparer", { exact: true }),
    ).toHaveCount(1);
    for (const field of await panel.getByRole("textbox").all())
      await expect(field).toHaveValue("");

    await panel.locator("#answer-maxime-greeting").fill("Наступна спроба");
    const retried = await save(page, panel);
    expect(
      retried.attempts.find((attempt) => attempt.id === original.id),
    ).toEqual(original);
    const duplicate = await post(request, baseURL, command);
    expect(duplicate.status()).toBe(200);
    const duplicateResult = (await duplicate.json()) as SceneWorkspace;
    expect(duplicateResult.attempts).toEqual(retried.attempts);
    expect(duplicateResult.draft).toEqual(retried.draft);
    const altered = await post(request, baseURL, {
      ...command,
      answers: { ...command.answers, "maxime-welcome": "Будь ласка." },
    });
    expect(altered.status()).toBe(409);
    expect((await workspace(request)).attempts).toEqual(retried.attempts);
    expect(await (await request.get("/api/learning")).json()).toEqual(
      learningBefore,
    );
  });

  test("rejects incomplete submissions, invalid roles and injected feedback without changing saved work", async ({
    request,
    baseURL,
  }) => {
    const initial = await emptyDraft(request, baseURL, "retrouvailles", "anna");
    const valid = commandFor(initial, "submit", modelAnswers(initial));
    const firstId = Object.keys(valid.answers)[0]!;
    for (const invalid of [
      { ...valid, answers: { ...valid.answers, [firstId]: "  " } },
      { ...valid, answers: {} },
      { ...valid, answers: { ...valid.answers, "maxime-greeting": "Привіт!" } },
      { ...valid, answers: { ...valid.answers, [firstId]: "я".repeat(501) } },
      { ...valid, roleId: "unknown" },
      { ...valid, feedback: [{ lineId: firstId, status: "matches" }] },
      { ...valid, helpUsed: "false" },
      { ...valid, expectedRevision: -1 },
      { ...valid, requestId: "" },
    ]) {
      const response = await post(request, baseURL, invalid);
      expect(response.status(), JSON.stringify(invalid).slice(0, 150)).toBe(
        400,
      );
      expect(Object.keys(await response.json())).toEqual(["message"]);
    }
    expect(
      (await post(request, baseURL, { ...valid, version: 2 })).status(),
    ).toBe(404);
    expect(
      (
        await request.post(endpoint, {
          headers: { Origin: "https://example.com" },
          data: valid,
        })
      ).status(),
    ).toBe(403);
    expect((await request.post(endpoint, { data: valid })).status()).toBe(403);
    expect(await workspace(request, "retrouvailles", "anna")).toEqual(initial);
  });

  test("recovers a submitted attempt after its response is lost and never submits it twice", async ({
    page,
    request,
    baseURL,
  }) => {
    const initial = await emptyDraft(request, baseURL, "retrouvailles");
    let panel = await openPractice(page, "retrouvailles");
    await fillAnswers(panel, modelAnswers(initial));
    let intercepted: SceneCommand | null = null;
    await page.route("**/api/scenes", async (route) => {
      const command = route.request().postDataJSON() as SceneCommand | null;
      if (
        route.request().method() === "POST" &&
        command?.type === "submit" &&
        !intercepted
      ) {
        intercepted = command;
        const delivered = await route.fetch();
        expect(delivered.status()).toBe(200);
        await route.abort("failed");
        return;
      }
      await route.continue();
    });
    await panel
      .getByRole("button", { name: "Remettre mon essai", exact: true })
      .click();
    await expect(panel.getByRole("alert")).toBeVisible();
    await expect(panel.locator("#answer-maxime-greeting")).toHaveValue(
      "Привіт!",
    );
    const delivered = await workspace(request, "retrouvailles");
    expect(delivered.attempts).toHaveLength(initial.attempts.length + 1);
    expect(intercepted).not.toBeNull();
    const original = delivered.attempts[0]!;

    page.once("dialog", (dialog) => dialog.accept());
    await page.reload();
    panel = await enterPractice(page, "retrouvailles");
    await expect(
      panel.getByText(
        "Ton essai avait bien été remis. Il figure dans l’historique.",
        { exact: true },
      ),
    ).toBeVisible();
    for (const field of await panel.getByRole("textbox").all())
      await expect(field).toHaveValue("");
    await expect(panel.locator(".cafe-history details").first()).toContainText(
      "Forme du modèle retrouvée",
    );
    expect((await workspace(request, "retrouvailles")).attempts[0]).toEqual(
      original,
    );
    const replay = await post(request, baseURL, intercepted);
    expect(replay.status()).toBe(200);
    expect(((await replay.json()) as SceneWorkspace).attempts).toEqual(
      delivered.attempts,
    );
  });

  test("compares concurrent drafts before either keeping local text or loading the saved version", async ({
    page,
    context,
    request,
    baseURL,
  }) => {
    await emptyDraft(request, baseURL, "rencontre", "anna");
    const first = await openPractice(page, "rencontre", "anna");
    const otherPage = await context.newPage();
    try {
      const second = await openPractice(otherPage, "rencontre", "anna");
      const firstField = first.locator("#answer-anna-greeting");
      const secondField = second.locator("#answer-anna-greeting");
      await firstField.fill("Добрий день!");
      await secondField.fill("Привіт!");
      const saved = await save(page, first);
      const rejected = commandResponse(otherPage, "save", 409);
      await second
        .getByRole("button", { name: "Enregistrer le brouillon", exact: true })
        .click();
      await rejected;
      await expect(
        second.getByRole("heading", {
          name: "Comparer les deux brouillons",
          exact: true,
        }),
      ).toBeVisible();
      await expect(secondField).toHaveValue("Привіт!");
      await expect(second.locator(".cafe-conflict")).toContainText(
        "Добрий день!",
      );
      await expect(
        second.getByRole("button", { name: "Remettre mon essai", exact: true }),
      ).toBeDisabled();
      expect(await workspace(request, "rencontre", "anna")).toEqual(saved);

      await second
        .getByRole("button", {
          name: "Garder mon texte après comparaison",
          exact: true,
        })
        .click();
      await expect(secondField).toBeEnabled();
      await expect(secondField).toHaveValue("Привіт!");
      const resolved = await save(otherPage, second);
      expect(resolved.draft.answers["anna-greeting"]).toBe("Привіт!");
      expect(resolved.draft.revision).toBe(saved.draft.revision + 1);

      await firstField.fill("Інший текст");
      const nextConflict = commandResponse(page, "save", 409);
      await first
        .getByRole("button", { name: "Enregistrer le brouillon", exact: true })
        .click();
      await nextConflict;
      await first
        .getByRole("button", {
          name: "Utiliser le brouillon enregistré",
          exact: true,
        })
        .click();
      await expect(firstField).toHaveValue("Привіт!");
      await expect(first.locator(".cafe-conflict")).toHaveCount(0);
      expect(await workspace(request, "rencontre", "anna")).toEqual(resolved);
    } finally {
      await otherPage.close();
    }
  });
});
