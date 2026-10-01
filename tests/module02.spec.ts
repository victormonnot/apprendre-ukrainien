import { expect, test, type Page } from "./fixtures";
import { openLearningStore } from "../src/lib/server/learning-store";
import { openAudioStore } from "../src/lib/server/audio-store";
import { describeAudio } from "../src/lib/server/audio-provider";
import type { ExerciseWorkspaceState } from "../src/lib/exercise-types";

test("local dictionary identifies the second module and returns to its vocabulary", async ({
  page,
}) => {
  await page.goto("/atelier");
  await page
    .getByLabel("Un mot en français ou en ukrainien", { exact: true })
    .fill("студентка");
  const reference = page.locator(
    '[data-language-reference-id="02-mot-studentka"]',
  );
  await reference.locator("summary").click();
  await expect(reference).toContainText("Référence du cours · module 02");
  await expect(
    reference.getByRole("link", {
      name: "Retrouver dans le cours",
      exact: true,
    }),
  ).toHaveAttribute("href", "/parcours/02/vocabulaire#personnes-et-metiers");
  await reference
    .getByRole("link", { name: "Retrouver dans le cours", exact: true })
    .click();
  await expect(page).toHaveURL("/parcours/02/vocabulaire#personnes-et-metiers");
});

async function panel(page: Page) {
  const exercise = page.locator('[data-exercise-id="02-3"]');
  if ((await exercise.getAttribute("open")) === null)
    await exercise.locator(":scope > summary").click();
  await expect(exercise.locator(".exercise-editor")).toBeVisible();
  return exercise;
}

test("module 02 retains its own answers across course views and corrects only after submission", async ({
  page,
  request,
  isMobile,
}) => {
  test.skip(
    isMobile,
    "This persistence check uses the shared isolated server profile.",
  );
  const previousModule = await (
    await request.get("/api/exercises/01-3")
  ).json();
  await page.goto("/parcours/02/exercices");
  let exercise = await panel(page);
  await exercise
    .getByRole("button", { name: "Commencer l’exercice", exact: true })
    .click();
  await expect(exercise.locator(".exercise-form")).toBeVisible();
  const items = exercise.locator("fieldset.exercise-item");
  const answers = [
    "я",
    "ти",
    "вона",
    "він",
    "ми",
    "ви",
    "ви",
    "вони",
    "Ви sert aussi à vouvoyer une seule personne.",
  ];
  await expect(items).toHaveCount(answers.length);
  for (const [index, value] of answers.entries()) {
    await items.nth(index).getByRole("textbox").fill(value);
    await items
      .nth(index)
      .getByLabel("Aide utilisée pour cette question", { exact: true })
      .selectOption("none");
  }
  await exercise
    .getByRole("button", { name: "Enregistrer le brouillon", exact: true })
    .click();
  await expect(exercise.getByRole("status")).toHaveText(
    "Brouillon enregistré.",
  );
  await expect(exercise.locator(".exercise-feedback")).toHaveCount(0);
  const draft = (await (
    await request.get("/api/exercises/02-3")
  ).json()) as ExerciseWorkspaceState;
  expect(draft.draft?.assessment).toBeNull();
  expect(JSON.stringify(draft)).not.toContain('"expected":');
  await page
    .getByRole("navigation", { name: "Supports du module", exact: true })
    .getByRole("link", { name: "Cours", exact: true })
    .click();
  await page.reload();
  exercise = await panel(page);
  await expect(
    exercise.getByLabel("Pronom sujet ukrainien", { exact: true }).first(),
  ).toHaveValue("я");
  const submitted = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/exercises/02-3" &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.type === "submit",
  );
  await exercise
    .getByRole("button", { name: "Remettre l’exercice", exact: true })
    .click();
  expect((await submitted).status()).toBe(200);
  const result = (await (
    await request.get("/api/exercises/02-3")
  ).json()) as ExerciseWorkspaceState;
  expect(result.draft).toBeNull();
  expect(result.attempts).toHaveLength(1);
  expect(result.attempts[0]?.assessment?.status).toBe("partial");
  expect(
    result.attempts[0]?.assessment?.items
      .slice(0, 8)
      .every((item) => item.fields[0]?.status === "correct"),
  ).toBe(true);
  expect(result.attempts[0]?.assessment?.items[8]?.fields[0]?.status).toBe(
    "pending",
  );
  expect(result.attempts[0]?.answers["3a"]?.fields.pronoun).toBe("я");
  expect(await (await request.get("/api/exercises/01-3")).json()).toEqual(
    previousModule,
  );
});

test("a module 02 phrase uses the same cached recording from the course and studio", async ({
  page,
}) => {
  const directory = process.env.PLAYWRIGHT_DATA_DIR;
  if (!directory)
    throw new Error("Audio fixtures require the isolated test database.");
  const learning = openLearningStore(directory);
  const store = openAudioStore(directory);
  const wave = Buffer.alloc(44 + 16000);
  wave.write("RIFF");
  wave.writeUInt32LE(wave.length - 8, 4);
  wave.write("WAVEfmt ", 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(8000, 24);
  wave.writeUInt32LE(16000, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write("data", 36);
  wave.writeUInt32LE(16000, 40);
  try {
    store.saveClip(
      learning.getLocalUserId(),
      describeAudio("openai-cedar", "Вона інженерка."),
      wave,
      "audio/wav",
    );
  } finally {
    store.close();
    learning.close();
  }
  await page.addInitScript(() =>
    localStorage.setItem("ukrainian-audio-voice", "openai-cedar"),
  );
  const sources: unknown[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/api/audio" &&
      request.method() === "POST"
    )
      sources.push(request.postDataJSON().source);
  });
  await page.goto("/parcours/02/cours");
  const reader = page
    .locator('[data-audio-player][data-audio-text="Вона інженерка."]')
    .first();
  await reader
    .getByRole("button", { name: "Écouter « Вона інженерка. »", exact: true })
    .click();
  await expect(reader).toHaveAttribute("data-audio-phase", "finished");
  const file = await reader.locator("audio").getAttribute("src");
  expect(file).toBeTruthy();
  await page.goto("/studio?element=02-identification-ingenieure");
  const studio = page.locator(
    '[data-audio-player][data-audio-text="Вона інженерка."]',
  );
  await studio
    .getByRole("button", { name: "Écouter « Вона інженерка. »", exact: true })
    .click();
  await expect(studio).toHaveAttribute("data-audio-phase", "finished");
  expect(await studio.locator("audio").getAttribute("src")).toBe(file);
  expect(sources).toEqual([
    { kind: "segment", segmentId: "02-identification-ingenieure" },
    { kind: "segment", segmentId: "02-identification-ingenieure" },
  ]);
});
