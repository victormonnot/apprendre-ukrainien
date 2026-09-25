import type {
  LanguageInput,
  LanguageLibrary,
  LanguageResult,
} from "./language-types";

export type LanguageGeneration = {
  type: "generate";
  requestId: string;
  input: LanguageInput;
};

export class LanguageRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "LanguageRequestError";
    this.status = status;
  }
}

async function requestLanguage<T>(
  query = "",
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/language${query}`, {
      ...init,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new LanguageRequestError(
      0,
      "L’application est injoignable. Ton texte reste ici ; tu peux réessayer.",
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new LanguageRequestError(
      response.status,
      "La réponse est indisponible. Réessaie sans fermer cette page.",
    );
  }
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : "L’atelier est momentanément indisponible.";
    throw new LanguageRequestError(response.status, message);
  }
  return body as T;
}

function send<T>(command: object) {
  return requestLanguage<T>("", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
}

export function loadLanguageLibrary(signal?: AbortSignal) {
  return requestLanguage<LanguageLibrary>("", { signal });
}

export function loadLanguageResult(resultId: string, signal?: AbortSignal) {
  return requestLanguage<LanguageResult>(
    `?${new URLSearchParams({ result: resultId })}`,
    { signal },
  );
}

export function loadExerciseLanguageInput(
  exerciseId: string,
  attemptId: string,
  signal?: AbortSignal,
) {
  return requestLanguage<LanguageInput>(
    `?${new URLSearchParams({ exercise: exerciseId, attempt: attemptId })}`,
    { signal },
  );
}

export function generateLanguageResult(command: LanguageGeneration) {
  return send<LanguageResult>(command);
}

export function saveLanguageResult(resultId: string) {
  return send<LanguageResult>({ type: "save-result", resultId });
}

export function saveLanguageReference(elementId: string) {
  return send<{ savedReferenceIds: string[] }>({
    type: "save-reference",
    elementId,
  });
}
