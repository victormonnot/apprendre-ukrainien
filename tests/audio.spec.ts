import { expect, test, type APIRequestContext, type Locator } from "./fixtures";
import { openAudioStore } from "../src/lib/server/audio-store";
import { openLearningStore } from "../src/lib/server/learning-store";
import { describeAudio } from "../src/lib/server/audio-provider";

function wave(seconds = 1.5) {
  const size = Math.floor(8000 * seconds) * 2;
  const data = Buffer.alloc(44 + size);
  data.write("RIFF");
  data.writeUInt32LE(data.length - 8, 4);
  data.write("WAVE", 8);
  data.write("fmt ", 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(8000, 24);
  data.writeUInt32LE(16000, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(size, 40);
  for (let offset = 44; offset < data.length; offset += 2)
    data.writeInt16LE(
      Math.round(
        Math.sin(((offset - 44) / 2 / 8000) * 440 * Math.PI * 2) * 1000,
      ),
      offset,
    );
  return data;
}
function seedAudio() {
  const directory = process.env.PLAYWRIGHT_DATA_DIR;
  if (!directory)
    throw new Error("Audio fixtures need the isolated test database.");
  const learning = openLearningStore(directory);
  const store = openAudioStore(directory);
  try {
    const user = learning.getLocalUserId();
    for (const text of ["кава", "мова", "кіт", "Мене звати Анна."])
      for (const voice of [
        "macos-lesya",
        "openai-marin",
        "openai-cedar",
        "openai-nova",
      ] as const)
        store.saveClip(user, describeAudio(voice, text), wave(), "audio/wav");
  } finally {
    store.close();
    learning.close();
  }
}
function post(
  request: APIRequestContext,
  baseURL: string | undefined,
  body: unknown,
) {
  return request.post("/api/audio", {
    headers: { Origin: baseURL! },
    data: body,
  });
}
const kava = {
  source: { kind: "reference", elementId: "01-mot-kava" },
  voiceId: "macos-lesya",
};

async function voiceSettings(player: Locator) {
  const toggle = player.getByRole("button", {
    name: "Choisir la voix",
    exact: true,
  });
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
  const select = player.getByLabel("Voix", { exact: true });
  await expect(select).toBeVisible();
  return select;
}

async function chooseVoice(
  player: Locator,
  voice: "openai-cedar" | "openai-nova",
) {
  const select = await voiceSettings(player);
  await select.selectOption(voice);
  await expect(select).toBeHidden();
}

async function expectVoice(
  player: Locator,
  voice: "openai-cedar" | "openai-nova",
) {
  const select = await voiceSettings(player);
  await expect(select).toHaveValue(voice);
  await select.press("Escape");
  await expect(select).toBeHidden();
}

test.describe("audio playback and repetition", () => {
  test.beforeAll(seedAudio);

  test("cached audio is reused with byte-range seeking even when synthesis is unavailable", async ({
    request,
    baseURL,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "Storage and HTTP ranges do not depend on the viewport.",
    );
    const catalogue = await (await request.get("/api/audio")).json();
    expect(
      catalogue.voices.map((voice: { id: string; label: string }) => [
        voice.id,
        voice.label,
      ]),
    ).toEqual([
      ["openai-cedar", "Masculine"],
      ["openai-nova", "Féminine"],
    ]);
    expect(catalogue.defaultVoiceId).toBe("openai-cedar");
    expect(
      catalogue.voices.every(
        (voice: { available: boolean }) => !voice.available,
      ),
    ).toBe(true);
    const firstResponse = await post(request, baseURL, kava);
    expect(firstResponse.status()).toBe(200);
    const first = await firstResponse.json();
    expect(await (await post(request, baseURL, kava)).json()).toEqual(first);
    expect(first.text).toBe("кава");
    expect(first.provider).toBe("macos");
    const oldMarin = await (
      await post(request, baseURL, { ...kava, voiceId: "openai-marin" })
    ).json();
    expect(oldMarin.voiceId).toBe("openai-marin");
    expect(await (await request.get(oldMarin.url)).body()).toEqual(wave());
    const file = await request.get(first.url);
    expect(file.status()).toBe(200);
    expect(await file.body()).toEqual(wave());
    const chunk = await request.get(first.url, {
      headers: { Range: "bytes=0-1" },
    });
    expect(chunk.status()).toBe(206);
    expect(await chunk.body()).toEqual(wave().subarray(0, 2));
    expect(chunk.headers()["content-range"]).toBe(`bytes 0-1/${wave().length}`);
    expect((await request.head(first.url)).headers()["content-length"]).toBe(
      String(wave().length),
    );
    expect(
      (
        await request.get(first.url, { headers: { Range: "bytes=999999999-" } })
      ).status(),
    ).toBe(416);
    expect(
      (
        await request.get(first.url, {
          headers: { Origin: "https://foreign.invalid" },
        })
      ).status(),
    ).toBe(403);
  });

  test("studio plays only on demand and pauses, slows and replays the same recording", async ({
    page,
    isMobile,
  }) => {
    const requests: string[] = [];
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        throw new Error("Microphone must never be requested");
      };
    });
    page.on("request", (request) => {
      if (request.url().endsWith("/api/audio") && request.method() === "POST")
        requests.push(request.postData()!);
    });
    await page.goto("/studio?element=01-mot-kava");
    const player = page.locator('[data-audio-player][data-audio-text="кава"]');
    await expect(player).toHaveAttribute("data-audio-phase", "idle");
    expect(requests).toHaveLength(0);
    await player
      .getByRole("button", { name: "Écouter « кава »", exact: true })
      .click();
    await expect(player).toHaveAttribute("data-audio-phase", "playing");
    const audio = player.locator("audio");
    // The UI enters playing while the native media engine is still starting.
    // Wait for real playback so this exercises pausing a recording in progress.
    await expect
      .poll(
        () =>
          audio.evaluate((element: HTMLAudioElement) => element.currentTime),
        {
          message: "The recording must advance before testing pause and resume",
          intervals: [50, 100],
          timeout: 10_000,
        },
      )
      .toBeGreaterThan(0);
    await player
      .getByRole("button", { name: "Mettre en pause « кава »", exact: true })
      .click();
    await expect(player).toHaveAttribute("data-audio-phase", "paused");
    const paused = await audio.evaluate((element: HTMLAudioElement) => ({
      paused: element.paused,
      time: element.currentTime,
      url: element.currentSrc,
    }));
    expect(paused.paused).toBe(true);
    expect(paused.time).toBeGreaterThan(0);
    await player.getByRole("button", { name: "Lecture ralentie" }).click();
    await expect(
      player.getByRole("button", { name: "Lecture ralentie" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await audio.evaluate((element: HTMLAudioElement) => element.playbackRate),
    ).toBe(0.75);
    await player
      .getByRole("button", { name: "Reprendre « кава »", exact: true })
      .click();
    await expect(player).toHaveAttribute("data-audio-phase", "finished");
    await player
      .getByRole("button", { name: "Réécouter « кава »", exact: true })
      .click();
    await expect(player).toHaveAttribute("data-audio-phase", "playing");
    expect(
      await audio.evaluate((element: HTMLAudioElement) => element.currentSrc),
    ).toBe(paused.url);
    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0]!).voiceId).toBe("openai-cedar");
    await player.getByRole("button", { name: "Lecture ralentie" }).click();
    await expect(
      player.getByRole("button", { name: "Lecture ralentie" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      await audio.evaluate((element: HTMLAudioElement) => element.playbackRate),
    ).toBe(1);
    expect(
      await audio.evaluate((element: HTMLAudioElement) => element.currentSrc),
    ).toBe(paused.url);
    if (isMobile) {
      await page.setViewportSize({ width: 320, height: 800 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await player.getByRole("button", { name: "Arrêter", exact: true }).click();
  });

  test("repetition pauses its silence and stops after the selected number of listens", async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "The playback state machine is shared across viewports.",
    );
    let generations = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/audio") && request.method() === "POST")
        generations++;
    });
    await page.goto("/studio?element=01-mot-kava");
    await page
      .getByRole("button", { name: "Répéter après", exact: true })
      .click();
    await page.getByLabel("Silence pour répéter").selectOption("2");
    const player = page.locator("[data-audio-player]");
    await player
      .getByRole("button", { name: "Écouter « кава »", exact: true })
      .click();
    await expect(player).toHaveAttribute("data-audio-phase", "gap");
    await player
      .getByRole("button", { name: "Mettre en pause « кава »", exact: true })
      .click();
    await expect(player).toHaveAttribute("data-audio-phase", "paused-gap");
    await page.waitForTimeout(2200);
    await expect(player).toHaveAttribute("data-audio-phase", "paused-gap");
    await player
      .getByRole("button", { name: "Reprendre « кава »", exact: true })
      .click();
    await expect(player).toHaveAttribute("data-audio-phase", "finished", {
      timeout: 12000,
    });
    await expect(player.getByRole("status")).toContainText("Écoute 3/3");
    expect(generations).toBe(1);
    await player
      .getByRole("button", { name: "Réécouter « кава »", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Extrait suivant →", exact: true })
      .click();
    await expect(page.locator("[data-audio-player]")).toHaveAttribute(
      "data-audio-phase",
      "idle",
    );
    expect(
      await page
        .locator("audio")
        .evaluateAll((elements: HTMLAudioElement[]) =>
          elements.every((element) => element.paused),
        ),
    ).toBe(true);
  });

  test("course players do not overlap and their controls are excluded from printing", async ({
    page,
  }) => {
    await page.goto("/parcours/01/vocabulaire");
    const first = page
      .locator('[data-audio-player][data-audio-text="кава"]')
      .first();
    const second = page
      .locator('[data-audio-player][data-audio-text="мова"]')
      .first();
    await first
      .getByRole("button", { name: "Écouter « кава »", exact: true })
      .click();
    await expect(first).toHaveAttribute("data-audio-phase", "playing");
    await second
      .getByRole("button", { name: "Écouter « мова »", exact: true })
      .click();
    await expect(first).toHaveAttribute("data-audio-phase", "paused");
    await expect(second).toHaveAttribute("data-audio-phase", "playing");
    expect(
      await page
        .locator("audio")
        .evaluateAll(
          (elements: HTMLAudioElement[]) =>
            elements.filter((element) => !element.paused).length,
        ),
    ).toBe(1);
    await page.emulateMedia({ media: "print" });
    await expect(first).toBeHidden();
    await expect(second).toBeHidden();
  });

  test("compact controls keep one speed button and two keyboard-accessible voice choices", async ({
    page,
    isMobile,
  }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/api/audio") && request.method() === "POST")
        requests.push(request.postData()!);
    });
    await page.goto("/parcours/01/vocabulaire");
    if (isMobile) await page.setViewportSize({ width: 320, height: 800 });
    const player = page
      .locator('[data-audio-player][data-audio-text="кава"]')
      .first();
    const settings = player.getByRole("button", {
      name: "Choisir la voix",
      exact: true,
    });
    await expect(player.getByRole("button")).toHaveCount(3);
    await expect(
      player.getByRole("button", { name: "Lecture ralentie", exact: true }),
    ).toHaveText("1×");
    await expect(player.getByLabel("Voix", { exact: true })).toBeHidden();
    const idleHeight = (await player.boundingBox())!.height;
    expect(idleHeight).toBeLessThanOrEqual(64);
    expect(requests).toHaveLength(0);

    await settings.focus();
    await settings.press("Enter");
    const voice = player.getByLabel("Voix", { exact: true });
    await expect(voice).toBeVisible();
    await expect(voice).toHaveValue("openai-cedar");
    await expect(voice).toBeFocused();
    expect(
      await voice
        .locator("option")
        .evaluateAll((options: HTMLOptionElement[]) =>
          options.map((option) => option.value),
        ),
    ).toEqual(["openai-cedar", "openai-nova"]);
    await expect(voice.locator("option").nth(0)).toHaveText(/^Masculine/);
    await expect(voice.locator("option").nth(1)).toHaveText(/^Féminine/);
    await expect(
      player.getByText("Voix de synthèse · OpenAI", { exact: true }),
    ).toBeVisible();
    await voice.press("Escape");
    await expect(voice).toBeHidden();
    await expect(settings).toBeFocused();
    expect((await player.boundingBox())!.height).toBe(idleHeight);
    expect(requests).toHaveLength(0);

    await settings.press("Enter");
    await expect(voice).toBeFocused();
    // The OS select picker is not consistently driven by arrows in headless macOS.
    // Opening, focus and dismissal are covered with real keyboard input above.
    await voice.selectOption("openai-nova");
    await expect(voice).toBeHidden();
    await expect(settings).toBeFocused();
    expect(
      await page.evaluate(() => localStorage.getItem("ukrainian-audio-voice")),
    ).toBe("openai-nova");
    expect(requests).toHaveLength(0);
    await player
      .getByRole("button", { name: "Écouter « кава »", exact: true })
      .click();
    await expect(player).toHaveAttribute("data-audio-phase", "playing");
    await expect(player.getByRole("button")).toHaveCount(4);
    expect((await player.boundingBox())!.height).toBeLessThanOrEqual(64);
    await expect(
      player.getByText("Voix de synthèse · OpenAI", { exact: true }),
    ).toBeHidden();
    await player
      .getByRole("button", { name: "Lecture ralentie", exact: true })
      .click();
    await expect(
      player.getByRole("button", { name: "Lecture ralentie", exact: true }),
    ).toHaveText("0,75×");
    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0]!).voiceId).toBe("openai-nova");
    await player.getByRole("button", { name: "Arrêter", exact: true }).click();
    await expect(player).toHaveAttribute("data-audio-phase", "idle");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);

    await page.evaluate(() => {
      document.documentElement.style.fontSize = "20px";
    });
    await settings.click();
    await expect(voice).toBeVisible();
    const menu = await player.locator(".audio-voice-menu").boundingBox();
    const viewport = page.viewportSize()!;
    expect(menu!.x).toBeGreaterThanOrEqual(8);
    expect(menu!.x + menu!.width).toBeLessThanOrEqual(viewport.width - 8);
    expect(menu!.y).toBeGreaterThanOrEqual(8);
    expect(menu!.y + menu!.height).toBeLessThanOrEqual(viewport.height - 8);
    await page.setViewportSize({ width: 320, height: 810 });
    await expect(voice).toBeHidden();
    expect(requests).toHaveLength(1);
  });

  test("voice changes reach opened players and other tabs without starting audio", async ({
    page,
    context,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "Shared preference propagation does not depend on the viewport.",
    );
    const voices: string[] = [];
    context.on("request", (request) => {
      if (request.url().endsWith("/api/audio") && request.method() === "POST")
        voices.push(request.postDataJSON().voiceId);
    });
    await page.goto("/parcours/01/vocabulaire");
    const first = page
      .locator('[data-audio-player][data-audio-text="кава"]')
      .first();
    const second = page
      .locator('[data-audio-player][data-audio-text="мова"]')
      .first();
    await first
      .getByRole("button", { name: "Écouter « кава »", exact: true })
      .click();
    await expect(first).toHaveAttribute("data-audio-phase", "playing");
    const originalFile = await first.locator("audio").getAttribute("src");
    await second
      .getByRole("button", { name: "Écouter « мова »", exact: true })
      .click();
    await expect(second).toHaveAttribute("data-audio-phase", "playing");
    await chooseVoice(second, "openai-nova");
    await expectVoice(first, "openai-nova");
    await expect(first).toHaveAttribute("data-audio-phase", "idle");
    await expect(second).toHaveAttribute("data-audio-phase", "idle");
    expect(voices).toEqual(["openai-cedar", "openai-cedar"]);
    expect(
      await page
        .locator("audio")
        .evaluateAll((elements: HTMLAudioElement[]) =>
          elements.every((audio) => audio.paused),
        ),
    ).toBe(true);

    await first
      .getByRole("button", { name: "Écouter « кава »", exact: true })
      .click();
    await expect(first).toHaveAttribute("data-audio-phase", "playing");
    expect(voices).toEqual(["openai-cedar", "openai-cedar", "openai-nova"]);
    const novaFile = await first.locator("audio").getAttribute("src");
    expect(novaFile).not.toBe(originalFile);
    await first
      .getByRole("button", { name: "Mettre en pause « кава »", exact: true })
      .click();

    // Workspace restoration uses separate storage keys; it must not choose a voice.
    await page.evaluate(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "workspace-generation",
          newValue: "2".repeat(32),
          storageArea: localStorage,
        }),
      );
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "ukrainian-audio-voice",
          newValue: "openai-cedar",
          storageArea: sessionStorage,
        }),
      );
    });
    await expectVoice(first, "openai-nova");
    await expect(first).toHaveAttribute("data-audio-phase", "paused");
    expect(await first.locator("audio").getAttribute("src")).toBe(novaFile);

    const other = await context.newPage();
    try {
      await other.goto("/studio?element=01-mot-kava");
      const otherPlayer = other.locator("[data-audio-player]");
      await expectVoice(otherPlayer, "openai-nova");
      await chooseVoice(otherPlayer, "openai-cedar");
      await expectVoice(first, "openai-cedar");
      await expectVoice(second, "openai-cedar");
      await expect(first).toHaveAttribute("data-audio-phase", "idle");
      await expect(otherPlayer).toHaveAttribute("data-audio-phase", "idle");
      expect(voices).toEqual(["openai-cedar", "openai-cedar", "openai-nova"]);
    } finally {
      await other.close();
    }
    await page.bringToFront();
    await first
      .getByRole("button", { name: "Écouter « кава »", exact: true })
      .click();
    await expect(first).toHaveAttribute("data-audio-phase", "playing");
    expect(await first.locator("audio").getAttribute("src")).toBe(originalFile);
    expect(voices).toEqual([
      "openai-cedar",
      "openai-cedar",
      "openai-nova",
      "openai-cedar",
    ]);
  });

  test("a lost prepare response can be retried without creating a different clip", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Recovery is verified once on the shared API.");
    let firstId: string | null = null;
    let lose = true;
    await page.route("**/api/audio", async (route) => {
      if (route.request().method() === "POST" && lose) {
        lose = false;
        const response = await route.fetch();
        firstId = (await response.json()).id;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });
    await page.goto("/studio?element=01-mot-kava");
    const player = page.locator("[data-audio-player]");
    await player
      .getByRole("button", { name: "Écouter « кава »", exact: true })
      .click();
    await expect(player.locator(".audio-error")).toContainText("injoignable");
    await player
      .getByRole("button", { name: "Réessayer « кава »", exact: true })
      .click();
    await expect(player).toHaveAttribute("data-audio-phase", "playing");
    expect(await player.locator("audio").getAttribute("src")).toBe(
      `/api/audio/${firstId}`,
    );
  });

  test("foreign, hidden-review and arbitrary-text requests cannot create audio", async ({
    request,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, "Server validation is shared.");
    for (const command of [
      { ...kava, text: "injected" },
      { ...kava, voiceId: "custom" },
      { ...kava, source: { kind: "reference", elementId: "01-lettre-a" } },
      { ...kava, source: { kind: "review", attemptId: "hidden" } },
      {
        ...kava,
        source: {
          kind: "language",
          resultId: "foreign",
          entryIndex: 0,
          exampleIndex: null,
        },
      },
    ])
      expect([400, 404]).toContain(
        (await post(request, baseURL, command)).status(),
      );
    expect(
      (
        await request.post("/api/audio", {
          headers: { Origin: "https://foreign.invalid" },
          data: kava,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(request, baseURL, {
          ...kava,
          source: { kind: "reference", elementId: "01-mot-syr" },
        })
      ).status(),
    ).toBe(503);
  });
});
