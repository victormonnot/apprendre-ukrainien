import { randomUUID } from "node:crypto";
import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "./fixtures";
import type {
  BackupFile,
  BackupInspection,
  RestoreResult,
} from "../src/lib/backup-types";
import type { ReviewCommand, ReviewOverview } from "../src/lib/review-types";

const endpoint = "/api/reviews";

function post(
  request: APIRequestContext,
  baseURL: string | undefined,
  path: string,
  data: unknown,
) {
  if (!baseURL) throw new Error("An isolated application URL is required.");
  return request.post(path, {
    headers: { Origin: new URL(baseURL).origin },
    data,
  });
}

async function overview(request: APIRequestContext, generation?: string) {
  const response = await request.get(endpoint, {
    ...(generation
      ? { headers: { "X-Workspace-Generation": generation } }
      : {}),
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as ReviewOverview;
}

async function update(
  request: APIRequestContext,
  baseURL: string | undefined,
  command: ReviewCommand,
) {
  const response = await post(request, baseURL, endpoint, command);
  expect(response.status()).toBe(200);
  return (await response.json()) as ReviewOverview;
}

function commandResponse(page: Page, type: ReviewCommand["type"]) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === endpoint &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.type === type &&
      response.status() === 200,
  );
}

async function clickCommand(
  page: Page,
  type: ReviewCommand["type"],
  button: Locator,
) {
  const response = commandResponse(page, type);
  await button.click();
  return (await (await response).json()) as ReviewOverview;
}

function persisted(state: ReviewOverview) {
  return {
    dailyNewLimit: state.dailyNewLimit,
    newToday: state.newToday,
    selectedCount: state.selectedCount,
    elements: state.elements,
    packs: state.packs,
    recent: state.recent,
    active: state.active,
  };
}

// The legacy browser suite shares a disposable profile. Keep these tests
// independent of its current selection, and restore every persisted change.
async function backup(request: APIRequestContext, baseURL: string | undefined) {
  const response = await post(request, baseURL, "/api/backups", {
    type: "create",
  });
  expect(response.status()).toBe(200);
  const file = (await response.json()) as BackupFile;
  const download = await request.get(`/api/backups/download?id=${file.id}`);
  expect(download.status()).toBe(200);
  return download.body();
}

async function restore(
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
  const workspace = await request.get("/api/workspace");
  expect(workspace.status()).toBe(200);
  const { generation } = (await workspace.json()) as { generation: string };
  const restored = await post(request, baseURL, "/api/backups/restore", {
    inspectionId: inspection.id,
    sha256: inspection.sha256,
    expectedGeneration: generation,
    requestId: randomUUID(),
  });
  expect(restored.status()).toBe(200);
  return ((await restored.json()) as RestoreResult).generation;
}

async function finishCurrent(
  request: APIRequestContext,
  baseURL: string | undefined,
  state: ReviewOverview,
) {
  const active = state.active;
  if (!active) return state;
  if (active.status === "presented")
    await update(request, baseURL, {
      type: "reveal",
      attemptId: active.id,
      answerText: "",
    });
  return update(request, baseURL, {
    type: "rate",
    attemptId: active.id,
    rating: "easy",
  });
}

async function suspendSelection(
  request: APIRequestContext,
  baseURL: string | undefined,
) {
  const state = await finishCurrent(request, baseURL, await overview(request));
  for (const element of state.elements.filter((item) => item.active))
    await update(request, baseURL, {
      type: "suspend",
      elementId: element.id,
    });
}

test.describe("review packs and extended practice", () => {
  test.describe.configure({ mode: "serial" });

  test("adds and completes a whole pack without duplicates, and remembers the daily limit", async ({
    page,
    request,
    baseURL,
  }) => {
    const baseline = await backup(request, baseURL);
    const before = persisted(await overview(request));
    try {
      await suspendSelection(request, baseURL);
      const partial = await update(request, baseURL, {
        type: "activate",
        elementId: "01-mot-kava",
      });
      await page.goto("/revisions");
      const pack = page.locator('[data-review-pack-id="module-01"]');
      await expect(pack).toContainText("50 cartes");
      const activated = await clickCommand(
        page,
        "activate-pack",
        pack.getByRole("button", { name: /^Compléter le pack/ }),
      );
      expect(
        activated.packs.find((item) => item.id === "module-01"),
      ).toMatchObject({
        elementCount: 31,
        cardCount: 50,
        activeElementCount: 31,
      });
      expect(activated.selectedCount).toBe(31);
      expect(activated.recent).toEqual(partial.recent);
      expect(activated.newToday).toBe(partial.newToday);
      expect(
        activated.elements.find((item) => item.id === "01-mot-kava"),
      ).toEqual(partial.elements.find((item) => item.id === "01-mot-kava"));
      await expect(
        pack.getByRole("button", { name: /^Pack ajouté/ }),
      ).toBeDisabled();
      const repeated = await update(request, baseURL, {
        type: "activate-pack",
        packId: "module-01",
      });
      expect(persisted(repeated)).toEqual(persisted(activated));

      await update(request, baseURL, {
        type: "suspend",
        elementId: "01-mot-kava",
      });
      await page.reload();
      const completed = await clickCommand(
        page,
        "activate-pack",
        pack.getByRole("button", { name: /^Compléter le pack/ }),
      );
      expect(persisted(completed)).toEqual(persisted(activated));

      const limit = page.getByRole("combobox", {
        name: "Nouvelles cartes par jour",
        exact: true,
      });
      for (const value of ["5", "unlimited"]) {
        const changed = commandResponse(page, "set-daily-limit");
        await limit.selectOption(value);
        const state = (await (await changed).json()) as ReviewOverview;
        expect(state.dailyNewLimit).toBe(value === "5" ? 5 : null);
        expect(state.recent).toEqual(activated.recent);
        await page.reload();
        await expect(limit).toHaveValue(value);
        expect((await overview(request)).dailyNewLimit).toBe(
          state.dailyNewLimit,
        );
      }
    } finally {
      await page.goto("/");
      const generation = await restore(request, baseURL, baseline);
      expect(persisted(await overview(request, generation))).toEqual(before);
    }
  });

  test("keeps practicing after the daily quota, resumes after reload and stops without changing the schedule", async ({
    page,
    request,
    baseURL,
  }) => {
    const baseline = await backup(request, baseURL);
    const before = persisted(await overview(request));
    try {
      await suspendSelection(request, baseURL);
      await update(request, baseURL, {
        type: "set-daily-limit",
        dailyNewLimit: null,
      });
      for (const suffix of ["kava", "mova", "kit", "mama", "tato", "tut"])
        await update(request, baseURL, {
          type: "activate",
          elementId: `01-mot-${suffix}`,
        });
      let prepared = await overview(request);
      let passes = 0;
      while (prepared.eligibleCount > 0) {
        expect(++passes).toBeLessThanOrEqual(12);
        prepared = await finishCurrent(
          request,
          baseURL,
          await update(request, baseURL, { type: "start" }),
        );
      }
      const planned = await update(request, baseURL, {
        type: "set-daily-limit",
        dailyNewLimit: 5,
      });
      expect(planned.newToday).toBeGreaterThanOrEqual(5);
      expect(planned.eligibleCount).toBe(0);
      expect(planned.practiceAvailableCount).toBeGreaterThan(0);
      await page.goto("/revisions");
      const active = page.getByRole("region", { name: "Carte de révision" });
      let current = await clickCommand(
        page,
        "start-practice",
        page.getByRole("button", {
          name: "Continuer à m’entraîner",
          exact: true,
        }),
      );
      const attempts: string[] = [];
      for (let pass = 0; pass < 3; pass++) {
        expect(current.active?.mode).toBe("practice");
        const attemptId = current.active!.id;
        attempts.push(attemptId);
        await expect(active).toHaveAttribute(
          "data-review-attempt-id",
          attemptId,
        );
        await expect(active.locator("[data-audio-player]")).toHaveCount(0);
        if (pass === 1) {
          await page.reload();
          await expect(active).toHaveAttribute(
            "data-review-attempt-id",
            attemptId,
          );
        }
        await active.getByRole("textbox").fill(`Rappel libre ${pass + 1}`);
        const revealed = await clickCommand(
          page,
          "reveal",
          active.getByRole("button", {
            name: "Révéler la réponse",
            exact: true,
          }),
        );
        expect(revealed.active?.revealed?.options).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              rating: "again",
              dueAt: null,
              practiceGap: expect.any(Number),
            }),
            expect.objectContaining({
              rating: "easy",
              dueAt: null,
              practiceGap: expect.any(Number),
            }),
          ]),
        );
        await expect(active.locator("[data-audio-player]")).toBeVisible();
        await expect(
          active.getByRole("button", { name: /^Écouter «/ }),
        ).toBeVisible();
        if (pass === 2)
          await active
            .getByRole("button", {
              name: "Terminer après cette carte",
              exact: true,
            })
            .click();
        const next = pass < 2 ? commandResponse(page, "start-practice") : null;
        const rated = await clickCommand(
          page,
          "rate",
          active.getByRole("button", {
            name: pass === 0 ? /^À revoir/ : /^Facile/,
          }),
        );
        expect(rated.newToday).toBe(planned.newToday);
        expect(rated.elements).toEqual(planned.elements);
        current = next
          ? ((await (await next).json()) as ReviewOverview)
          : rated;
      }
      await expect(active).toHaveCount(0);
      const after = await overview(request);
      expect(after.active).toBeNull();
      expect(after.elements).toEqual(planned.elements);
      expect(after.newToday).toBe(planned.newToday);
      expect(
        after.recent.filter((entry) => attempts.includes(entry.id)),
      ).toHaveLength(3);
      expect(after.recent.slice(3)).toEqual(planned.recent.slice(0, 17));
      await expect(
        page.getByRole("button", {
          name: "Continuer à m’entraîner",
          exact: true,
        }),
      ).toBeVisible();
    } finally {
      await page.goto("/");
      const generation = await restore(request, baseURL, baseline);
      expect(persisted(await overview(request, generation))).toEqual(before);
    }
  });
});
