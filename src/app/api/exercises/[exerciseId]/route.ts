import { getExercise } from "@/content/exercises";
import {
  EXERCISE_FIELD_MAX_LENGTH,
  EXERCISE_WORK_NOTE_MAX_LENGTH,
  type ExerciseCommand,
  type ExerciseDefinition,
} from "@/lib/exercise-types";
import { gradeExercise } from "@/lib/server/exercise-grading";
import { getExerciseStore } from "@/lib/server/exercise-service";
import {
  ExerciseConflictError,
  ExerciseAttemptNotFoundError,
} from "@/lib/server/exercise-store";
import { getLearningStore } from "@/lib/server/learning-service";
import {
  RequestError,
  json,
  readLocalJson,
  requireLocalRequest,
} from "@/lib/server/local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ exerciseId: string }> };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateCommand(
  body: Record<string, unknown>,
  definition: ExerciseDefinition,
): ExerciseCommand {
  if (body.type === "start") {
    if (
      Object.keys(body).some((key) => !["type", "retryOf"].includes(key)) ||
      (body.retryOf !== undefined &&
        (typeof body.retryOf !== "string" || body.retryOf.length > 80))
    ) {
      throw new RequestError("La demande de tentative est invalide.");
    }
    return body as ExerciseCommand;
  }
  if (
    typeof body.type !== "string" ||
    !["save", "submit"].includes(body.type) ||
    Object.keys(body).some(
      (key) =>
        ![
          "type",
          "attemptId",
          "expectedRevision",
          "answers",
          "workNote",
        ].includes(key),
    )
  ) {
    throw new RequestError("Cette action est invalide.");
  }
  if (
    typeof body.attemptId !== "string" ||
    body.attemptId.length > 80 ||
    !Number.isSafeInteger(body.expectedRevision) ||
    (body.expectedRevision as number) < 1 ||
    typeof body.workNote !== "string" ||
    body.workNote.length > EXERCISE_WORK_NOTE_MAX_LENGTH ||
    !record(body.answers)
  ) {
    throw new RequestError("La tentative ou sa version est invalide.");
  }
  if (
    Object.keys(body.answers).length !== definition.items.length ||
    Object.keys(body.answers).some(
      (id) => !definition.items.some((item) => item.id === id),
    )
  ) {
    throw new RequestError(
      "Les questions ne correspondent pas à cet exercice.",
    );
  }
  for (const item of definition.items) {
    const answer = body.answers[item.id];
    if (
      !record(answer) ||
      Object.keys(answer).some((key) => !["fields", "aid"].includes(key)) ||
      !record(answer.fields) ||
      (answer.aid !== null &&
        (typeof answer.aid !== "string" ||
          !["none", "resource", "correction"].includes(answer.aid)))
    ) {
      throw new RequestError(`La réponse ${item.id} est invalide.`);
    }
    if (
      Object.keys(answer.fields).length !== item.fields.length ||
      Object.keys(answer.fields).some(
        (id) => !item.fields.some((field) => field.id === id),
      )
    ) {
      throw new RequestError(
        `Les champs de ${item.id} ne correspondent pas à la question.`,
      );
    }
    for (const field of item.fields) {
      const value = answer.fields[field.id];
      if (
        typeof value !== "string" ||
        value.length > EXERCISE_FIELD_MAX_LENGTH ||
        (field.options &&
          value !== "" &&
          !field.options.some((option) => option.value === value))
      ) {
        throw new RequestError(
          `Le champ « ${field.label} » de ${item.id} est invalide.`,
        );
      }
      if (body.type === "submit" && !value.trim()) {
        throw new RequestError(
          `Complète ${item.id} avant de remettre l’exercice. Tu peux écrire « Je ne sais pas » si tu bloques dans un champ libre.`,
        );
      }
    }
    if (body.type === "submit" && answer.aid === null) {
      throw new RequestError(`Indique l’aide utilisée pour ${item.id}.`);
    }
  }
  return body as ExerciseCommand;
}

function handleError(error: unknown) {
  if (error instanceof RequestError)
    return json({ message: error.message }, error.status);
  if (error instanceof ExerciseAttemptNotFoundError)
    return json({ message: "Cette tentative n’existe pas." }, 404);
  if (error instanceof ExerciseConflictError)
    return json(
      {
        message:
          "Cette tentative a changé. Compare les versions avant de poursuivre.",
        workspace: error.currentWorkspace,
      },
      409,
    );
  console.error("Exercise storage request failed", error);
  return json(
    {
      message:
        "L’exercice est momentanément indisponible. Conserve ton brouillon et réessaie.",
    },
    503,
  );
}

export async function GET(request: Request, context: RouteContext) {
  try {
    requireLocalRequest(request);
    const { exerciseId } = await context.params;
    if (!getExercise(exerciseId))
      throw new RequestError("Cet exercice n’existe pas.", 404);
    const userId = getLearningStore().getLocalUserId();
    return json(getExerciseStore().getWorkspace(userId, exerciseId));
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    requireLocalRequest(request, true);
    const { exerciseId } = await context.params;
    const definition = getExercise(exerciseId);
    if (!definition) throw new RequestError("Cet exercice n’existe pas.", 404);
    const command = validateCommand(await readLocalJson(request), definition);
    const userId = getLearningStore().getLocalUserId();
    const store = getExerciseStore();
    if (command.type === "start")
      return json(store.startAttempt(userId, definition, command.retryOf));
    if (command.type === "save")
      return json(
        store.saveDraft(
          userId,
          definition,
          command.attemptId,
          command.expectedRevision,
          command.answers,
          command.workNote,
        ),
      );
    const assessment = gradeExercise(definition, command.answers);
    return json(
      store.submitAttempt(
        userId,
        definition,
        command.attemptId,
        command.expectedRevision,
        command.answers,
        command.workNote,
        assessment,
      ),
    );
  } catch (error) {
    return handleError(error);
  }
}
