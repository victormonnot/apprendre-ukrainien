import { expect, test, type Locator, type Page } from "./fixtures";
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
      for (const voice of [
        "macos-lesya",
        "openai-cedar",
        "openai-nova",
      ] as const)
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

async function fixedVoiceSettings(audio: Locator) {
  await audio.getByRole("button", { name: "Vitesse", exact: true }).click();
  await expect(
    audio.getByRole("button", { name: "Lecture ralentie" }),
  ).toBeVisible();
  await expect(audio.getByLabel("Voix", { exact: true })).toHaveCount(0);
}

test.describe("guided scene audio", () => {
  test.beforeAll(seedSceneAudio);

  test("conversation follows the selection, pauses and alternates character voices at the chosen speed", async ({
    page,
    isMobile,
  }) => {
    const sources = watchSources(page);
    await page.addInitScript(() => {
      localStorage.setItem("ukrainian-audio-voice", "openai-cedar");
    });
    await page.goto("/cafe");
    await expect(player(page)).toHaveAttribute("data-audio-phase", "idle");
    expect(sources).toHaveLength(0);
    await page.locator('[data-scene-line="anna-thanks"]').click();
    await expect(player(page)).toHaveAttribute("data-audio-text", "Дякую!");
    expect(sources).toHaveLength(0);
    await fixedVoiceSettings(player(page));
    await player(page)
      .getByRole("button", { name: "Lecture ralentie" })
      .click();
    await player(page)
      .getByRole("button", { name: "Lecture ralentie" })
      .press("Escape");
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
    expect(sources.map((source) => source.voiceId)).toEqual([
      "openai-nova",
      "openai-cedar",
      "openai-nova",
      "openai-cedar",
    ]);
    await expect(listen(page)).toHaveAttribute("data-scene-following", "false");
    await fixedVoiceSettings(player(page));
    await expect(
      player(page).getByRole("button", { name: "Lecture ralentie" }),
    ).toHaveAttribute("aria-pressed", "true");
    await player(page)
      .getByRole("button", { name: "Lecture ralentie" })
      .press("Escape");
    await page.locator('[data-scene-line="anna-thanks"]').click();
    await player(page)
      .getByRole("button", { name: "Écouter « Дякую! »", exact: true })
      .click();
    await expect(player(page)).toHaveAttribute("data-audio-phase", "playing");
    expect(await player(page).locator("audio").getAttribute("src")).toBe(file);
    await expect(player(page)).toHaveAttribute("data-audio-phase", "finished");
    expect(sources).toHaveLength(5);
    expect(sources.at(-1)?.voiceId).toBe("openai-nova");
    expect(
      await page.evaluate(() => localStorage.getItem("ukrainian-audio-voice")),
    ).toBe("openai-cedar");
    if (isMobile) {
      await page.setViewportSize({ width: 320, height: 800 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });

  test("the informal conversation starts with Maxime and ignores global voice changes during playback", async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "Character assignment and preference events are shared across viewports.",
    );
    const sources = watchSources(page);
    await page.addInitScript(() => {
      if (!localStorage.getItem("ukrainian-audio-voice"))
        localStorage.setItem("ukrainian-audio-voice", "openai-nova");
    });
    await page.goto("/cafe");
    await page
      .getByLabel("Version de la scène", { exact: true })
      .selectOption("retrouvailles");
    await listen(page)
      .getByRole("button", { name: "Écouter la conversation", exact: true })
      .click();
    await expect(player(page)).toHaveAttribute("data-audio-phase", "playing");
    expect(sources.map(({ lineId, voiceId }) => ({ lineId, voiceId }))).toEqual(
      [{ lineId: "maxime-greeting", voiceId: "openai-cedar" }],
    );
    const maximeFile = await player(page).locator("audio").getAttribute("src");
    // A preference notification in this document must not interrupt a character.
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("ukrainian-audio-voice-changed", {
          detail: "openai-nova",
        }),
      );
    });
    await expect(listen(page)).toHaveAttribute("data-scene-following", "true");
    await expect(
      page.locator('[data-scene-line="anna-greeting"]'),
    ).toHaveAttribute("aria-current", "true");
    await expect(player(page)).toHaveAttribute("data-audio-phase", "playing");
    expect(await player(page).locator("audio").getAttribute("src")).not.toBe(
      maximeFile,
    );
    // Simulate another document changing the preference without backgrounding this page.
    await page.evaluate(() => {
      localStorage.setItem("ukrainian-audio-voice", "openai-cedar");
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "ukrainian-audio-voice",
          oldValue: "openai-nova",
          newValue: "openai-cedar",
          storageArea: localStorage,
        }),
      );
    });
    await expect(listen(page)).toHaveAttribute("data-scene-following", "true");
    await expect(listen(page)).toContainText("Conversation terminée", {
      timeout: 20_000,
    });
    expect(
      sources.map(({ variantId, lineId, voiceId }) => ({
        variantId,
        lineId,
        voiceId,
      })),
    ).toEqual([
      {
        variantId: "retrouvailles",
        lineId: "maxime-greeting",
        voiceId: "openai-cedar",
      },
      {
        variantId: "retrouvailles",
        lineId: "anna-greeting",
        voiceId: "openai-nova",
      },
      {
        variantId: "retrouvailles",
        lineId: "maxime-introduction",
        voiceId: "openai-cedar",
      },
      {
        variantId: "retrouvailles",
        lineId: "anna-introduction",
        voiceId: "openai-nova",
      },
      {
        variantId: "retrouvailles",
        lineId: "maxime-thanks",
        voiceId: "openai-cedar",
      },
      {
        variantId: "retrouvailles",
        lineId: "anna-welcome",
        voiceId: "openai-nova",
      },
      {
        variantId: "retrouvailles",
        lineId: "maxime-goodbye",
        voiceId: "openai-cedar",
      },
      {
        variantId: "retrouvailles",
        lineId: "anna-goodbye",
        voiceId: "openai-nova",
      },
    ]);
    expect(
      await page.evaluate(() => localStorage.getItem("ukrainian-audio-voice")),
    ).toBe("openai-cedar");
    await page.goto("/studio?element=01-presentation-anna");
    const ordinary = page.locator(
      '[data-audio-player][data-audio-text="Мене звати Анна."]',
    );
    await ordinary
      .getByRole("button", { name: "Vitesse et voix", exact: true })
      .click();
    await expect(ordinary.getByLabel("Voix", { exact: true })).toHaveValue(
      "openai-cedar",
    );
  });

  test("identical greetings keep distinct character recordings in observation and role models", async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "Recording identity and role models are shared across viewports.",
    );
    const sources = watchSources(page);
    await page.addInitScript(() => {
      localStorage.setItem("ukrainian-audio-voice", "openai-nova");
    });
    await page.goto("/cafe");
    const files = new Map<string, string>();
    for (const role of ["anna", "maxime"]) {
      await page.locator(`[data-scene-line="${role}-greeting"]`).click();
      await player(page)
        .getByRole("button", { name: "Écouter « Добрий день! »", exact: true })
        .click();
      await expect(player(page)).toHaveAttribute(
        "data-audio-phase",
        "finished",
      );
      const file = await player(page).locator("audio").getAttribute("src");
      expect(file).toBeTruthy();
      files.set(role, file!);
    }
    expect(files.get("anna")).not.toBe(files.get("maxime"));
    expect(sources.map((source) => source.voiceId)).toEqual([
      "openai-nova",
      "openai-cedar",
    ]);
    await page
      .getByRole("button", { name: "Prendre un rôle", exact: true })
      .click();
    const practice = page.locator(".cafe-practice");
    const roleSelector = practice.getByLabel("Mon personnage", { exact: true });
    for (const role of ["maxime", "anna"]) {
      await expect(roleSelector).toBeEnabled();
      await roleSelector.selectOption(role);
      const line = practice
        .locator(".cafe-your-turn")
        .filter({ has: page.locator(`#answer-${role}-greeting`) });
      await line
        .getByRole("button", { name: "Voir le modèle", exact: true })
        .click();
      const model = line.locator("[data-audio-player]");
      await fixedVoiceSettings(model);
      await model
        .getByRole("button", { name: "Lecture ralentie" })
        .press("Escape");
      await model
        .getByRole("button", { name: "Écouter « Добрий день! »", exact: true })
        .click();
      await expect(model).toHaveAttribute("data-audio-phase", "finished");
      expect(await model.locator("audio").getAttribute("src")).toBe(
        files.get(role),
      );
      const requestCount = sources.length;
      await model
        .getByRole("button", {
          name: "Réécouter « Добрий день! »",
          exact: true,
        })
        .click();
      await expect(model).toHaveAttribute("data-audio-phase", "playing");
      expect(await model.locator("audio").getAttribute("src")).toBe(
        files.get(role),
      );
      await expect(model).toHaveAttribute("data-audio-phase", "finished");
      expect(sources).toHaveLength(requestCount);
    }
    expect(sources.map((source) => source.voiceId)).toEqual([
      "openai-nova",
      "openai-cedar",
      "openai-cedar",
      "openai-nova",
    ]);
    expect(
      await page.evaluate(() => localStorage.getItem("ukrainian-audio-voice")),
    ).toBe("openai-nova");
  });

  test("repetition reuses Anna's recording through every cycle and replay", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Repeat cycles are shared across viewports.");
    const sources = watchSources(page);
    await page.addInitScript(() => {
      localStorage.setItem("ukrainian-audio-voice", "openai-cedar");
    });
    await page.goto("/cafe");
    await listen(page)
      .getByRole("button", { name: "Répéter cette réplique", exact: true })
      .click();
    await listen(page).getByLabel("Silence pour répéter").selectOption("2");
    await player(page)
      .getByRole("button", { name: "Écouter « Добрий день! »", exact: true })
      .click();
    await expect(player(page)).toHaveAttribute("data-audio-phase", "playing");
    const file = await player(page).locator("audio").getAttribute("src");
    await expect(player(page)).toHaveAttribute("data-audio-phase", "gap");
    await expect(player(page)).toHaveAttribute("data-audio-phase", "finished", {
      timeout: 12_000,
    });
    await expect(player(page).getByRole("status")).toContainText("Écoute 3/3");
    expect(sources.map((source) => source.voiceId)).toEqual(["openai-nova"]);
    expect(await player(page).locator("audio").getAttribute("src")).toBe(file);
    await player(page)
      .getByRole("button", { name: "Réécouter « Добрий день! »", exact: true })
      .click();
    await expect(player(page)).toHaveAttribute("data-audio-phase", "playing");
    expect(await player(page).locator("audio").getAttribute("src")).toBe(file);
    expect(sources).toHaveLength(1);
    expect(
      await page.evaluate(() => localStorage.getItem("ukrainian-audio-voice")),
    ).toBe("openai-cedar");
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
    expect(sources.map((source) => source.voiceId)).toEqual([
      "openai-nova",
      "openai-cedar",
      "openai-cedar",
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
