import { learningResources } from "@/content/resources";
import { getLearningStore } from "@/lib/server/learning-service";
import {
  ResourceInputError,
  resourceIdentifier,
  validateResourceCommand,
} from "@/lib/server/resource-input";
import {
  getResourceStore,
  requireResource,
} from "@/lib/server/resource-service";
import {
  ResourceConflictError,
  ResourceRequestConflictError,
} from "@/lib/server/resource-store";
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
  if (error instanceof RequestError)
    return json({ message: error.message }, error.status);
  if (error instanceof ResourceInputError)
    return json({ message: error.message }, 400);
  if (
    error instanceof ResourceConflictError ||
    error instanceof ResourceRequestConflictError
  )
    return json(
      { message: error.message, workspace: error.currentWorkspace },
      409,
    );
  console.error(
    "Resource request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return json(
    {
      message:
        "Les ressources sont momentanément indisponibles. Tes notes restent ici ; réessaie.",
    },
    503,
  );
}

export async function GET(request: Request) {
  try {
    requireLocalRequest(request);
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    if (params.size !== 0 && (params.size !== 1 || !resourceIdentifier(id)))
      throw new RequestError("La ressource demandée est invalide.");
    if (params.size === 1) {
      const resource = requireResource(id!);
      return json(
        getResourceStore().getWorkspace(
          getLearningStore().getLocalUserId(),
          resource,
        ),
      );
    }
    const userId = getLearningStore().getLocalUserId();
    const store = getResourceStore();
    return json({
      resources: learningResources.map((resource) =>
        store.getWorkspace(userId, resource),
      ),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireLocalRequest(request, true);
    const command = validateResourceCommand(await readLocalJson(request));
    requireWorkspaceGeneration(request);
    const resource = requireResource(command.resourceId);
    return json(
      getResourceStore().applyCommand(
        getLearningStore().getLocalUserId(),
        resource,
        command,
      ),
    );
  } catch (error) {
    return handleError(error);
  }
}
