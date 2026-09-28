import "server-only";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { accountsEnabled, accountDirectory, AuthError } from "./auth-store";
import {
  assertAuthRequest,
  authError,
  getAuthStore,
  requireAccount,
} from "./auth-http";
import { withAccountContext } from "./account-context";
import { getBackupStore } from "./backup-service";

function directoryBytes(directory: string): number {
  let bytes = 0;
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return 0;
    throw error;
  }
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) bytes += directoryBytes(target);
    else if (entry.isFile()) bytes += statSync(target).size;
  }
  return bytes;
}

/** Authenticate before reading a body or opening any learning storage. */
export function withAccount<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Response | Promise<Response>,
) {
  return async (original: Request, ...args: Args): Promise<Response> => {
    try {
      assertAuthRequest(original, !["GET", "HEAD"].includes(original.method));
      if (!accountsEnabled()) return await handler(original, ...args);
      const url = new URL(original.url);
      let request = original;
      // Native <audio> and download links cannot supply custom headers. Their URL
      // carries only an identity guard, never a credential or storage selector.
      if (
        ["GET", "HEAD"].includes(original.method) &&
        (/^\/api\/audio\/[^/]+$/.test(url.pathname) ||
          url.pathname === "/api/backups/download") &&
        url.searchParams.has("account")
      ) {
        if (url.searchParams.getAll("account").length !== 1)
          throw new AuthError(
            "Le compte de cette ressource est invalide.",
            409,
            "ACCOUNT_CHANGED",
          );
        const headers = new Headers(original.headers);
        if (
          headers.has("X-Account-Id") &&
          headers.get("X-Account-Id") !== url.searchParams.get("account")
        )
          throw new AuthError(
            "Le compte de cette ressource est invalide.",
            409,
            "ACCOUNT_CHANGED",
          );
        headers.set("X-Account-Id", url.searchParams.get("account")!);
        url.searchParams.delete("account");
        request = new Request(url, {
          method: original.method,
          headers,
          signal: original.signal,
        });
      }
      const account = requireAccount(request);
      const dataDirectory = accountDirectory(account);
      return await withAccountContext(
        { ...account, dataDirectory },
        async () => {
          const mutation = !["GET", "HEAD"].includes(request.method);
          const member = account.role === "member";
          const backupMutation =
            mutation && url.pathname.startsWith("/api/backups");
          if (member && mutation) {
            const store = getAuthStore();
            store.consumeLimit("writes:" + account.id, 3000, 24 * 60 * 60_000);
            if (backupMutation) {
              store.consumeLimit("backups:" + account.id, 10, 24 * 60 * 60_000);
              getBackupStore().maintainMemberBackups();
            }
            // Cached audio cannot generate paid content for members. A fresh
            // export or bounded restore remains possible at the storage ceiling.
            const maintenance = [
              "/api/audio",
              "/api/backups",
              "/api/backups/restore",
            ].includes(url.pathname);
            if (
              !maintenance &&
              directoryBytes(dataDirectory) > 48 * 1024 * 1024
            )
              throw new AuthError(
                "Ton espace a atteint sa limite de stockage. Tu peux télécharger une sauvegarde dans Mes données.",
                413,
                "STORAGE_LIMIT",
              );
          }
          try {
            return await handler(request, ...args);
          } finally {
            if (member && backupMutation)
              getBackupStore().maintainMemberBackups();
          }
        },
      );
    } catch (error) {
      return authError(error);
    }
  };
}
