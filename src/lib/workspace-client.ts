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
    storage = window.sessionStorage;
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

async function readGeneration(): Promise<string> {
  let response: Response;
  try {
    response = await fetch("/api/workspace", { cache: "no-store" });
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
  if (generation) return Promise.resolve(generation);
  if (!bootstrap) {
    bootstrap = readGeneration()
      .then((next) => {
        adoptGeneration(next);
        generation = next;
        return next;
      })
      .catch((error: unknown) => {
        bootstrap = null;
        throw error;
      });
  }
  return bootstrap;
}

export async function appFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const current = await bootstrapWorkspace();
  const headers = new Headers(
    input instanceof Request ? input.headers : undefined,
  );
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  headers.set("X-Workspace-Generation", current);
  const response = await fetch(input, { ...init, headers });
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
    const storage = window.sessionStorage;
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
  });
}

export function exportCurrentDrafts(): void {
  let current: {
    generation: string;
    exportedAt: string;
    drafts: Record<string, string>;
  };
  try {
    const storage = window.sessionStorage;
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
