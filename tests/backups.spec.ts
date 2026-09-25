import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  expect,
  test,
  type APIRequest,
  type APIRequestContext,
  type Download,
} from "./fixtures";
import type {
  BackupFile,
  BackupInspection,
  RestoreCommand,
  RestoreResult,
} from "../src/lib/backup-types";
import type { ResourceWorkspace } from "../src/lib/resource-types";
import type { ReviewOverview } from "../src/lib/review-types";

function post(
  request: APIRequestContext,
  baseURL: string | undefined,
  endpoint: string,
  data: unknown,
) {
  if (!baseURL) throw new Error("The application base URL must be configured.");
  return request.post(endpoint, {
    headers: { Origin: new URL(baseURL).origin },
    data,
  });
}

async function generation(request: APIRequestContext): Promise<string> {
  const response = await request.get("/api/workspace");
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { generation: string };
  expect(body.generation).toEqual(expect.any(String));
  return body.generation;
}

async function freshRequest(factory: APIRequest, baseURL: string | undefined) {
  const probe = await factory.newContext({ baseURL });
  let value: string;
  try {
    value = await generation(probe);
  } finally {
    await probe.dispose();
  }
  return factory.newContext({
    baseURL,
    extraHTTPHeaders: { "X-Workspace-Generation": value },
  });
}

async function resource(
  request: APIRequestContext,
): Promise<ResourceWorkspace> {
  const response = await request.get("/api/resources?id=ul-expressions");
  expect(response.status()).toBe(200);
  return response.json();
}

async function downloadedBytes(download: Download) {
  const path = await download.path();
  if (!path) throw new Error("The downloaded file was not saved.");
  return readFile(path);
}

async function saveNotes(
  request: APIRequestContext,
  baseURL: string | undefined,
  notes: string,
) {
  const current = await resource(request);
  const response = await post(request, baseURL, "/api/resources", {
    type: "save-notes",
    resourceId: "ul-expressions",
    requestId: randomUUID(),
    expectedRevision: current.state.notesRevision,
    notes,
  });
  expect(response.status()).toBe(200);
  return response.json() as Promise<ResourceWorkspace>;
}

async function reviews(request: APIRequestContext): Promise<ReviewOverview> {
  const response = await request.get("/api/reviews");
  expect(response.status()).toBe(200);
  return response.json();
}

function persistedReviews(overview: ReviewOverview) {
  return {
    elements: overview.elements,
    active: overview.active,
    recent: overview.recent,
    selectedCount: overview.selectedCount,
    newToday: overview.newToday,
  };
}

async function createBackup(
  request: APIRequestContext,
  baseURL: string | undefined,
) {
  const response = await post(request, baseURL, "/api/backups", {
    type: "create",
  });
  expect(response.status()).toBe(200);
  const file = (await response.json()) as BackupFile;
  expect(file.kind).toBe("manual");
  expect(file.sizeBytes).toBeGreaterThan(0);
  const downloaded = await request.get(`/api/backups/download?id=${file.id}`);
  expect(downloaded.status()).toBe(200);
  expect(downloaded.headers()["content-type"]).toContain(
    "application/vnd.sqlite3",
  );
  expect(downloaded.headers()["cache-control"]).toMatch(/\bno-store\b/);
  const bytes = await downloaded.body();
  expect(bytes.byteLength).toBe(file.sizeBytes);
  expect(bytes.subarray(0, 16).toString("ascii")).toBe("SQLite format 3\u0000");
  return { file, bytes };
}

async function inspect(
  request: APIRequestContext,
  baseURL: string | undefined,
  bytes: Buffer,
) {
  const response = await request.post("/api/backups/inspect", {
    headers: { Origin: baseURL!, "Content-Type": "application/octet-stream" },
    data: bytes,
  });
  expect(response.status()).toBe(200);
  const inspection = (await response.json()) as BackupInspection;
  expect(inspection.sha256).toBe(
    createHash("sha256").update(bytes).digest("hex"),
  );
  expect(inspection.sizeBytes).toBe(bytes.byteLength);
  expect(inspection.summary.activeCards).toBeGreaterThanOrEqual(0);
  return inspection;
}

async function restore(
  request: APIRequestContext,
  baseURL: string | undefined,
  bytes: Buffer,
) {
  const inspection = await inspect(request, baseURL, bytes);
  const command: RestoreCommand = {
    inspectionId: inspection.id,
    sha256: inspection.sha256,
    expectedGeneration: await generation(request),
    requestId: randomUUID(),
  };
  const response = await post(
    request,
    baseURL,
    "/api/backups/restore",
    command,
  );
  expect(response.status()).toBe(200);
  const result = (await response.json()) as RestoreResult;
  expect(result.requestId).toBe(command.requestId);
  expect(result.generation).not.toBe(command.expectedGeneration);
  expect(result.safetyBackupId).toEqual(expect.any(String));
  return { command, result };
}

test.describe("local database backups and recovery", () => {
  test.describe.configure({ mode: "serial" });

  test("the data page is readable on desktop and mobile without creating a backup or restoring work", async ({
    page,
    request,
    isMobile,
  }) => {
    const before = await generation(request);
    const initial = await resource(request);
    const writes: string[] = [];
    page.on("request", (outgoing) => {
      if (outgoing.method() === "POST")
        writes.push(new URL(outgoing.url()).pathname);
    });
    await page.goto("/donnees");
    await expect(
      page.getByRole("heading", { name: "Mes données", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Créer une sauvegarde", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByLabel("Choisir un fichier de sauvegarde", { exact: true }),
    ).toBeAttached();
    expect(writes).toEqual([]);
    expect(await generation(request)).toBe(before);
    expect((await resource(request)).state).toEqual(initial.state);
    if (isMobile) {
      await page.setViewportSize({ width: 320, height: 800 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });

  test("restores notes and review state exactly, rotates the generation, and safely retries the same restoration", async ({
    request,
    playwright,
    baseURL,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "Restoration replaces the shared test database and is verified once.",
    );
    const beforeResource = await resource(request);
    const beforeReviews = await reviews(request);
    const baseline = await createBackup(request, baseURL);
    let current: APIRequestContext | null = null;
    try {
      await saveNotes(
        request,
        baseURL,
        "Texte temporaire après sauvegarde : Дякую.",
      );
      const element = beforeReviews.elements.find(
        (item) => item.id === "01-mot-kava",
      )!;
      const changed = await post(request, baseURL, "/api/reviews", {
        type: element.active ? "suspend" : "activate",
        elementId: element.id,
      });
      expect(changed.status()).toBe(200);
      expect(persistedReviews(await reviews(request))).not.toEqual(
        persistedReviews(beforeReviews),
      );
      const { command, result } = await restore(
        request,
        baseURL,
        baseline.bytes,
      );

      const retry = await post(
        request,
        baseURL,
        "/api/backups/restore",
        command,
      );
      expect(retry.status()).toBe(200);
      expect(await retry.json()).toEqual(result);
      const changedRetry = await post(
        request,
        baseURL,
        "/api/backups/restore",
        {
          ...command,
          sha256: "0".repeat(64),
        },
      );
      expect(changedRetry.status()).toBe(409);
      expect(await generation(request)).toBe(result.generation);
      current = await freshRequest(playwright.request, baseURL);
      expect((await resource(current)).state).toEqual(beforeResource.state);
      expect(persistedReviews(await reviews(current))).toEqual(
        persistedReviews(beforeReviews),
      );

      const stale = await post(request, baseURL, "/api/resources", {
        type: "save-notes",
        resourceId: "ul-expressions",
        requestId: randomUUID(),
        expectedRevision: beforeResource.state.notesRevision,
        notes: "Un ancien onglet ne doit pas écrire ce texte.",
      });
      expect(stale.status()).toBe(409);
      expect((await resource(current)).state).toEqual(beforeResource.state);

      const safety = await current.get(
        `/api/backups/download?id=${result.safetyBackupId}`,
      );
      expect(safety.status()).toBe(200);
      const safetyInspection = await inspect(
        current,
        baseURL,
        await safety.body(),
      );
      expect(safetyInspection.summary.resourceNotes).toBeGreaterThan(0);
      const fresh = await saveNotes(
        current,
        baseURL,
        "Cet onglet a chargé la nouvelle génération.",
      );
      expect(fresh.state.notes).toBe(
        "Cet onglet a chargé la nouvelle génération.",
      );
    } finally {
      await current?.dispose();
      const cleanup = await freshRequest(playwright.request, baseURL);
      try {
        await restore(cleanup, baseURL, baseline.bytes);
        const restored = await freshRequest(playwright.request, baseURL);
        try {
          expect((await resource(restored)).state).toEqual(
            beforeResource.state,
          );
          expect(persistedReviews(await reviews(restored))).toEqual(
            persistedReviews(beforeReviews),
          );
        } finally {
          await restored.dispose();
        }
      } finally {
        await cleanup.dispose();
      }
    }
  });

  test("untrusted origins, missing generations and invalid archives cannot modify the workspace", async ({
    request,
    playwright,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, "Server validation is shared across viewports.");
    const before = await generation(request);
    const state = await resource(request);
    for (const origin of ["https://foreign.invalid", "null"]) {
      expect(
        (
          await request.post("/api/backups", {
            headers: { Origin: origin },
            data: { type: "create" },
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await request.post("/api/backups/inspect", {
            headers: {
              Origin: origin,
              "Content-Type": "application/octet-stream",
            },
            data: Buffer.from("SQLite format 3\u0000"),
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await request.post("/api/backups/restore", {
            headers: { Origin: origin },
            data: {
              inspectionId: randomUUID(),
              sha256: "0".repeat(64),
              requestId: randomUUID(),
              expectedGeneration: before,
            },
          })
        ).status(),
      ).toBe(403);
    }
    const missing = await playwright.request.newContext({ baseURL });
    try {
      expect(
        (
          await post(missing, baseURL, "/api/backups", { type: "create" })
        ).status(),
      ).toBe(409);
    } finally {
      await missing.dispose();
    }
    const invalid = await request.post("/api/backups/inspect", {
      headers: { Origin: baseURL!, "Content-Type": "application/octet-stream" },
      data: Buffer.from("This is not a SQLite database."),
    });
    expect(invalid.status()).toBe(400);
    expect([400, 404]).toContain(
      (
        await request.get("/api/backups/download?id=../../learning.sqlite3")
      ).status(),
    );
    expect(await generation(request)).toBe(before);
    expect((await resource(request)).state).toEqual(state.state);
  });

  test("the interface downloads and inspects a backup, requires confirmation, and preserves an old tab’s draft separately", async ({
    page,
    context,
    request,
    playwright,
    baseURL,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "The destructive UI flow is verified once; mobile uses the read-only check.",
    );
    const before = await resource(request);
    const baseline = await createBackup(request, baseURL);
    const oldTab = await context.newPage();
    let current: APIRequestContext | null = null;
    try {
      await oldTab.goto("/ressources/ul-expressions");
      const oldNotes = oldTab.getByRole("textbox", {
        name: "Ce que je veux retenir",
        exact: true,
      });
      await expect(oldNotes).toBeEnabled();
      const draft = `Brouillon conservé à part après restauration : ${randomUUID()}`;
      await oldNotes.fill(draft);

      await page.goto("/donnees");
      const createdResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/backups" &&
          response.request().method() === "POST" &&
          response.status() === 200,
      );
      await page
        .getByRole("button", { name: "Créer une sauvegarde", exact: true })
        .click();
      const created = (await (await createdResponse).json()) as BackupFile;
      const row = page.locator(`[data-backup-id="${created.id}"]`);
      await expect(row).toBeVisible();
      const downloaded = page.waitForEvent("download");
      await row
        .getByRole("button", { name: "Télécharger", exact: true })
        .click();
      const bytes = await downloadedBytes(await downloaded);
      expect(bytes.subarray(0, 16).toString("ascii")).toBe(
        "SQLite format 3\u0000",
      );
      expect(bytes.byteLength).toBe(created.sizeBytes);

      await page
        .getByLabel("Choisir un fichier de sauvegarde", { exact: true })
        .setInputFiles({
          name: "restauration.sqlite3",
          mimeType: "application/vnd.sqlite3",
          buffer: bytes,
        });
      await expect(
        page.getByRole("heading", {
          name: "Vérifier avant de restaurer",
          exact: true,
        }),
      ).toBeVisible();
      const restoreButton = page.getByRole("button", {
        name: "Restaurer cette sauvegarde",
        exact: true,
      });
      await expect(restoreButton).toBeDisabled();
      expect((await resource(request)).state).toEqual(before.state);
      await page
        .getByRole("checkbox", {
          name: "Je veux remplacer le travail actuel par cette sauvegarde.",
          exact: true,
        })
        .check();
      await expect(restoreButton).toBeEnabled();
      await restoreButton.click();
      await expect(
        page.getByRole("heading", {
          name: "Le travail a été restauré",
          exact: true,
        }),
      ).toBeVisible();

      const stale = oldTab.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/resources" &&
          response.request().method() === "POST" &&
          response.status() === 409,
      );
      await oldTab
        .getByRole("button", { name: "Enregistrer mes notes", exact: true })
        .click();
      await stale;
      await expect(oldNotes).toHaveValue(draft);
      await expect(
        oldTab.getByRole("button", {
          name: "Recharger l’application",
          exact: true,
        }),
      ).toBeVisible();
      current = await freshRequest(playwright.request, baseURL);
      expect((await resource(current)).state).toEqual(before.state);
      oldTab.once("dialog", (dialog) => dialog.accept());
      await oldTab
        .getByRole("button", { name: "Recharger l’application", exact: true })
        .click();
      await expect(oldNotes).toHaveValue(before.state.notes);
      await oldTab.goto("/donnees");
      const archived = oldTab.waitForEvent("download");
      await oldTab
        .getByRole("button", {
          name: "Télécharger les anciens brouillons",
          exact: true,
        })
        .click();
      expect(
        (await downloadedBytes(await archived)).toString("utf8"),
      ).toContain(draft);
      expect((await resource(current)).state).toEqual(before.state);
      await page
        .getByRole("button", {
          name: "Ouvrir le travail restauré",
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(/\/parcours$/);
    } finally {
      await oldTab.close();
      await current?.dispose();
      const cleanup = await freshRequest(playwright.request, baseURL);
      try {
        await restore(cleanup, baseURL, baseline.bytes);
      } finally {
        await cleanup.dispose();
      }
    }
  });

  test("a lost restoration response survives reload and retries its original receipt without restoring twice", async ({
    page,
    request,
    playwright,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, "Restoration recovery is shared across viewports.");
    const baseline = await createBackup(request, baseURL);
    let receipt: RestoreResult | null = null;
    const commands: RestoreCommand[] = [];
    let lose = true;
    try {
      await page.route("**/api/backups/restore", async (route) => {
        commands.push(route.request().postDataJSON() as RestoreCommand);
        if (lose) {
          lose = false;
          const response = await route.fetch();
          expect(response.status()).toBe(200);
          receipt = (await response.json()) as RestoreResult;
          await route.abort("failed");
        } else await route.continue();
      });
      await page.goto("/donnees");
      await page
        .getByLabel("Choisir un fichier de sauvegarde", { exact: true })
        .setInputFiles({
          name: "retry.sqlite3",
          mimeType: "application/vnd.sqlite3",
          buffer: baseline.bytes,
        });
      await page
        .getByRole("checkbox", {
          name: "Je veux remplacer le travail actuel par cette sauvegarde.",
          exact: true,
        })
        .check();
      await page
        .getByRole("button", {
          name: "Restaurer cette sauvegarde",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Réessayer la restauration",
          exact: true,
        }),
      ).toBeEnabled();
      expect(receipt).not.toBeNull();
      const committedGeneration = await generation(request);
      expect(committedGeneration).toBe(
        (receipt as RestoreResult | null)?.generation,
      );
      page.once("dialog", (dialog) => dialog.accept());
      await page.reload();
      await page
        .getByRole("button", { name: "Réessayer la restauration", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Le travail a été restauré",
          exact: true,
        }),
      ).toBeVisible();
      expect(commands).toHaveLength(2);
      expect(commands[1]).toEqual(commands[0]);
      expect(await generation(request)).toBe(committedGeneration);
    } finally {
      const cleanup = await freshRequest(playwright.request, baseURL);
      try {
        await restore(cleanup, baseURL, baseline.bytes);
      } finally {
        await cleanup.dispose();
      }
    }
  });
});
