import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  audioGroups,
  findAudioSegment,
  presentationSegments,
} from "../../src/content/audio.ts";
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
const module02Course = readFileSync(
  new URL("../../src/content/modules/02/course.md", import.meta.url),
  "utf8",
);
const module02Vocabulary = readFileSync(
  new URL("../../src/content/modules/02/vocabulary.md", import.meta.url),
  "utf8",
);
const module01Elements = reviewElements.filter(
  (element) => element.moduleId === "01",
);
const module02Elements = reviewElements.filter(
  (element) => element.moduleId === "02",
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
    module01Elements
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
    module01Elements
      .filter((element) => element.kind !== "letter")
      .map((element) => element.label),
    taughtWords,
  );
  assert.equal(module01Elements.length, 31);
  assert.equal(module01Elements.flatMap((element) => element.cards).length, 50);
});

test("module 01 learning item identifiers remain unchanged", () => {
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
    module01Elements.map((element) => element.id),
    expectedIds,
  );
});

test("module 02 reviews cover its five letters and fifteen taught words without duplicating module 01", () => {
  assert.deepEqual(
    module02Elements
      .filter((element) => element.kind === "letter")
      .map((element) => element.label),
    tableLabels(section(module02Vocabulary, "lettres")),
  );
  assert.deepEqual(
    module02Elements
      .filter((element) => element.kind !== "letter")
      .map((element) => element.label),
    ["pronoms", "personnes-et-metiers", "petits-mots"].flatMap((anchor) =>
      tableLabels(section(module02Vocabulary, anchor)),
    ),
  );
  assert.deepEqual(
    module02Elements.map((element) => element.id),
    [
      "lettre-d",
      "lettre-e",
      "lettre-zh",
      "lettre-ts",
      "lettre-ya",
      "mot-ya",
      "mot-ty",
      "mot-vin",
      "mot-vona",
      "mot-my",
      "mot-vy",
      "mot-vony",
      "mot-student",
      "mot-studentka",
      "mot-studenty",
      "mot-inzhener",
      "mot-inzhenerka",
      "mot-inzhenery",
      "mot-tse",
      "mot-ne",
    ].map((id) => `02-${id}`),
  );
  assert.equal(module02Elements.length, 20);
  assert.equal(module02Elements.flatMap((element) => element.cards).length, 35);
  assert.equal(reviewElements.length, 51);
  assert.equal(reviewElements.flatMap((element) => element.cards).length, 85);
  const previousLabels = new Set(
    module01Elements.map((element) => element.label),
  );
  for (const element of module02Elements) {
    assert.ok(!previousLabels.has(element.label), element.label);
    assert.notEqual(element.label, "воно");
  }
});

test("learning item and card identifiers are unique and independent of editable wording", () => {
  assert.equal(
    new Set(reviewElements.map((element) => element.id)).size,
    reviewElements.length,
  );
  const cardIds = new Set<string>();
  for (const element of reviewElements) {
    assert.ok(["01", "02"].includes(element.moduleId));
    assert.ok(element.id.startsWith(`${element.moduleId}-`));
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
    const match = /^\/parcours\/(01|02)\/(cours|vocabulaire)#([a-z-]+)$/.exec(
      element.sourceHref,
    );
    assert.ok(match, element.sourceHref);
    assert.equal(match[1], element.moduleId);
    const sources =
      match[1] === "01"
        ? { cours: course, vocabulaire: vocabulary }
        : { cours: module02Course, vocabulaire: module02Vocabulary };
    const sourceSection = section(
      sources[match[2] as keyof typeof sources],
      match[3]!,
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
      if (element.id === "02-mot-ne") {
        assert.match(card.details, /généralement sans accent propre/);
        assert.doesNotMatch(card.details, /\*\*не\*\*/);
      } else {
        assert.match(
          card.details,
          /Accent tonique : .*\*\*[\p{Script=Cyrillic}]+\*\*/u,
        );
      }
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

test("module 02 production cues distinguish subjects, politeness, gender, number and negation", () => {
  assert.match(getReviewCard("02-mot-ya-production")!.cue, /pronom sujet/);
  assert.match(getReviewCard("02-mot-ty-production")!.cue, /tutoies/);
  assert.match(getReviewCard("02-mot-vy-production")!.cue, /vouvoies/);
  assert.match(
    getReviewCard("02-mot-vy-comprehension")!.answer,
    /plusieurs personnes, ou une seule par politesse/,
  );
  for (const family of ["student", "inzhener"]) {
    assert.match(getReviewCard(`02-mot-${family}-production`)!.cue, /un homme/);
    assert.match(
      getReviewCard(`02-mot-${family}ka-production`)!.cue,
      /une femme/,
    );
    assert.match(
      getReviewCard(`02-mot-${family}y-production`)!.cue,
      /groupe masculin ou mixte/,
    );
  }
  assert.match(
    getReviewCard("02-mot-ne-production")!.cue,
    /devant le nom.*pas la réponse « non »/,
  );
  assert.match(
    getReviewCard("02-mot-tse-comprehension")!.details,
    /Ce n’est pas le verbe « être »/,
  );
});

test("module 02 listening material has separate groups and links to introduced course examples", () => {
  const oldGroupIds = ["words", "expressions", "presentation"];
  for (const id of oldGroupIds) {
    const group = audioGroups.find((entry) => entry.id === id)!;
    assert.ok(group);
    assert.ok(group.segments.every((segment) => segment.id.startsWith("01-")));
  }
  const words = audioGroups.find((group) => group.id === "02-words")!.segments;
  assert.deepEqual(
    words.map((segment) => segment.id),
    module02Elements
      .filter((element) => element.kind !== "letter")
      .map((element) => element.id),
  );
  const phrases = audioGroups.find(
    (group) => group.id === "02-phrases",
  )!.segments;
  assert.equal(phrases.length, 12);
  for (const segment of [...words, ...phrases]) {
    assert.equal(findAudioSegment(segment.text), segment);
    assert.equal(
      findAudioSegment(` ${segment.text.toLocaleLowerCase("uk")} `),
      segment,
    );
    assert.ok(segment.french.trim());
    const match = /^\/parcours\/02\/(cours|vocabulaire)#([a-z-]+)$/.exec(
      segment.sourceHref,
    );
    assert.ok(match, segment.sourceHref);
    assert.ok(
      section(
        match[1] === "cours" ? module02Course : module02Vocabulary,
        match[2]!,
      ).includes(segment.text),
      `${segment.text} is absent from ${segment.sourceHref}`,
    );
    if (segment.source.kind === "segment") {
      assert.equal(segment.source.segmentId, segment.id);
      assert.ok(presentationSegments.includes(segment));
    } else {
      assert.equal(segment.source.kind, "reference");
    }
  }
  assert.equal(findAudioSegment("Це кава.")?.id, "02-identifier-cafe");
  assert.equal(findAudioSegment("Це кава?"), undefined);
  assert.equal(findAudioSegment("Ти студент?")?.id, "02-question-etudiant");
  assert.equal(findAudioSegment("Ти студент."), undefined);
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
