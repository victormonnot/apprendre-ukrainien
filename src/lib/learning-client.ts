import { appFetch } from "./workspace-client";
import type {
  LearningCommand,
  LearningDocumentState,
  LearningNote,
  LearningOverview,
} from "./learning-types";

export class NoteConflictError extends Error {
  readonly currentNote: LearningNote;

  constructor(currentNote: LearningNote) {
    super("Une autre version de cette note a été enregistrée.");
    this.name = "NoteConflictError";
    this.currentNote = currentNote;
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    if (response.status === 409 && error?.currentNote) {
      throw new NoteConflictError(error.currentNote);
    }
    throw new Error(
      error?.message ??
        "La sauvegarde est indisponible. Réessaie dans un instant.",
    );
  }
  return response.json() as Promise<T>;
}

export async function loadLearning(signal?: AbortSignal) {
  return readResponse<LearningOverview>(
    await appFetch("/api/learning", { cache: "no-store", signal }).catch(
      networkError,
    ),
  );
}

export async function updateLearning(command: LearningCommand) {
  return readResponse<LearningDocumentState>(
    await appFetch("/api/learning", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
      cache: "no-store",
    }).catch(networkError),
  );
}

function networkError(cause: unknown): never {
  if (cause instanceof TypeError) {
    throw new Error(
      "La connexion à l’application est interrompue. Réessaie lorsque le serveur est disponible.",
    );
  }
  throw cause;
}
