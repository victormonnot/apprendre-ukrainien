import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getModule } from "../../src/content/catalog.ts";
import { getResource, learningResources } from "../../src/content/resources.ts";
import { prepareDocument } from "../../src/lib/markdown.ts";

test("resources retain stable identifiers and public publisher attribution", () => {
  assert.deepEqual(
    learningResources.map((resource) => resource.id),
    ["ul-alphabet", "ulp-001", "ulp-003", "ul-expressions"],
  );
  assert.equal(
    new Set(learningResources.map((resource) => resource.id)).size,
    learningResources.length,
  );
  for (const resource of learningResources) {
    assert.equal(getResource(resource.id), resource);
    assert.ok(resource.author.includes("Ukrainian Lessons"));
    const source = new URL(resource.sourceUrl);
    assert.equal(source.protocol, "https:");
    assert.equal(source.hostname, "www.ukrainianlessons.com");
    assert.equal(source.username, "");
    assert.equal(source.password, "");
    assert.equal(resource.language, "Ukrainien · explications en anglais");
    assert.equal(resource.verifiedOn, "2026-09-25");
    assert.ok(resource.objective && resource.description);
    assert.equal(resource.steps.length, 3);
    assert.ok(
      resource.durationSeconds === null ||
        (Number.isInteger(resource.durationSeconds) &&
          resource.durationSeconds > 0),
    );
  }
  assert.equal(getResource("unknown"), undefined);
  assert.equal(getResource("__proto__"), undefined);
});

test("every resource connects to existing course material and valid section anchors", () => {
  for (const resource of learningResources) {
    const courseModule = getModule(resource.moduleId);
    assert.ok(courseModule);
    assert.ok(resource.connections.length > 0);
    for (const connection of resource.connections) {
      const url = new URL(connection.href, "http://localhost");
      const [, parcours, moduleId, view] = url.pathname.split("/");
      assert.equal(parcours, "parcours");
      assert.equal(moduleId, courseModule.id);
      const document = courseModule.documents.find(
        (document) => document.view === view,
      );
      assert.ok(document);
      const markdown = readFileSync(
        `src/content/modules/${courseModule.id}/${document.filename}`,
        "utf8",
      );
      const { sections } = prepareDocument(markdown);
      assert.ok(
        url.hash && sections.some((section) => `#${section.id}` === url.hash),
        connection.href,
      );
    }
  }
});

test("media use only the published video and podcast endpoints; the guide stays a source link", () => {
  assert.deepEqual(getResource("ul-alphabet")!.media, {
    kind: "youtube",
    videoId: "ksXIXj7CXwc",
  });
  for (const [id, episode] of [
    ["ulp-001", "5566339"],
    ["ulp-003", "5566333"],
  ] as const) {
    const resource = getResource(id)!;
    assert.equal(resource.kind, "podcast");
    assert.equal(resource.media?.kind, "audio");
    if (resource.media?.kind !== "audio")
      assert.fail("Expected the official podcast audio endpoint");
    const audio = new URL(resource.media.url);
    assert.equal(audio.protocol, "https:");
    assert.equal(audio.hostname, "www.buzzsprout.com");
    assert.ok(audio.pathname.startsWith(`/1370836/episodes/${episode}-`));
    assert.ok(audio.pathname.endsWith(".mp3"));
    assert.equal(audio.search, "");
  }
  assert.equal(getResource("ul-expressions")!.media, null);
  assert.equal(getResource("ul-expressions")!.durationSeconds, null);
});
