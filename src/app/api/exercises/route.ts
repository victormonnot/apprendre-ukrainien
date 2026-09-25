import { getModule } from "@/content/catalog";
import { getModuleExercises } from "@/content/exercises";
import { getExerciseStore } from "@/lib/server/exercise-service";
import { getLearningStore } from "@/lib/server/learning-service";
import {
  RequestError,
  json,
  requireLocalRequest,
} from "@/lib/server/local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    requireLocalRequest(request);
    const moduleId = new URL(request.url).searchParams.get("moduleId");
    if (!moduleId || !getModule(moduleId))
      throw new RequestError("Ce module n’existe pas.", 404);
    const userId = getLearningStore().getLocalUserId();
    const store = getExerciseStore();
    const exercises = getModuleExercises(moduleId).map((definition) => {
      const workspace = store.getWorkspace(userId, definition.id);
      const latest = workspace.attempts[0];
      return {
        id: definition.id,
        number: definition.number,
        title: definition.title,
        hasDraft: Boolean(workspace.draft),
        submissions: workspace.attempts.length,
        latestStatus: latest?.assessment?.status ?? null,
      };
    });
    return json({ exercises });
  } catch (error) {
    if (error instanceof RequestError)
      return json({ message: error.message }, error.status);
    console.error("Exercise overview request failed", error);
    return json(
      {
        message:
          "Le suivi des exercices est indisponible. Les cours restent accessibles.",
      },
      503,
    );
  }
}
