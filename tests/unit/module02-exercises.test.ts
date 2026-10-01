import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getExercise,
  getModuleExercises,
} from "../../src/content/exercises.ts";
import { gradeExercise } from "../../src/lib/server/exercise-grading.ts";
import type { ExerciseAnswers } from "../../src/lib/exercise-types.ts";

function assess(
  number: number,
  itemId: string,
  fieldId: string,
  value: string,
) {
  const definition = getExercise(`02-${number}`)!;
  const answers: ExerciseAnswers = {
    [itemId]: { fields: { [fieldId]: value }, aid: "none" },
  };
  const original = structuredClone(answers);
  const result = gradeExercise(definition, answers)
    .items.find((item) => item.itemId === itemId)
    ?.fields.find((field) => field.fieldId === fieldId);
  assert.deepEqual(answers, original);
  assert.ok(result);
  return result;
}

function exerciseSections(source: string) {
  return Array.from(
    source.matchAll(
      /^### Exercice (\d+) — (.+) \{#exercice-\d+\}\n([\s\S]*?)(?=\n#{2,3} |$)/gm,
    ),
  );
}

test("module 02 publishes twelve aligned exercises without answers in the public definitions", () => {
  const course = readFileSync("src/content/modules/02/course.md", "utf8");
  const worksheet = readFileSync("src/content/modules/02/exercises.md", "utf8");
  const common = exerciseSections(course);
  const all = exerciseSections(worksheet);
  const exercises = getModuleExercises("02");
  assert.equal(common.length, 8);
  assert.equal(all.length, 12);
  assert.equal(exercises.length, 12);
  const expectedItemCounts = [4, 8, 9, 6, 7, 5, 4, 4, 5, 5, 5, 5];
  for (const [index, exercise] of exercises.entries()) {
    assert.equal(exercise.id, `02-${index + 1}`);
    assert.equal(exercise.version, 1);
    assert.equal(exercise.title, all[index]?.[2]);
    assert.equal(exercise.items.length, expectedItemCounts[index]);
    assert.equal(
      new Set(exercise.items.map((item) => item.id)).size,
      exercise.items.length,
    );
    for (const [itemIndex, item] of exercise.items.entries()) {
      assert.equal(
        item.id,
        `${index + 1}${String.fromCharCode(97 + itemIndex)}`,
      );
      for (const field of item.fields) {
        assert.ok(field.label);
        assert.ok(
          !("expected" in field) &&
            !("correct" in field) &&
            !("answer" in field),
        );
      }
    }
  }
  for (const [index, exercise] of common.entries())
    assert.equal(exercise[0].trim(), all[index]?.[0].trim());
});

test("identical item numbers use the right module's rules without changing module 01", () => {
  const answers: ExerciseAnswers = {
    "3a": { fields: { word: "тато", pronoun: "я" }, aid: "none" },
  };
  const first = gradeExercise(getExercise("01-3")!, answers);
  const second = gradeExercise(getExercise("02-3")!, answers);
  assert.equal(first.items[0]?.fields[0]?.expected, "тато");
  assert.equal(second.items[0]?.fields[0]?.expected, "я");
  assert.equal(first.items[0]?.fields[0]?.status, "correct");
  assert.equal(second.items[0]?.fields[0]?.status, "correct");
});

test("pronouns distinguish speaker, interlocutor and singular formal address", () => {
  assert.equal(assess(3, "3e", "pronoun", "ми").status, "correct");
  assert.equal(assess(3, "3f", "pronoun", "ви").status, "correct");
  assert.equal(assess(3, "3g", "pronoun", "ви").status, "correct");
  assert.equal(assess(3, "3e", "pronoun", "вони").status, "incorrect");
  assert.equal(assess(3, "3h", "pronoun", "воно").status, "incorrect");
  for (const alternative of ["mi", "мu", "my", "ми всі", "__proto__"]) {
    assert.equal(assess(3, "3e", "pronoun", alternative).status, "pending");
  }
});

test("new letters and stress are checked independently from pronunciation", () => {
  assert.equal(assess(2, "2d", "lowercase", "ц").status, "correct");
  assert.equal(assess(2, "2d", "lowercase", "Ц").status, "incorrect");
  assert.equal(assess(2, "2b", "lowercase", "e").status, "incorrect");
  assert.equal(assess(2, "2f", "stress", "2").status, "correct");
  assert.equal(assess(2, "2g", "stress", "2").status, "incorrect");
  assert.match(
    assess(2, "2g", "stress", "3").feedback,
    /ne valide pas ta prononciation/,
  );
  assert.equal(assess(2, "2d", "sound", "ts").status, "pending");
});

test("controlled sentences accept ordinary orthographic variation while retaining question intent", () => {
  assert.equal(
    assess(5, "5a", "phrase", "  ВІН — інжене́р. ").status,
    "correct",
  );
  assert.equal(assess(5, "5c", "phrase", "Ми  інженери!").status, "correct");
  assert.equal(assess(6, "6d", "phrase", "Ви інженер ?").status, "correct");
  assert.equal(assess(6, "6d", "phrase", "Ви інженер.").status, "incorrect");
  assert.equal(assess(5, "5f", "phrase", "Ви тут?").status, "incorrect");
  assert.equal(
    assess(7, "7d", "phrase", "Так, ми студенти.").status,
    "correct",
  );
  assert.equal(
    assess(7, "7d", "phrase", "Так, ви студенти.").status,
    "pending",
  );
  assert.equal(
    assess(7, "7b", "phrase", "Ні, я не студентка.\nЯ інженерка.").status,
    "correct",
  );
});

test("unrecognized sentences and open explanations stay pending rather than being rejected by matching", () => {
  for (const alternative of [
    "Я є інженеркою.",
    "Вона інженер.",
    "Ми студент.",
    "Це не кава, а сік.",
    "Вiн інженер.",
  ]) {
    assert.equal(assess(5, "5a", "phrase", alternative).status, "pending");
  }
  assert.equal(
    assess(4, "4a", "meaning", "Elle est ingénieure.").status,
    "pending",
  );
  assert.equal(
    assess(5, "5g", "explanation", "L’être est sous-entendu.").status,
    "pending",
  );
  assert.equal(
    assess(11, "11e", "answer", "Це не кава. Це сир.").status,
    "pending",
  );
  assert.equal(assess(9, "9c", "decision", "fits").status, "correct");
  assert.equal(assess(9, "9b", "decision", "fits").status, "incorrect");
  assert.equal(
    assess(9, "9a", "justification", "Le groupe est pluriel.").status,
    "pending",
  );
});

test("unanswered fields and unsupported definitions do not reveal model answers", () => {
  assert.equal(assess(5, "5a", "phrase", "  ").expected, undefined);
  for (const definition of [
    { ...getExercise("02-5")!, version: 2 },
    { ...getExercise("02-5")!, moduleId: "03" },
    { ...getExercise("01-3")!, moduleId: "02" },
  ]) {
    const result = gradeExercise(definition, {});
    assert.equal(result.status, "pending");
    assert.ok(
      result.items
        .flatMap((item) => item.fields)
        .every((field) => field.expected === undefined),
    );
  }
});
