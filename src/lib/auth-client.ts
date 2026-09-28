import type { AuthState, Authentication } from "./auth-types";
import { getWorkspaceAccountId, suspendWorkspace } from "./workspace-client";

export const AUTH_STORAGE_KEY = "ukrainian-account-changed";

export class AuthClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AuthClientError";
  }
}

async function authRequest<T>(path = "", body?: unknown): Promise<T> {
  const headers = new Headers();
  if (body !== undefined) headers.set("Content-Type", "application/json");
  const accountId = getWorkspaceAccountId();
  if (accountId) headers.set("X-Account-Id", accountId);
  let response: Response;
  try {
    response = await fetch(`/api/auth${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new AuthClientError(
      "La connexion est indisponible. Réessaie dans un instant.",
      503,
    );
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 || result?.code === "ACCOUNT_CHANGED") {
      suspendWorkspace();
      window.dispatchEvent(new Event("account-changed"));
    }
    throw new AuthClientError(
      typeof result?.message === "string"
        ? result.message
        : "La demande n’a pas abouti. Réessaie.",
      response.status,
    );
  }
  return result as T;
}

export const loadAuth = () => authRequest<AuthState>();
export const login = (username: string, password: string) =>
  authRequest<Authentication>("/login", { username, password });
export const register = (
  username: string,
  displayName: string,
  password: string,
) =>
  authRequest<Authentication>("/register", { username, displayName, password });
export const recover = (
  username: string,
  recoveryCode: string,
  password: string,
) =>
  authRequest<Authentication>("/recover", { username, recoveryCode, password });
export const logout = () => authRequest<{ ok: true }>("/logout", {});
export const changePassword = (currentPassword: string, password: string) =>
  authRequest<{ ok: true }>("/password", { currentPassword, password });

export function announceAuthChange() {
  try {
    window.localStorage.setItem(AUTH_STORAGE_KEY, crypto.randomUUID());
  } catch {
    // Focus revalidation also catches account changes without browser storage.
  }
}
