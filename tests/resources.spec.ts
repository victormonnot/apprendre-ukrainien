import { expect, test, type APIRequestContext, type Page } from "./fixtures";
import { randomUUID } from "node:crypto";
import { getResource } from "../src/content/resources";
import type {
  ResourceCommand,
  ResourceWorkspace,
} from "../src/lib/resource-types";

const endpoint = "/api/resources";

async function workspace(
  request: APIRequestContext,
  id: string,
): Promise<ResourceWorkspace> {
  const response = await request.get(`${endpoint}?id=${id}`);
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

async function resetResource(
  request: APIRequestContext,
  baseURL: string | undefined,
  id: string,
) {
  const before = await workspace(request, id);
  const notes = await post(request, baseURL, {
    type: "save-notes",
    requestId: randomUUID(),
    resourceId: id,
    expectedRevision: before.state.notesRevision,
    notes: "",
  });
  expect(notes.status()).toBe(200);
  const position = await post(request, baseURL, {
    type: "save-position",
    requestId: randomUUID(),
    resourceId: id,
    expectedRevision: before.state.positionRevision,
    positionSeconds: null,
  });
  expect(position.status()).toBe(200);
  return position.json() as Promise<ResourceWorkspace>;
}

function commandResponse(
  page: Page,
  type: ResourceCommand["type"],
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

async function openResource(page: Page, id: string) {
  await page.goto(`/ressources/${id}`);
  const notes = page.getByRole("textbox", {
    name: "Ce que je veux retenir",
    exact: true,
  });
  await expect(notes).toBeEnabled();
  return notes;
}

async function saveNotes(page: Page) {
  const saved = commandResponse(page, "save-notes");
  await page
    .getByRole("button", { name: "Enregistrer mes notes", exact: true })
    .click();
  await saved;
  await expect(
    page.getByText("Notes enregistrées.", { exact: true }),
  ).toBeVisible();
}

function wave(seconds = 8) {
  const size = 8000 * seconds * 2;
  const bytes = Buffer.alloc(44 + size);
  bytes.write("RIFF");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(size, 40);
  for (let offset = 44; offset < bytes.length; offset += 2)
    bytes.writeInt16LE(
      Math.round(
        Math.sin(((offset - 44) / 2 / 8000) * 220 * Math.PI * 2) * 500,
      ),
      offset,
    );
  return bytes;
}

test.describe("resources, listening notes and personal bookmarks", () => {
  test.describe.configure({ mode: "serial" });

  test("the catalogue leads to the resource; saved notes and an unsaved tab copy survive reload", async ({
    page,
    request,
    baseURL,
    isMobile,
  }) => {
    await resetResource(request, baseURL, "ul-expressions");
    await page.goto("/ressources");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const id of ["ul-alphabet", "ulp-001", "ulp-003", "ul-expressions"])
      await expect(
        page.locator(`a[href="/ressources/${id}"]`).first(),
      ).toBeVisible();
    if (isMobile) {
      await page.setViewportSize({ width: 320, height: 800 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.locator('a[href="/ressources/ul-expressions"]').first().click();
    const notes = page.getByRole("textbox", {
      name: "Ce que je veux retenir",
      exact: true,
    });
    await expect(notes).toBeEnabled();
    await expect(
      page.getByRole("heading", {
        name: getResource("ul-expressions")!.title,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Charger le lecteur", exact: true }),
    ).toHaveCount(0);
    if (isMobile)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    const saved =
      "Je reconnais Дякую.\nJe veux réécouter la formule de présentation.";
    await notes.fill(saved);
    await saveNotes(page);
    await page.reload();
    await expect(notes).toHaveValue(saved);
    const draft = `${saved}\nBrouillon à conserver dans cet onglet.`;
    await notes.fill(draft);
    page.once("dialog", (dialog) => dialog.accept());
    await page.reload();
    await expect(notes).toHaveValue(draft);
    await expect(
      page.getByText("Le brouillon de cet onglet a été retrouvé.", {
        exact: true,
      }),
    ).toBeVisible();
    expect((await workspace(request, "ul-expressions")).state.notes).toBe(
      saved,
    );
    await saveNotes(page);
    expect((await workspace(request, "ul-expressions")).state.notes).toBe(
      draft,
    );
  });

  test("two tabs compare their notes before explicitly replacing a newer version", async ({
    page,
    context,
    request,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, "Conflict handling is shared across viewports.");
    await resetResource(request, baseURL, "ulp-003");
    const first = await openResource(page, "ulp-003");
    const other = await context.newPage();
    try {
      const second = await openResource(other, "ulp-003");
      await first.fill("Premier onglet : écouter le prénom.");
      await second.fill("Deuxième onglet : conserver ma propre phrase.");
      await saveNotes(page);
      const conflict = commandResponse(other, "save-notes", 409);
      await other
        .getByRole("button", { name: "Enregistrer mes notes", exact: true })
        .click();
      await conflict;
      await expect(
        other.getByRole("heading", {
          name: "Comparer les notes des deux onglets",
          exact: true,
        }),
      ).toBeVisible();
      await expect(second).toHaveValue(
        "Deuxième onglet : conserver ma propre phrase.",
      );
      await expect(second).toBeDisabled();
      expect((await workspace(request, "ulp-003")).state.notes).toBe(
        "Premier onglet : écouter le prénom.",
      );
      await other
        .getByRole("button", {
          name: "Garder mon texte après comparaison",
          exact: true,
        })
        .click();
      await expect(second).toBeEnabled();
      expect((await workspace(request, "ulp-003")).state.notes).toBe(
        "Premier onglet : écouter le prénom.",
      );
      await saveNotes(other);
      expect((await workspace(request, "ulp-003")).state.notes).toBe(
        "Deuxième onglet : conserver ma propre phrase.",
      );
    } finally {
      await other.close();
    }
  });

  test("retrying a lost note response sends the same command without another revision", async ({
    page,
    request,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, "Network recovery uses the same protocol.");
    const before = await resetResource(request, baseURL, "ulp-003");
    const sent: unknown[] = [];
    let lose = true;
    await page.route(`**${endpoint}`, async (route) => {
      const outgoing = route.request();
      if (
        outgoing.method() === "POST" &&
        outgoing.postDataJSON()?.type === "save-notes"
      ) {
        sent.push(outgoing.postDataJSON());
        if (lose) {
          lose = false;
          const response = await route.fetch();
          expect(response.status()).toBe(200);
          await route.abort("failed");
          return;
        }
      }
      await route.continue();
    });
    const notes = await openResource(page, "ulp-003");
    await notes.fill("Cette note est reçue même si la réponse se perd.");
    await page
      .getByRole("button", { name: "Enregistrer mes notes", exact: true })
      .click();
    await expect(
      page.locator(".resource-notes").getByRole("alert"),
    ).toContainText("injoignable");
    await expect(notes).toHaveValue(
      "Cette note est reçue même si la réponse se perd.",
    );
    const received = (await workspace(request, "ulp-003")).state;
    expect(received.notesRevision).toBe(before.state.notesRevision + 1);
    const retry = commandResponse(page, "save-notes");
    await page
      .getByRole("button", { name: "Réessayer l’enregistrement", exact: true })
      .click();
    await retry;
    await expect(
      page.getByText("Notes enregistrées.", { exact: true }),
    ).toBeVisible();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect((await workspace(request, "ulp-003")).state).toEqual(received);
  });

  test("a manual bookmark and notes save independently without assigning learning progress", async ({
    page,
    request,
    baseURL,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "Persistence and learning state are independent of screen size.",
    );
    const before = await resetResource(request, baseURL, "ulp-001");
    const learningBefore = await (await request.get("/api/learning")).json();
    const notes = await openResource(page, "ulp-001");
    await notes.fill("Notes écrites pendant la préparation du repère.");
    const input = page.getByLabel("Ou saisir un repère (mm:ss)", {
      exact: true,
    });
    await input.fill("1:72");
    await expect(
      page.getByRole("button", { name: "Garder ce repère", exact: true }),
    ).toBeDisabled();
    await input.fill("1:12");
    const positionSaved = commandResponse(page, "save-position");
    await page
      .getByRole("button", { name: "Garder ce repère", exact: true })
      .click();
    await positionSaved;
    const position = (await workspace(request, "ulp-001")).state;
    expect(position.positionSeconds).toBe(72);
    expect(position.positionRevision).toBe(before.state.positionRevision + 1);
    expect(position.notesRevision).toBe(before.state.notesRevision);
    await expect(notes).toHaveValue(
      "Notes écrites pendant la préparation du repère.",
    );
    await saveNotes(page);
    const after = (await workspace(request, "ulp-001")).state;
    expect(after.notesRevision).toBe(before.state.notesRevision + 1);
    expect(after.positionRevision).toBe(position.positionRevision);
    expect(after.positionSeconds).toBe(72);
    await page.reload();
    await expect(page.locator(".resource-saved-position")).toHaveText("1:12");
    await expect(notes).toHaveValue(after.notes);
    expect(await (await request.get("/api/learning")).json()).toEqual(
      learningBefore,
    );
  });

  test("a lost bookmark response retains the proposed instant when a newer bookmark must be compared", async ({
    page,
    request,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, "Bookmark recovery uses the same protocol.");
    await resetResource(request, baseURL, "ulp-001");
    const resource = getResource("ulp-001")!;
    if (resource.media?.kind !== "audio")
      throw new Error("The podcast fixture needs its official audio URL.");
    await page.route(resource.media.url, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "audio/wav",
        body: wave(),
        headers: { "Accept-Ranges": "bytes" },
      });
    });
    const sent: unknown[] = [];
    let lose = true;
    await page.route(`**${endpoint}`, async (route) => {
      const outgoing = route.request();
      if (
        outgoing.method() === "POST" &&
        outgoing.postDataJSON()?.type === "save-position"
      ) {
        sent.push(outgoing.postDataJSON());
        if (lose) {
          lose = false;
          expect((await route.fetch()).status()).toBe(200);
          await route.abort("failed");
          return;
        }
      }
      await route.continue();
    });
    await openResource(page, "ulp-001");
    await page
      .getByRole("button", { name: "Charger le lecteur", exact: true })
      .click();
    const audio = page.locator('[data-resource-player="ulp-001"] audio');
    await expect
      .poll(() =>
        audio.evaluate((element: HTMLAudioElement) => element.readyState),
      )
      .toBeGreaterThanOrEqual(1);
    await audio.evaluate((element: HTMLAudioElement) => {
      element.currentTime = 3;
    });
    await expect(page.locator(".resource-current-position strong")).toHaveText(
      "0:03",
    );
    await page
      .getByRole("button", { name: "Garder ce repère", exact: true })
      .click();
    await expect(
      page.locator(".resource-bookmark").getByRole("alert"),
    ).toContainText("injoignable");
    const received = await workspace(request, "ulp-001");
    expect(received.state.positionSeconds).toBe(3);
    const concurrent = await post(request, baseURL, {
      type: "save-position",
      requestId: randomUUID(),
      resourceId: "ulp-001",
      expectedRevision: received.state.positionRevision,
      positionSeconds: 5,
    });
    expect(concurrent.status()).toBe(200);
    const newer = (await concurrent.json()) as ResourceWorkspace;
    await audio.evaluate((element: HTMLAudioElement) => {
      element.currentTime = 6;
    });
    await expect(page.locator(".resource-current-position strong")).toHaveText(
      "0:06",
    );
    const retried = commandResponse(page, "save-position");
    await page
      .getByRole("button", { name: "Réessayer le repère", exact: true })
      .click();
    await retried;
    await expect(page.locator(".resource-conflict")).toContainText(
      "Repère de l’autre onglet : 0:05",
    );
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    await page
      .getByRole("button", { name: "J’ai comparé les repères", exact: true })
      .click();
    await expect(
      page.getByLabel("Ou saisir un repère (mm:ss)", { exact: true }),
    ).toHaveValue("0:03");
    expect((await workspace(request, "ulp-001")).state).toEqual(newer.state);
    const saved = commandResponse(page, "save-position");
    await page
      .getByRole("button", { name: "Garder ce repère", exact: true })
      .click();
    await saved;
    const after = (await workspace(request, "ulp-001")).state;
    expect(after.positionSeconds).toBe(3);
    expect(after.positionRevision).toBe(newer.state.positionRevision + 1);
  });

  test("audio loads only on demand and a saved position restores into the native player", async ({
    page,
    request,
    baseURL,
  }) => {
    await resetResource(request, baseURL, "ulp-001");
    const resource = getResource("ulp-001")!;
    if (resource.media?.kind !== "audio")
      throw new Error("The podcast fixture needs its official audio URL.");
    const audioUrl = resource.media.url;
    const external: string[] = [];
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (new URL(url).origin === new URL(baseURL!).origin) {
        await route.continue();
        return;
      }
      external.push(url);
      if (url === audioUrl) {
        await route.fulfill({
          status: 200,
          contentType: "audio/wav",
          body: wave(),
          headers: { "Accept-Ranges": "bytes" },
        });
      } else await route.abort("blockedbyclient");
    });
    await openResource(page, "ulp-001");
    const player = page.locator('[data-resource-player="ulp-001"]');
    await expect(player.locator("audio")).toHaveCount(0);
    expect(external).toEqual([]);
    const opened = commandResponse(page, "open");
    await player
      .getByRole("button", { name: "Charger le lecteur", exact: true })
      .click();
    await opened;
    const audio = player.locator("audio");
    await expect
      .poll(() =>
        audio.evaluate((element: HTMLAudioElement) => element.readyState),
      )
      .toBeGreaterThanOrEqual(1);
    expect(
      await audio.evaluate((element: HTMLAudioElement) => element.paused),
    ).toBe(true);
    expect(
      await audio.evaluate((element: HTMLAudioElement) => element.duration),
    ).toBe(8);
    await audio.evaluate(async (element: HTMLAudioElement) => {
      await element.play();
    });
    await expect
      .poll(() =>
        audio.evaluate((element: HTMLAudioElement) => element.currentTime),
      )
      .toBeGreaterThan(0);
    await audio.evaluate((element: HTMLAudioElement) => {
      element.pause();
      element.currentTime = 3;
    });
    await expect(page.locator(".resource-current-position strong")).toHaveText(
      "0:03",
    );
    const saved = commandResponse(page, "save-position");
    await page
      .getByRole("button", { name: "Garder ce repère", exact: true })
      .click();
    await saved;
    expect((await workspace(request, "ulp-001")).state.positionSeconds).toBe(3);
    const requestCount = external.length;
    await page.reload();
    await expect(
      page.getByRole("textbox", {
        name: "Ce que je veux retenir",
        exact: true,
      }),
    ).toBeEnabled();
    expect(external.length).toBe(requestCount);
    await expect(player.locator("audio")).toHaveCount(0);
    await player
      .getByRole("button", { name: "Charger le lecteur", exact: true })
      .click();
    await expect
      .poll(() =>
        audio.evaluate((element: HTMLAudioElement) => element.currentTime),
      )
      .toBe(3);
    expect(
      await audio.evaluate((element: HTMLAudioElement) => element.paused),
    ).toBe(true);
    await player
      .getByRole("button", { name: "Fermer le lecteur", exact: true })
      .click();
    await expect(player.locator("audio")).toHaveCount(0);
    expect(external.every((url) => url === audioUrl)).toBe(true);
  });

  test("video makes no external request before loading and leaves notes usable after provider failure", async ({
    page,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, "External-provider failures use shared player logic.");
    const external: string[] = [];
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (new URL(url).origin === new URL(baseURL!).origin)
        await route.continue();
      else {
        external.push(url);
        await route.abort("blockedbyclient");
      }
    });
    const notes = await openResource(page, "ul-alphabet");
    const player = page.locator('[data-resource-player="ul-alphabet"]');
    await expect(player.locator("iframe")).toHaveCount(0);
    expect(external).toEqual([]);
    await player
      .getByRole("button", { name: "Charger le lecteur", exact: true })
      .click();
    await expect(player.getByRole("alert")).toContainText("YouTube");
    expect(external).toContain("https://www.youtube.com/iframe_api");
    await expect(notes).toBeEnabled();
    await expect(
      page.getByRole("link", {
        name: "Ouvrir la source officielle ↗",
        exact: true,
      }),
    ).toHaveAttribute("href", getResource("ul-alphabet")!.sourceUrl);
    await expect(
      player.getByRole("button", { name: "Réessayer le lecteur", exact: true }),
    ).toBeEnabled();
  });

  test("invalid and foreign requests cannot mutate private resource notes", async ({
    request,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, "API validation does not depend on the viewport.");
    const before = await workspace(request, "ul-expressions");
    const valid = {
      type: "save-notes",
      requestId: randomUUID(),
      resourceId: "ul-expressions",
      expectedRevision: before.state.notesRevision,
      notes: "A note that must not be written",
    };
    for (const body of [
      { ...valid, userId: "other" },
      { ...valid, expectedRevision: -1 },
      { ...valid, requestId: "invalid" },
      { ...valid, notes: "x".repeat(10_001) },
      {
        type: "save-position",
        requestId: randomUUID(),
        resourceId: "ul-expressions",
        expectedRevision: before.state.positionRevision,
        positionSeconds: 12,
      },
    ])
      expect((await post(request, baseURL, body)).status()).toBe(400);
    for (const origin of ["https://foreign.invalid", "null"])
      expect(
        (
          await request.post(endpoint, {
            headers: { Origin: origin },
            data: valid,
          })
        ).status(),
      ).toBe(403);
    expect((await request.post(endpoint, { data: valid })).status()).toBe(403);
    expect(
      (
        await request.get(endpoint, {
          headers: { Origin: "https://foreign.invalid" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (await request.get(`${endpoint}?id=unknown-resource`)).status(),
    ).toBe(404);
    expect(
      (await request.get(`${endpoint}?id=ul-alphabet&extra=value`)).status(),
    ).toBe(400);
    expect(await workspace(request, "ul-expressions")).toEqual(before);
  });
});
