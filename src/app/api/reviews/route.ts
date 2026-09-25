import {
  REVIEW_ANSWER_MAX_LENGTH,
  type ReviewCommand,
} from "@/lib/review-types";
import { getLearningStore } from "@/lib/server/learning-service";
import { getReviewStore } from "@/lib/server/review-service";
import {
  ReviewConflictError,
  ReviewNotFoundError,
} from "@/lib/server/review-store";
import {
  RequestError,
  json,
  readLocalJson,
  requireLocalRequest,
} from "@/lib/server/local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function identifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
}

function validateCommand(body: Record<string, unknown>): ReviewCommand {
  const fields = {
    activate: ["type", "elementId"],
    suspend: ["type", "elementId"],
    start: ["type"],
    reveal: ["type", "attemptId", "answerText"],
    rate: ["type", "attemptId", "rating"],
  };
  if (typeof body.type !== "string" || !Object.hasOwn(fields, body.type))
    throw new RequestError("Cette action de révision est invalide.");
  const allowed = fields[body.type as keyof typeof fields];
  if (
    Object.keys(body).length !== allowed.length ||
    Object.keys(body).some((key) => !allowed.includes(key))
  )
    throw new RequestError(
      "La demande de révision contient des champs invalides.",
    );
  if (
    (body.type === "activate" || body.type === "suspend") &&
    !identifier(body.elementId)
  )
    throw new RequestError("L’élément à réviser est invalide.");
  if (
    (body.type === "reveal" || body.type === "rate") &&
    !identifier(body.attemptId)
  )
    throw new RequestError("La tentative est invalide.");
  if (
    body.type === "reveal" &&
    (typeof body.answerText !== "string" ||
      body.answerText.length > REVIEW_ANSWER_MAX_LENGTH)
  )
    throw new RequestError(
      `La réponse doit contenir au maximum ${REVIEW_ANSWER_MAX_LENGTH} caractères.`,
    );
  if (
    body.type === "rate" &&
    (typeof body.rating !== "string" ||
      !["again", "hard", "good", "easy"].includes(body.rating))
  )
    throw new RequestError("Choisis un des quatre résultats de révision.");
  return body as ReviewCommand;
}

function handleError(error: unknown) {
  if (error instanceof RequestError)
    return json({ message: error.message }, error.status);
  if (error instanceof ReviewConflictError)
    return json({ message: error.message }, 409);
  if (error instanceof ReviewNotFoundError)
    return json({ message: error.message }, 404);
  console.error("Review storage request failed", error);
  return json(
    {
      message:
        "Les révisions sont momentanément indisponibles. Ta réponse reste dans cette page ; réessaie.",
    },
    503,
  );
}

export async function GET(request: Request) {
  try {
    requireLocalRequest(request);
    const userId = getLearningStore().getLocalUserId();
    return json(getReviewStore().getOverview(userId));
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireLocalRequest(request, true);
    const command = validateCommand(await readLocalJson(request));
    const userId = getLearningStore().getLocalUserId();
    const store = getReviewStore();
    switch (command.type) {
      case "activate":
        return json(store.activateElement(userId, command.elementId));
      case "suspend":
        return json(store.suspendElement(userId, command.elementId));
      case "start":
        return json(store.startReview(userId));
      case "reveal":
        return json(
          store.revealAnswer(userId, command.attemptId, command.answerText),
        );
      case "rate":
        return json(
          store.rateReview(userId, command.attemptId, command.rating),
        );
    }
  } catch (error) {
    return handleError(error);
  }
}
