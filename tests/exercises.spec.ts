import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "./fixtures";
import type {
  ExerciseAnswers,
  ExerciseWorkspaceState,
} from "../src/lib/exercise-types";

const coursePath = "/parcours/01/cours";
const exercisesPath = "/parcours/01/exercices";
const endpoint = (id: string) => `/api/exercises/${id}`;

async function workspace(request: APIRequestContext, id: string) {
  const response = await request.get(endpoint(id));
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toMatch(/\bno-store\b/);
  return (await response.json()) as ExerciseWorkspaceState;
}

function post(
  request: APIRequestContext,
  baseURL: string | undefined,
  id: string,
  command: unknown,
) {
  if (!baseURL) throw new Error("The application base URL must be configured.");
  return request.post(endpoint(id), {
    headers: { Origin: new URL(baseURL).origin },
    data: command,
  });
}

async function openExercise(page: Page, number: number) {
  const panel = page.locator(`[data-exercise-id="01-${number}"]`);
  const summary = panel.locator(":scope > summary");
  if ((await panel.getAttribute("open")) === null) await summary.click();
  await expect(panel.locator(".exercise-editor")).toBeVisible();
  return panel;
}

function commandResponse(
  page: Page,
  id: string,
  type: "start" | "save" | "submit",
  status = 200,
) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === endpoint(id) &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.type === type &&
      response.status() === status,
  );
}

async function startExercise(page: Page, panel: Locator, id: string) {
  const started = commandResponse(page, id, "start");
  await panel
    .getByRole("button", { name: "Commencer l’exercice", exact: true })
    .click();
  await started;
  await expect(panel.locator(".exercise-form")).toBeVisible();
}

async function saveExercise(page: Page, panel: Locator, id: string) {
  const saved = commandResponse(page, id, "save");
  await panel
    .getByRole("button", { name: "Enregistrer le brouillon", exact: true })
    .click();
  await saved;
  await expect(panel.getByRole("status")).toHaveText("Brouillon enregistré.");
}

async function fillItems(panel: Locator, values: string[]) {
  const items = panel.locator("fieldset.exercise-item");
  await expect(items).toHaveCount(values.length);
  for (let index = 0; index < values.length; index++) {
    const item = items.nth(index);
    await item.getByRole("textbox").fill(values[index]!);
    await item
      .getByLabel("Aide utilisée pour cette question", { exact: true })
      .selectOption("none");
  }
}

test.describe("exercise answers and corrections", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    ({ isMobile }) => isMobile,
    "These checks share one server profile.",
  );

  test("does not reveal corrections before submission and keeps the same draft across both course views", async ({
    page,
    browser,
    baseURL,
    request,
  }) => {
    const initial = await workspace(request, "01-3");
    expect(initial).toEqual({ exerciseId: "01-3", draft: null, attempts: [] });
    await page.goto(coursePath);
    const panel = await openExercise(page, 3);
    await expect(panel.locator(".exercise-feedback")).toHaveCount(0);
    await startExercise(page, panel, "01-3");
    const firstDraft = (await workspace(request, "01-3")).draft!;
    expect(firstDraft.assessment).toBeNull();
    expect(firstDraft.submittedAt).toBeNull();
    expect(JSON.stringify(firstDraft)).not.toContain('"expected":');
    expect(JSON.stringify(firstDraft)).not.toContain('"feedback":');

    await panel
      .getByLabel("Mot ukrainien", { exact: true })
      .nth(0)
      .fill("тато");
    await panel
      .getByLabel("Aide utilisée pour cette question", { exact: true })
      .nth(0)
      .selectOption("resource");
    const note = "Premier passage sur papier, avec la fiche.";
    await panel
      .getByLabel("Note sur mon travail (facultatif)", { exact: true })
      .fill(note);
    await saveExercise(page, panel, "01-3");
    const saved = await workspace(request, "01-3");
    expect(saved.draft?.id).toBe(firstDraft.id);
    expect(saved.draft?.answers["3a"]).toEqual({
      fields: { word: "тато" },
      aid: "resource",
    });
    expect(saved.draft?.assessment).toBeNull();
    expect(saved.attempts).toEqual([]);

    await page.reload();
    const reloaded = await openExercise(page, 3);
    await expect(reloaded.getByLabel("Mot ukrainien").nth(0)).toHaveValue(
      "тато",
    );
    await page
      .getByRole("navigation", { name: "Supports du module", exact: true })
      .getByRole("link", { name: "Exercices", exact: true })
      .click();
    await expect(page).toHaveURL(exercisesPath);
    const sheetPanel = await openExercise(page, 3);
    await expect(sheetPanel.getByLabel("Mot ukrainien").nth(0)).toHaveValue(
      "тато",
    );
    expect((await workspace(request, "01-3")).draft?.id).toBe(firstDraft.id);

    const otherContext = await browser.newContext({ baseURL });
    try {
      const otherPage = await otherContext.newPage();
      await otherPage.goto(exercisesPath);
      const otherPanel = await openExercise(otherPage, 3);
      await expect(otherPanel.getByLabel("Mot ukrainien").nth(0)).toHaveValue(
        "тато",
      );
      await expect(
        otherPanel.getByLabel("Note sur mon travail (facultatif)"),
      ).toHaveValue(note);
      await expect(otherPanel.locator(".exercise-feedback")).toHaveCount(0);
    } finally {
      await otherContext.close();
    }
  });

  test("submits written answers once, explains known mismatches and starts a blank retry without changing the original", async ({
    page,
    request,
    baseURL,
  }) => {
    await page.goto(exercisesPath);
    const panel = await openExercise(page, 3);
    const draft = (await workspace(request, "01-3")).draft!;
    await fillItems(panel, ["тато", "мама", "мама", "мова", "там"]);
    await panel
      .getByLabel("Note sur mon travail (facultatif)")
      .fill("Réponses réellement remises.");
    const submittedResponse = commandResponse(page, "01-3", "submit");
    await panel
      .getByRole("button", { name: "Remettre l’exercice", exact: true })
      .click();
    const response = await submittedResponse;
    const submitted = (await response.json()) as ExerciseWorkspaceState;
    expect(submitted.draft).toBeNull();
    expect(submitted.attempts).toHaveLength(1);
    const original = submitted.attempts[0]!;
    expect(original.id).toBe(draft.id);
    expect(original.assessment?.status).toBe("corrected");
    expect(original.answers["3b"]!.fields.word).toBe("мама");
    expect(original.answers["3b"]!.aid).toBe("none");
    await expect(panel.locator(".exercise-feedback-correct")).toHaveCount(3);
    await expect(panel.locator(".exercise-feedback-incorrect")).toHaveCount(2);
    await expect(
      panel.locator(".exercise-feedback-incorrect").first(),
    ).toContainText("мама signifie « maman »");
    await expect(panel.locator(".exercise-answer").nth(1)).toHaveText("мама");
    await expect(panel.locator(".exercise-form")).toHaveCount(0);

    const duplicate = await post(request, baseURL, "01-3", {
      type: "submit",
      attemptId: original.id,
      expectedRevision: draft.revision,
      answers: original.answers,
      workNote: original.workNote,
    });
    expect(duplicate.status()).toBe(200);
    expect(await duplicate.json()).toEqual(submitted);
    const changedAnswers = structuredClone(original.answers);
    changedAnswers["3b"]!.fields.word = "кава";
    const altered = await post(request, baseURL, "01-3", {
      type: "submit",
      attemptId: original.id,
      expectedRevision: draft.revision,
      answers: changedAnswers,
      workNote: original.workNote,
    });
    expect(altered.status()).toBe(409);

    const retried = commandResponse(page, "01-3", "start");
    await panel
      .getByRole("button", { name: "Réessayer l’exercice", exact: true })
      .click();
    await retried;
    for (const field of await panel.getByLabel("Mot ukrainien").all())
      await expect(field).toHaveValue("");
    for (const aid of await panel
      .getByLabel("Aide utilisée pour cette question")
      .all())
      await expect(aid).toHaveValue("");
    await expect(
      panel.getByLabel("Note sur mon travail (facultatif)"),
    ).toHaveValue("");
    const retry = await workspace(request, "01-3");
    expect(retry.draft?.retryOf).toBe(original.id);
    expect(retry.draft?.number).toBe(original.number + 1);
    expect(retry.draft?.assessment).toBeNull();
    expect(retry.attempts).toEqual([original]);
    const summary = await request.get("/api/exercises?moduleId=01");
    expect(summary.status()).toBe(200);
    expect(summary.headers()["cache-control"]).toMatch(/\bno-store\b/);
    expect(
      (await summary.json()).exercises.find(
        (entry: { id: string }) => entry.id === "01-3",
      ),
    ).toMatchObject({
      hasDraft: true,
      submissions: 1,
      latestStatus: "corrected",
    });
  });

  test("keeps free productions awaiting review without marking them wrong or correct", async ({
    page,
    request,
  }) => {
    await page.goto(exercisesPath);
    const panel = await openExercise(page, 7);
    await startExercise(page, panel, "01-7");
    const values = [
      "Добрий день!",
      "Мене звати Максим.",
      "Дякую!",
      "До побачення!",
    ];
    await fillItems(panel, values);
    const submitted = commandResponse(page, "01-7", "submit");
    await panel
      .getByRole("button", { name: "Remettre l’exercice", exact: true })
      .click();
    await submitted;
    await expect(panel.locator(".exercise-feedback-pending")).toHaveCount(4);
    await expect(
      panel.locator(".exercise-feedback-correct, .exercise-feedback-incorrect"),
    ).toHaveCount(0);
    await expect(panel.locator(".exercise-attempt > summary")).toContainText(
      "En attente de correction",
    );
    const result = (await workspace(request, "01-7")).attempts[0]!;
    expect(result.assessment?.status).toBe("pending");
    expect(
      Object.values(result.answers).map((answer) => answer.fields.answer),
    ).toEqual(values);
    expect(
      result.assessment?.items.every((item) =>
        item.fields.every((field) => field.status === "pending"),
      ),
    ).toBe(true);
  });

  test("rejects malformed commands and injected grades without exposing a correction", async ({
    request,
    baseURL,
  }) => {
    const initial = await post(request, baseURL, "01-6", { type: "start" });
    expect(initial.status()).toBe(200);
    const state = (await initial.json()) as ExerciseWorkspaceState;
    const draft = state.draft!;
    const answers: ExerciseAnswers = Object.fromEntries(
      Object.entries(draft.answers).map(([id, answer]) => [
        id,
        {
          fields: Object.fromEntries(
            Object.keys(answer.fields).map((fieldId) => [
              fieldId,
              "Réponse à vérifier",
            ]),
          ),
          aid: "none",
        },
      ]),
    );
    const valid = {
      type: "save",
      attemptId: draft.id,
      expectedRevision: draft.revision,
      answers,
      workNote: "",
    };
    const firstId = Object.keys(answers)[0]!;
    const firstFieldId = Object.keys(answers[firstId]!.fields)[0]!;
    const invalid = [
      [],
      { ...valid, userId: "another-profile" },
      { ...valid, status: "submitted" },
      { ...valid, assessment: { status: "corrected", items: [] } },
      { ...valid, grade: 100 },
      { ...valid, type: ["save"] },
      { ...valid, answers: [] },
      {
        ...valid,
        answers: {
          ...answers,
          [firstId]: { ...answers[firstId], aid: ["none"] },
        },
      },
      {
        ...valid,
        answers: { ...answers, [firstId]: { ...answers[firstId], fields: [] } },
      },
      {
        ...valid,
        answers: {
          ...answers,
          [firstId]: { ...answers[firstId], grade: "correct" },
        },
      },
      { ...valid, answers: { ...answers, extra: answers[firstId] } },
      {
        ...valid,
        answers: {
          ...answers,
          [firstId]: { ...answers[firstId], fields: { extra: "Inventé" } },
        },
      },
      { ...valid, expectedRevision: 0 },
      {
        ...valid,
        type: "submit",
        answers: { ...answers, [firstId]: { ...answers[firstId], aid: null } },
      },
      {
        ...valid,
        type: "submit",
        answers: {
          ...answers,
          [firstId]: { ...answers[firstId], fields: { [firstFieldId]: "   " } },
        },
      },
      { type: "start", retryOf: [] },
    ];
    for (const command of invalid) {
      const response = await post(request, baseURL, "01-6", command);
      expect(response.status(), JSON.stringify(command).slice(0, 200)).toBe(
        400,
      );
      const value = await response.json();
      expect(Object.keys(value)).toEqual(["message"]);
      expect(JSON.stringify(value)).not.toContain('"expected":');
    }
    expect(await workspace(request, "01-6")).toEqual(state);
    for (const origin of ["https://example.com", "null"]) {
      const response = await request.post(endpoint("01-6"), {
        headers: { Origin: origin },
        data: valid,
      });
      expect(response.status()).toBe(403);
    }
    expect(
      (await request.post(endpoint("01-6"), { data: valid })).status(),
    ).toBe(403);
    expect(
      (
        await request.post(endpoint("01-6"), {
          headers: { Host: "example.com", Origin: "http://example.com" },
          data: valid,
        })
      ).status(),
    ).toBe(403);
    expect((await request.get(endpoint("99-1"))).status()).toBe(404);
    expect(
      (
        await post(request, baseURL, "01-6", {
          ...valid,
          attemptId: "missing-attempt",
        })
      ).status(),
    ).toBe(404);
    const otherExercise = (await workspace(request, "01-3")).draft!;
    expect(
      (
        await post(request, baseURL, "01-6", {
          ...valid,
          attemptId: otherExercise.id,
        })
      ).status(),
    ).toBe(404);
    expect(await workspace(request, "01-6")).toEqual(state);
  });

  test("preserves a second editor’s draft when another tab saves a newer revision", async ({
    page,
    context,
    request,
  }) => {
    await page.goto(exercisesPath);
    const first = await openExercise(page, 3);
    const otherPage = await context.newPage();
    try {
      await otherPage.goto(coursePath);
      const second = await openExercise(otherPage, 3);
      const firstAnswer = first.getByLabel("Mot ukrainien").nth(0);
      const secondAnswer = second.getByLabel("Mot ukrainien").nth(0);
      await firstAnswer.fill("тато");
      await secondAnswer.fill("Mon brouillon concurrent");
      await saveExercise(page, first, "01-3");
      const saved = await workspace(request, "01-3");
      const conflict = commandResponse(otherPage, "01-3", "save", 409);
      await second
        .getByRole("button", { name: "Enregistrer le brouillon", exact: true })
        .click();
      expect((await (await conflict).json()).workspace).toEqual(saved);
      await expect(secondAnswer).toHaveValue("Mon brouillon concurrent");
      await expect(
        second.getByRole("heading", {
          name: "Une autre version est enregistrée",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        second.getByLabel("Mes réponses dans cet onglet — à copier si besoin", {
          exact: true,
        }),
      ).toHaveValue(/Mon brouillon concurrent/);
      await expect(
        second.getByRole("button", {
          name: "Remettre l’exercice",
          exact: true,
        }),
      ).toBeDisabled();
      expect(await workspace(request, "01-3")).toEqual(saved);
      await second
        .getByRole("button", {
          name: "Charger la version enregistrée",
          exact: true,
        })
        .click();
      await expect(secondAnswer).toHaveValue("тато");
      await expect(second.locator(".exercise-conflict")).toHaveCount(0);
    } finally {
      await otherPage.close();
    }
  });

  test("keeps form edits after a failed API request and restores the temporary draft after reload", async ({
    page,
    request,
  }) => {
    await page.goto(exercisesPath);
    let panel = await openExercise(page, 3);
    const saved = await workspace(request, "01-3");
    const localText = "Réponse hors connexion à conserver";
    await panel.getByLabel("Mot ukrainien").nth(0).fill(localText);
    let failures = 0;
    await page.route("**/api/exercises/01-3", async (route) => {
      if (
        route.request().method() === "POST" &&
        route.request().postDataJSON()?.type === "save" &&
        failures === 0
      ) {
        failures += 1;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });
    await panel
      .getByRole("button", { name: "Enregistrer le brouillon", exact: true })
      .click();
    await expect(panel.getByRole("alert")).toBeVisible();
    expect(failures).toBe(1);
    await expect(panel.getByLabel("Mot ukrainien").nth(0)).toHaveValue(
      localText,
    );
    expect(await workspace(request, "01-3")).toEqual(saved);
    page.once("dialog", (dialog) => dialog.accept());
    await page.reload();
    panel = await openExercise(page, 3);
    await expect(panel.getByLabel("Mot ukrainien").nth(0)).toHaveValue(
      localText,
    );
    await expect(panel.getByRole("status")).toHaveText(
      "Brouillon non enregistré retrouvé dans cet onglet.",
    );
    await saveExercise(page, panel, "01-3");
    expect(
      (await workspace(request, "01-3")).draft?.answers["3a"]!.fields.word,
    ).toBe(localText);
  });

  test("prints the exercise instructions without personal answers or corrections", async ({
    page,
  }) => {
    await page.goto(exercisesPath);
    const panel = await openExercise(page, 3);
    await panel.locator(".exercise-attempt > summary").click();
    await expect(panel.locator(".exercise-answer").first()).toBeVisible();
    await expect(page.locator("#exercice-3")).toHaveText(
      "Exercice 3 — Produire à partir du sens",
    );
    await page.emulateMedia({ media: "print" });
    try {
      await expect(panel).toBeHidden();
      await expect(
        page.locator(".exercise-answer:visible, .exercise-feedback:visible"),
      ).toHaveCount(0);
      await expect(page.locator("#exercice-3")).toBeVisible();
      await expect(page.locator("article.prose")).toContainText(
        "Ferme le vocabulaire et écris en ukrainien",
      );
    } finally {
      await page.emulateMedia({ media: "screen" });
    }
  });

  test("records a later recall without claiming oral accuracy or updating the learner’s self-report", async ({
    page,
    request,
    baseURL,
  }) => {
    const learningBefore = await (await request.get("/api/learning")).json();
    await page.goto(exercisesPath);
    const panel = await openExercise(page, 8);
    await expect(panel.locator(".exercise-guidance")).toContainText(
      "en laissant passer au moins une nuit",
    );
    await startExercise(page, panel, "01-8");
    await expect(panel).toContainText("Aucun audio n’est évalué.");
    await fillItems(panel, [
      "мама : maman ; тато : papa ; кава : café ; мова : langue",
      "Привіт! Мене звати Анна.",
      "Pour accompagner une demande et répondre à un merci.",
      "Н : n ; Р : r roulé.",
    ]);
    const submitted = commandResponse(page, "01-8", "submit");
    await panel
      .getByRole("button", { name: "Remettre l’exercice", exact: true })
      .click();
    await submitted;
    const attempt = (await workspace(request, "01-8")).attempts[0]!;
    expect(attempt.submittedAt).not.toBeNull();
    expect(attempt.assessment?.status).toBe("pending");
    await expect(panel.locator(".exercise-feedback-pending")).toHaveCount(4);
    await expect(
      panel.locator(".exercise-feedback-correct, .exercise-feedback-incorrect"),
    ).toHaveCount(0);
    await expect(panel).not.toContainText(
      /prononciation validée|maîtrise acquise|réussite différée/i,
    );
    const learningAfter = await (await request.get("/api/learning")).json();
    for (const before of learningBefore.documents) {
      const after = learningAfter.documents.find(
        (document: { moduleId: string; view: string }) =>
          document.moduleId === before.moduleId &&
          document.view === before.view,
      );
      expect(after.selfReport).toEqual(before.selfReport);
    }
    const duplicate = await post(request, baseURL, "01-8", {
      type: "submit",
      attemptId: attempt.id,
      expectedRevision: attempt.revision - 1,
      answers: attempt.answers,
      workNote: attempt.workNote,
    });
    expect(duplicate.status()).toBe(200);
    expect((await duplicate.json()).attempts).toHaveLength(1);
  });
});
