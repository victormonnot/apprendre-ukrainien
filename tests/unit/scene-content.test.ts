import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cafeScenes, getScene } from "../../src/content/scenes.ts";
import { getReviewElement } from "../../src/content/reviews.ts";
import { prepareDocument } from "../../src/lib/markdown.ts";

test("the two café variants keep the same module scope and four turns per role", () => {
  assert.deepEqual(
    cafeScenes.map((scene) => [scene.id, scene.variantId, scene.version]),
    [
      ["01-cafe", "rencontre", 1],
      ["01-cafe", "retrouvailles", 1],
    ],
  );
  const course = readFileSync("src/content/modules/01/course.md", "utf8");
  const vocabulary = readFileSync(
    "src/content/modules/01/vocabulary.md",
    "utf8",
  );
  const { sections } = prepareDocument(course);
  for (const scene of cafeScenes) {
    assert.equal(scene.moduleId, "01");
    assert.equal(scene.lines.length, 8);
    assert.equal(new Set(scene.lines.map((line) => line.id)).size, 8);
    assert.deepEqual(
      scene.characters.map((character) => character.id),
      ["anna", "maxime"],
    );
    for (const character of scene.characters)
      assert.equal(
        scene.lines.filter((line) => line.speakerId === character.id).length,
        4,
      );
    assert.ok(
      sections.some((section) => section.id === scene.sourceHref.split("#")[1]),
    );
    for (const line of scene.lines) {
      assert.ok(
        course.includes(line.ukrainian) || vocabulary.includes(line.ukrainian),
      );
      assert.ok(line.ukrainian.length <= 1000);
      assert.ok(!line.ukrainian.includes("\u0301"));
      assert.ok(line.direction && line.prompt && line.french);
      assert.ok(line.help.includes("Accent tonique :"));
      assert.ok(line.help.includes("Repère français approximatif :"));
      assert.ok(line.help.includes("**"));
      assert.ok(line.referenceIds.length > 0);
      for (const referenceId of line.referenceIds) {
        const reference = getReviewElement(referenceId);
        assert.ok(reference);
        assert.equal(reference.kind, "expression");
        assert.equal(reference.moduleId, "01");
        if (reference.id !== "01-expression-mene-zvaty") {
          assert.equal(line.ukrainian, reference.label);
          assert.equal(line.help, reference.cards[0]!.details);
        }
      }
    }
  }
});

test("version 1 keeps its published dialogue and resolves explicit versions only", () => {
  assert.deepEqual(
    getScene("01-cafe", "rencontre", 1)!.lines.map((line) => [
      line.id,
      line.ukrainian,
    ]),
    [
      ["anna-greeting", "Добрий день!"],
      ["maxime-greeting", "Добрий день!"],
      ["anna-introduction", "Мене звати Анна."],
      ["maxime-introduction", "Мене звати Максим."],
      ["anna-thanks", "Дякую!"],
      ["maxime-welcome", "Будь ласка."],
      ["anna-goodbye", "До побачення!"],
      ["maxime-goodbye", "До побачення!"],
    ],
  );
  assert.deepEqual(
    getScene("01-cafe", "retrouvailles", 1)!.lines.map((line) => [
      line.id,
      line.ukrainian,
    ]),
    [
      ["maxime-greeting", "Привіт!"],
      ["anna-greeting", "Привіт!"],
      ["maxime-introduction", "Мене звати Максим."],
      ["anna-introduction", "Мене звати Анна."],
      ["maxime-thanks", "Дякую!"],
      ["anna-welcome", "Будь ласка."],
      ["maxime-goodbye", "До побачення!"],
      ["anna-goodbye", "До побачення!"],
    ],
  );
  assert.equal(getScene("01-cafe", "rencontre"), cafeScenes[0]);
  for (const version of [0, 2, -1, 1.5, NaN])
    assert.equal(getScene("01-cafe", "rencontre", version), undefined);
  assert.equal(getScene("02-cafe", "rencontre", 1), undefined);
  assert.equal(getScene("01-cafe", "unknown", 1), undefined);
});

test("resolved definitions cannot mutate a published scene or another variant", () => {
  const scene = getScene("01-cafe", "rencontre", 1)!;
  const before = JSON.stringify(cafeScenes);
  assert.ok(Object.isFrozen(cafeScenes));
  assert.ok(Object.isFrozen(scene));
  assert.ok(Object.isFrozen(scene.characters));
  assert.ok(Object.isFrozen(scene.lines));
  assert.throws(() => {
    scene.title = "Changed";
  }, TypeError);
  assert.throws(() => {
    scene.characters[0]!.name = "Changed";
  }, TypeError);
  assert.throws(() => {
    scene.lines[0]!.ukrainian = "Changed";
  }, TypeError);
  assert.throws(() => {
    scene.lines[0]!.referenceIds.push("another");
  }, TypeError);
  assert.equal(JSON.stringify(cafeScenes), before);
});
