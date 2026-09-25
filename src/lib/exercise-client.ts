import type { ExerciseCommand, ExerciseWorkspaceState } from "./exercise-types";

export class ExerciseConflictError extends Error {
  readonly workspace: ExerciseWorkspaceState;
  constructor(workspace: ExerciseWorkspaceState) {
    super(
      "Cette tentative a été modifiée dans un autre onglet. Ton brouillon est conservé.",
    );
    this.name = "ExerciseConflictError";
    this.workspace = workspace;
  }
}

async function request(
  exerciseId: string,
  command?: ExerciseCommand,
  signal?: AbortSignal,
) {
  let response: Response;
  try {
    response = await fetch(`/api/exercises/${encodeURIComponent(exerciseId)}`, {
      method: command ? "POST" : "GET",
      ...(command
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(command),
          }
        : {}),
      cache: "no-store",
      signal,
    });
  } catch (cause) {
    if (cause instanceof TypeError)
      throw new Error(
        "La connexion est interrompue. Ton brouillon reste disponible ; réessaie lorsque l’application répond.",
      );
    throw cause;
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError")
      throw cause;
    throw new Error(
      "L’application a renvoyé une réponse illisible. Ton brouillon reste disponible ; réessaie dans un instant.",
    );
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      "L’application a renvoyé une réponse inattendue. Ton brouillon reste disponible ; réessaie dans un instant.",
    );
  }
  const result = value as Record<string, unknown>;
  if (response.status === 409 && result.workspace)
    throw new ExerciseConflictError(result.workspace as ExerciseWorkspaceState);
  if (!response.ok)
    throw new Error(
      typeof result.message === "string"
        ? result.message
        : "La sauvegarde est indisponible.",
    );
  return value as ExerciseWorkspaceState;
}

export function loadExercise(exerciseId: string, signal?: AbortSignal) {
  return request(exerciseId, undefined, signal);
}
export function updateExercise(exerciseId: string, command: ExerciseCommand) {
  return request(exerciseId, command);
}
