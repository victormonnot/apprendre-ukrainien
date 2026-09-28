import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { accountsEnabled } from "./auth-store.ts";

export type RequestAccountContext = {
  id: string;
  username: string;
  displayName: string;
  role: "owner" | "member";
  dataDirectory: string;
};

type Closeable = { close(): void };
type RequestScope = {
  account: Readonly<RequestAccountContext>;
  resources: Map<string, Closeable>;
  closed: boolean;
};
type LegacyResource = { directory: string; resource: Closeable };

const state = globalThis as typeof globalThis & {
  requestAccountStorage?: AsyncLocalStorage<RequestScope>;
  legacyAccountResources?: Map<string, LegacyResource>;
};
const storage = (state.requestAccountStorage ??=
  new AsyncLocalStorage<RequestScope>());

export function getRequestAccount():
  Readonly<RequestAccountContext> | undefined {
  const scope = storage.getStore();
  return scope?.closed ? undefined : scope?.account;
}

export function getDataDirectory(): string {
  const scope = storage.getStore();
  if (scope?.closed) throw new Error("The account request has finished.");
  if (scope) return scope.account.dataDirectory;
  if (accountsEnabled())
    throw new Error("An authenticated account context is required.");
  return process.env.APP_DATA_DIR || path.join(process.cwd(), ".data");
}

function closeScope(scope: RequestScope): void {
  scope.closed = true;
  for (const resource of [...scope.resources.values()].reverse()) {
    try {
      resource.close();
    } catch (error) {
      console.error(
        "Account storage cleanup failed",
        error instanceof Error ? error.name : "UnknownError",
      );
    }
  }
  scope.resources.clear();
}

/** Owns every opened store until the complete synchronous or async handler settles. */
export function withAccountContext<T>(
  account: RequestAccountContext,
  operation: () => T,
): T {
  if (!path.isAbsolute(account.dataDirectory))
    throw new Error("An account storage directory must be absolute.");
  const scope: RequestScope = {
    account: Object.freeze({ ...account }),
    resources: new Map(),
    closed: false,
  };
  return storage.run(scope, () => {
    try {
      const result = operation();
      if (
        result !== null &&
        (typeof result === "object" || typeof result === "function") &&
        "then" in result &&
        typeof result.then === "function"
      )
        return Promise.resolve(result).finally(() => closeScope(scope)) as T;
      closeScope(scope);
      return result;
    } catch (error) {
      closeScope(scope);
      throw error;
    }
  });
}

/** Reuses a store within one request, never between authenticated requests. */
export function getRequestStore<T extends Closeable>(
  key: string,
  factory: (directory: string) => T,
): T {
  const directory = getDataDirectory();
  const scope = storage.getStore();
  if (scope) {
    const existing = scope.resources.get(key);
    if (existing) return existing as T;
    const resource = factory(directory);
    scope.resources.set(key, resource);
    return resource;
  }

  // The legacy local installation keeps at most one connection per service.
  const resources = (state.legacyAccountResources ??= new Map());
  const existing = resources.get(key);
  if (existing?.directory === directory) return existing.resource as T;
  if (existing) {
    existing.resource.close();
    resources.delete(key);
  }
  const resource = factory(directory);
  resources.set(key, { directory, resource });
  return resource;
}

export function getAccountRequestNamespace(): string {
  return JSON.stringify([
    getRequestAccount()?.id ?? "local",
    getDataDirectory(),
  ]);
}
