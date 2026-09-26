import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { getScene } from "../../src/content/scenes.ts";
import type {
  SceneCommand,
  SceneDefinition,
  SceneRoleId,
} from "../../src/lib/scene-types.ts";
import {
  SceneInputError,
  validateSceneCommand,
} from "../../src/lib/server/scene-input.ts";
import { openLearningStore } from "../../src/lib/server/learning-store.ts";
import {
  openSceneStore,
  SceneConflictError,
  SceneRequestConflictError,
} from "../../src/lib/server/scene-store.ts";
import { openAudioStore } from "../../src/lib/server/audio-store.ts";

const scene = getScene("01-cafe", "rencontre")!;
const variation = getScene("01-cafe", "retrouvailles")!;

function answers(definition = scene, roleId: SceneRoleId = "maxime") {
  return Object.fromEntries(
    definition.lines
      .filter((line) => line.speakerId === roleId)
      .map((line) => [line.id, line.ukrainian]),
  );
}

function command(overrides: Partial<SceneCommand> = {}): SceneCommand {
  return {
    type: "submit",
    requestId: randomUUID(),
    sceneId: scene.id,
    variantId: scene.variantId,
    version: scene.version,
    roleId: "maxime",
    expectedRevision: 0,
    answers: answers(),
    helpUsed: false,
    ...overrides,
  };
}

function fixture(t: TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), "ukrainian-scenes-"));
  const resources: { close(): void }[] = [];
  let timestamp = "2026-09-25T10:00:00.000Z";
  t.after(() => {
    for (const resource of resources.reverse()) resource.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    directory,
    now: () => new Date(timestamp),
    setTime(value: string) {
      timestamp = value;
    },
    profile() {
      const store = openLearningStore(directory);
      try {
        return store.getLocalUserId();
      } finally {
        store.close();
      }
    },
    open() {
      const store = openSceneStore(directory, {
        now: () => new Date(timestamp),
      });
      resources.push(store);
      return store;
    },
    inspect() {
      const database = new DatabaseSync(
        path.join(directory, "learning.sqlite3"),
      );
      resources.push(database);
      return database;
    },
  };
}

test("scene drafts start blank and preserve exact text, assistance and revisions across restarts", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = openSceneStore(context.directory, { now: context.now });
  const empty = store.getWorkspace(userId, scene, "maxime");
  assert.equal(empty.draft.revision, 0);
  assert.equal(empty.draft.updatedAt, null);
  assert.deepEqual(Object.values(empty.draft.answers), ["", "", "", ""]);
  const firstId = Object.keys(empty.draft.answers)[0]!;
  const saved = store.applyCommand(
    userId,
    scene,
    command({
      type: "save",
      answers: { [firstId]: "  Добрий\nдень!  " },
      helpUsed: true,
    }),
  );
  assert.equal(saved.draft.answers[firstId], "  Добрий\nдень!  ");
  assert.equal(saved.draft.revision, 1);
  assert.equal(saved.draft.helpUsed, true);
  assert.equal(saved.draft.updatedAt, context.now().toISOString());
  store.close();
  const reopened = context.open();
  assert.deepEqual(reopened.getWorkspace(userId, scene, "maxime"), saved);
  const next = reopened.applyCommand(
    userId,
    scene,
    command({ type: "save", expectedRevision: 1, answers: {} }),
  );
  assert.equal(next.draft.revision, 2);
  assert.equal(next.draft.helpUsed, true);
  assert.deepEqual(Object.values(next.draft.answers), ["", "", "", ""]);
});

test("submissions preserve originals and full snapshots while feedback only matches or invites comparison", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const reference = structuredClone(scene);
  const input = answers();
  const ownLines = scene.lines.filter((line) => line.speakerId === "maxime");
  input[ownLines[0]!.id] =
    ` \n${ownLines[0]!.ukrainian.toLocaleUpperCase("uk").replace(/\p{P}/gu, "")}...  `;
  input[ownLines[1]!.id] = "Мене звати Віктор.";
  const request = command({ answers: input, helpUsed: true });
  const submitted = store.applyCommand(userId, reference, request);
  const attempt = submitted.attempts[0]!;
  assert.deepEqual(attempt.answers, input);
  assert.deepEqual(attempt.scene, scene);
  assert.equal(attempt.feedback[0]!.status, "matches");
  assert.equal(attempt.feedback[1]!.status, "compare");
  assert.equal(attempt.feedback[1]!.answer, "Мене звати Віктор.");
  assert.equal(attempt.helpUsed, true);
  assert.equal(attempt.submittedAt, context.now().toISOString());
  assert.equal(submitted.draft.revision, 1);
  assert.equal(submitted.draft.helpUsed, false);
  assert.deepEqual(Object.values(submitted.draft.answers), ["", "", "", ""]);
  reference.lines[0]!.ukrainian = "Mutation du catalogue";
  input[ownLines[0]!.id] = "Mutation du formulaire";
  assert.deepEqual(store.getWorkspace(userId, reference, "maxime"), submitted);
  const next = store.applyCommand(
    userId,
    reference,
    command({ expectedRevision: 1 }),
  );
  assert.equal(next.attempts.length, 2);
  assert.deepEqual(next.attempts[1], attempt);
  assert.deepEqual(next.attempts[0]!.scene, scene);
  assert.equal(next.draft.revision, 2);
});

test("lost responses can be replayed after restart without duplicating attempts or reverting newer work", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = openSceneStore(context.directory, { now: context.now });
  const request = command();
  const original = store.applyCommand(userId, scene, request);
  assert.deepEqual(store.applyCommand(userId, scene, request), original);
  store.close();
  context.setTime("2026-09-26T10:00:00.000Z");
  const reopened = context.open();
  assert.deepEqual(reopened.applyCommand(userId, scene, request), original);
  const save = command({ type: "save", expectedRevision: 1 });
  const newer = reopened.applyCommand(userId, scene, save);
  assert.deepEqual(reopened.applyCommand(userId, scene, save), newer);
  assert.deepEqual(reopened.applyCommand(userId, scene, request), newer);
  assert.equal(newer.attempts.length, 1);
  assert.equal(newer.draft.revision, 2);
});

test("reusing request identifiers with altered inputs or actions is rejected", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const request = command();
  const original = store.applyCommand(userId, scene, request);
  for (const changed of [
    { type: "save" as const },
    { expectedRevision: 1 },
    { helpUsed: true },
    { answers: {} },
    { roleId: "anna" as const },
  ])
    assert.throws(
      () => store.applyCommand(userId, scene, { ...request, ...changed }),
      SceneRequestConflictError,
    );
  assert.throws(
    () =>
      store.applyCommand(userId, variation, {
        ...request,
        variantId: variation.variantId,
        answers: answers(variation),
      }),
    SceneRequestConflictError,
  );
  assert.deepEqual(store.getWorkspace(userId, scene, "maxime"), original);
});

test("concurrent stale drafts and submissions are rejected without changing history", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const first = context.open();
  const second = context.open();
  const saved = first.applyCommand(userId, scene, command({ type: "save" }));
  for (const type of ["save", "submit"] as const) {
    assert.throws(
      () => second.applyCommand(userId, scene, command({ type })),
      (error: unknown) => {
        assert.ok(error instanceof SceneConflictError);
        assert.deepEqual(error.currentWorkspace, saved);
        return true;
      },
    );
  }
  assert.deepEqual(first.getWorkspace(userId, scene, "maxime"), saved);
  const submitted = second.applyCommand(
    userId,
    scene,
    command({ expectedRevision: 1 }),
  );
  assert.equal(submitted.draft.revision, 2);
  assert.equal(submitted.attempts.length, 1);
});

test("roles, variants and definition versions preserve independent drafts and immutable histories", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const original = store.applyCommand(userId, scene, command());
  const variant = store.applyCommand(
    userId,
    variation,
    command({
      variantId: variation.variantId,
      answers: answers(variation),
      type: "save",
    }),
  );
  const anna = store.applyCommand(
    userId,
    scene,
    command({ roleId: "anna", answers: answers(scene, "anna") }),
  );
  const nextDefinition: SceneDefinition = {
    ...scene,
    version: 2,
    title: "Version suivante",
  };
  const nextBlank = store.getWorkspace(userId, nextDefinition, "maxime");
  assert.equal(nextBlank.draft.revision, 0);
  assert.deepEqual(nextBlank.attempts, original.attempts);
  assert.throws(
    () => store.applyCommand(userId, nextDefinition, command()),
    SceneConflictError,
  );
  const next = store.applyCommand(
    userId,
    nextDefinition,
    command({ version: 2 }),
  );
  assert.equal(next.attempts.length, 2);
  assert.equal(next.attempts[0]!.scene.version, 2);
  assert.equal(next.attempts[1]!.scene.version, 1);
  assert.equal(store.getWorkspace(userId, scene, "maxime").draft.revision, 1);
  assert.deepEqual(store.getWorkspace(userId, variation, "maxime"), variant);
  assert.deepEqual(store.getWorkspace(userId, scene, "anna"), anna);
});

test("profile ownership isolates draft, history and request recovery", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const otherUserId = randomUUID();
  context
    .inspect()
    .prepare("INSERT INTO profiles (id, created_at) VALUES (?, ?)")
    .run(otherUserId, context.now().toISOString());
  const store = context.open();
  const request = command();
  const first = store.applyCommand(userId, scene, request);
  const blank = store.getWorkspace(otherUserId, scene, "maxime");
  assert.deepEqual(blank.attempts, []);
  assert.equal(blank.draft.revision, 0);
  const second = store.applyCommand(otherUserId, scene, request);
  assert.notEqual(first.attempts[0]!.id, second.attempts[0]!.id);
  assert.deepEqual(store.getWorkspace(userId, scene, "maxime"), first);
  assert.deepEqual(store.getWorkspace(otherUserId, scene, "maxime"), second);
  assert.throws(
    () => store.applyCommand(randomUUID(), scene, command()),
    /FOREIGN KEY/,
  );
});

test("submissions require every own line and reject unknown lines, other characters and oversized input", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const firstId = Object.keys(answers())[0]!;
  const otherId = scene.lines.find((line) => line.speakerId === "anna")!.id;
  for (const input of [
    {},
    { ...answers(), [firstId]: " \n " },
    { ...answers(), unknown: "texte" },
    { ...answers(), [otherId]: "texte" },
    { ...answers(), [firstId]: "x".repeat(501) },
  ])
    assert.throws(
      () => store.applyCommand(userId, scene, command({ answers: input })),
      SceneInputError,
    );
  assert.throws(
    () =>
      store.applyCommand(
        userId,
        scene,
        command({ type: "save", answers: { [otherId]: "texte" } }),
      ),
    SceneInputError,
  );
  assert.equal(store.getWorkspace(userId, scene, "maxime").draft.revision, 0);
  assert.equal(
    context
      .inspect()
      .prepare("SELECT count(*) AS count FROM scene_requests")
      .get()!.count,
    0,
  );
  assert.equal(
    store.applyCommand(
      userId,
      scene,
      command({ answers: { ...answers(), [firstId]: "x".repeat(500) } }),
    ).attempts[0]!.feedback[0]!.status,
    "compare",
  );
});

test("input shape rejects forged metadata, revisions, roles and nested answers", () => {
  for (const changed of [
    { extra: true },
    { requestId: "random" },
    { type: "assess" },
    { roleId: "stranger" },
    { sceneId: "../scene" },
    { variantId: "" },
    { version: 0 },
    { version: 1.5 },
    { expectedRevision: -1 },
    { expectedRevision: Number.MAX_SAFE_INTEGER },
    { expectedRevision: 1.5 },
    { helpUsed: "false" },
    { answers: [] },
    { answers: { line: {} } },
    { answers: null },
  ])
    assert.throws(
      () => validateSceneCommand({ ...command(), ...changed }),
      SceneInputError,
    );
  assert.throws(() => validateSceneCommand(null), SceneInputError);
  assert.deepEqual(validateSceneCommand(command({ answers: {} })).answers, {});
});

test("database guards prevent tampering with submissions, requests, identities and revision history", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const original = store.applyCommand(userId, scene, command());
  const database = context.inspect();
  for (const statement of [
    "UPDATE scene_attempts SET answers = '{}'",
    "UPDATE scene_attempts SET definition = '{}'",
    "UPDATE scene_attempts SET feedback = '[]'",
    "UPDATE scene_attempts SET help_used = 1",
    "DELETE FROM scene_attempts",
    "UPDATE scene_requests SET command = '{}'",
    "DELETE FROM scene_requests",
    "UPDATE scene_drafts SET definition = '{}'",
    "UPDATE scene_drafts SET revision = 0",
    "DELETE FROM scene_drafts",
    "UPDATE scene_drafts SET role_id = 'anna'",
    "UPDATE scene_drafts SET answers = '{}'",
  ])
    assert.throws(
      () => database.exec(statement),
      /immutable|cannot be deleted|revisions must advance/,
    );
  assert.deepEqual(store.getWorkspace(userId, scene, "maxime"), original);
});

test("scene reading and writing never infer learning mastery or activate review cards", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const database = context.inspect();
  const rows = [
    "learning_events",
    "exercise_events",
    "review_events",
    "review_elements",
  ]
    .filter((name) =>
      database
        .prepare("SELECT name FROM sqlite_master WHERE name = ?")
        .get(name),
    )
    .map((name) => ({
      name,
      rows: database.prepare(`SELECT * FROM ${name}`).all(),
    }));
  const store = context.open();
  store.getWorkspace(userId, scene, "maxime");
  store.applyCommand(userId, scene, command({ type: "save" }));
  store.applyCommand(userId, scene, command({ expectedRevision: 1 }));
  for (const snapshot of rows)
    assert.deepEqual(
      database.prepare(`SELECT * FROM ${snapshot.name}`).all(),
      snapshot.rows,
    );
});

test("migration six preserves earlier data, audio bytes and migration checksums", (t) => {
  const context = fixture(t);
  const migrationsDirectory = path.join(context.directory, "old-migrations");
  mkdirSync(migrationsDirectory);
  for (const filename of [
    "001_learning.sql",
    "002_exercises.sql",
    "003_reviews.sql",
    "004_language.sql",
    "005_audio.sql",
  ])
    copyFileSync(
      path.join(process.cwd(), "migrations", filename),
      path.join(migrationsDirectory, filename),
    );
  const options = { migrationsDirectory, now: context.now };
  const learning = openLearningStore(context.directory, options);
  const userId = learning.getLocalUserId();
  learning.saveNote(userId, "01", "cours", "Ma note avant les scènes", 0);
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
  context.open().applyCommand(userId, scene, command());
  for (const snapshot of snapshots)
    assert.deepEqual(
      database.prepare(`SELECT * FROM ${snapshot.name}`).all(),
      snapshot.rows,
      `${snapshot.name} must be preserved`,
    );
  assert.deepEqual(
    database
      .prepare(
        "SELECT * FROM schema_migrations WHERE version <= 5 ORDER BY version",
      )
      .all(),
    history,
  );
  assert.equal(
    database.prepare("SELECT count(*) AS count FROM schema_migrations").get()!
      .count,
    9,
  );
});
