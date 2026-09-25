import { expect, test, type APIRequestContext } from "@playwright/test";
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
      store.saveClip(
        user,
        describeAudio("macos-lesya", text),
        wave(),
        "audio/wav",
      );
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
    await player
      .getByRole("button", { name: "Mettre en pause « кава »", exact: true })
      .click();
    await expect(player).toHaveAttribute("data-audio-phase", "paused");
    const audio = player.locator("audio");
    const paused = await audio.evaluate((element: HTMLAudioElement) => ({
      paused: element.paused,
      time: element.currentTime,
      url: element.currentSrc,
    }));
    expect(paused.paused).toBe(true);
    await player.getByRole("button", { name: "Ralentir · 0,75×" }).click();
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
    await expect(player.locator(".audio-provenance")).toContainText("macOS");
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
