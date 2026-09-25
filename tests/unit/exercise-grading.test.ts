import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  exercises,
  getExercise,
  getExerciseByNumber,
  getModuleExercises,
} from "../../src/content/exercises.ts";
import type {
  ExerciseAnswers,
  ExerciseDefinition,
} from "../../src/lib/exercise-types.ts";
import { gradeExercise } from "../../src/lib/server/exercise-grading.ts";

function definition(number: number): ExerciseDefinition {
  const found = getExerciseByNumber("01", number);
  assert.ok(found);
  return found;
}

function answers(
  values: Record<string, Record<string, string>>,
): ExerciseAnswers {
  return Object.fromEntries(
    Object.entries(values).map(([id, fields]) => [id, { fields, aid: "none" }]),
  );
}

function field(number: number, itemId: string, fieldId: string, value: string) {
  const assessment = gradeExercise(
    definition(number),
    answers({ [itemId]: { [fieldId]: value } }),
  );
  const result = assessment.items
    .find((item) => item.itemId === itemId)
    ?.fields.find((field) => field.fieldId === fieldId);
  assert.ok(result);
  return result;
}

test("the exercise catalogue matches the source titles and keeps stable, unique item and field identifiers", () => {
  const source = readFileSync(
    new URL("../../src/content/modules/01/exercises.md", import.meta.url),
    "utf8",
  );
  const headings = Array.from(source.matchAll(/^### Exercice (\d+) — (.+)$/gm));
  assert.equal(headings.length, 13);
  assert.equal(exercises.length, headings.length);
  const itemCounts = [7, 5, 5, 5, 6, 3, 4, 4, 4, 6, 4, 4, 3];
  const allItemIds = new Set<string>();
  for (const [index, exercise] of exercises.entries()) {
    assert.equal(exercise.id, `01-${index + 1}`);
    assert.equal(
      exercise.title,
      headings[index]?.[2]?.replace(/ \{#[^}]+\}$/, ""),
    );
    assert.equal(exercise.number, Number(headings[index]?.[1]));
    assert.equal(exercise.items.length, itemCounts[index]);
    assert.equal(getExercise(exercise.id), exercise);
    for (const [itemIndex, item] of exercise.items.entries()) {
      assert.equal(
        item.id,
        `${exercise.number}${String.fromCharCode(97 + itemIndex)}`,
      );
      assert.ok(!allItemIds.has(item.id));
      allItemIds.add(item.id);
      assert.ok(item.label.trim());
      assert.equal(
        new Set(item.fields.map((field) => field.id)).size,
        item.fields.length,
      );
      for (const field of item.fields) {
        assert.ok(field.label.trim());
        assert.ok(!("expected" in field));
        assert.ok(!("correct" in field));
        assert.ok(!("answer" in field));
        if (field.options)
          assert.equal(
            new Set(field.options.map((option) => option.value)).size,
            field.options.length,
          );
      }
    }
  }
  assert.deepEqual(getModuleExercises("01"), exercises);
  assert.deepEqual(getModuleExercises("99"), []);
  assert.equal(getExercise("../01-1"), undefined);
  assert.equal(getExerciseByNumber("01", 99), undefined);
});

test("word matching normalizes case, combining stress, whitespace and terminal punctuation without changing the submitted text", () => {
  const input = answers({
    "3a": { word: "  ТА́ТО!  " },
    "3b": { word: "кава." },
    "3c": { word: "МАМА\u00a0" },
    "3d": { word: "\nмова…" },
    "3e": { word: "тут?!" },
  });
  const copy = structuredClone(input);
  const result = gradeExercise(definition(3), input);
  assert.equal(result.status, "corrected");
  assert.ok(
    result.items.every((item) =>
      item.fields.every((field) => field.status === "correct"),
    ),
  );
  assert.deepEqual(input, copy);
});

test("Latin lookalikes and transliterations are never validated as Ukrainian words", () => {
  for (const value of ["tato", "tаtо", "kaвa", "мoвa", "тyт"]) {
    const result = field(3, "3a", "word", value);
    assert.equal(result.status, "pending");
    assert.match(result.feedback, /lettres latines/);
  }
  assert.equal(field(10, "10a", "word", "ciк").status, "pending");
  assert.equal(field(1, "1a", "lowercase", "h").status, "incorrect");
});

test("different words from the lesson get contextual corrections rather than being accepted by approximate spelling", () => {
  const cat = field(10, "10d", "word", "кіт");
  assert.equal(cat.status, "incorrect");
  assert.equal(cat.expected, "кит");
  assert.match(cat.feedback, /chat/);
  assert.match(cat.feedback, /baleine/);
  const there = field(3, "3e", "word", "там");
  assert.equal(there.status, "incorrect");
  assert.match(there.feedback, /là, là-bas/);
  assert.equal(there.expected, "тут");
});

test("unrecognized words, plausible alternatives and typos remain unverified", () => {
  for (const value of [
    "батько",
    "татко",
    "таато",
    "constructor",
    "__proto__",
  ]) {
    const result = field(3, "3a", "word", value);
    assert.equal(result.status, "pending");
    assert.equal(result.expected, "тато");
  }
  assert.equal(field(10, "10e", "word", "тут").status, "correct");
  assert.equal(field(10, "10e", "word", "ось тут").status, "pending");
});

test("lowercase tasks distinguish capitals and letter identity without inferring pronunciation", () => {
  const correct = field(1, "1a", "lowercase", " н ");
  assert.equal(correct.status, "correct");
  assert.match(correct.feedback, /pas sa prononciation/);
  assert.equal(field(1, "1a", "lowercase", "Н").status, "incorrect");
  assert.equal(field(1, "1a", "lowercase", "п").status, "incorrect");
  assert.equal(field(1, "1b", "lowercase", "p").status, "incorrect");
  assert.equal(field(1, "1b", "lowercase", "р").status, "correct");
});

test("written stress choices are corrected separately from the copy, syllables and explanation", () => {
  const input = answers({
    "4a": { word: "Привіт", syllables: "при-віт", stress: "2" },
    "4b": { word: "Дякую", syllables: "дя-ку-ю", stress: "2" },
    "4e": { explanation: "Une syllabe ressort davantage." },
  });
  const result = gradeExercise(definition(4), input);
  assert.equal(result.status, "partial");
  assert.equal(
    result.items[0]?.fields.find((field) => field.fieldId === "stress")?.status,
    "correct",
  );
  assert.equal(
    result.items[0]?.fields.find((field) => field.fieldId === "syllables")
      ?.status,
    "pending",
  );
  const wrong = result.items[1]?.fields.find(
    (field) => field.fieldId === "stress",
  );
  assert.equal(wrong?.status, "incorrect");
  assert.match(wrong?.feedback ?? "", /1re syllabe/);
  assert.match(wrong?.feedback ?? "", /ne valide pas ta prononciation/);
  assert.equal(result.items[4]?.fields[0]?.status, "pending");
});

test("segmentation requires the word boundaries and keeps dialogue replies on separate lines", () => {
  assert.equal(
    field(11, "11a", "segmentation", "Добрий  день!\nМене звати Анна.").status,
    "correct",
  );
  assert.equal(
    field(11, "11a", "segmentation", "Добрийдень! Менезвати Анна.").status,
    "incorrect",
  );
  assert.equal(
    field(11, "11b", "segmentation", "Дякую!\r\nБудь ласка.").status,
    "correct",
  );
  assert.equal(
    field(11, "11b", "segmentation", "Дякую! Будь ласка.").status,
    "incorrect",
  );
  assert.equal(
    field(11, "11c", "segmentation", "До побачення!").status,
    "correct",
  );
  assert.equal(
    field(11, "11c", "segmentation", "До побачення.").status,
    "pending",
  );
  assert.equal(
    field(11, "11a", "segmentation", "Добрий день! Мене звати Максим.").status,
    "pending",
  );
});

test("context choices are corrected without declaring the replacement or reasoning correct", () => {
  const input = answers(
    Object.fromEntries(
      ["12a", "12b", "12c", "12d"].map((id) => [
        id,
        {
          decision: "change",
          proposal: "Дякую!",
          justification: "Mon explication.",
        },
      ]),
    ),
  );
  const result = gradeExercise(definition(12), input);
  assert.equal(result.status, "partial");
  assert.deepEqual(
    result.items.map((item) => item.fields[0]?.status),
    ["correct", "correct", "correct", "incorrect"],
  );
  assert.ok(
    result.items.every((item) =>
      item.fields.slice(1).every((field) => field.status === "pending"),
    ),
  );
  assert.equal(field(12, "12d", "decision", "fits").status, "correct");
});

test("free productions, explanations, meanings and sound hints stay pending even when they match the course", () => {
  for (const [number, itemId, fieldId, value] of [
    [1, "1a", "sound", "n"],
    [2, "2a", "reading", "MO-va"],
    [2, "2a", "meaning", "langue"],
    [5, "5c", "phrase", "Дякую!"],
    [6, "6b", "answer", "Мене звати Максим."],
    [7, "7a", "answer", "Добрий день!"],
    [8, "8c", "answer", "S’il te plaît ou de rien selon le contexte."],
    [9, "9d", "classification", "кіт et сік ; кит, рис et сир"],
    [13, "13a", "answer", "Привіт! Мене звати Максим."],
  ] as const) {
    assert.equal(field(number, itemId, fieldId, value).status, "pending");
  }
  const result = gradeExercise(
    definition(6),
    answers({
      "6a": { answer: "Je m’appelle Anna." },
      "6b": { answer: "Мене звати Максим." },
      "6c": { answer: "Le prénom change." },
    }),
  );
  assert.equal(result.status, "pending");
});

test("unanswered fields and an unsupported content version never receive premature model answers", () => {
  const missing = gradeExercise(definition(3), {});
  assert.equal(missing.status, "pending");
  assert.ok(
    missing.items.every((item) =>
      item.fields.every(
        (field) => field.status === "pending" && field.expected === undefined,
      ),
    ),
  );
  for (const changed of [
    { ...definition(3), version: 2 },
    { ...definition(3), moduleId: "02" },
  ]) {
    const result = gradeExercise(changed, answers({ "3a": { word: "тато" } }));
    assert.equal(result.status, "pending");
    assert.ok(
      result.items.every((item) =>
        item.fields.every((field) => field.expected === undefined),
      ),
    );
  }
});

test("the declared assistance is preserved and does not change correction of a written response", () => {
  const input = answers({ "3a": { word: "тато" } });
  const withoutHelp = gradeExercise(definition(3), input);
  input["3a"]!.aid = "correction";
  const withHelp = gradeExercise(definition(3), input);
  assert.deepEqual(withHelp, withoutHelp);
  assert.equal(input["3a"]!.aid, "correction");
});
