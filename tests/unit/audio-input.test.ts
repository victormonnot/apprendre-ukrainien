import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { audioGroups, findAudioSegment } from "../../src/content/audio.ts";
import { cafeScenes } from "../../src/content/scenes.ts";
import { audioByteRange } from "../../src/lib/server/audio-range.ts";
import {
  AudioInputError,
  resolveAudioText,
  validateAudioCommand,
} from "../../src/lib/server/audio-input.ts";
import type { ReviewAttemptView } from "../../src/lib/review-types.ts";
import type { LanguageResult } from "../../src/lib/language-types.ts";
import { prepareDocument } from "../../src/lib/markdown.ts";

const context = { getResult: () => null, getActiveReview: () => null };
test("listening segments keep the existing Ukrainian words and explicit course origins", () => {
  const segments = audioGroups.flatMap((group) => group.segments);
  assert.equal(segments.length, 22);
  assert.equal(new Set(segments.map((segment) => segment.id)).size, 22);
  const source = readFileSync("src/content/modules/01/course.md", "utf8");
  for (const segment of segments) {
    assert.ok(segment.text.length > 0 && segment.text.length <= 1000);
    assert.equal(resolveAudioText(segment.source, context), segment.text);
    const [, , moduleId, view] = segment.sourceHref.split(/[\/#]/);
    const filename = view === "cours" ? "course" : "vocabulary";
    const { sections } = prepareDocument(
      readFileSync(`src/content/modules/${moduleId}/${filename}.md`, "utf8"),
    );
    assert.ok(
      sections.some(
        (section) => section.id === segment.sourceHref.split("#")[1],
      ),
    );
    if (segment.source.kind === "segment")
      assert.ok(source.includes(segment.text));
  }
  assert.equal(findAudioSegment("кава")?.id, "01-mot-kava");
  assert.equal(findAudioSegment("Привіт!")?.id, "01-expression-pryvit");
  assert.equal(findAudioSegment("Ии"), undefined);
  assert.equal(findAudioSegment("Un commentaire avec кава"), undefined);
});
test("audio commands accept only known shapes and never a client-controlled text or provider", () => {
  const valid = {
    source: { kind: "reference", elementId: "01-mot-kava" },
    voiceId: "macos-lesya",
  };
  assert.deepEqual(validateAudioCommand(valid), valid);
  for (const value of [
    null,
    [],
    { ...valid, text: "injected" },
    { ...valid, voiceId: "custom" },
    { ...valid, source: { kind: "reference", elementId: "../bad" } },
    {
      ...valid,
      source: {
        kind: "language",
        resultId: "id",
        entryIndex: -1,
        exampleIndex: null,
      },
    },
    {
      ...valid,
      source: {
        kind: "language",
        resultId: "id",
        entryIndex: 0,
        exampleIndex: 3,
      },
    },
  ])
    assert.throws(() => validateAudioCommand(value), AudioInputError);
  assert.throws(
    () =>
      resolveAudioText(
        { kind: "reference", elementId: "01-lettre-a" },
        context,
      ),
    AudioInputError,
  );
  assert.throws(
    () =>
      resolveAudioText(
        {
          kind: "language",
          resultId: "other-profile",
          entryIndex: 0,
          exampleIndex: null,
        },
        context,
      ),
    AudioInputError,
  );
});
test("audio of a review is available only for the revealed snapshot, without revealing a hidden answer", () => {
  const source = { kind: "review" as const, attemptId: "attempt" };
  const active: ReviewAttemptView = {
    id: "attempt",
    cardId: "card",
    elementId: "01-mot-kava",
    definitionVersion: 1,
    sourceHref: "/parcours/01/cours",
    direction: "production",
    status: "presented",
    prompt: "Rappel",
    cue: "café",
    cueLang: "fr",
    answerText: null,
    revealed: null,
  };
  assert.throws(
    () =>
      resolveAudioText(source, { ...context, getActiveReview: () => active }),
    AudioInputError,
  );
  const revealed: ReviewAttemptView = {
    ...active,
    status: "revealed",
    revealed: {
      answer: "кава",
      answerLang: "uk",
      details: "Référence",
      options: [],
    },
  };
  assert.equal(
    resolveAudioText(source, { ...context, getActiveReview: () => revealed }),
    "кава",
  );
  assert.throws(
    () =>
      resolveAudioText(
        { ...source, attemptId: "someone" },
        { ...context, getActiveReview: () => revealed },
      ),
    AudioInputError,
  );
  assert.equal(revealed.status, "revealed");
});
test("scene audio resolves only the exact published variant, version and line", () => {
  for (const scene of cafeScenes) {
    for (const line of scene.lines) {
      const command = {
        voiceId: "macos-lesya",
        source: {
          kind: "scene",
          sceneId: scene.id,
          variantId: scene.variantId,
          version: scene.version,
          lineId: line.id,
        },
      };
      const validated = validateAudioCommand(command);
      assert.deepEqual(validated, command);
      assert.equal(resolveAudioText(validated.source, context), line.ukrainian);
    }
  }
  const source = {
    kind: "scene" as const,
    sceneId: "01-cafe",
    variantId: "rencontre",
    version: 1,
    lineId: "anna-greeting",
  };
  assert.equal(resolveAudioText(source, context), "Добрий день!");
  assert.equal(
    resolveAudioText({ ...source, variantId: "retrouvailles" }, context),
    "Привіт!",
  );
  for (const changed of [
    { sceneId: "unknown" },
    { variantId: "unknown" },
    { version: 2 },
    { lineId: "unknown" },
  ])
    assert.throws(
      () => resolveAudioText({ ...source, ...changed }, context),
      (error: unknown) =>
        error instanceof AudioInputError && error.status === 404,
    );
});
test("scene audio rejects client text, missing fields and invalid versions", () => {
  const source = {
    kind: "scene",
    sceneId: "01-cafe",
    variantId: "rencontre",
    version: 1,
    lineId: "anna-greeting",
  };
  for (const invalid of [
    { ...source, text: "injected" },
    { ...source, sceneId: "../scene" },
    { ...source, variantId: "" },
    { ...source, lineId: null },
    { ...source, version: 0 },
    { ...source, version: -1 },
    { ...source, version: 1.5 },
    { ...source, version: "1" },
    { ...source, version: Number.MAX_SAFE_INTEGER + 1 },
    { ...source, version: undefined },
    { kind: "scene", sceneId: "01-cafe", lineId: "anna-greeting" },
  ])
    assert.throws(
      () => validateAudioCommand({ source: invalid, voiceId: "macos-lesya" }),
      AudioInputError,
    );
});
test("audio of generated examples resolves the exact saved text without accepting another source", () => {
  const result = {
    content: {
      entries: [{ ukrainian: "кава", examples: [{ ukrainian: "Це кава." }] }],
    },
  } as LanguageResult;
  const source = {
    kind: "language" as const,
    resultId: "saved",
    entryIndex: 0,
    exampleIndex: 0,
  };
  const owned = {
    ...context,
    getResult: (id: string) => (id === "saved" ? result : null),
  };
  assert.equal(resolveAudioText(source, owned), "Це кава.");
  assert.equal(
    resolveAudioText({ ...source, exampleIndex: null }, owned),
    "кава",
  );
  assert.throws(
    () => resolveAudioText({ ...source, entryIndex: 1 }, owned),
    AudioInputError,
  );
});
test("media byte ranges support seeking and reject malformed or unsatisfiable ranges", () => {
  assert.equal(audioByteRange(null, 100), null);
  assert.deepEqual(audioByteRange("bytes=0-1", 100), { start: 0, end: 1 });
  assert.deepEqual(audioByteRange("bytes=50-", 100), { start: 50, end: 99 });
  assert.deepEqual(audioByteRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.deepEqual(audioByteRange("bytes=0-200", 100), { start: 0, end: 99 });
  for (const header of [
    "bytes=100-",
    "bytes=10-1",
    "bytes=-",
    "bytes=-0",
    "bytes=0-1,5-6",
    "bytes=100000000000000000000-",
    "wat=0-1",
  ])
    assert.equal(audioByteRange(header, 100), "invalid");
});
