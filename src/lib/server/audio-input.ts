import { getReviewElement } from "../../content/reviews.ts";
import { presentationSegments } from "../../content/audio.ts";
import { getScene } from "../../content/scenes.ts";
import type { AudioSource, AudioVoiceId } from "../audio-types.ts";
import type { LanguageResult } from "../language-types.ts";
import type { ReviewAttemptView } from "../review-types.ts";

export class AudioInputError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AudioInputError";
    this.status = status;
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function identifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
}
function keys(value: Record<string, unknown>, expected: string[]) {
  return (
    Object.keys(value).length === expected.length &&
    Object.keys(value).every((key) => expected.includes(key))
  );
}
export function validateAudioCommand(value: unknown): {
  source: AudioSource;
  voiceId: AudioVoiceId;
} {
  if (
    !object(value) ||
    !keys(value, ["source", "voiceId"]) ||
    typeof value.voiceId !== "string" ||
    !["macos-lesya", "openai-marin", "openai-cedar", "openai-nova"].includes(
      value.voiceId,
    ) ||
    !object(value.source)
  )
    throw new AudioInputError("Cette demande audio est invalide.");
  const source = value.source;
  const valid =
    source.kind === "reference"
      ? keys(source, ["kind", "elementId"]) && identifier(source.elementId)
      : source.kind === "segment"
        ? keys(source, ["kind", "segmentId"]) && identifier(source.segmentId)
        : source.kind === "scene"
          ? keys(source, [
              "kind",
              "sceneId",
              "variantId",
              "version",
              "lineId",
            ]) &&
            identifier(source.sceneId) &&
            identifier(source.variantId) &&
            Number.isSafeInteger(source.version) &&
            Number(source.version) > 0 &&
            identifier(source.lineId)
          : source.kind === "review"
            ? keys(source, ["kind", "attemptId"]) &&
              identifier(source.attemptId)
            : source.kind === "language"
              ? keys(source, [
                  "kind",
                  "resultId",
                  "entryIndex",
                  "exampleIndex",
                ]) &&
                identifier(source.resultId) &&
                Number.isSafeInteger(source.entryIndex) &&
                Number(source.entryIndex) >= 0 &&
                Number(source.entryIndex) < 6 &&
                (source.exampleIndex === null ||
                  (Number.isSafeInteger(source.exampleIndex) &&
                    Number(source.exampleIndex) >= 0 &&
                    Number(source.exampleIndex) < 3))
              : false;
  if (!valid) throw new AudioInputError("La source audio est invalide.");
  return {
    source: source as AudioSource,
    voiceId: value.voiceId as AudioVoiceId,
  };
}
export function resolveAudioText(
  source: AudioSource,
  context: {
    getResult(id: string): LanguageResult | null;
    getActiveReview(): ReviewAttemptView | null;
  },
): string {
  if (source.kind === "reference") {
    const element = getReviewElement(source.elementId);
    if (!element || element.kind === "letter")
      throw new AudioInputError(
        "Écoute les lettres dans les mots du cours.",
        404,
      );
    return element.label;
  }
  if (source.kind === "segment") {
    const segment = presentationSegments.find(
      (entry) => entry.id === source.segmentId,
    );
    if (!segment)
      throw new AudioInputError("Ce passage audio est introuvable.", 404);
    return segment.text;
  }
  if (source.kind === "language") {
    const result = context.getResult(source.resultId);
    const entry = result?.content.entries[source.entryIndex];
    const text =
      source.exampleIndex === null
        ? entry?.ukrainian
        : entry?.examples[source.exampleIndex]?.ukrainian;
    if (!text)
      throw new AudioInputError(
        "Cette phrase est introuvable dans la fiche.",
        404,
      );
    return text;
  }
  if (source.kind === "scene") {
    const scene = getScene(source.sceneId, source.variantId, source.version);
    const line = scene?.lines.find((line) => line.id === source.lineId);
    if (!line)
      throw new AudioInputError("Cette réplique est introuvable.", 404);
    return line.ukrainian;
  }
  const review = context.getActiveReview();
  if (
    !review ||
    review.id !== source.attemptId ||
    review.status !== "revealed" ||
    !review.revealed ||
    review.direction === "recognition"
  )
    throw new AudioInputError("Révèle d’abord la réponse pour l’écouter.", 404);
  const text =
    review.cueLang === "uk"
      ? review.cue
      : review.revealed.answerLang === "uk"
        ? review.revealed.answer
        : null;
  if (!text)
    throw new AudioInputError(
      "Cette carte ne contient pas de mot à écouter.",
      404,
    );
  return text;
}
