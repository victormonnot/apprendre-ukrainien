import { getLearningStore } from "@/lib/server/learning-service";
import {
  getLanguageStore,
  getSubmittedInput,
  languageConfigured,
  languageReferences,
  requestLanguageResult,
  resolveLanguageInput,
} from "@/lib/server/language-service";
import {
  LanguageInputError,
  languageIdentifier,
  validateLanguageInput,
} from "@/lib/server/language-input";
import { LanguageProviderError } from "@/lib/server/language-provider";
import {
  LanguageRequestConflictError,
  LanguageResultNotFoundError,
  LanguageReferenceNotFoundError,
} from "@/lib/server/language-store";
import {
  RequestError,
  json,
  readLocalJson,
  requireLocalRequest,
} from "@/lib/server/local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function handleError(error: unknown) {
  if (error instanceof RequestError || error instanceof LanguageProviderError)
    return json({ message: error.message }, error.status);
  if (error instanceof LanguageInputError)
    return json({ message: error.message }, 400);
  if (error instanceof LanguageRequestConflictError)
    return json(
      {
        message:
          "Cette demande correspond déjà à un autre texte. Lance une nouvelle demande.",
      },
      409,
    );
  if (
    error instanceof LanguageResultNotFoundError ||
    error instanceof LanguageReferenceNotFoundError
  )
    return json({ message: "Cette fiche est introuvable." }, 404);
  // Never log learner text or an upstream response (which may contain credentials).
  console.error(
    "Language request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return json(
    {
      message:
        "L’atelier est momentanément indisponible. Ton texte reste dans la page ; réessaie.",
    },
    503,
  );
}
export async function GET(request: Request) {
  try {
    requireLocalRequest(request);
    const userId = getLearningStore().getLocalUserId();
    const params = new URL(request.url).searchParams;
    if (params.size === 1 && params.has("result")) {
      if (!languageIdentifier(params.get("result")))
        throw new RequestError("La fiche est invalide.");
      const result = getLanguageStore().getResult(
        userId,
        params.get("result")!,
      );
      if (!result) throw new RequestError("Cette fiche est introuvable.", 404);
      return json(result);
    }
    if (params.size === 2 && params.has("exercise") && params.has("attempt")) {
      if (
        !languageIdentifier(params.get("exercise")) ||
        !languageIdentifier(params.get("attempt"))
      )
        throw new RequestError("La remise est invalide.");
      return json(
        getSubmittedInput(
          userId,
          params.get("exercise")!,
          params.get("attempt")!,
        ),
      );
    }
    if (params.size) throw new RequestError("La recherche est invalide.");
    return json({
      configured: languageConfigured(),
      references: languageReferences,
      savedReferenceIds: getLanguageStore().listSavedReferenceIds(userId),
      savedResults: getLanguageStore().listSavedResults(userId),
    });
  } catch (error) {
    return handleError(error);
  }
}
export async function POST(request: Request) {
  try {
    requireLocalRequest(request, true);
    const body = await readLocalJson(request);
    const keys = Object.keys(body).sort().join(",");
    const userId = getLearningStore().getLocalUserId();
    if (body.type === "generate" && keys === "input,requestId,type") {
      if (
        typeof body.requestId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          body.requestId,
        )
      )
        throw new RequestError("L’identifiant de demande est invalide.");
      const input = await resolveLanguageInput(
        userId,
        validateLanguageInput(body.input),
      );
      return json(await requestLanguageResult(userId, body.requestId, input));
    }
    if (
      body.type === "save-result" &&
      keys === "resultId,type" &&
      languageIdentifier(body.resultId)
    )
      return json(getLanguageStore().saveResult(userId, body.resultId));
    if (
      body.type === "save-reference" &&
      keys === "elementId,type" &&
      languageIdentifier(body.elementId)
    ) {
      getLanguageStore().saveReference(userId, body.elementId);
      return json({
        savedReferenceIds: getLanguageStore().listSavedReferenceIds(userId),
      });
    }
    throw new RequestError("Cette action de l’atelier est invalide.");
  } catch (error) {
    return handleError(error);
  }
}
