import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getReviewCard,
  getReviewElement,
  reviewElements,
} from "../../src/content/reviews.ts";

const course = readFileSync(
  new URL("../../src/content/modules/01/course.md", import.meta.url),
  "utf8",
);
const vocabulary = readFileSync(
  new URL("../../src/content/modules/01/vocabulary.md", import.meta.url),
  "utf8",
);

function section(markdown: string, anchor: string) {
  const heading = new RegExp(`^## .+\\{#${anchor}\\}$`, "m").exec(markdown);
  assert.ok(heading, `Missing source heading: ${anchor}`);
  return markdown.slice(heading.index + heading[0].length).split(/\n## /)[0]!;
}

function tableLabels(markdown: string) {
  return Array.from(markdown.matchAll(/^\|\s*([^|]+?)\s*\|/gm))
    .map((match) => match[1]!.trim())
    .filter((label) => /\p{Script=Cyrillic}/u.test(label));
}

test("review content covers the priority alphabet and the words taught in the module", () => {
  const priorityLetters = course.match(/\*\*(А а ·.+)\*\*/)?.[1]?.split(" · ");
  assert.ok(priorityLetters);
  assert.deepEqual(
    reviewElements
      .filter((element) => element.kind === "letter")
      .map((element) => element.label),
    priorityLetters,
  );
  const taughtWords = [
    "premiers-mots",
    "expressions",
    "mots-complementaires",
  ].flatMap((anchor) => tableLabels(section(vocabulary, anchor)));
  assert.deepEqual(
    reviewElements
      .filter((element) => element.kind !== "letter")
      .map((element) => element.label),
    taughtWords,
  );
  assert.equal(reviewElements.length, 31);
  assert.equal(reviewElements.flatMap((element) => element.cards).length, 50);
});

test("learning item and card identifiers are unique and independent of editable wording", () => {
  const expectedIds = [
    "lettre-a",
    "lettre-m",
    "lettre-t",
    "lettre-o",
    "lettre-k",
    "lettre-n",
    "lettre-v",
    "lettre-s",
    "lettre-r",
    "lettre-ou",
    "lettre-i",
    "lettre-y",
    "mot-kava",
    "mot-mova",
    "mot-kit",
    "mot-mama",
    "mot-tato",
    "mot-tut",
    "mot-tam",
    "expression-pryvit",
    "expression-dobryi-den",
    "expression-diakuiu",
    "expression-bud-laska",
    "expression-tak",
    "expression-ni",
    "expression-do-pobachennia",
    "expression-mene-zvaty",
    "mot-kyt",
    "mot-sik",
    "mot-rys",
    "mot-syr",
  ].map((id) => `01-${id}`);
  assert.deepEqual(
    reviewElements.map((element) => element.id),
    expectedIds,
  );
  const cardIds = new Set<string>();
  for (const element of reviewElements) {
    assert.equal(element.moduleId, "01");
    assert.equal(getReviewElement(element.id), element);
    assert.deepEqual(
      element.cards.map((card) => card.direction),
      element.kind === "letter"
        ? ["recognition"]
        : ["comprehension", "production"],
    );
    for (const card of element.cards) {
      assert.equal(card.id, `${element.id}-${card.direction}`);
      assert.equal(card.elementId, element.id);
      assert.equal(card.version, 1);
      assert.ok(!cardIds.has(card.id));
      cardIds.add(card.id);
      assert.equal(getReviewCard(card.id), card);
    }
  }
  for (const invalid of [
    "constructor",
    "__proto__",
    "../01-mot-kava",
    "02-mot-kava",
  ]) {
    assert.equal(getReviewElement(invalid), undefined);
    assert.equal(getReviewCard(invalid), undefined);
  }
});

test("every source link returns to the passage that introduces the item", () => {
  for (const element of reviewElements) {
    const match = /^\/parcours\/01\/(cours|vocabulaire)#([a-z-]+)$/.exec(
      element.sourceHref,
    );
    assert.ok(match, element.sourceHref);
    const sourceSection = section(
      match[1] === "cours" ? course : vocabulary,
      match[2]!,
    );
    assert.ok(
      sourceSection.includes(element.label),
      `${element.label} is absent from ${element.sourceHref}`,
    );
    assert.doesNotMatch(element.sourceHref, /exercice/);
  }
});

test("fronts use ordinary spelling while stress and approximate reading remain on the back", () => {
  for (const element of reviewElements) {
    for (const card of element.cards) {
      assert.doesNotMatch(`${card.prompt} ${card.cue}`, /\*|\u0301|<strong>/);
      assert.ok(card.prompt.trim());
      assert.ok(card.answer.trim());
      if (element.kind === "letter") {
        assert.equal(card.cue, element.label);
        assert.equal(card.cueLang, "uk");
        assert.equal(card.answerLang, "fr");
        assert.match(card.prompt, /son.*dans un mot/);
        assert.match(card.details, /ne vérifie pas ta prononciation/);
        continue;
      }
      assert.match(
        card.details,
        /Accent tonique : .*\*\*[\p{Script=Cyrillic}]+\*\*/u,
      );
      assert.match(card.details, /syllabe|2e de мене ; 1re de звати/);
      assert.match(card.details, /Repère français approximatif/);
      const syllables = card.details
        .split(" — ")[0]!
        .replace("Accent tonique : ", "")
        .replaceAll("**", "")
        .replaceAll("-", "");
      assert.equal(
        syllables,
        element.label.replace(/[!?.…]/g, "").toLowerCase(),
      );
      if (card.direction === "comprehension") {
        assert.equal(card.cue, element.label);
        assert.equal(card.cueLang, "uk");
        assert.equal(card.answerLang, "fr");
      } else {
        assert.equal(card.answer, element.label);
        assert.equal(card.cueLang, "fr");
        assert.equal(card.answerLang, "uk");
        assert.doesNotMatch(card.cue, /\p{Script=Cyrillic}/u);
      }
    }
  }
});

test("ambiguous meanings and registers have explicit contexts before answering", () => {
  assert.match(getReviewCard("01-mot-kava-production")!.cue, /boisson/);
  assert.match(getReviewCard("01-mot-mova-production")!.cue, /langage/);
  assert.match(getReviewCard("01-mot-kit-production")!.cue, /mâle/);
  assert.match(
    getReviewCard("01-expression-pryvit-production")!.cue,
    /saluer un ami/,
  );
  assert.match(
    getReviewCard("01-expression-dobryi-den-production")!.cue,
    /journée, registre poli ou neutre/,
  );
  assert.match(
    getReviewCard("01-expression-bud-laska-comprehension")!.prompt,
    /vient de te remercier/,
  );
  assert.equal(
    getReviewCard("01-expression-bud-laska-comprehension")!.answer,
    "De rien.",
  );
  assert.match(
    getReviewCard("01-expression-bud-laska-production")!.cue,
    /demande/,
  );
  assert.match(
    getReviewCard("01-expression-mene-zvaty-production")!.cue,
    /modèle avant le prénom/,
  );
  assert.doesNotMatch(
    JSON.stringify(reviewElements),
    /genanki|\.apkg|Sessions\/|Anki\//,
  );
});
