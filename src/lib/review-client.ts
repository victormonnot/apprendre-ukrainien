import type { ReviewCommand, ReviewOverview } from "./review-types";

export class ReviewRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ReviewRequestError";
    this.status = status;
  }
}

async function requestReviews(init: RequestInit): Promise<ReviewOverview> {
  let response: Response;
  try {
    response = await fetch("/api/reviews", { ...init, cache: "no-store" });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ReviewRequestError(
      0,
      "L’application est injoignable. Conserve ta réponse et réessaie.",
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ReviewRequestError(
      response.status,
      "La réponse du serveur est indisponible. Réessaie sans fermer cette page.",
    );
  }
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : "Les révisions sont momentanément indisponibles.";
    throw new ReviewRequestError(response.status, message);
  }
  return body as ReviewOverview;
}

export function loadReviews(signal?: AbortSignal) {
  return requestReviews({ signal });
}

export function updateReviews(command: ReviewCommand) {
  return requestReviews({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
}
