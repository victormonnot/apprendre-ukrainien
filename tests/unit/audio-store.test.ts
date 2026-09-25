import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { getExercise } from "../../src/content/exercises.ts";
import type { AudioDescriptor } from "../../src/lib/audio-types.ts";
import {
  AudioValidationError,
  openAudioStore,
} from "../../src/lib/server/audio-store.ts";
import { openExerciseStore } from "../../src/lib/server/exercise-store.ts";
import { openLanguageStore } from "../../src/lib/server/language-store.ts";
import { openLearningStore } from "../../src/lib/server/learning-store.ts";
import { openReviewStore } from "../../src/lib/server/review-store.ts";

const descriptor: AudioDescriptor = {
  text: "Добрий день!",
  voiceId: "macos-lesya",
  voiceLabel: "Lesya",
  provider: "macos",
  model: "macos-lesya-v1",
  instructionsVersion: 1,
};

function wave(size = 46): Uint8Array {
  const bytes = Buffer.alloc(size);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(size - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(22050, 24);
  bytes.writeUInt32LE(44100, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(size - 44, 40);
  return bytes;
}

function mp3(): Uint8Array {
  const bytes = new Uint8Array(417);
  bytes.set([0xff, 0xfb, 0x90, 0]);
  return bytes;
}

function fixture(t: TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), "ukrainian-audio-"));
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
    open() {
      const store = openAudioStore(directory, {
        now: () => new Date(timestamp),
      });
      resources.push(store);
      return store;
    },
    profile() {
      const store = openLearningStore(directory);
      try {
        return store.getLocalUserId();
      } finally {
        store.close();
      }
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

test("equivalent normalized text reuses the first immutable clip and its voice snapshot", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  assert.equal(store.findClip(userId, descriptor), null);
  const original = { ...descriptor, text: "  Добрий\nдень! " };
  const bytes = wave();
  const clip = store.saveClip(userId, original, bytes, "audio/wav");
  assert.equal(clip.text, descriptor.text);
  assert.equal(clip.createdAt, context.now().toISOString());
  assert.equal(clip.url, `/api/audio/${clip.id}`);
  context.setTime("2026-09-26T10:00:00.000Z");
  assert.deepEqual(
    store.saveClip(
      userId,
      { ...descriptor, voiceLabel: "New label" },
      wave(48),
      "audio/wav",
    ),
    clip,
  );
  assert.deepEqual(store.findClip(userId, descriptor), clip);
  const stored = store.getClip(userId, clip.id)!;
  assert.deepEqual(stored.clip, clip);
  assert.deepEqual(Array.from(stored.bytes), Array.from(bytes));
  bytes[44] = 1;
  stored.bytes[44] = 2;
  original.text = "Mutated after save";
  assert.equal(store.getClip(userId, clip.id)!.bytes[44], 0);
  assert.equal(store.getClip(userId, clip.id)!.clip.text, descriptor.text);
  assert.equal(
    context
      .inspect()
      .prepare("SELECT count(*) AS count FROM audio_clips")
      .get()!.count,
    1,
  );
});

test("NFC composition shares a cache while text, voice, model and instruction changes do not", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const first = store.saveClip(userId, descriptor, wave(), "audio/wav");
  assert.equal(
    store.findClip(userId, {
      ...descriptor,
      text: descriptor.text.normalize("NFD"),
    })!.id,
    first.id,
  );
  const variations: AudioDescriptor[] = [
    { ...descriptor, text: "Привіт!" },
    { ...descriptor, model: "macos-lesya-v2" },
    { ...descriptor, instructionsVersion: 2 },
    {
      ...descriptor,
      provider: "openai",
      voiceId: "openai-marin",
      model: "tts-v1",
    },
    {
      ...descriptor,
      provider: "openai",
      voiceId: "openai-cedar",
      model: "tts-v1",
    },
  ];
  const ids = [first.id];
  for (const variation of variations) {
    assert.equal(store.findClip(userId, variation), null);
    const clip = store.saveClip(userId, variation, wave(), "audio/wav");
    ids.push(clip.id);
    assert.equal(store.findClip(userId, variation)!.id, clip.id);
  }
  assert.equal(new Set(ids).size, ids.length);
});

test("audio remains available byte for byte after closing and reopening the store", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = openAudioStore(context.directory, { now: context.now });
  const bytes = wave(48);
  bytes[44] = 42;
  const clip = store.saveClip(userId, descriptor, bytes, "audio/wav");
  store.close();
  const reopened = context.open();
  assert.deepEqual(reopened.findClip(userId, descriptor), clip);
  assert.deepEqual(reopened.getClip(userId, clip.id), {
    clip,
    bytes: new Uint8Array(bytes),
  });
});

test("clip IDs and descriptor cache entries stay isolated by profile", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const otherUserId = randomUUID();
  const database = context.inspect();
  database
    .prepare("INSERT INTO profiles (id, created_at) VALUES (?, ?)")
    .run(otherUserId, context.now().toISOString());
  const store = context.open();
  const first = store.saveClip(userId, descriptor, wave(), "audio/wav");
  assert.equal(store.getClip(otherUserId, first.id), null);
  assert.equal(store.findClip(otherUserId, descriptor), null);
  assert.equal(store.getClip(userId, randomUUID()), null);
  const other = store.saveClip(otherUserId, descriptor, wave(), "audio/wav");
  assert.notEqual(other.id, first.id);
  assert.equal(store.findClip(userId, descriptor)!.id, first.id);
  assert.equal(store.findClip(otherUserId, descriptor)!.id, other.id);
  assert.throws(
    () => store.saveClip(randomUUID(), descriptor, wave(), "audio/wav"),
    /FOREIGN KEY/,
  );
});

test("database guards reject replacing or deleting an existing clip", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const clip = store.saveClip(userId, descriptor, wave(), "audio/wav");
  const database = context.inspect();
  for (const statement of [
    "UPDATE audio_clips SET text = 'Changed'",
    "UPDATE audio_clips SET bytes = x'00'",
    "UPDATE audio_clips SET voice_label = 'Changed'",
    "UPDATE audio_clips SET created_at = 'Changed'",
    "UPDATE audio_clips SET id = 'Changed'",
    "DELETE FROM audio_clips",
  ]) {
    assert.throws(
      () => database.exec(statement),
      /immutable|cannot be deleted/,
    );
  }
  assert.deepEqual(store.getClip(userId, clip.id)!.clip, clip);
});

test("WAV and MP3 files must match their declared type, contain audio and fit the size bound", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const invalidWave = wave();
  invalidWave[4] = 255;
  const emptyWave = wave(44);
  const missingFormat = wave();
  missingFormat[12] = 0;
  const invalid: [Uint8Array, "audio/wav" | "audio/mpeg"][] = [
    [new Uint8Array(), "audio/wav"],
    [new Uint8Array(8 * 1024 * 1024 + 1), "audio/wav"],
    [Buffer.from("<html>failed request</html>"), "audio/wav"],
    [wave(), "audio/mpeg"],
    [mp3(), "audio/wav"],
    [invalidWave, "audio/wav"],
    [emptyWave, "audio/wav"],
    [missingFormat, "audio/wav"],
    [wave().subarray(0, 45), "audio/wav"],
    [Buffer.from("ID3"), "audio/mpeg"],
    [new Uint8Array([0xff, 0xfb, 0x90, 0]), "audio/mpeg"],
    [new Uint8Array([0xff, 0xff, 0xff, 0xff]), "audio/mpeg"],
  ];
  for (const [bytes, mimeType] of invalid) {
    assert.throws(
      () => store.saveClip(userId, descriptor, bytes, mimeType),
      AudioValidationError,
    );
  }
  assert.equal(store.findClip(userId, descriptor), null);
  const maximum = store.saveClip(
    userId,
    descriptor,
    wave(8 * 1024 * 1024),
    "audio/wav",
  );
  assert.equal(
    store.getClip(userId, maximum.id)!.bytes.length,
    8 * 1024 * 1024,
  );
  const compressed = store.saveClip(
    userId,
    { ...descriptor, text: "Привіт!" },
    mp3(),
    "audio/mpeg",
  );
  assert.equal(compressed.mimeType, "audio/mpeg");
  const taggedMp3 = new Uint8Array(10 + mp3().length);
  taggedMp3.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]);
  taggedMp3.set(mp3(), 10);
  assert.equal(
    store.saveClip(
      userId,
      { ...descriptor, text: "Дякую!" },
      taggedMp3,
      "audio/mpeg",
    ).mimeType,
    "audio/mpeg",
  );
});

test("invalid descriptors cannot populate or bypass the cache", (t) => {
  const context = fixture(t);
  const userId = context.profile();
  const store = context.open();
  const invalid: AudioDescriptor[] = [
    { ...descriptor, text: " \n " },
    { ...descriptor, text: "а".repeat(1001) },
    { ...descriptor, model: "" },
    { ...descriptor, voiceLabel: "" },
    { ...descriptor, instructionsVersion: 0 },
    { ...descriptor, instructionsVersion: 1.5 },
    { ...descriptor, provider: "openai" },
    { ...descriptor, voiceId: "openai-cedar" },
  ];
  for (const value of invalid) {
    assert.throws(() => store.findClip(userId, value), AudioValidationError);
    assert.throws(
      () => store.saveClip(userId, value, wave(), "audio/wav"),
      AudioValidationError,
    );
  }
});

test("migration five preserves all earlier learning data and migration checksums", (t) => {
  const context = fixture(t);
  const migrationsDirectory = path.join(context.directory, "old-migrations");
  mkdirSync(migrationsDirectory);
  for (const filename of [
    "001_learning.sql",
    "002_exercises.sql",
    "003_reviews.sql",
    "004_language.sql",
  ]) {
    copyFileSync(
      path.join(process.cwd(), "migrations", filename),
      path.join(migrationsDirectory, filename),
    );
  }
  const options = { migrationsDirectory, now: context.now };
  const learning = openLearningStore(context.directory, options);
  const userId = learning.getLocalUserId();
  learning.saveNote(userId, "01", "cours", "Ma note avant l’audio", 0);
  learning.saveCheckpoint(userId, "01", "cours", "premiers-mots");
  learning.close();
  const exercises = openExerciseStore(context.directory, options);
  exercises.startAttempt(userId, getExercise("01-1")!);
  exercises.close();
  const reviews = openReviewStore(context.directory, options);
  reviews.activateElement(userId, "01-mot-kava");
  const active = reviews.startReview(userId).active!;
  reviews.revealAnswer(userId, active.id, "Mon vrai rappel");
  reviews.close();
  const language = openLanguageStore(context.directory, options);
  language.saveReference(userId, "01-mot-kava");
  const result = language.recordResult(userId, {
    requestId: randomUUID(),
    input: {
      mode: "translate",
      text: "Café",
      context: "Une boisson",
      source: null,
    },
    content: {
      title: "Café",
      summary: "Une boisson",
      ambiguity: "",
      entries: [],
      feedback: [],
      practice: "Rappel",
    },
    model: "test-model",
  });
  language.saveResult(userId, result.id);
  language.close();
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
  const store = context.open();
  store.saveClip(userId, descriptor, wave(), "audio/wav");
  for (const { name, rows } of snapshots) {
    assert.deepEqual(
      database.prepare(`SELECT * FROM ${name}`).all(),
      rows,
      `${name} must be preserved`,
    );
  }
  assert.deepEqual(
    database
      .prepare(
        "SELECT * FROM schema_migrations WHERE version <= 4 ORDER BY version",
      )
      .all(),
    history,
  );
  assert.equal(
    database.prepare("SELECT count(*) AS count FROM schema_migrations").get()!
      .count,
    7,
  );
});
