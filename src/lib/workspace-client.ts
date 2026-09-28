const GENERATION_KEY = "workspace-generation";
const ARCHIVE_PREFIX = "workspace-archive:";
const DRAFT_PREFIXES = [
  "learning-draft:",
  "exercise-draft:",
  "ukrainian-review-draft:",
  "ukrainian-language-draft:",
  "cafe-draft:",
  "resource-notes:",
];

export type ArchivedWorkspaceDrafts = {
  generation: string;
  archivedAt: string;
  drafts: Record<string, string>;
};

export class WorkspaceClientError extends Error {
  readonly status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.name = "WorkspaceClientError";
    this.status = status;
  }
}

type Identity = { enabled: boolean; accountId: string | null; epoch: number };
let identity: Identity = { enabled: false, accountId: null, epoch: 0 };
let suspended = false;
const requests = new Set<AbortController>();

export function getWorkspaceAccountId() {
  return identity.accountId;
}
export function suspendWorkspace() {
  suspended = true;
}
export function configureWorkspaceIdentity(
  enabled: boolean,
  accountId: string | null,
) {
  if (identity.enabled !== enabled || identity.accountId !== accountId) {
    identity = { enabled, accountId, epoch: identity.epoch + 1 };
    generation = null;
    bootstrap = null;
    for (const controller of requests) controller.abort();
    requests.clear();
  }
  suspended = false;
}
function assertIdentity(expected: Identity) {
  if (
    suspended ||
    expected !== identity ||
    (identity.enabled && !identity.accountId)
  )
    throw new WorkspaceClientError(
      "La connexion à ton compte a changé. Reconnecte-toi pour retrouver ton espace.",
      401,
    );
}
function accountHeaders(expected: Identity) {
  const headers = new Headers();
  if (expected.accountId) headers.set("X-Account-Id", expected.accountId);
  return headers;
}
function invalidateAccount() {
  suspendWorkspace();
  window.dispatchEvent(new Event("account-changed"));
}

// Each instance captures its account. A late cleanup from an old component can
// therefore never write a draft into the next account's namespace.
export function getWorkspaceStorage(): Storage {
  const owner = identity;
  const prefix = owner.enabled ? `account:${owner.accountId ?? "guest"}:` : "";
  function store() {
    return window.sessionStorage;
  }
  function keys() {
    const storage = store();
    const found: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (
        key &&
        (prefix ? key.startsWith(prefix) : !key.startsWith("account:"))
      )
        found.push(prefix ? key.slice(prefix.length) : key);
    }
    return found;
  }
  return {
    get length() {
      return keys().length;
    },
    key(index: number) {
      return keys()[index] ?? null;
    },
    getItem(key: string) {
      return store().getItem(prefix + key);
    },
    setItem(key: string, value: string) {
      store().setItem(prefix + key, value);
    },
    removeItem(key: string) {
      store().removeItem(prefix + key);
    },
    clear() {
      for (const key of keys()) store().removeItem(prefix + key);
    },
  };
}

function distinctCopy(storage: Storage, key: string, value: string): string {
  let target = key;
  let suffix = 1;
  while (storage.getItem(target) !== null && storage.getItem(target) !== value)
    target = `${key}:${++suffix}`;
  if (storage.getItem(target) === null) storage.setItem(target, value);
  return target;
}

/** Only a server-verified owner may claim drafts from the former local mode. */
export function adoptLegacyWorkspaceDrafts(account: {
  id: string;
  role: "owner" | "member";
}) {
  if (account.role !== "owner") return;
  let storage: Storage;
  try {
    storage = window.sessionStorage;
  } catch {
    return;
  }
  const prefix = `account:${account.id}:`;
  const marker = prefix + "workspace-legacy-adopted";
  if (storage.getItem(marker)) return;
  const legacy: Record<string, string> = {};
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (
      !key ||
      !(
        key === GENERATION_KEY ||
        key === "backup-preparation" ||
        key.startsWith(ARCHIVE_PREFIX) ||
        DRAFT_PREFIXES.some((draft) => key.startsWith(draft))
      )
    )
      continue;
    const value = storage.getItem(key);
    if (value !== null) legacy[key] = value;
  }
  if (!Object.keys(legacy).length) return;
  try {
    // Keep a byte-for-byte string copy of every source value, including any
    // conflicting restore preparation. Never overwrite an existing account key.
    const source = distinctCopy(
      storage,
      prefix + "workspace-legacy-source",
      JSON.stringify(legacy),
    );
    for (const [key, value] of Object.entries(legacy)) {
      const target = prefix + key;
      if (storage.getItem(target) === null) storage.setItem(target, value);
      else if (
        key.startsWith(ARCHIVE_PREFIX) &&
        storage.getItem(target) !== value
      )
        distinctCopy(storage, prefix + "workspace-archive:legacy-copy", value);
    }
    const drafts = Object.fromEntries(
      Object.entries(legacy).filter(([key]) =>
        DRAFT_PREFIXES.some((draft) => key.startsWith(draft)),
      ),
    );
    if (Object.keys(drafts).length) {
      const key = prefix + "workspace-archive:legacy-browser";
      const previous = readArchive(storage.getItem(key));
      if (
        !previous.some(
          (entry) => JSON.stringify(entry.drafts) === JSON.stringify(drafts),
        )
      )
        distinctCopy(
          storage,
          key,
          JSON.stringify([
            {
              generation: legacy[GENERATION_KEY] ?? "unversioned",
              archivedAt: new Date().toISOString(),
              drafts,
            },
          ]),
        );
    }
    // Last write marks completion; a failed copy leaves the sources untouched and
    // can be retried. Unscoped originals also remain available in local mode.
    storage.setItem(marker, source);
  } catch {
    throw new WorkspaceClientError(
      "Tes anciens brouillons restent conservés, mais leur copie vers ton compte n’a pas abouti. Libère de l’espace dans le navigateur puis réessaie.",
    );
  }
}

function legacyWorkspaceCopies(): Record<string, string>[] {
  try {
    const storage = getWorkspaceStorage();
    const copies: Record<string, string>[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith("workspace-legacy-source")) {
        const value: unknown = JSON.parse(storage.getItem(key) ?? "null");
        if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value) &&
          Object.values(value).every((entry) => typeof entry === "string")
        )
          copies.push(value as Record<string, string>);
      }
    }
    return copies;
  } catch {
    return [];
  }
}

let generation: string | null = null;
let bootstrap: Promise<string> | null = null;

function currentDrafts(storage: Storage): Record<string, string> {
  const drafts: Record<string, string> = {};
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key || !DRAFT_PREFIXES.some((prefix) => key.startsWith(prefix)))
      continue;
    const value = storage.getItem(key);
    if (value !== null) drafts[key] = value;
  }
  return drafts;
}

function readArchive(value: string | null): ArchivedWorkspaceDrafts[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is ArchivedWorkspaceDrafts =>
        typeof entry === "object" &&
        entry !== null &&
        typeof entry.generation === "string" &&
        typeof entry.archivedAt === "string" &&
        typeof entry.drafts === "object" &&
        entry.drafts !== null &&
        !Array.isArray(entry.drafts) &&
        Object.entries(entry.drafts).every(
          ([key, text]) =>
            DRAFT_PREFIXES.some((prefix) => key.startsWith(prefix)) &&
            typeof text === "string",
        ),
    );
  } catch {
    return [];
  }
}

function adoptGeneration(next: string) {
  let storage: Storage;
  try {
    void window.sessionStorage;
    storage = getWorkspaceStorage();
  } catch {
    return;
  }
  try {
    const previous = storage.getItem(GENERATION_KEY);
    if (previous !== next) {
      const drafts = currentDrafts(storage);
      if (Object.keys(drafts).length) {
        const oldGeneration = previous ?? "unversioned";
        const archiveKey = `${ARCHIVE_PREFIX}${oldGeneration}`;
        const archived = readArchive(storage.getItem(archiveKey));
        archived.push({
          generation: oldGeneration,
          archivedAt: new Date().toISOString(),
          drafts,
        });
        // Write the complete archive before removing any recoverable source text.
        storage.setItem(archiveKey, JSON.stringify(archived));
        for (const key of Object.keys(drafts)) storage.removeItem(key);
      }
      try {
        storage.setItem(GENERATION_KEY, next);
      } catch {
        // The in-memory generation still protects this tab. Any source drafts
        // were already archived before reaching this optional persistence step.
      }
    }
  } catch {
    throw new WorkspaceClientError(
      "Les anciens brouillons de cet onglet n’ont pas pu être archivés. Conserve tes textes avant de libérer de l’espace dans le navigateur, puis réessaie.",
    );
  }
}

async function readGeneration(expected = identity): Promise<string> {
  assertIdentity(expected);
  let response: Response;
  try {
    response = await fetch("/api/workspace", {
      cache: "no-store",
      credentials: "same-origin",
      headers: accountHeaders(expected),
    });
    assertIdentity(expected);
  } catch {
    throw new WorkspaceClientError(
      "Le suivi de l’application est injoignable. Tes brouillons restent conservés ; réessaie.",
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new WorkspaceClientError(
      "La version des données est indisponible. Réessaie sans fermer cette page.",
    );
  }
  if (
    response.status === 401 ||
    (typeof body === "object" &&
      body !== null &&
      "code" in body &&
      body.code === "ACCOUNT_CHANGED")
  )
    invalidateAccount();
  if (
    expected.enabled &&
    response.ok &&
    (typeof body !== "object" ||
      body === null ||
      !("accountId" in body) ||
      body.accountId !== expected.accountId)
  ) {
    invalidateAccount();
    throw new WorkspaceClientError(
      "Le compte de cet onglet a changé. Reconnecte-toi.",
      409,
    );
  }
  if (
    !response.ok ||
    typeof body !== "object" ||
    body === null ||
    !("generation" in body) ||
    typeof body.generation !== "string" ||
    !/^[0-9a-f]{32}$/.test(body.generation)
  )
    throw new WorkspaceClientError(
      "La version des données est indisponible. Réessaie sans fermer cette page.",
      response.status,
    );
  return body.generation;
}

export function bootstrapWorkspace(): Promise<string> {
  const expected = identity;
  try {
    assertIdentity(expected);
  } catch (error) {
    return Promise.reject(error);
  }
  if (generation) return Promise.resolve(generation);
  if (!bootstrap) {
    bootstrap = readGeneration(expected)
      .then((next) => {
        assertIdentity(expected);
        adoptGeneration(next);
        generation = next;
        return next;
      })
      .catch((error: unknown) => {
        if (identity === expected) bootstrap = null;
        throw error;
      });
  }
  return bootstrap;
}

export async function appFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: { generation?: string; allowWorkspaceChange?: boolean } = {},
): Promise<Response> {
  const expected = identity;
  assertIdentity(expected);
  const current = options.generation ?? (await bootstrapWorkspace());
  assertIdentity(expected);
  const headers = new Headers(
    input instanceof Request ? input.headers : undefined,
  );
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  headers.set("X-Workspace-Generation", current);
  if (expected.accountId) headers.set("X-Account-Id", expected.accountId);
  else headers.delete("X-Account-Id");
  const controller = new AbortController();
  requests.add(controller);
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      credentials: "same-origin",
      headers,
      signal: init.signal
        ? AbortSignal.any([init.signal, controller.signal])
        : controller.signal,
    });
    assertIdentity(expected);
  } finally {
    requests.delete(controller);
  }
  if (response.status === 401 || response.status === 409) {
    const problem = await response
      .clone()
      .json()
      .catch(() => null);
    if (response.status === 401 || problem?.code === "ACCOUNT_CHANGED") {
      invalidateAccount();
      throw new WorkspaceClientError(
        "La connexion à ton compte a changé. Reconnecte-toi pour continuer.",
        response.status,
      );
    }
  }
  if (options.allowWorkspaceChange) return response;
  const actual = response.headers.get("X-Workspace-Generation");
  let changed = !!actual && actual !== current;
  if (response.status === 409) {
    if (!changed) {
      const body: unknown = await response
        .clone()
        .json()
        .catch(() => null);
      changed =
        typeof body === "object" &&
        body !== null &&
        "code" in body &&
        body.code === "WORKSPACE_CHANGED";
    }
  }
  if (changed) {
    window.dispatchEvent(new CustomEvent("workspace-changed"));
    if (response.ok)
      throw new WorkspaceClientError(
        "Une sauvegarde a été restaurée depuis l’ouverture de cet onglet. Tes textes restent ici. Recharge la page pour utiliser les données restaurées ; tu peux d’abord exporter tes brouillons.",
        409,
      );
  }
  return response;
}

export async function acceptRestoredGeneration(next?: string): Promise<string> {
  const restored = next ?? (await readGeneration());
  if (!/^[0-9a-f]{32}$/.test(restored))
    throw new WorkspaceClientError("La version restaurée est invalide.");
  adoptGeneration(restored);
  generation = restored;
  bootstrap = Promise.resolve(restored);
  return restored;
}

export function getArchivedDrafts(): ArchivedWorkspaceDrafts[] {
  if (typeof window === "undefined") return [];
  try {
    const storage = getWorkspaceStorage();
    const archives: ArchivedWorkspaceDrafts[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith(ARCHIVE_PREFIX))
        archives.push(...readArchive(storage.getItem(key)));
    }
    return archives.sort((a, b) => a.archivedAt.localeCompare(b.archivedAt));
  } catch {
    return [];
  }
}

export function exportArchivedDrafts(): void {
  downloadDrafts({
    format: "ukrainian-workspace-drafts",
    version: 1,
    archives: getArchivedDrafts(),
    legacyStorage: legacyWorkspaceCopies(),
  });
}

export function exportCurrentDrafts(): void {
  let current: {
    generation: string;
    exportedAt: string;
    drafts: Record<string, string>;
  };
  try {
    const storage = getWorkspaceStorage();
    current = {
      generation:
        storage.getItem(GENERATION_KEY) ?? generation ?? "unversioned",
      exportedAt: new Date().toISOString(),
      drafts: currentDrafts(storage),
    };
  } catch {
    throw new WorkspaceClientError(
      "Les brouillons de cet onglet ne sont pas accessibles. Copie les textes encore visibles avant de recharger.",
    );
  }
  downloadDrafts({
    format: "ukrainian-workspace-drafts",
    version: 1,
    current,
    archives: getArchivedDrafts(),
    legacyStorage: legacyWorkspaceCopies(),
  });
}

function downloadDrafts(value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `brouillons-archives-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
