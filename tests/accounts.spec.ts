import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { relative } from "node:path";
import { accountDirectory, openAuthStore } from "../src/lib/server/auth-store";
import { openLearningStore } from "../src/lib/server/learning-store";
import { openAudioStore } from "../src/lib/server/audio-store";
import { describeAudio } from "../src/lib/server/audio-provider";
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from "@playwright/test";
import type { LearningOverview } from "../src/lib/learning-types";
import type { ReviewOverview } from "../src/lib/review-types";
import type { BackupFile, BackupInspection } from "../src/lib/backup-types";

// The normal legacy suite keeps its existing single-profile server and fixtures.
// Run this spec only against an isolated APP_AUTH_ENABLED=1 installation.
test.skip(
  process.env.APP_AUTH_ENABLED !== "1",
  "Accounts require the dedicated authenticated test server.",
);

type Account = {
  id: string;
  username: string;
  displayName: string;
  role: "owner" | "member";
  aiEnabled: boolean;
};
type Session = {
  account: Account;
  password: string;
  recoveryCode: string;
  generation: string;
};
const password = "A long isolated test passphrase 42!";
const username = (prefix: string) => `${prefix}_${randomUUID().slice(0, 12)}`;

function isolatedDirectory() {
  const directory = process.env.PLAYWRIGHT_DATA_DIR;
  if (!directory)
    throw new Error("Account fixtures require an isolated test directory.");
  const fromTemp = relative(realpathSync(tmpdir()), realpathSync(directory));
  if (!fromTemp || fromTemp.startsWith(".."))
    throw new Error(
      "Account fixtures must remain inside a temporary directory.",
    );
  return directory;
}

test.beforeAll(async () => {
  if (process.env.APP_AUTH_ENABLED !== "1") return;
  const store = openAuthStore(isolatedDirectory());
  try {
    if (!store.hasOwner())
      await store.provisionOwner({
        username: "isolated_owner",
        displayName: "Isolated test owner",
        password,
      });
  } finally {
    store.close();
  }
});

function seedPrivateAudio(account: Account) {
  const directory = accountDirectory(account, isolatedDirectory());
  const learning = openLearningStore(directory);
  const audio = openAudioStore(directory);
  // A short valid silent PCM fixture; never call a speech provider during tests.
  const bytes = Buffer.alloc(44 + 1600);
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
  bytes.writeUInt32LE(1600, 40);
  try {
    audio.saveClip(
      learning.getLocalUserId(),
      describeAudio("openai-cedar", "кава"),
      bytes,
      "audio/wav",
    );
  } finally {
    audio.close();
    learning.close();
  }
}

function authPost(
  request: APIRequestContext,
  baseURL: string | undefined,
  action: string,
  data: unknown,
  accountId?: string,
) {
  if (!baseURL) throw new Error("An isolated application URL is required.");
  return request.post(`/api/auth/${action}`, {
    headers: {
      Origin: new URL(baseURL).origin,
      ...(accountId ? { "X-Account-Id": accountId } : {}),
    },
    data,
  });
}

async function workspace(request: APIRequestContext, accountId: string) {
  const response = await request.get("/api/workspace", {
    headers: { "X-Account-Id": accountId },
  });
  expect(response.status()).toBe(200);
  const result = (await response.json()) as {
    generation: string;
    accountId: string;
  };
  expect(result.accountId).toBe(accountId);
  expect(result.generation).toEqual(expect.any(String));
  return result.generation;
}

async function register(
  request: APIRequestContext,
  baseURL: string | undefined,
  prefix: string,
): Promise<Session> {
  const response = await authPost(request, baseURL, "register", {
    username: username(prefix),
    displayName: prefix,
    password,
  });
  expect(response.status()).toBe(201);
  const result = (await response.json()) as {
    account: Account;
    recoveryCode: string;
  };
  expect(result.account).toMatchObject({
    id: expect.any(String),
    role: "member",
    aiEnabled: false,
  });
  expect(result.recoveryCode.length).toBeGreaterThanOrEqual(20);
  return {
    ...result,
    password,
    generation: await workspace(request, result.account.id),
  };
}

function headers(session: Session) {
  return {
    "X-Account-Id": session.account.id,
    "X-Workspace-Generation": session.generation,
  };
}

function dataGet(request: APIRequestContext, session: Session, path: string) {
  return request.get(path, { headers: headers(session) });
}

function dataPost(
  request: APIRequestContext,
  baseURL: string | undefined,
  session: Session,
  path: string,
  data: unknown,
) {
  return request.post(path, {
    headers: { ...headers(session), Origin: new URL(baseURL!).origin },
    data,
  });
}

async function denied(response: APIResponse, status: number, code?: string) {
  expect(response.status()).toBe(status);
  if (code) expect(await response.json()).toMatchObject({ code });
}

async function learning(request: APIRequestContext, session: Session) {
  const response = await dataGet(request, session, "/api/learning");
  expect(response.status()).toBe(200);
  return (await response.json()) as LearningOverview;
}

function note(overview: LearningOverview) {
  return (
    overview.documents.find(
      (document) => document.moduleId === "01" && document.view === "cours",
    )?.note.text ?? ""
  );
}

async function openNotebook(page: Page) {
  await page.goto("/parcours/01/cours");
  await page.getByText("Mon suivi et mes notes", { exact: true }).click();
  const input = page.getByLabel("Ma note personnelle", { exact: true });
  await expect(input).toBeVisible();
  return input;
}

async function loginForm(page: Page, user: string, secret = password) {
  await page.goto("/connexion");
  await page.getByLabel("Identifiant", { exact: true }).fill(user);
  await page.getByLabel("Mot de passe", { exact: true }).fill(secret);
  const response = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/auth/login" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(/\/parcours$/);
}

test("guests can navigate the course while every personal API requires a session", async ({
  page,
  request,
  baseURL,
  isMobile,
}) => {
  expect(await (await request.get("/api/auth")).json()).toEqual({
    enabled: true,
    account: null,
  });
  for (const path of [
    "/api/workspace",
    "/api/learning",
    "/api/reviews",
    "/api/exercises?moduleId=01",
    "/api/language",
    "/api/scenes",
    "/api/resources?id=ul-expressions",
    "/api/backups",
    "/api/audio",
    `/api/backups/download?id=${randomUUID()}`,
    `/api/audio/${randomUUID()}`,
  ]) {
    await denied(await request.get(path), 401, "AUTH_REQUIRED");
  }
  await denied(
    await request.post("/api/learning", {
      headers: { Origin: baseURL! },
      data: {
        type: "note",
        moduleId: "01",
        view: "cours",
        text: "A guest must not save this.",
        expectedRevision: 0,
      },
    }),
    401,
    "AUTH_REQUIRED",
  );
  await page.goto("/parcours/01/cours");
  await expect(
    page.getByRole("heading", {
      name: "Lire le cyrillique et faire un premier échange",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Supports du module" })
    .getByRole("link", { name: "Vocabulaire", exact: true })
    .click();
  await expect(page).toHaveURL(/\/parcours\/01\/vocabulaire$/);
  await expect(
    page.getByRole("heading", { name: "Les sept premiers mots" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Ma note personnelle", { exact: true }),
  ).toHaveCount(0);
  await page.goto("/connexion");
  await expect(page.getByLabel("Identifiant", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Mot de passe", { exact: true }),
  ).toHaveAttribute("type", "password");
  await page.goto("/inscription");
  await expect(
    page.getByLabel("Confirmer le mot de passe", { exact: true }),
  ).toBeVisible();
  if (isMobile) {
    await page.setViewportSize({ width: 320, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("separate accounts cannot read notes, review attempts, audio, backups or write with a stale identity", async ({
  playwright,
  baseURL,
  isMobile,
}) => {
  test.skip(
    isMobile,
    "The server account boundary is independent of viewport.",
  );
  const a = await playwright.request.newContext({ baseURL });
  const b = await playwright.request.newContext({ baseURL });
  try {
    const first = await register(a, baseURL, "first");
    const second = await register(b, baseURL, "second");
    await denied(await a.get("/api/workspace"), 409, "ACCOUNT_CHANGED");
    await denied(await a.get("/api/learning"), 409, "ACCOUNT_CHANGED");
    const command = {
      type: "note",
      moduleId: "01",
      view: "cours",
      text: "Private note from account A.",
      expectedRevision: 0,
    };
    expect(
      (await dataPost(a, baseURL, first, "/api/learning", command)).status(),
    ).toBe(200);
    expect(note(await learning(b, second))).toBe("");
    expect(
      (
        await dataPost(b, baseURL, second, "/api/learning", {
          ...command,
          text: "Private note from account B.",
        })
      ).status(),
    ).toBe(200);
    expect(note(await learning(a, first))).toBe(command.text);
    expect(note(await learning(b, second))).toBe(
      "Private note from account B.",
    );
    await denied(
      await dataPost(b, baseURL, second, "/api/learning", {
        ...command,
        userId: first.account.id,
      }),
      400,
    );

    expect(
      (
        await dataPost(a, baseURL, first, "/api/reviews", {
          type: "activate",
          elementId: "01-mot-kava",
        })
      ).status(),
    ).toBe(200);
    const started = await dataPost(a, baseURL, first, "/api/reviews", {
      type: "start",
    });
    expect(started.status()).toBe(200);
    const ownReviews = (await started.json()) as ReviewOverview;
    expect(ownReviews.active).not.toBeNull();
    const otherReviews = (await (
      await dataGet(b, second, "/api/reviews")
    ).json()) as ReviewOverview;
    expect(otherReviews.selectedCount).toBe(0);
    expect(otherReviews.active).toBeNull();
    await denied(
      await dataPost(b, baseURL, second, "/api/reviews", {
        type: "reveal",
        attemptId: ownReviews.active!.id,
        answerText: "Trying to reveal someone else’s card.",
      }),
      404,
    );
    expect(
      (
        (await (
          await dataGet(a, first, "/api/reviews")
        ).json()) as ReviewOverview
      ).active,
    ).toEqual(ownReviews.active);

    seedPrivateAudio(first.account);
    const cachedAudio = await dataPost(a, baseURL, first, "/api/audio", {
      source: { kind: "reference", elementId: "01-mot-kava" },
      voiceId: "openai-cedar",
    });
    expect(cachedAudio.status()).toBe(200);
    const clip = (await cachedAudio.json()) as { id: string; url: string };
    expect(new URL(clip.url, baseURL).searchParams.get("account")).toBe(
      first.account.id,
    );
    expect((await a.get(clip.url)).status()).toBe(200);
    expect((await a.head(clip.url)).status()).toBe(200);
    await denied(await dataGet(b, second, `/api/audio/${clip.id}`), 404);
    await denied(await b.get(clip.url), 409, "ACCOUNT_CHANGED");
    await denied(await b.head(clip.url), 409);
    await denied(
      await dataPost(b, baseURL, second, "/api/audio", {
        source: { kind: "reference", elementId: "01-mot-kava" },
        voiceId: "openai-cedar",
      }),
      403,
    );
    await denied(
      await dataPost(b, baseURL, second, "/api/language", {
        type: "generate",
        requestId: randomUUID(),
        input: {
          mode: "translate",
          text: "Private generation blocked for a member.",
          context: "",
          source: null,
        },
      }),
      403,
    );

    const backupResponse = await dataPost(a, baseURL, first, "/api/backups", {
      type: "create",
    });
    expect(backupResponse.status()).toBe(200);
    const backup = (await backupResponse.json()) as BackupFile;
    const downloaded = await dataGet(
      a,
      first,
      `/api/backups/download?id=${backup.id}`,
    );
    expect(downloaded.status()).toBe(200);
    const bytes = await downloaded.body();
    await denied(
      await dataGet(b, second, `/api/backups/download?id=${backup.id}`),
      404,
    );
    const inspected = await a.post("/api/backups/inspect", {
      headers: {
        ...headers(first),
        Origin: baseURL!,
        "Content-Type": "application/octet-stream",
      },
      data: bytes,
    });
    expect(inspected.status()).toBe(200);
    const inspection = (await inspected.json()) as BackupInspection;
    await denied(
      await dataPost(b, baseURL, second, "/api/backups/restore", {
        inspectionId: inspection.id,
        sha256: inspection.sha256,
        expectedGeneration: second.generation,
        requestId: randomUUID(),
      }),
      410,
    );
    expect(note(await learning(b, second))).toBe(
      "Private note from account B.",
    );

    // Switching the cookie in the same browser must not authorize a stale tab.
    expect(
      (
        await authPost(a, baseURL, "login", {
          username: second.account.username,
          password,
        })
      ).status(),
    ).toBe(200);
    for (const path of [
      "/api/workspace",
      "/api/learning",
      "/api/reviews",
      "/api/backups",
    ])
      await denied(await dataGet(a, first, path), 409, "ACCOUNT_CHANGED");
    await denied(
      await dataPost(a, baseURL, first, "/api/learning", {
        ...command,
        expectedRevision: 1,
      }),
      409,
      "ACCOUNT_CHANGED",
    );
    await denied(
      await authPost(a, baseURL, "logout", {}, first.account.id),
      409,
      "ACCOUNT_CHANGED",
    );
    await denied(
      await authPost(
        a,
        baseURL,
        "password",
        {
          currentPassword: password,
          password: "A stale tab must not change this 43!",
        },
        first.account.id,
      ),
      409,
      "ACCOUNT_CHANGED",
    );
    expect(note(await learning(a, second))).toBe(
      "Private note from account B.",
    );
    expect(note(await learning(b, second))).toBe(
      "Private note from account B.",
    );
  } finally {
    await a.dispose();
    await b.dispose();
  }
});

test("password change, recovery and logout revoke old session cookies", async ({
  playwright,
  baseURL,
  isMobile,
}) => {
  test.skip(isMobile, "Credential revocation is a server-side property.");
  const current = await playwright.request.newContext({ baseURL });
  const other = await playwright.request.newContext({ baseURL });
  const recovery = await playwright.request.newContext({ baseURL });
  let copied: APIRequestContext | null = null;
  let loggedOut: APIRequestContext | null = null;
  try {
    const session = await register(current, baseURL, "credentials");
    const state = await current.storageState();
    const cookie = state.cookies.find((cookie) => cookie.httpOnly);
    expect(cookie).toBeDefined();
    expect(cookie!.path).toBe("/");
    expect(["Lax", "Strict"]).toContain(cookie!.sameSite);
    expect(cookie!.value).not.toBe(password);
    expect(cookie!.value).not.toBe(session.recoveryCode);
    expect(
      (
        await authPost(other, baseURL, "login", {
          username: session.account.username,
          password,
        })
      ).status(),
    ).toBe(200);
    copied = await playwright.request.newContext({
      baseURL,
      storageState: await other.storageState(),
    });
    const updatedPassword = "The changed isolated passphrase 84!";
    const changed = await authPost(
      current,
      baseURL,
      "password",
      { currentPassword: password, password: updatedPassword },
      session.account.id,
    );
    expect(changed.status()).toBe(200);
    expect(await changed.json()).toMatchObject({ ok: true });
    await denied(
      await dataGet(copied, session, "/api/learning"),
      401,
      "AUTH_REQUIRED",
    );
    await denied(
      await dataGet(other, session, "/api/learning"),
      401,
      "AUTH_REQUIRED",
    );
    expect((await (await current.get("/api/auth")).json()).account.id).toBe(
      session.account.id,
    );
    await denied(
      await authPost(other, baseURL, "login", {
        username: session.account.username,
        password,
      }),
      401,
    );
    expect(
      (
        await authPost(other, baseURL, "login", {
          username: session.account.username,
          password: updatedPassword,
        })
      ).status(),
    ).toBe(200);

    const recoveredPassword = "Recovered isolated passphrase 126!";
    const recovered = await authPost(recovery, baseURL, "recover", {
      username: session.account.username,
      recoveryCode: session.recoveryCode,
      password: recoveredPassword,
    });
    expect(recovered.status()).toBe(200);
    const grant = (await recovered.json()) as {
      account: Account;
      recoveryCode: string;
    };
    expect(grant.account.id).toBe(session.account.id);
    expect(grant.recoveryCode).not.toBe(session.recoveryCode);
    await denied(
      await dataGet(current, session, "/api/learning"),
      401,
      "AUTH_REQUIRED",
    );
    await denied(
      await dataGet(other, session, "/api/learning"),
      401,
      "AUTH_REQUIRED",
    );
    await denied(
      await authPost(other, baseURL, "recover", {
        username: session.account.username,
        recoveryCode: session.recoveryCode,
        password: "The consumed code cannot change this 42!",
      }),
      401,
    );
    const status = await recovery.get("/api/auth");
    expect(status.headers()["cache-control"]).toMatch(/\bno-store\b/);
    expect(await status.json()).toEqual({
      enabled: true,
      account: grant.account,
    });
    loggedOut = await playwright.request.newContext({
      baseURL,
      storageState: await recovery.storageState(),
    });
    expect(
      (
        await authPost(recovery, baseURL, "logout", {}, session.account.id)
      ).status(),
    ).toBe(200);
    await denied(
      await dataGet(loggedOut, session, "/api/learning"),
      401,
      "AUTH_REQUIRED",
    );
    expect((await (await recovery.get("/api/auth")).json()).account).toBeNull();
    expect(
      (
        await authPost(other, baseURL, "login", {
          username: session.account.username,
          password: recoveredPassword,
        })
      ).status(),
    ).toBe(200);
  } finally {
    await current.dispose();
    await other.dispose();
    await recovery.dispose();
    await copied?.dispose();
    await loggedOut?.dispose();
  }
});

test("registration rejects foreign origins and invalid credentials, then throttles repeated failed login", async ({
  request,
  baseURL,
  isMobile,
}) => {
  test.skip(
    isMobile,
    "Authentication validation and throttling do not depend on viewport.",
  );
  const name = username("invalid");
  await denied(
    await request.post("/api/auth/register", {
      headers: { Origin: "https://foreign.invalid" },
      data: { username: name, displayName: "Rejected", password },
    }),
    403,
  );
  for (const data of [
    { username: "bad/username", displayName: "Rejected", password },
    { username: name, displayName: "Rejected", password: "short" },
    { username: name, displayName: "Rejected", password, role: "owner" },
  ])
    await denied(await authPost(request, baseURL, "register", data), 400);
  expect((await (await request.get("/api/auth")).json()).account).toBeNull();
  let limited = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await authPost(request, baseURL, "login", {
      username: name,
      password,
    });
    if (response.status() === 429) {
      await denied(response, 429, "AUTH_RATE_LIMITED");
      limited = true;
      break;
    }
    expect(response.status()).toBe(401);
  }
  expect(limited).toBe(true);
});

test("registration shows a one-time recovery code and switching accounts never restores another account’s drafts", async ({
  page,
  playwright,
  baseURL,
  isMobile,
}) => {
  test.skip(
    isMobile,
    "The account-switch storage boundary is shared across viewports.",
  );
  const secondRequest = await playwright.request.newContext({ baseURL });
  try {
    const second = await register(secondRequest, baseURL, "draft_b");
    const firstUsername = username("draft_a");
    await page.goto("/inscription");
    await page.evaluate(() => {
      sessionStorage.setItem(
        "learning-draft:01:cours",
        JSON.stringify({
          version: 1,
          note: {
            text: "Legacy owner draft must remain private.",
            base: { text: "", revision: 0, updatedAt: null },
          },
        }),
      );
    });
    await page.getByLabel("Identifiant", { exact: true }).fill(firstUsername);
    await page
      .getByLabel("Prénom ou pseudo", { exact: true })
      .fill("Premier compte");
    await page.getByLabel("Mot de passe", { exact: true }).fill(password);
    await page
      .getByLabel("Confirmer le mot de passe", { exact: true })
      .fill(password);
    await page
      .getByRole("button", { name: "Créer mon compte", exact: true })
      .click();
    await expect(
      page.getByText("Ton code de récupération", { exact: true }),
    ).toBeVisible();
    const code = await page.locator("[data-recovery-code]").textContent();
    expect(code?.trim().length).toBeGreaterThanOrEqual(20);
    await page
      .getByLabel("J’ai conservé mon code de récupération", { exact: true })
      .check();
    await page.getByRole("button", { name: "Continuer", exact: true }).click();
    await expect(page.locator("[data-recovery-code]")).toHaveCount(0);
    await expect(page).toHaveURL(/\/compte$/);
    const auth = (await (await page.request.get("/api/auth")).json()) as {
      account: Account;
    };
    const secretCookie = (await page.context().cookies()).find(
      (cookie) => cookie.httpOnly,
    );
    expect(secretCookie).toBeDefined();
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      secretCookie!.value,
    );
    expect(
      await page.evaluate(() =>
        JSON.stringify({ ...localStorage, ...sessionStorage }),
      ),
    ).not.toContain(code!.trim());

    const draft = "Private unfinished draft belonging only to A.";
    const firstNote = await openNotebook(page);
    await expect(firstNote).toHaveValue("");
    await firstNote.fill(draft);
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.values(sessionStorage).some((value) =>
            value.includes("Private unfinished draft belonging only to A."),
          ),
        ),
      )
      .toBe(true);
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto("/compte");
    await page
      .getByRole("button", { name: "Se déconnecter", exact: true })
      .click();
    await expect(page).toHaveURL(/\/connexion$/);
    await loginForm(page, second.account.username);
    await expect(await openNotebook(page)).toHaveValue("");
    expect(note(await learning(secondRequest, second))).toBe("");
    const changedAuth = await page.request.get("/api/auth");
    expect((await changedAuth.json()).account.id).toBe(second.account.id);
    await page.goto("/compte");
    await page
      .getByRole("button", { name: "Se déconnecter", exact: true })
      .click();
    await expect(page).toHaveURL(/\/connexion$/);
    await loginForm(page, firstUsername);
    expect(
      (await (await page.request.get("/api/auth")).json()).account.id,
    ).toBe(auth.account.id);
    await expect(await openNotebook(page)).toHaveValue(draft);
  } finally {
    await secondRequest.dispose();
  }
});
