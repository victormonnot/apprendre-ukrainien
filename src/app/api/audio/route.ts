import { getLearningStore } from "@/lib/server/learning-service";
import { getAudioCatalogue, requestAudio } from "@/lib/server/audio-service";
import {
  AudioInputError,
  validateAudioCommand,
} from "@/lib/server/audio-input";
import { AudioProviderError } from "@/lib/server/audio-provider";
import {
  RequestError,
  json,
  readLocalJson,
  requireLocalRequest,
  requireWorkspaceGeneration,
} from "@/lib/server/local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function handleError(error: unknown) {
  if (
    error instanceof AudioInputError ||
    error instanceof AudioProviderError ||
    error instanceof RequestError
  )
    return json({ message: error.message }, error.status);
  console.error(
    "Audio request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return json(
    {
      message:
        "Le son est momentanément indisponible. Tu peux réessayer sans quitter la page.",
    },
    503,
  );
}
export async function GET(request: Request) {
  try {
    requireLocalRequest(request);
    return json(await getAudioCatalogue());
  } catch (error) {
    return handleError(error);
  }
}
export async function POST(request: Request) {
  try {
    requireLocalRequest(request, true);
    const { source, voiceId } = validateAudioCommand(
      await readLocalJson(request),
    );
    requireWorkspaceGeneration(request);
    return json(
      await requestAudio(getLearningStore().getLocalUserId(), source, voiceId),
    );
  } catch (error) {
    return handleError(error);
  }
}
