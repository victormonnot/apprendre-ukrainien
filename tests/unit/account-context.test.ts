import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  getAccountRequestNamespace,
  getDataDirectory,
  getRequestAccount,
  getRequestStore,
  withAccountContext,
  type RequestAccountContext,
} from "../../src/lib/server/account-context.ts";
import { openDatabase } from "../../src/lib/server/database.ts";
import { openLearningStore } from "../../src/lib/server/learning-store.ts";
import {
  openBackupStore,
  BackupError,
} from "../../src/lib/server/backup-store.ts";
import { openAudioStore } from "../../src/lib/server/audio-store.ts";

function fixture(t: TestContext) {
  const root = mkdtempSync(path.join(tmpdir(), "ukrainian-accounts-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  function account(id: string, owner = false): RequestAccountContext {
    return {
      id,
      username: id,
      displayName: id,
      role: owner ? "owner" : "member",
      dataDirectory: owner ? root : path.join(root, "accounts", id),
    };
  }
  return { root, account };
}

function learning() {
  return getRequestStore("learning", openLearningStore);
}
function backups() {
  return getRequestStore("backups", openBackupStore);
}
function generation() {
  return String(
    getRequestStore("generation", openDatabase)
      .prepare("SELECT generation FROM workspace_state WHERE id = 1")
      .get()!.generation,
  );
}
function note() {
  const store = learning();
  return store.getOverview(store.getLocalUserId()).documents[0]?.note.text;
}

test("authenticated storage rejects missing context without touching the legacy directory", (t) => {
  const { root, account } = fixture(t);
  const previousAuth = process.env.APP_AUTH_ENABLED;
  const previousAccess = process.env.APP_ACCESS_MODE;
  const previousData = process.env.APP_DATA_DIR;
  process.env.APP_AUTH_ENABLED = "1";
  process.env.APP_ACCESS_MODE = "private";
  process.env.APP_DATA_DIR = path.join(root, "untouched");
  t.after(() => {
    if (previousAuth === undefined) delete process.env.APP_AUTH_ENABLED;
    else process.env.APP_AUTH_ENABLED = previousAuth;
    if (previousAccess === undefined) delete process.env.APP_ACCESS_MODE;
    else process.env.APP_ACCESS_MODE = previousAccess;
    if (previousData === undefined) delete process.env.APP_DATA_DIR;
    else process.env.APP_DATA_DIR = previousData;
  });
  for (const operation of [
    getDataDirectory,
    openDatabase,
    openBackupStore,
    learning,
  ])
    assert.throws(() => operation(), /authenticated account context/);
  assert.equal(existsSync(process.env.APP_DATA_DIR), false);
  withAccountContext(account("alice"), () => {
    assert.equal(getDataDirectory(), account("alice").dataDirectory);
    assert.ok(learning().getLocalUserId());
  });
  // Maintenance tools and isolated fixtures retain explicit-directory access.
  const explicit = openDatabase(path.join(root, "maintenance"));
  explicit.close();
  process.env.APP_AUTH_ENABLED = "0";
  assert.equal(getDataDirectory(), process.env.APP_DATA_DIR);
});

test("the public accounts mode cannot fall back to legacy storage even when the auth flag is absent or false", (t) => {
  const { root, account } = fixture(t);
  const previousAuth = process.env.APP_AUTH_ENABLED;
  const previousAccess = process.env.APP_ACCESS_MODE;
  const previousData = process.env.APP_DATA_DIR;
  process.env.APP_ACCESS_MODE = "accounts";
  process.env.APP_DATA_DIR = path.join(root, "untouched");
  t.after(() => {
    if (previousAuth === undefined) delete process.env.APP_AUTH_ENABLED;
    else process.env.APP_AUTH_ENABLED = previousAuth;
    if (previousAccess === undefined) delete process.env.APP_ACCESS_MODE;
    else process.env.APP_ACCESS_MODE = previousAccess;
    if (previousData === undefined) delete process.env.APP_DATA_DIR;
    else process.env.APP_DATA_DIR = previousData;
  });
  for (const authFlag of [undefined, "0"]) {
    if (authFlag === undefined) delete process.env.APP_AUTH_ENABLED;
    else process.env.APP_AUTH_ENABLED = authFlag;
    for (const operation of [
      getDataDirectory,
      openDatabase,
      openBackupStore,
      learning,
    ])
      assert.throws(() => operation(), /authenticated account context/);
    assert.equal(existsSync(process.env.APP_DATA_DIR), false);
    withAccountContext(account("alice"), () => {
      assert.ok(learning().getLocalUserId());
    });
  }
});

test("interleaved async requests keep stores, identities and writes isolated", async (t) => {
  const { account } = fixture(t);
  const aliceReady = Promise.withResolvers<void>();
  const bobDone = Promise.withResolvers<void>();
  let aliceStore: ReturnType<typeof openLearningStore> | undefined;
  let bobStore: ReturnType<typeof openLearningStore> | undefined;
  await Promise.all([
    withAccountContext(account("alice"), async () => {
      const store = learning();
      aliceStore = store;
      const userId = store.getLocalUserId();
      store.saveNote(userId, "01", "cours", "Alice avant", 0);
      aliceReady.resolve();
      await bobDone.promise;
      assert.equal(getRequestAccount()?.id, "alice");
      assert.equal(learning(), store);
      assert.equal(note(), "Alice avant");
      store.saveNote(userId, "01", "cours", "Alice après", 1);
    }),
    withAccountContext(account("bob"), async () => {
      await aliceReady.promise;
      try {
        const store = learning();
        bobStore = store;
        assert.notEqual(store, aliceStore);
        const userId = store.getLocalUserId();
        assert.equal(note(), undefined);
        store.saveNote(userId, "01", "cours", "Bob seulement", 0);
        await Promise.resolve();
        assert.equal(getRequestAccount()?.id, "bob");
        assert.equal(note(), "Bob seulement");
      } finally {
        bobDone.resolve();
      }
    }),
  ]);
  assert.equal(getRequestAccount(), undefined);
  assert.throws(() => aliceStore!.getLocalUserId(), /closed|not open/i);
  assert.throws(() => bobStore!.getLocalUserId(), /closed|not open/i);
  withAccountContext(account("alice"), () =>
    assert.equal(note(), "Alice après"),
  );
  withAccountContext(account("bob"), () =>
    assert.equal(note(), "Bob seulement"),
  );
});

test("request cleanup closes real connections on thrown and rejected operations", async (t) => {
  const { account } = fixture(t);
  const failure = new Error("handler failed");
  let database: ReturnType<typeof openDatabase> | undefined;
  assert.throws(
    () =>
      withAccountContext(account("alice"), () => {
        database = getRequestStore("database", openDatabase);
        throw failure;
      }),
    (error) => error === failure,
  );
  assert.throws(() => database!.prepare("SELECT 1"), /closed|not open/i);
  await assert.rejects(
    withAccountContext(account("alice"), async () => {
      database = getRequestStore("database", openDatabase);
      await Promise.resolve();
      throw failure;
    }),
    (error) => error === failure,
  );
  assert.throws(() => database!.prepare("SELECT 1"), /closed|not open/i);
});

test("nested accounts restore the outer context and cannot share a request namespace", (t) => {
  const { account } = fixture(t);
  withAccountContext(account("alice"), () => {
    const outer = learning();
    const namespace = getAccountRequestNamespace();
    withAccountContext(account("bob"), () => {
      assert.notEqual(learning(), outer);
      assert.notEqual(getAccountRequestNamespace(), namespace);
    });
    assert.equal(learning(), outer);
    assert.equal(getAccountRequestNamespace(), namespace);
  });
});

test("detached work cannot reopen stores after the owning request has finished", async (t) => {
  const { account } = fixture(t);
  const resume = Promise.withResolvers<void>();
  let detached: Promise<void> | undefined;
  withAccountContext(account("alice"), () => {
    learning().getLocalUserId();
    detached = resume.promise.then(() => {
      assert.equal(getRequestAccount(), undefined);
      assert.throws(learning, /request has finished/);
      assert.throws(openDatabase, /request has finished/);
    });
  });
  resume.resolve();
  await detached;
});

test("the provisioned owner retains the legacy workspace while a new member starts empty", (t) => {
  const { root, account } = fixture(t);
  const legacy = openLearningStore(root);
  const ownerProfileId = legacy.getLocalUserId();
  legacy.saveNote(ownerProfileId, "01", "cours", "Note historique", 0);
  legacy.close();
  withAccountContext(account("owner", true), () => {
    assert.equal(learning().getLocalUserId(), ownerProfileId);
    assert.equal(note(), "Note historique");
  });
  withAccountContext(account("member"), () => {
    assert.notEqual(learning().getLocalUserId(), ownerProfileId);
    assert.equal(note(), undefined);
  });
});

test("restoring one account invalidates only its generation while another request remains usable", async (t) => {
  const { account } = fixture(t);
  const ready = Promise.withResolvers<void>();
  const restored = Promise.withResolvers<void>();
  await Promise.all([
    withAccountContext(account("alice"), async () => {
      const store = learning();
      const userId = store.getLocalUserId();
      store.saveNote(userId, "01", "cours", "Avant sauvegarde", 0);
      const backup = backups().createBackup();
      const bytes = backups().readBackup(backup.id).bytes;
      const oldGeneration = generation();
      store.saveNote(userId, "01", "cours", "Après sauvegarde", 1);
      await ready.promise;
      try {
        // A second request restores the same account while its first connection stays open.
        withAccountContext(account("alice"), () => {
          const inspection = backups().inspectBackup(bytes);
          backups().restoreBackup({
            inspectionId: inspection.id,
            sha256: inspection.sha256,
            requestId: randomUUID(),
            expectedGeneration: oldGeneration,
          });
        });
        assert.notEqual(generation(), oldGeneration);
        assert.equal(note(), "Avant sauvegarde");
      } finally {
        restored.resolve();
      }
    }),
    withAccountContext(account("bob"), async () => {
      const store = learning();
      const userId = store.getLocalUserId();
      store.saveNote(userId, "01", "cours", "Bob avant", 0);
      const before = generation();
      ready.resolve();
      await restored.promise;
      assert.equal(generation(), before);
      assert.equal(note(), "Bob avant");
      store.saveNote(userId, "01", "cours", "Bob après", 1);
      assert.equal(note(), "Bob après");
    }),
  ]);
});

test("backup and clip identifiers from another account do not expose their data", (t) => {
  const { account } = fixture(t);
  const foreign = withAccountContext(account("alice"), () => {
    const userId = learning().getLocalUserId();
    const bytes = Buffer.alloc(46);
    bytes.write("RIFF", 0);
    bytes.writeUInt32LE(38, 4);
    bytes.write("WAVEfmt ", 8);
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20);
    bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(22050, 24);
    bytes.writeUInt32LE(44100, 28);
    bytes.writeUInt16LE(2, 32);
    bytes.writeUInt16LE(16, 34);
    bytes.write("data", 36);
    bytes.writeUInt32LE(2, 40);
    const clip = getRequestStore("audio", openAudioStore).saveClip(
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
      "audio/wav",
    );
    const backup = backups().createBackup();
    assert.equal(clip.url, `/api/audio/${clip.id}?account=alice`);
    const inspection = backups().inspectBackup(
      backups().readBackup(backup.id).bytes,
    );
    return { clip, backup, inspection };
  });
  withAccountContext(account("bob"), () => {
    const userId = learning().getLocalUserId();
    assert.equal(
      getRequestStore("audio", openAudioStore).getClip(userId, foreign.clip.id),
      null,
    );
    assert.throws(
      () => backups().readBackup(foreign.backup.id),
      (error) => error instanceof BackupError && error.status === 404,
    );
    assert.throws(
      () =>
        backups().restoreBackup({
          inspectionId: foreign.inspection.id,
          sha256: foreign.inspection.sha256,
          requestId: randomUUID(),
          expectedGeneration: generation(),
        }),
      (error) => error instanceof BackupError && error.status === 410,
    );
  });
});

test("member maintenance retains the latest manual and safety backups and expires only stale imports", (t) => {
  const { account } = fixture(t);
  const member = account("alice");
  let timestamp = Date.parse("2026-09-28T10:00:00.000Z");
  withAccountContext(member, () => {
    learning().getLocalUserId();
    const store = getRequestStore("backups", (directory) =>
      openBackupStore(directory, { now: () => new Date(timestamp) }),
    );
    const original = store.createBackup();
    const bytes = store.readBackup(original.id).bytes;
    const expired = store.inspectBackup(bytes);
    const manualIds = [original.id];
    for (let index = 0; index < 5; index++) {
      timestamp += 1_000;
      manualIds.push(store.createBackup().id);
    }
    const safetyIds: string[] = [];
    for (let index = 0; index < 4; index++) {
      timestamp += 1_000;
      const inspected = store.inspectBackup(bytes);
      safetyIds.push(
        store.restoreBackup({
          inspectionId: inspected.id,
          sha256: inspected.sha256,
          requestId: randomUUID(),
          expectedGeneration: store.getOverview().generation,
        }).safetyBackupId,
      );
    }
    timestamp += 30 * 60_000;
    const active = store.inspectBackup(bytes);
    timestamp += 30 * 60_000;
    const before = store.getOverview();
    store.maintainMemberBackups();
    const after = store.getOverview();
    assert.equal(after.generation, before.generation);
    assert.deepEqual(after.current, before.current);
    assert.deepEqual(
      after.files
        .filter((file) => file.kind === "manual")
        .map((file) => file.id),
      manualIds.slice(-3).reverse(),
    );
    assert.deepEqual(
      after.files
        .filter((file) => file.kind === "safety")
        .map((file) => file.id),
      safetyIds.slice(-2).reverse(),
    );
    const directory = path.join(member.dataDirectory, "backups");
    for (const id of [...manualIds.slice(0, -3), ...safetyIds.slice(0, -2)]) {
      assert.equal(existsSync(path.join(directory, `${id}.sqlite3`)), false);
      assert.equal(existsSync(path.join(directory, `${id}.json`)), false);
    }
    for (const suffix of ["sqlite3", "json"]) {
      assert.equal(
        existsSync(path.join(directory, "pending", `${expired.id}.${suffix}`)),
        false,
      );
      assert.equal(
        existsSync(path.join(directory, "pending", `${active.id}.${suffix}`)),
        true,
      );
    }
    store.maintainMemberBackups();
    assert.deepEqual(store.getOverview(), after);
  });
});

test("member retention cannot remove the snapshot just returned when creation timestamps tie", (t) => {
  const { account } = fixture(t);
  withAccountContext(account("alice"), () => {
    learning().getLocalUserId();
    const store = getRequestStore("backups", (directory) =>
      openBackupStore(directory, {
        now: () => new Date("2026-09-28T10:00:00.000Z"),
      }),
    );
    for (let index = 0; index < 10; index++) {
      const created = store.createBackup();
      store.maintainMemberBackups();
      assert.equal(store.readBackup(created.id).file.id, created.id);
      assert.ok(store.getOverview().files.length <= 3);
    }
  });
});

test("member backup maintenance never prunes the owner or a legacy CLI workspace", (t) => {
  const { root, account } = fixture(t);
  let timestamp = Date.parse("2026-09-28T10:00:00.000Z");
  let oldInspectionId = "";
  withAccountContext(account("owner", true), () => {
    learning().getLocalUserId();
    const store = getRequestStore("backups", (directory) =>
      openBackupStore(directory, { now: () => new Date(timestamp) }),
    );
    const original = store.createBackup();
    oldInspectionId = store.inspectBackup(
      store.readBackup(original.id).bytes,
    ).id;
    for (let index = 0; index < 5; index++) {
      timestamp += 1_000;
      store.createBackup();
    }
    timestamp += 2 * 60 * 60_000;
    const before = store.getOverview();
    store.maintainMemberBackups();
    assert.deepEqual(store.getOverview(), before);
    assert.equal(store.getOverview().files.length, 6);
    assert.ok(
      existsSync(
        path.join(root, "backups", "pending", `${oldInspectionId}.sqlite3`),
      ),
    );
  });
  const legacy = openBackupStore(root, { now: () => new Date(timestamp) });
  try {
    legacy.maintainMemberBackups();
    assert.equal(legacy.getOverview().files.length, 6);
    assert.ok(
      existsSync(
        path.join(root, "backups", "pending", `${oldInspectionId}.sqlite3`),
      ),
    );
  } finally {
    legacy.close();
  }
});
