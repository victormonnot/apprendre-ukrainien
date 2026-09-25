import { expect, test, type APIRequestContext, type Page } from "./fixtures";
import {
  NOTE_MAX_LENGTH,
  REPORT_MAX_LENGTH,
  type LearningCommand,
  type LearningDocumentState,
  type LearningOverview,
} from "../src/lib/learning-types";

const coursePath = "/parcours/01/cours";
const endpoint = "/api/learning";

async function overview(request: APIRequestContext) {
  const response = await request.get(endpoint);
  expect(response.status()).toBe(200);
  return (await response.json()) as LearningOverview;
}

async function courseState(request: APIRequestContext) {
  const state = (await overview(request)).documents.find(
    (document) => document.moduleId === "01" && document.view === "cours",
  );
  expect(state).toBeDefined();
  return state as LearningDocumentState;
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

async function openNotebook(page: Page) {
  const summary = page
    .locator("summary")
    .filter({ hasText: "Mon suivi et mes notes" });
  if ((await summary.locator("..").getAttribute("open")) === null) {
    await summary.click();
  }
  const note = page.getByRole("textbox", {
    name: "Ma note personnelle",
    exact: true,
  });
  await expect(note).toBeVisible();
  await expect(note).toBeEnabled();
  return note;
}

function noteResponse(page: Page, status: number) {
  return page.waitForResponse((response) => {
    const request = response.request();
    return (
      new URL(response.url()).pathname === endpoint &&
      request.method() === "POST" &&
      request.postDataJSON()?.type === "note" &&
      response.status() === status
    );
  });
}

test.describe("personal learning workspace", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    ({ isMobile }) => isMobile,
    "These checks share one server profile.",
  );

  test("records a visit without assigning a learning success", async ({
    page,
    request,
  }) => {
    const before = (await overview(request)).documents.find(
      (document) => document.moduleId === "01" && document.view === "cours",
    );
    const visit = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === endpoint &&
        response.request().method() === "POST" &&
        response.request().postDataJSON()?.type === "visit" &&
        response.ok(),
    );
    await page.goto(coursePath);
    await visit;
    await openNotebook(page);

    const after = await courseState(request);
    expect(after.lastViewedAt).not.toBeNull();
    expect(after.selfReport).toEqual(before?.selfReport ?? null);
    expect(after.note).toEqual(
      before?.note ?? { text: "", revision: 0, updatedAt: null },
    );
    await expect(page.getByText(/100\s*%/)).toHaveCount(0);
  });

  test("keeps a personal note after reload and in a fresh browser context", async ({
    page,
    browser,
    baseURL,
    request,
  }) => {
    const text =
      "À revoir : и et і. Мама — maman.\nUn exemple dans mon cahier.";
    await page.goto(coursePath);
    const note = await openNotebook(page);
    await note.fill(text);
    const saved = noteResponse(page, 200);
    await page
      .getByRole("button", { name: "Enregistrer ma note", exact: true })
      .click();
    await saved;
    expect((await courseState(request)).note.text).toBe(text);

    await page.reload();
    await expect(await openNotebook(page)).toHaveValue(text);

    const otherContext = await browser.newContext({ baseURL });
    try {
      const otherPage = await otherContext.newPage();
      await otherPage.goto(coursePath);
      await expect(await openNotebook(otherPage)).toHaveValue(text);
    } finally {
      await otherContext.close();
    }
  });

  test("preserves a conflicting draft when another tab saved first", async ({
    page,
    context,
    request,
  }) => {
    await page.goto(coursePath);
    const firstNote = await openNotebook(page);
    const otherPage = await context.newPage();
    try {
      await otherPage.goto(coursePath);
      const secondNote = await openNotebook(otherPage);
      const firstText = "Premier onglet : distinguer les sons и et і.";
      const draft = "Deuxième onglet : mon brouillon à conserver.";
      await firstNote.fill(firstText);
      await secondNote.fill(draft);

      const saved = noteResponse(page, 200);
      await page
        .getByRole("button", { name: "Enregistrer ma note", exact: true })
        .click();
      await saved;

      const conflict = noteResponse(otherPage, 409);
      await otherPage
        .getByRole("button", { name: "Enregistrer ma note", exact: true })
        .click();
      const response = await conflict;
      expect((await response.json()).currentNote.text).toBe(firstText);
      await expect(secondNote).toHaveValue(draft);
      await expect(
        otherPage.getByText(/une autre version/i).first(),
      ).toBeVisible();
      expect((await courseState(request)).note.text).toBe(firstText);

      const replace = otherPage.getByRole("button", {
        name: "Remplacer la version enregistrée par mon brouillon",
        exact: true,
      });
      await expect(replace).toBeDisabled();
      await otherPage
        .getByRole("checkbox", {
          name: "J’ai comparé les deux versions.",
          exact: true,
        })
        .check();
      const resolved = noteResponse(otherPage, 200);
      await replace.click();
      await resolved;
      expect((await courseState(request)).note.text).toBe(draft);
      await otherPage.reload();
      await expect(await openNotebook(otherPage)).toHaveValue(draft);
    } finally {
      await otherPage.close();
    }
  });

  test("keeps an unsaved draft after a network error and lets the user retry", async ({
    page,
    request,
  }) => {
    await page.goto(coursePath);
    const note = await openNotebook(page);
    const stored = (await courseState(request)).note;
    const draft = "Brouillon hors connexion : тато et мама.";
    await note.fill(draft);

    let failures = 0;
    await page.route("**/api/learning", async (route) => {
      const outgoing = route.request();
      if (
        outgoing.method() === "POST" &&
        outgoing.postDataJSON()?.type === "note" &&
        failures === 0
      ) {
        failures += 1;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    const save = page.getByRole("button", {
      name: "Enregistrer ma note",
      exact: true,
    });
    await save.click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    expect(failures).toBe(1);
    await expect(note).toHaveValue(draft);
    expect((await courseState(request)).note).toEqual(stored);

    const saved = noteResponse(page, 200);
    await save.click();
    await saved;
    await expect(note).toHaveValue(draft);
    expect((await courseState(request)).note.text).toBe(draft);
  });

  test("resumes the exact passage chosen in a document", async ({
    page,
    request,
  }) => {
    await page.goto(coursePath);
    await openNotebook(page);
    const heading = page.locator("article.prose h2").nth(1);
    const sectionId = await heading.getAttribute("id");
    expect(sectionId).toBeTruthy();
    await page
      .getByLabel("Passage à retrouver", { exact: true })
      .selectOption(sectionId!);
    const checkpoint = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === endpoint &&
        response.request().method() === "POST" &&
        response.request().postDataJSON()?.type === "checkpoint" &&
        response.ok(),
    );
    await page
      .getByRole("button", { name: "Garder ce passage", exact: true })
      .click();
    await checkpoint;
    expect((await courseState(request)).checkpoint?.sectionId).toBe(sectionId);

    await page.goto("/parcours");
    const resume = page.getByRole("link", {
      name: "Reprendre ma lecture",
      exact: true,
    });
    await expect(resume).toBeVisible();
    const target = new URL((await resume.getAttribute("href"))!, page.url());
    expect(target.pathname).toBe(coursePath);
    expect(decodeURIComponent(target.hash.slice(1))).toBe(sectionId);
    await resume.click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === coursePath &&
        decodeURIComponent(url.hash.slice(1)) === sectionId,
    );
    await expect(page.locator("article.prose h2").nth(1)).toBeInViewport();
    await page.reload();
    await openNotebook(page);
    await expect(
      page.getByLabel("Passage à retrouver", { exact: true }),
    ).toHaveValue(sectionId!);
  });

  test("protects an unsaved note during navigation and restores it when returning", async ({
    page,
    request,
  }) => {
    await page.goto(coursePath);
    const note = await openNotebook(page);
    const stored = (await courseState(request)).note;
    const draft = "Question à garder : comment distinguer и et і ?";
    await note.fill(draft);
    const vocabulary = page
      .getByRole("navigation", { name: "Supports du module", exact: true })
      .getByRole("link", { name: "Vocabulaire", exact: true });

    page.once("dialog", (dialog) => dialog.dismiss());
    await vocabulary.click();
    await expect(page).toHaveURL(coursePath);
    await expect(note).toHaveValue(draft);
    expect((await courseState(request)).note).toEqual(stored);

    page.once("dialog", (dialog) => dialog.accept());
    await vocabulary.click();
    await expect(page).toHaveURL("/parcours/01/vocabulaire");
    await page.goBack();
    await expect(page).toHaveURL(coursePath);
    await expect(await openNotebook(page)).toHaveValue(draft);
    await expect(
      page.getByText("Brouillon non enregistré retrouvé dans cet onglet.", {
        exact: true,
      }),
    ).toBeVisible();
    expect((await courseState(request)).note).toEqual(stored);

    const saved = noteResponse(page, 200);
    await page
      .getByRole("button", { name: "Enregistrer ma note", exact: true })
      .click();
    await saved;
    expect((await courseState(request)).note.text).toBe(draft);
  });

  test("saves a self-reported result together with its working context", async ({
    page,
    request,
  }) => {
    await page.goto(coursePath);
    await openNotebook(page);
    const level = page.getByLabel("Où j’en suis sur cette fiche", {
      exact: true,
    });
    const detail = page.getByLabel(
      "Repère de travail (exercice, aide utilisée, rappel…)",
      { exact: true },
    );
    await level.selectOption("with_help");
    await detail.fill("Exercice 2 terminé en consultant la table des lettres.");
    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === endpoint &&
        response.request().method() === "POST" &&
        response.request().postDataJSON()?.type === "self-report" &&
        response.ok(),
    );
    await page
      .getByRole("button", { name: "Enregistrer mon bilan", exact: true })
      .click();
    await saved;
    expect((await courseState(request)).selfReport).toMatchObject({
      level: "with_help",
      detail: "Exercice 2 terminé en consultant la table des lettres.",
    });
    await page.reload();
    await openNotebook(page);
    await expect(level).toHaveValue("with_help");
    await expect(detail).toHaveValue(
      "Exercice 2 terminé en consultant la table des lettres.",
    );
  });

  test("validates commands and rejects writes from another origin", async ({
    request,
    baseURL,
  }) => {
    const valid: LearningCommand = {
      type: "visit",
      moduleId: "01",
      view: "cours",
    };
    const invalidCommands = [
      { command: { ...valid, view: "inconnu" }, status: 404 },
      { command: { ...valid, moduleId: "99" }, status: 404 },
      { command: { ...valid, userId: "another-user" }, status: 400 },
      {
        command: { ...valid, type: "checkpoint", sectionId: "missing-section" },
        status: 400,
      },
      {
        command: {
          ...valid,
          type: "self-report",
          level: "mastered",
          detail: "",
        },
        status: 400,
      },
      {
        command: {
          ...valid,
          type: "self-report",
          level: "first_success",
          detail: "   ",
        },
        status: 400,
      },
      {
        command: {
          ...valid,
          type: "self-report",
          level: "understood",
          detail: "x".repeat(REPORT_MAX_LENGTH + 1),
        },
        status: 400,
      },
      {
        command: {
          ...valid,
          type: "note",
          text: "x".repeat(NOTE_MAX_LENGTH + 1),
          expectedRevision: 0,
        },
        status: 400,
      },
      {
        command: {
          ...valid,
          type: "note",
          text: "Invalid revision",
          expectedRevision: -1,
        },
        status: 400,
      },
    ];
    for (const { command, status } of invalidCommands) {
      const response = await post(request, baseURL, command);
      expect(response.status(), JSON.stringify(command).slice(0, 180)).toBe(
        status,
      );
    }

    const before = await courseState(request);
    for (const origin of ["https://example.com", "null"]) {
      const response = await request.post(endpoint, {
        headers: { Origin: origin },
        data: valid,
      });
      expect(response.status(), origin).toBe(403);
    }
    const noOrigin = await request.post(endpoint, { data: valid });
    expect(noOrigin.status()).toBe(403);
    const externalHost = await request.post(endpoint, {
      headers: { Host: "example.com", Origin: "http://example.com" },
      data: valid,
    });
    expect(externalHost.status()).toBe(403);
    expect(await courseState(request)).toEqual(before);
  });

  test("never caches personal data and rejects a stale note revision", async ({
    request,
    baseURL,
  }) => {
    const read = await request.get(endpoint);
    expect(read.headers()["cache-control"]).toMatch(/\bno-store\b/);
    const before = await courseState(request);
    const command: LearningCommand = {
      type: "note",
      moduleId: "01",
      view: "cours",
      text: "La version enregistrée est conservée.",
      expectedRevision: before.note.revision,
    };
    const saved = await post(request, baseURL, command);
    expect(saved.status()).toBe(200);
    expect(saved.headers()["cache-control"]).toMatch(/\bno-store\b/);
    const current = (await saved.json()) as LearningDocumentState;
    expect(current.note.revision).toBe(before.note.revision + 1);

    const conflict = await post(request, baseURL, {
      ...command,
      text: "Une ancienne version ne doit pas écraser la note.",
    });
    expect(conflict.status()).toBe(409);
    expect(conflict.headers()["cache-control"]).toMatch(/\bno-store\b/);
    expect((await conflict.json()).currentNote).toEqual(current.note);
    expect((await courseState(request)).note).toEqual(current.note);
  });
});
