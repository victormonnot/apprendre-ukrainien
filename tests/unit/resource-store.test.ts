import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { getScene } from "../../src/content/scenes.ts";
import type {
  LearningResource,
  ResourceCommand,
} from "../../src/lib/resource-types.ts";
import {
  ResourceInputError,
  validateResourceCommand,
} from "../../src/lib/server/resource-input.ts";
import { openLearningStore } from "../../src/lib/server/learning-store.ts";
import { openAudioStore } from "../../src/lib/server/audio-store.ts";
import { openSceneStore } from "../../src/lib/server/scene-store.ts";
import {
  openResourceStore,
  ResourceConflictError,
  ResourceRequestConflictError,
} from "../../src/lib/server/resource-store.ts";

const resource: LearningResource = {
  id: "ulp-001",
  moduleId: "01",
  title: "Salutations",
  author: "Ukrainian Lessons",
  kind: "podcast",
  description: "Une écoute guidée.",
  language: "ukrainien et anglais",
  durationSeconds: 60,
  sourceUrl: "https://www.ukrainianlessons.com/episode1/",
  verifiedOn: "2026-09-25",
  objective: "Repérer une salutation.",
  steps: ["Écouter les salutations."],
  connections: [{ label: "Cours", href: "/parcours/01/cours" }],
  media: { kind: "audio", url: "https://media.example.test/episode1.mp3" },
};
const otherResource = { ...resource, id: "ulp-003" };
const guide: LearningResource = {
  ...resource,
  id: "ul-expressions",
  kind: "guide",
  media: null,
};

function notes(
  notes = "Мої нотатки",
  expectedRevision = 0,
  requestId = randomUUID(),
): ResourceCommand {
  return {
    type: "save-notes",
    requestId,
    resourceId: resource.id,
    expectedRevision,
    notes,
  };
}
function position(
  positionSeconds: number | null,
  expectedRevision = 0,
  requestId = randomUUID(),
): ResourceCommand {
  return {
    type: "save-position",
    requestId,
    resourceId: resource.id,
    expectedRevision,
    positionSeconds,
  };
}
function opening(requestId = randomUUID()): ResourceCommand {
  return { type: "open", requestId, resourceId: resource.id };
}

function fixture(t: TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), "ukrainian-resources-"));
  const handles: { close(): void }[] = [];
  let timestamp = "2026-09-25T10:00:00.000Z";
  t.after(() => {
    for (const handle of handles.reverse()) handle.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    directory,
    now: () => new Date(timestamp),
    setTime(value: string) {
      timestamp = value;
    },
    profile() {
      const learning = openLearningStore(directory);
      try {
        return learning.getLocalUserId();
      } finally {
        learning.close();
      }
    },
    open() {
      const store = openResourceStore(directory, {
        now: () => new Date(timestamp),
      });
      handles.push(store);
      return store;
    },
    inspect() {
      const database = new DatabaseSync(
        path.join(directory, "learning.sqlite3"),
      );
      handles.push(database);
      return database;
    },
  };
}

test("resource reads start blank and never record an opening or learning activity", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const database = context.inspect();
  const before = database.prepare("SELECT * FROM learning_events").all();
  const store = context.open();
  const workspace = store.getWorkspace(userId, resource);
  assert.deepEqual(workspace.state, {
    resourceId: resource.id,
    notes: "",
    notesRevision: 0,
    positionSeconds: null,
    positionRevision: 0,
    openedAt: null,
    updatedAt: null,
  });
  workspace.resource.steps.push("Local mutation");
  assert.deepEqual(store.getWorkspace(userId, resource).resource, resource);
  for (const table of ["resource_states", "resource_requests"])
    assert.equal(
      database.prepare(`SELECT count(*) AS count FROM ${table}`).get()!.count,
      0,
    );
  assert.deepEqual(
    database.prepare("SELECT * FROM learning_events").all(),
    before,
  );
});

test("exact notes and fractional playback positions persist across a restart", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = openResourceStore(context.directory, { now: context.now });
  const text = "  Bonjour\n\nДобрий день!\nе\u0301\t  ";
  store.applyCommand(userId, resource, notes(text));
  const saved = store.applyCommand(userId, resource, position(12.75));
  assert.equal(saved.state.notes, text);
  assert.equal(saved.state.notesRevision, 1);
  assert.equal(saved.state.positionSeconds, 12.75);
  assert.equal(saved.state.positionRevision, 1);
  assert.equal(saved.state.updatedAt, context.now().toISOString());
  assert.equal(saved.state.openedAt, null);
  store.close();
  assert.deepEqual(context.open().getWorkspace(userId, resource), saved);
});

test("notes and playback positions use independent revisions across connections", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const first = context.open();
  const second = context.open();
  first.applyCommand(userId, resource, notes("A note"));
  const bookmarked = second.applyCommand(userId, resource, position(19));
  assert.equal(bookmarked.state.notes, "A note");
  assert.equal(bookmarked.state.notesRevision, 1);
  assert.equal(bookmarked.state.positionRevision, 1);
  const noted = first.applyCommand(userId, resource, notes("A newer note", 1));
  assert.equal(noted.state.positionSeconds, 19);
  assert.equal(noted.state.positionRevision, 1);
  assert.equal(noted.state.notesRevision, 2);
  const cleared = second.applyCommand(userId, resource, position(null, 1));
  assert.equal(cleared.state.notes, "A newer note");
  assert.equal(cleared.state.positionSeconds, null);
  assert.equal(cleared.state.positionRevision, 2);
});

test("stale notes and positions expose current workspace without overwriting", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  store.applyCommand(userId, resource, notes("Existing"));
  const current = store.applyCommand(userId, resource, position(5));
  for (const command of [notes("Overwrite"), position(10)])
    assert.throws(
      () => store.applyCommand(userId, resource, command),
      (error: unknown) => {
        assert.ok(error instanceof ResourceConflictError);
        assert.deepEqual(error.currentWorkspace, current);
        return true;
      },
    );
  assert.deepEqual(store.getWorkspace(userId, resource), current);
  assert.equal(
    context
      .inspect()
      .prepare("SELECT count(*) AS count FROM resource_requests")
      .get()!.count,
    2,
  );
});

test("explicit openings only change openedAt and idempotent retries do not reopen", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  store.applyCommand(userId, resource, notes());
  const before = store.applyCommand(userId, resource, position(3));
  const request = opening();
  context.setTime("2026-09-26T10:00:00.000Z");
  const opened = store.applyCommand(userId, resource, request);
  assert.deepEqual(opened, {
    ...before,
    state: { ...before.state, openedAt: context.now().toISOString() },
  });
  context.setTime("2026-09-27T10:00:00.000Z");
  assert.deepEqual(store.applyCommand(userId, resource, request), opened);
  const next = store.applyCommand(userId, resource, opening());
  assert.equal(next.state.openedAt, context.now().toISOString());
  assert.equal(next.state.updatedAt, before.state.updatedAt);
});

test("lost response retries survive restart and return newer state before revision checks", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = openResourceStore(context.directory, { now: context.now });
  const noteRequest = notes("Saved once");
  const positionRequest = position(7);
  store.applyCommand(userId, resource, noteRequest);
  const saved = store.applyCommand(userId, resource, positionRequest);
  store.close();
  context.setTime("2026-09-26T10:00:00.000Z");
  const reopened = context.open();
  assert.deepEqual(reopened.applyCommand(userId, resource, noteRequest), saved);
  assert.deepEqual(
    reopened.applyCommand(userId, resource, positionRequest),
    saved,
  );
  reopened.applyCommand(userId, resource, notes("Newer text", 1));
  const newer = reopened.applyCommand(userId, resource, position(9, 1));
  assert.deepEqual(reopened.applyCommand(userId, resource, noteRequest), newer);
  assert.deepEqual(
    reopened.applyCommand(userId, resource, positionRequest),
    newer,
  );
  assert.equal(
    context
      .inspect()
      .prepare("SELECT count(*) AS count FROM resource_requests")
      .get()!.count,
    4,
  );
});

test("request identifier reuse with modified text, action, revision or resource is a conflict", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const requestId = randomUUID();
  const saved = store.applyCommand(
    userId,
    resource,
    notes("Original", 0, requestId),
  );
  for (const command of [
    notes("Changed", 0, requestId),
    notes("Original", 1, requestId),
    position(7, 0, requestId),
    opening(requestId),
  ])
    assert.throws(
      () => store.applyCommand(userId, resource, command),
      (error: unknown) => {
        assert.ok(error instanceof ResourceRequestConflictError);
        assert.deepEqual(error.currentWorkspace, saved);
        return true;
      },
    );
  assert.throws(
    () =>
      store.applyCommand(userId, otherResource, {
        ...notes("Original", 0, requestId),
        resourceId: otherResource.id,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ResourceRequestConflictError);
      assert.equal(error.currentWorkspace.resource.id, otherResource.id);
      assert.equal(error.currentWorkspace.state.notesRevision, 0);
      return true;
    },
  );
  assert.deepEqual(store.getWorkspace(userId, resource), saved);
});

test("resource and profile ownership isolate notes, positions and retry identifiers", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const otherUserId = randomUUID();
  context
    .inspect()
    .prepare("INSERT INTO profiles (id, created_at) VALUES (?, ?)")
    .run(otherUserId, context.now().toISOString());
  const store = context.open();
  const request = notes("Private note");
  const first = store.applyCommand(userId, resource, request);
  assert.equal(store.getWorkspace(otherUserId, resource).state.notes, "");
  assert.equal(store.getWorkspace(userId, otherResource).state.notes, "");
  store.applyCommand(otherUserId, resource, request);
  store.applyCommand(userId, otherResource, {
    ...notes("Other resource"),
    resourceId: otherResource.id,
  });
  store.applyCommand(otherUserId, resource, notes("Other profile", 1));
  assert.deepEqual(store.getWorkspace(userId, resource), first);
  assert.throws(
    () => store.applyCommand(randomUUID(), resource, opening()),
    /FOREIGN KEY/,
  );
  assert.throws(
    () => store.applyCommand(userId, otherResource, notes()),
    ResourceInputError,
  );
});

test("media bookmarks accept advertised-duration drift and guides only permit clearing", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  assert.equal(
    store.applyCommand(userId, resource, position(90)).state.positionSeconds,
    90,
  );
  assert.equal(
    store.applyCommand(userId, resource, position(86400, 1)).state
      .positionSeconds,
    86400,
  );
  assert.equal(
    store.applyCommand(userId, resource, position(0, 2)).state.positionSeconds,
    0,
  );
  assert.throws(
    () =>
      store.applyCommand(userId, guide, {
        ...position(0),
        resourceId: guide.id,
      }),
    ResourceInputError,
  );
  const cleared = store.applyCommand(userId, guide, {
    ...position(null),
    resourceId: guide.id,
  });
  assert.equal(cleared.state.positionSeconds, null);
});

test("input validation rejects forged metadata, invalid revisions and unbounded values", () => {
  for (const value of [
    null,
    [],
    {},
    { ...notes(), extra: true },
    { ...notes(), userId: "other" },
    { ...notes(), requestId: "not-a-uuid" },
    { ...notes(), resourceId: "../private" },
    { ...notes(), type: "assess" },
    { ...notes(), expectedRevision: -1 },
    { ...notes(), expectedRevision: 1.5 },
    { ...notes(), expectedRevision: Number.MAX_SAFE_INTEGER },
    { ...notes(), notes: [] },
    { ...notes(), notes: "x".repeat(10001) },
    { ...opening(), expectedRevision: 0 },
    { ...position(0), positionSeconds: undefined },
    { ...position(0), positionSeconds: "5" },
    position(-1),
    position(Infinity),
    position(NaN),
    position(86400.1),
  ])
    assert.throws(() => validateResourceCommand(value), ResourceInputError);
  const max = notes("x".repeat(10000));
  assert.deepEqual(validateResourceCommand(max), max);
  assert.deepEqual(
    validateResourceCommand(position(null)).type,
    "save-position",
  );
});

test("database guards prevent request tampering and resetting resource revision history", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  store.applyCommand(userId, resource, notes());
  const saved = store.applyCommand(userId, resource, position(4));
  const database = context.inspect();
  for (const statement of [
    "UPDATE resource_requests SET command = '{}'",
    "DELETE FROM resource_requests",
    "UPDATE resource_states SET resource_id = 'other'",
    "UPDATE resource_states SET notes_revision = 0",
    "UPDATE resource_states SET position_revision = 0",
    "UPDATE resource_states SET notes = 'Forged'",
    "UPDATE resource_states SET position_seconds = 5",
    "DELETE FROM resource_states",
  ])
    assert.throws(
      () => database.exec(statement),
      /immutable|cannot be deleted|revisions must advance/,
    );
  assert.deepEqual(store.getWorkspace(userId, resource), saved);
});

test("resource use never infers mastery or changes practice and review history", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const database = context.inspect();
  const tables = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'resource_%' AND name NOT LIKE 'sqlite_%'",
    )
    .all() as { name: string }[];
  const snapshots = tables.map(({ name }) => ({
    name,
    rows: database.prepare(`SELECT * FROM ${name}`).all(),
  }));
  const store = context.open();
  store.getWorkspace(userId, resource);
  store.applyCommand(userId, resource, opening());
  store.applyCommand(userId, resource, notes());
  store.applyCommand(userId, resource, position(10));
  for (const snapshot of snapshots)
    assert.deepEqual(
      database.prepare(`SELECT * FROM ${snapshot.name}`).all(),
      snapshot.rows,
      snapshot.name,
    );
});

test("migration seven preserves previous notes, audio, scene answers and migration checksums", (t) => {
  const context = fixture(t);
  const migrationsDirectory = path.join(context.directory, "old-migrations");
  mkdirSync(migrationsDirectory);
  for (const filename of [
    "001_learning.sql",
    "002_exercises.sql",
    "003_reviews.sql",
    "004_language.sql",
    "005_audio.sql",
    "006_scenes.sql",
  ])
    copyFileSync(
      path.join(process.cwd(), "migrations", filename),
      path.join(migrationsDirectory, filename),
    );
  const options = { migrationsDirectory, now: context.now };
  const learning = openLearningStore(context.directory, options);
  const userId = learning.getLocalUserId();
  learning.saveNote(userId, "01", "cours", "Ma note avant les ressources", 0);
  learning.saveCheckpoint(userId, "01", "cours", "premiers-mots");
  learning.close();
  const audio = openAudioStore(context.directory, options);
  const bytes = new Uint8Array(417);
  bytes.set([0xff, 0xfb, 0x90, 0]);
  audio.saveClip(
    userId,
    {
      text: "Добрий день!",
      voiceId: "macos-lesya",
      voiceLabel: "Lesya",
      provider: "macos",
      model: "macos-lesya-v1",
      instructionsVersion: 1,
    },
    bytes,
    "audio/mpeg",
  );
  audio.close();
  const scene = getScene("01-cafe", "rencontre")!;
  const sceneStore = openSceneStore(context.directory, options);
  const line = scene.lines.find((line) => line.speakerId === "maxime")!;
  sceneStore.applyCommand(userId, scene, {
    type: "save",
    requestId: randomUUID(),
    sceneId: scene.id,
    variantId: scene.variantId,
    version: scene.version,
    roleId: "maxime",
    expectedRevision: 0,
    answers: { [line.id]: "  Моя відповідь  " },
    helpUsed: true,
  });
  sceneStore.close();
  const database = context.inspect();
  const history = database
    .prepare("SELECT * FROM schema_migrations ORDER BY version")
    .all();
  const snapshots = (
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations'",
      )
      .all() as { name: string }[]
  ).map(({ name }) => ({
    name,
    rows: database.prepare(`SELECT * FROM ${name}`).all(),
  }));
  context.open().applyCommand(userId, resource, notes());
  for (const snapshot of snapshots)
    assert.deepEqual(
      database.prepare(`SELECT * FROM ${snapshot.name}`).all(),
      snapshot.rows,
      snapshot.name,
    );
  assert.deepEqual(
    database
      .prepare(
        "SELECT * FROM schema_migrations WHERE version <= 6 ORDER BY version",
      )
      .all(),
    history,
  );
  assert.equal(
    database.prepare("SELECT count(*) AS count FROM schema_migrations").get()!
      .count,
    8,
  );
});
