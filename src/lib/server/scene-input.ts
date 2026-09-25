import {
  SCENE_ANSWER_MAX_LENGTH,
  type SceneCommand,
  type SceneDefinition,
  type SceneRoleId,
} from "../scene-types.ts";

export class SceneInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SceneInputError";
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function sceneIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{1,100}$/.test(value);
}

export function sceneRole(value: unknown): value is SceneRoleId {
  return value === "anna" || value === "maxime";
}

export function validateSceneCommand(value: unknown): SceneCommand {
  if (
    !object(value) ||
    Object.keys(value).sort().join(",") !==
      "answers,expectedRevision,helpUsed,requestId,roleId,sceneId,type,variantId,version" ||
    (value.type !== "save" && value.type !== "submit") ||
    typeof value.requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.requestId,
    ) ||
    !sceneIdentifier(value.sceneId) ||
    !sceneIdentifier(value.variantId) ||
    !sceneRole(value.roleId) ||
    !Number.isSafeInteger(value.version) ||
    Number(value.version) < 1 ||
    !Number.isSafeInteger(value.expectedRevision) ||
    Number(value.expectedRevision) < 0 ||
    Number(value.expectedRevision) >= Number.MAX_SAFE_INTEGER ||
    typeof value.helpUsed !== "boolean" ||
    !object(value.answers) ||
    Object.keys(value.answers).length > 50 ||
    Object.entries(value.answers).some(
      ([key, answer]) =>
        !sceneIdentifier(key) ||
        typeof answer !== "string" ||
        answer.length > SCENE_ANSWER_MAX_LENGTH,
    )
  )
    throw new SceneInputError("Cette réponse à la scène est invalide.");
  return value as SceneCommand;
}

export function validateSceneAnswers(
  scene: SceneDefinition,
  command: SceneCommand,
) {
  const lines = scene.lines.filter((line) => line.speakerId === command.roleId);
  if (
    !lines.length ||
    Object.keys(command.answers).some(
      (id) => !lines.some((line) => line.id === id),
    )
  )
    throw new SceneInputError(
      "Écris seulement les répliques de ton personnage.",
    );
  if (
    command.type === "submit" &&
    lines.some((line) => !command.answers[line.id]?.trim())
  )
    throw new SceneInputError(
      "Complète chaque réplique de ton personnage avant de comparer.",
    );
  return Object.fromEntries(
    lines.map((line) => [line.id, command.answers[line.id] ?? ""]),
  );
}
