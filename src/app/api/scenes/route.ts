import { getLearningStore } from "@/lib/server/learning-service";
import {
  SceneInputError,
  sceneIdentifier,
  sceneRole,
  validateSceneCommand,
} from "@/lib/server/scene-input";
import { getSceneStore, requireScene } from "@/lib/server/scene-service";
import {
  SceneConflictError,
  SceneRequestConflictError,
} from "@/lib/server/scene-store";
import {
  RequestError,
  json,
  readLocalJson,
  requireLocalRequest,
} from "@/lib/server/local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handleError(error: unknown) {
  if (error instanceof RequestError)
    return json({ message: error.message }, error.status);
  if (error instanceof SceneInputError)
    return json({ message: error.message }, 400);
  if (error instanceof SceneConflictError)
    return json(
      { message: error.message, workspace: error.currentWorkspace },
      409,
    );
  if (error instanceof SceneRequestConflictError)
    return json({ message: error.message }, 409);
  console.error(
    "Scene request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return json(
    {
      message:
        "La scène est momentanément indisponible. Tes réponses restent ici ; réessaie.",
    },
    503,
  );
}

export async function GET(request: Request) {
  try {
    requireLocalRequest(request);
    const params = new URL(request.url).searchParams;
    const sceneId = params.get("scene");
    const variantId = params.get("variant");
    const roleId = params.get("role");
    if (
      params.size !== 3 ||
      !sceneIdentifier(sceneId) ||
      !sceneIdentifier(variantId) ||
      !sceneRole(roleId)
    )
      throw new RequestError("La scène ou le personnage demandé est invalide.");
    const definition = requireScene(sceneId, variantId);
    return json(
      getSceneStore().getWorkspace(
        getLearningStore().getLocalUserId(),
        definition,
        roleId,
      ),
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireLocalRequest(request, true);
    const command = validateSceneCommand(await readLocalJson(request));
    const definition = requireScene(
      command.sceneId,
      command.variantId,
      command.version,
    );
    return json(
      getSceneStore().applyCommand(
        getLearningStore().getLocalUserId(),
        definition,
        command,
      ),
    );
  } catch (error) {
    return handleError(error);
  }
}
