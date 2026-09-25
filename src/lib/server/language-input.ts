import { getModule } from "../../content/catalog.ts";
import { getExercise } from "../../content/exercises.ts";
import {
  LANGUAGE_CONTEXT_MAX_LENGTH,
  LANGUAGE_TEXT_MAX_LENGTH,
  type LanguageInput,
  type LanguageSource,
} from "../language-types.ts";
import type { ExerciseAttempt } from "../exercise-types.ts";

export class LanguageInputError extends Error {}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new LanguageInputError("La demande contient des champs invalides.");
}
export function languageIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
}
export function validateLanguageInput(value: unknown): LanguageInput {
  if (!record(value)) throw new LanguageInputError("La demande est invalide.");
  exactKeys(value, ["mode", "text", "context", "source"]);
  if (
    typeof value.mode !== "string" ||
    !["translate", "explain", "correct"].includes(value.mode)
  )
    throw new LanguageInputError("Choisis une activité de l’atelier.");
  if (
    typeof value.context !== "string" ||
    value.context.length > LANGUAGE_CONTEXT_MAX_LENGTH
  )
    throw new LanguageInputError("Le contexte est limité à 2 000 caractères.");
  let source: LanguageSource | null = null;
  if (value.source !== null) {
    if (!record(value.source))
      throw new LanguageInputError("La source est invalide.");
    if (value.source.kind === "document") {
      exactKeys(value.source, ["kind", "moduleId", "view", "anchor"]);
      const { moduleId, view, anchor } = value.source;
      if (
        typeof moduleId !== "string" ||
        !getModule(moduleId)?.documents.some(
          (document) => document.view === view,
        ) ||
        typeof anchor !== "string" ||
        !/^[a-z0-9-]{0,100}$/.test(anchor)
      )
        throw new LanguageInputError("Le passage du cours est invalide.");
    } else if (value.source.kind === "exercise") {
      exactKeys(value.source, ["kind", "exerciseId", "attemptId"]);
      if (
        !languageIdentifier(value.source.exerciseId) ||
        !getExercise(value.source.exerciseId) ||
        !languageIdentifier(value.source.attemptId) ||
        value.mode !== "correct"
      )
        throw new LanguageInputError("La remise d’exercice est invalide.");
    } else throw new LanguageInputError("La source est invalide.");
    source = value.source as LanguageSource;
  }
  if (
    typeof value.text !== "string" ||
    value.text.length >
      (source?.kind === "exercise" ? 60_000 : LANGUAGE_TEXT_MAX_LENGTH) ||
    (!value.text.trim() && source?.kind !== "exercise")
  )
    throw new LanguageInputError("Écris un texte de 1 à 2 000 caractères.");
  return {
    mode: value.mode as LanguageInput["mode"],
    text: value.text.trim(),
    context: value.context.trim(),
    source,
  };
}

export function submittedLanguageInput(
  attempt: ExerciseAttempt,
): LanguageInput {
  if (attempt.status !== "submitted")
    throw new LanguageInputError(
      "Remets tes réponses avant de demander une relecture.",
    );
  const text =
    `Module ${attempt.definition.moduleId}, exercice ${attempt.definition.number} : ${attempt.definition.title}. Remise ${attempt.number}.\n${attempt.definition.guidance ?? ""}\n\n` +
    attempt.definition.items
      .map((item) =>
        [
          item.label,
          ...item.fields.map((field) => {
            const value = attempt.answers[item.id]?.fields[field.id] ?? "";
            return `${field.label} : ${field.options?.find((option) => option.value === value)?.label ?? value}`;
          }),
        ].join("\n"),
      )
      .join("\n\n");
  if (text.length > 60_000)
    throw new LanguageInputError(
      "Cette remise est trop longue. Relis un extrait dans l’atelier.",
    );
  return {
    mode: "correct",
    text,
    context: "",
    source: {
      kind: "exercise",
      exerciseId: attempt.exerciseId,
      attemptId: attempt.id,
    },
  };
}
