import assert from "node:assert/strict";
import test from "node:test";
import {
  validateLanguageInput,
  submittedLanguageInput,
  submittedLanguageAnswers,
  LanguageInputError,
} from "../../src/lib/server/language-input.ts";
import type { ExerciseAttempt } from "../../src/lib/exercise-types.ts";
import { getExercise } from "../../src/content/exercises.ts";

const input = {
  mode: "translate",
  text: " café ",
  context: " boisson ",
  source: null,
};
test("language input validates modes, strict fields, bounds and local sources", () => {
  assert.deepEqual(validateLanguageInput(input), {
    ...input,
    text: "café",
    context: "boisson",
  });
  for (const value of [
    null,
    [],
    { ...input, mode: ["translate"] },
    { ...input, mode: { toString: "x" } },
    { ...input, mode: "execute" },
    { ...input, text: "" },
    { ...input, text: "x".repeat(2001) },
    { ...input, context: "x".repeat(2001) },
    { ...input, userId: "other" },
    { ...input, source: { kind: "url", href: "https://example.com" } },
    {
      ...input,
      source: { kind: "document", moduleId: "../", view: "cours", anchor: "" },
    },
    {
      ...input,
      source: {
        kind: "document",
        moduleId: "01",
        view: "cours",
        anchor: "<script>",
      },
    },
    {
      ...input,
      source: { kind: "exercise", exerciseId: "01-6", attemptId: "id" },
    },
  ])
    assert.throws(() => validateLanguageInput(value), LanguageInputError);
  const document = {
    kind: "document",
    moduleId: "01",
    view: "cours",
    anchor: "alphabet",
  };
  assert.deepEqual(
    validateLanguageInput({ ...input, source: document }).source,
    document,
  );
});

test("writing assistance uses the submitted definition and original answers without work notes or anticipatory feedback", () => {
  const definition = getExercise("01-6")!;
  const attempt: ExerciseAttempt = {
    id: "submitted-id",
    exerciseId: definition.id,
    definitionVersion: 1,
    definition,
    number: 1,
    status: "submitted",
    revision: 2,
    retryOf: null,
    answers: Object.fromEntries(
      definition.items.map((item) => [
        item.id,
        { fields: { answer: "Réponse originale" }, aid: "none" },
      ]),
    ),
    workNote: "Une note personnelle non transmise",
    createdAt: "2026-09-25T10:00:00Z",
    updatedAt: "2026-09-25T10:00:00Z",
    submittedAt: "2026-09-25T10:00:00Z",
    assessment: null,
  };
  const copy = structuredClone(attempt);
  const resolved = submittedLanguageInput(attempt);
  assert.match(resolved.text, /Réponse originale/);
  assert.match(resolved.text, /Traduis Мене звати Анна/);
  assert.doesNotMatch(resolved.text, /Une note personnelle/);
  assert.deepEqual(resolved.source, {
    kind: "exercise",
    exerciseId: definition.id,
    attemptId: attempt.id,
  });
  assert.deepEqual(attempt, copy);
  assert.deepEqual(
    submittedLanguageAnswers(attempt),
    definition.items.map(() => "Réponse originale"),
  );
  assert.deepEqual(submittedLanguageAnswers({ ...attempt, answers: {} }), []);
  const withChoice = {
    ...attempt,
    definition: getExercise("01-4")!,
    answers: { "4a": { fields: { stress: "1" }, aid: "none" as const } },
  };
  assert.deepEqual(submittedLanguageAnswers(withChoice), ["1re syllabe"]);
  assert.throws(
    () => submittedLanguageInput({ ...attempt, status: "draft" }),
    LanguageInputError,
  );
  assert.throws(
    () => submittedLanguageAnswers({ ...attempt, status: "draft" }),
    LanguageInputError,
  );
});
