import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import {
  accountDirectory,
  AuthError,
  normalizeUsername,
  openAuthStore,
} from "../../src/lib/server/auth-store.ts";

const password = "une phrase de test privée 42";
const nextPassword = "une autre phrase de test 84";
function fixture(t: TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), "ukrainian-accounts-"));
  let time = Date.parse("2026-09-28T12:00:00Z");
  const stores: ReturnType<typeof openAuthStore>[] = [];
  const open = () => {
    const s = openAuthStore(directory, () => time);
    stores.push(s);
    return s;
  };
  t.after(() => {
    for (const s of stores)
      try {
        s.close();
      } catch {}
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    directory,
    open,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
async function owner(store: ReturnType<typeof openAuthStore>) {
  return store.provisionOwner({
    username: "victor",
    displayName: "Victor",
    password,
  });
}

test("owner must be explicitly provisioned; members never claim existing storage", async (t) => {
  const f = fixture(t),
    s = f.open();
  await assert.rejects(
    s.register({ username: "victor", displayName: "Visitor", password }),
    { status: 503 },
  );
  const a = await owner(s);
  const b = await s.register({
    username: "  New.User  ",
    displayName: "New",
    password,
  });
  assert.equal(a.account.role, "owner");
  assert.equal(b.account.role, "member");
  assert.equal(b.account.username, "new.user");
  assert.equal(accountDirectory(a.account, f.directory), f.directory);
  assert.equal(
    accountDirectory(b.account, f.directory),
    path.join(f.directory, "accounts", b.account.id),
  );
  await assert.rejects(
    s.provisionOwner({ username: "another", displayName: "Other", password }),
    { status: 409 },
  );
  await assert.rejects(
    s.register({ username: "VICTOR", displayName: "Other", password }),
    { status: 409 },
  );
});

test("sessions and recovery codes are stored only as digests; password hashes salted", async (t) => {
  const f = fixture(t),
    s = f.open(),
    a = await owner(s);
  const b = await s.register({
    username: "tester",
    displayName: "Test",
    password,
  });
  const db = new DatabaseSync(path.join(f.directory, "accounts.sqlite3"));
  try {
    const hashes = db
      .prepare("SELECT password_hash,recovery_hash FROM accounts")
      .all();
    assert.notEqual(hashes[0]!.password_hash, hashes[1]!.password_hash);
    assert.match(String(hashes[0]!.password_hash), /^scrypt-v1:/);
    const serialized =
      JSON.stringify(db.prepare("SELECT * FROM accounts").all()) +
      JSON.stringify(db.prepare("SELECT * FROM sessions").all());
    for (const secret of [
      password,
      a.token,
      a.recoveryCode,
      b.token,
      b.recoveryCode,
    ])
      assert.ok(!serialized.includes(secret));
  } finally {
    db.close();
  }
  assert.deepEqual(s.resolveSession(a.token), a.account);
  assert.equal(s.resolveSession("a".repeat(64)), null);
  assert.equal(s.resolveSession("bad"), null);
});

test("login, logout and expiration survive reopening the registry", async (t) => {
  const f = fixture(t),
    s = f.open(),
    a = await owner(s),
    reopened = f.open();
  assert.deepEqual(reopened.resolveSession(a.token), a.account);
  await assert.rejects(reopened.login("victor", "incorrect secret"), {
    status: 401,
  });
  await assert.rejects(reopened.login("missing", password), { status: 401 });
  const b = await reopened.login("VICTOR", password);
  assert.notEqual(a.token, b.token);
  reopened.logout(a.token);
  assert.equal(s.resolveSession(a.token), null);
  assert.ok(s.resolveSession(b.token));
  f.advance(30 * 24 * 60 * 60_000 + 1);
  assert.equal(s.resolveSession(b.token), null);
});

test("password changes revoke other devices and keep only current session", async (t) => {
  const f = fixture(t),
    s = f.open(),
    a = await owner(s),
    other = await s.login("victor", password);
  await assert.rejects(s.changePassword(a.token, "bad", nextPassword), {
    status: 400,
  });
  assert.ok(s.resolveSession(other.token));
  await s.changePassword(a.token, password, nextPassword);
  assert.ok(s.resolveSession(a.token));
  assert.equal(s.resolveSession(other.token), null);
  await assert.rejects(s.login("victor", password), { status: 401 });
  assert.ok((await s.login("victor", nextPassword)).token);
});

test("recovery is single-use, rotates recovery material, and revokes every old session", async (t) => {
  const f = fixture(t),
    s = f.open(),
    a = await owner(s),
    other = await s.login("victor", password);
  const recovered = await s.recover("victor", a.recoveryCode, nextPassword);
  assert.equal(recovered.account.id, a.account.id);
  assert.notEqual(recovered.recoveryCode, a.recoveryCode);
  assert.equal(s.resolveSession(a.token), null);
  assert.equal(s.resolveSession(other.token), null);
  assert.ok(s.resolveSession(recovered.token));
  await assert.rejects(s.recover("victor", a.recoveryCode, password), {
    status: 401,
  });
  const next = await s.recover("victor", recovered.recoveryCode, password);
  assert.equal(s.resolveSession(recovered.token), null);
  assert.ok(s.resolveSession(next.token));
});

test("persistent rate limits cannot be reset by reopening or another store", (t) => {
  const f = fixture(t),
    s = f.open();
  s.consumeLimit("test", 2, 60_000);
  f.open().consumeLimit("test", 2, 60_000);
  assert.throws(
    () => s.consumeLimit("test", 2, 60_000),
    (e) => e instanceof AuthError && e.status === 429,
  );
  f.advance(60_001);
  assert.doesNotThrow(() => s.consumeLimit("test", 2, 60_000));
});

test("weak passwords and unsafe identity selectors are rejected", async (t) => {
  const f = fixture(t),
    s = f.open();
  for (const username of ["../owner", "a/b", "x", "étonnant", "<script>"])
    assert.throws(() => normalizeUsername(username));
  await assert.rejects(
    s.provisionOwner({
      username: "victor",
      displayName: "Victor",
      password: "victor",
    }),
    { status: 400 },
  );
  assert.throws(() =>
    accountDirectory(
      {
        id: "../root",
        username: "visitor",
        displayName: "Visitor",
        role: "member",
      },
      f.directory,
    ),
  );
  assert.equal(s.hasOwner(), false);
});
