import {
  RESOURCE_NOTES_MAX_LENGTH,
  RESOURCE_POSITION_MAX_SECONDS,
  type LearningResource,
  type ResourceCommand,
} from "../resource-types.ts";

export class ResourceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceInputError";
  }
}

export function resourceIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{1,100}$/.test(value);
}

export function validateResourceCommand(value: unknown): ResourceCommand {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ResourceInputError("Cette demande de ressource est invalide.");
  const input = value as Record<string, unknown>;
  const fields = Object.keys(input).sort().join(",");
  if (
    typeof input.requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.requestId,
    ) ||
    !resourceIdentifier(input.resourceId)
  )
    throw new ResourceInputError("Cette demande de ressource est invalide.");
  if (input.type === "open") {
    if (fields !== "requestId,resourceId,type")
      throw new ResourceInputError(
        "Cette ouverture de ressource est invalide.",
      );
    return input as ResourceCommand;
  }
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    Number(input.expectedRevision) < 0 ||
    Number(input.expectedRevision) >= Number.MAX_SAFE_INTEGER
  )
    throw new ResourceInputError(
      "La version de cet enregistrement est invalide.",
    );
  if (input.type === "save-notes") {
    if (
      fields !== "expectedRevision,notes,requestId,resourceId,type" ||
      typeof input.notes !== "string" ||
      input.notes.length > RESOURCE_NOTES_MAX_LENGTH
    )
      throw new ResourceInputError(
        "Les notes sont limitées à 10 000 caractères.",
      );
    return input as ResourceCommand;
  }
  if (input.type === "save-position") {
    if (
      fields !== "expectedRevision,positionSeconds,requestId,resourceId,type" ||
      (input.positionSeconds !== null &&
        (typeof input.positionSeconds !== "number" ||
          !Number.isFinite(input.positionSeconds) ||
          input.positionSeconds < 0 ||
          input.positionSeconds > RESOURCE_POSITION_MAX_SECONDS))
    )
      throw new ResourceInputError(
        "Ce repère doit être compris entre 0 et 24 heures.",
      );
    return input as ResourceCommand;
  }
  throw new ResourceInputError("Cette action sur la ressource est invalide.");
}

export function validateResourcePosition(
  resource: LearningResource,
  positionSeconds: number | null,
) {
  if (positionSeconds !== null && resource.media === null)
    throw new ResourceInputError(
      "Cette ressource ne contient pas de lecteur audio ou vidéo.",
    );
}
