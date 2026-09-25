import assert from "node:assert/strict";
import test from "node:test";
import { prepareDocument } from "../../src/lib/markdown.ts";

test("a saved section remains addressable after its title changes", () => {
  const before = prepareDocument(
    "# Cours\n\n## Lire des mots {#lecture}\n\nTexte.",
  );
  const after = prepareDocument(
    "# Cours enrichi\n\n## Comprendre un nouveau mot {#lecture}\n\nTexte enrichi.",
  );
  assert.equal(before.sections[0]?.id, after.sections[0]?.id);
  assert.equal(after.sections[0]?.title, "Comprendre un nouveau mot");
});

test("duplicate section identifiers fail rather than misdirect a saved checkpoint", () => {
  assert.throws(
    () => prepareDocument("# Cours\n\n## Un {#lecture}\n\n## Deux {#lecture}"),
    /Duplicate/,
  );
});
