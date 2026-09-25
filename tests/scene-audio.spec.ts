import { expect, test, type Page } from "./fixtures";
import { cafeScenes } from "../src/content/scenes";
import { describeAudio } from "../src/lib/server/audio-provider";
import { openAudioStore } from "../src/lib/server/audio-store";
import { openLearningStore } from "../src/lib/server/learning-store";

function wave() {
  const size = 8_000 * 2 * 2;
  const data = Buffer.alloc(44 + size);
  data.write("RIFF");
  data.writeUInt32LE(data.length - 8, 4);
  data.write("WAVE", 8);
  data.write("fmt ", 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(8_000, 24);
  data.writeUInt32LE(16_000, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(size, 40);
  for (let offset = 44; offset < data.length; offset += 2)
    data.writeInt16LE(
      Math.round(
        Math.sin(((offset - 44) / 2 / 8_000) * 440 * Math.PI * 2) * 1_000,
      ),
      offset,
    );
  return data;
}

function seedSceneAudio() {
  const directory = process.env.PLAYWRIGHT_DATA_DIR;
  if (!directory)
    throw new Error("Scene audio needs an isolated test database.");
  const learning = openLearningStore(directory);
  const store = openAudioStore(directory);
  try {
    const user = learning.getLocalUserId();
    const texts = new Set(
      cafeScenes.flatMap((scene) => scene.lines.map((line) => line.ukrainian)),
    );
    for (const text of texts)
      for (const voice of ["macos-lesya", "openai-cedar"] as const)
        store.saveClip(user, describeAudio(voice, text), wave(), "audio/wav");
  } finally {
    store.close();
    learning.close();
  }
}

function listen(page: Page) {
  return page.locator("[data-scene-listening]");
}
function player(page: Page) {
  return listen(page).locator("[data-audio-player]");
}
function watchSources(page: Page) {
  const sources: { lineId: string; variantId: string; voiceId: string }[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/audio") && request.method() === "POST") {
      const body = request.postDataJSON();
      if (body.source.kind === "scene")
        sources.push({ ...body.source, voiceId: body.voiceId });
    }
  });
  return sources;
}

test.describe("guided scene audio", () => {
  test.beforeAll(seedSceneAudio);

  test("conversation follows the selection, pauses and keeps voice and speed between lines", async ({
    page,
    isMobile,
  }) => {
    const sources = watchSources(page);
    await page.goto("/cafe");
    await expect(player(page)).toHaveAttribute("data-audio-phase", "idle");
    expect(sources).toHaveLength(0);
    await page.locator('[data-scene-line="anna-thanks"]').click();
    await expect(player(page)).toHaveAttribute("data-audio-text", "Дякую!");
    expect(sources).toHaveLength(0);
    await player(page)
      .getByLabel("Voix", { exact: true })
      .selectOption("openai-cedar");
    await player(page)
      .getByRole("button", { name: "Ralentir · 0,75×" })
      .click();
    await listen(page)
      .getByRole("button", { name: "Écouter la conversation", exact: true })
      .click();
    await expect(player(page)).toHaveAttribute("data-audio-phase", "playing");
    await player(page)
      .getByRole("button", { name: "Mettre en pause « Дякую! »", exact: true })
      .click();
    await expect(player(page)).toHaveAttribute("data-audio-phase", "paused");
    const file = await player(page).locator("audio").getAttribute("src");
    await page.waitForTimeout(2_900);
    expect(sources.map((source) => source.lineId)).toEqual(["anna-thanks"]);
    await player(page)
      .getByRole("button", { name: "Reprendre « Дякую! »", exact: true })
      .click();
    await expect(
      page.locator('[data-scene-line="maxime-welcome"]'),
    ).toHaveAttribute("aria-current", "true");
    await expect(player(page)).toHaveAttribute("data-audio-phase", "playing");
    await expect(player(page).getByLabel("Voix", { exact: true })).toHaveValue(
      "openai-cedar",
    );
    expect(
      await player(page)
        .locator("audio")
        .evaluate((audio: HTMLAudioElement) => audio.playbackRate),
    ).toBe(0.75);
    await expect(listen(page)).toContainText("Conversation terminée", {
      timeout: 12_000,
    });
    expect(sources.map((source) => source.lineId)).toEqual([
      "anna-thanks",
      "maxime-welcome",
      "anna-goodbye",
      "maxime-goodbye",
    ]);
    expect(sources.every((source) => source.voiceId === "openai-cedar")).toBe(
      true,
    );
    await expect(listen(page)).toHaveAttribute("data-scene-following", "false");
    await page.locator('[data-scene-line="anna-thanks"]').click();
    await player(page)
      .getByRole("button", { name: "Écouter « Дякую! »", exact: true })
      .click();
    await expect(player(page)).toHaveAttribute("data-audio-phase", "playing");
    expect(await player(page).locator("audio").getAttribute("src")).toBe(file);
    await expect(player(page)).toHaveAttribute("data-audio-phase", "finished");
    expect(sources).toHaveLength(5);
    if (isMobile) {
      await page.setViewportSize({ width: 320, height: 800 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });

  test("changing the selected line cancels a delayed audio response and the queue", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Cancellation is shared across viewports.");
    const sources = watchSources(page);
    let release!: () => void;
    let pending = true;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/audio", async (route) => {
      if (route.request().method() === "POST" && pending) {
        pending = false;
        const response = await route.fetch();
        await gate;
        await route.fulfill({ response }).catch(() => {
          /* The old player aborted its request. */
        });
      } else await route.continue();
    });
    await page.goto("/cafe");
    await listen(page)
      .getByRole("button", { name: "Écouter la conversation", exact: true })
      .click();
    await expect(player(page)).toHaveAttribute("data-audio-phase", "loading");
    await expect.poll(() => sources.length).toBe(1);
    await page.locator('[data-scene-line="anna-introduction"]').click();
    release();
    await expect(player(page)).toHaveAttribute("data-audio-phase", "idle");
    await expect(listen(page)).toHaveAttribute("data-scene-following", "false");
    await page.waitForTimeout(250);
    expect(
      await page
        .locator("audio")
        .evaluateAll((elements: HTMLAudioElement[]) =>
          elements.every((audio) => audio.paused),
        ),
    ).toBe(true);
    expect(sources).toHaveLength(1);
    await player(page)
      .getByRole("button", {
        name: "Écouter « Мене звати Анна. »",
        exact: true,
      })
      .click();
    await expect(player(page)).toHaveAttribute("data-audio-phase", "finished");
    expect(sources.map((source) => source.lineId)).toEqual([
      "anna-greeting",
      "anna-introduction",
    ]);
  });

  test("a failed line stops the conversation and retrying plays only that line", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Network recovery is shared across viewports.");
    const sources = watchSources(page);
    let fail = true;
    await page.route("**/api/audio", async (route) => {
      if (
        route.request().method() === "POST" &&
        route.request().postDataJSON().source.lineId === "maxime-welcome" &&
        fail
      ) {
        fail = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Voix temporairement indisponible.",
          }),
        });
      } else await route.continue();
    });
    await page.goto("/cafe");
    await page.locator('[data-scene-line="anna-thanks"]').click();
    await listen(page)
      .getByRole("button", { name: "Écouter la conversation", exact: true })
      .click();
    await expect(player(page)).toHaveAttribute("data-audio-phase", "error");
    await expect(listen(page)).toHaveAttribute("data-scene-following", "false");
    await expect(player(page).getByRole("alert")).toContainText(
      "temporairement indisponible",
    );
    expect(sources.map((source) => source.lineId)).toEqual([
      "anna-thanks",
      "maxime-welcome",
    ]);
    await player(page)
      .getByRole("button", { name: "Réessayer « Будь ласка. »", exact: true })
      .click();
    await expect(player(page)).toHaveAttribute("data-audio-phase", "finished");
    expect(sources.map((source) => source.lineId)).toEqual([
      "anna-thanks",
      "maxime-welcome",
      "maxime-welcome",
    ]);
  });

  test("backgrounding pauses playback and changing mode or variant requires a new play action", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Playback lifecycle is shared across viewports.");
    const sources = watchSources(page);
    await page.goto("/cafe");
    await listen(page)
      .getByRole("button", { name: "Écouter la conversation", exact: true })
      .click();
    await expect(player(page)).toHaveAttribute("data-audio-phase", "playing");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(player(page)).toHaveAttribute("data-audio-phase", "paused");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: false,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(2_200);
    await expect(player(page)).toHaveAttribute("data-audio-phase", "paused");
    expect(sources).toHaveLength(1);
    await listen(page)
      .getByRole("button", { name: "Répéter cette réplique", exact: true })
      .click();
    await expect(player(page)).toHaveAttribute("data-audio-phase", "idle");
    await expect(listen(page)).toHaveAttribute("data-scene-following", "false");
    await listen(page).getByLabel("Silence pour répéter").selectOption("2");
    await player(page)
      .getByRole("button", { name: "Écouter « Добрий день! »", exact: true })
      .click();
    await expect(player(page)).toHaveAttribute("data-audio-phase", "gap");
    await page
      .getByLabel("Version de la scène", { exact: true })
      .selectOption("retrouvailles");
    await expect(player(page)).toHaveAttribute("data-audio-text", "Привіт!");
    await expect(player(page)).toHaveAttribute("data-audio-phase", "idle");
    await page.waitForTimeout(2_300);
    expect(sources).toHaveLength(2);
    expect(
      await page
        .locator("audio")
        .evaluateAll((elements: HTMLAudioElement[]) =>
          elements.every((audio) => audio.paused),
        ),
    ).toBe(true);
  });
});
