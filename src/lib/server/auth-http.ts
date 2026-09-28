import { readBodyChunk } from "@/lib/server/request-body";
import "server-only";
import {
  accountRootDirectory,
  accountsEnabled,
  AuthError,
  openAuthStore,
  SESSION_SECONDS,
  type Account,
} from "./auth-store";
import {
  assertRequestAccess,
  assertRequestOrigin,
  RequestAccessError,
} from "./request-access";

const state = globalThis as typeof globalThis & {
  accountRegistry?: {
    directory: string;
    store: ReturnType<typeof openAuthStore>;
  };
};
export function getAuthStore() {
  const directory = accountRootDirectory();
  if (state.accountRegistry?.directory !== directory) {
    state.accountRegistry?.store.close();
    state.accountRegistry = { directory, store: openAuthStore(directory) };
  }
  return state.accountRegistry.store;
}
export function accountView(account: Account) {
  return { ...account, aiEnabled: account.role === "owner" };
}
function cookieName() {
  return process.env.APP_ORIGIN
    ? "__Host-ukrainien-session"
    : "ukrainien-session";
}
export function sessionToken(request: Request) {
  const values = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith(cookieName() + "="));
  if (values.length !== 1) return undefined;
  const token = values[0]!.slice(cookieName().length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : undefined;
}
export function authResponse(
  value: unknown,
  status = 200,
  token?: string | null,
) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    Vary: "Cookie, Origin",
    "X-Content-Type-Options": "nosniff",
  });
  if (token !== undefined)
    headers.set(
      "Set-Cookie",
      `${cookieName()}=${token ?? ""}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? SESSION_SECONDS : 0}${process.env.APP_ORIGIN ? "; Secure" : ""}`,
    );
  return Response.json(value, { status, headers });
}
export function authError(error: unknown) {
  if (error instanceof AuthError || error instanceof RequestAccessError)
    return authResponse(
      { message: error.message, code: error.code },
      error.status,
    );
  console.error(
    "Account request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return authResponse(
    {
      message:
        "L’accès aux comptes est momentanément indisponible. Réessaie dans un instant.",
      code: "AUTH_UNAVAILABLE",
    },
    503,
  );
}
export function assertAuthRequest(request: Request, mutation = false) {
  const access = assertRequestAccess(request);
  assertRequestOrigin(request, access, mutation);
}
export function requireAccount(request: Request, requireIdentity = true) {
  const account = getAuthStore().resolveSession(sessionToken(request));
  if (!account)
    throw new AuthError(
      "Connecte-toi pour retrouver ton espace personnel.",
      401,
      "AUTH_REQUIRED",
    );
  if (requireIdentity && request.headers.get("X-Account-Id") !== account.id)
    throw new AuthError(
      "Le compte connecté a changé. Recharge la page avant de continuer.",
      409,
      "ACCOUNT_CHANGED",
    );
  return account;
}
export async function readAuthBody(request: Request, keys: string[]) {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim() !==
    "application/json"
  )
    throw new AuthError("Un formulaire JSON est attendu.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError("Le formulaire est vide.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    const deadline = Date.now() + 60_000;
    while (true) {
      const { done, value } = await readBodyChunk(reader, deadline);
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw new AuthError("Le formulaire est trop volumineux.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
  } catch {
    throw new AuthError("Le formulaire est invalide.");
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).sort().join(",") !== [...keys].sort().join(",")
  )
    throw new AuthError("Les champs du formulaire sont invalides.");
  return body as Record<string, unknown>;
}
export async function handleAuth(request: Request, action: string) {
  try {
    assertAuthRequest(request, request.method !== "GET");
    if (action === "status") {
      if (!accountsEnabled())
        return authResponse({ enabled: false, account: null });
      const account = getAuthStore().resolveSession(sessionToken(request));
      return authResponse({
        enabled: true,
        account: account ? accountView(account) : null,
      });
    }
    if (!accountsEnabled())
      return authResponse(
        { message: "Les comptes ne sont pas activés sur cette installation." },
        404,
      );
    const store = getAuthStore();
    if (action === "register") {
      const body = await readAuthBody(request, [
        "username",
        "displayName",
        "password",
      ]);
      const result = await store.register({
        username: body.username,
        displayName: body.displayName,
        password: body.password,
      });
      // Replacing a current browser identity revokes its old session.
      store.logout(sessionToken(request));
      return authResponse(
        {
          account: accountView(result.account),
          recoveryCode: result.recoveryCode,
        },
        201,
        result.token,
      );
    }
    if (action === "login") {
      const body = await readAuthBody(request, ["username", "password"]);
      const result = await store.login(body.username, body.password);
      store.logout(sessionToken(request));
      return authResponse(
        { account: accountView(result.account) },
        200,
        result.token,
      );
    }
    if (action === "recover") {
      const body = await readAuthBody(request, [
        "username",
        "recoveryCode",
        "password",
      ]);
      const result = await store.recover(
        body.username,
        body.recoveryCode,
        body.password,
      );
      store.logout(sessionToken(request));
      return authResponse(
        {
          account: accountView(result.account),
          recoveryCode: result.recoveryCode,
        },
        200,
        result.token,
      );
    }
    requireAccount(request);
    if (action === "logout") {
      await readAuthBody(request, []);
      store.logout(sessionToken(request));
      return authResponse({ ok: true }, 200, null);
    }
    if (action === "password") {
      const body = await readAuthBody(request, ["currentPassword", "password"]);
      await store.changePassword(
        sessionToken(request),
        body.currentPassword,
        body.password,
      );
      return authResponse({ ok: true });
    }
    return authResponse({ message: "Cette action n’existe pas." }, 404);
  } catch (error) {
    return authError(error);
  }
}
