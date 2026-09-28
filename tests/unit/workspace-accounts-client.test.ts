import assert from "node:assert/strict";
import test from "node:test";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}
let serial = 0;
async function harness(
  operation: (
    client: typeof import("../../src/lib/workspace-client.ts"),
    storage: MemoryStorage,
    events: string[],
  ) => Promise<void>,
) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = globalThis.fetch;
  const storage = new MemoryStorage();
  const events: string[] = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: storage,
      dispatchEvent(event: Event) {
        events.push(event.type);
        return true;
      },
    },
  });
  try {
    const url = new URL("../../src/lib/workspace-client.ts", import.meta.url);
    url.searchParams.set("accounts", String(serial++));
    await operation(await import(url.href), storage, events);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow)
      Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
}
const generationA = "a".repeat(32);
const generationB = "b".repeat(32);

test("authenticated bootstrap, reads and writes all carry the captured account identity", async () => {
  await harness(async (client) => {
    client.configureWorkspaceIdentity(true, "alice");
    const calls: {
      url: string;
      account: string | null;
      generation: string | null;
    }[] = [];
    globalThis.fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(input),
        account: headers.get("X-Account-Id"),
        generation: headers.get("X-Workspace-Generation"),
      });
      return input === "/api/workspace"
        ? Response.json({ accountId: "alice", generation: generationA })
        : Response.json({ ok: true });
    };
    await client.appFetch("/api/learning");
    await client.appFetch("/api/learning", {
      method: "POST",
      headers: { "X-Account-Id": "bob" },
      body: "{}",
    });
    assert.deepEqual(calls, [
      { url: "/api/workspace", account: "alice", generation: null },
      { url: "/api/learning", account: "alice", generation: generationA },
      { url: "/api/learning", account: "alice", generation: generationA },
    ]);
  });
});

test("an old account bootstrap cannot adopt another account's generation or archive its drafts", async () => {
  await harness(async (client) => {
    client.configureWorkspaceIdentity(true, "alice");
    let finishAlice!: (response: Response) => void;
    globalThis.fetch = async (_input, init) =>
      new Headers(init?.headers).get("X-Account-Id") === "alice"
        ? new Promise<Response>((resolve) => {
            finishAlice = resolve;
          })
        : Response.json({ accountId: "bob", generation: generationB });
    const alice = client.bootstrapWorkspace();
    client.configureWorkspaceIdentity(true, "bob");
    const bob = client.getWorkspaceStorage();
    bob.setItem("workspace-generation", generationB);
    bob.setItem("learning-draft:01:cours", "Bob's draft");
    assert.equal(await client.bootstrapWorkspace(), generationB);
    finishAlice(Response.json({ accountId: "alice", generation: generationA }));
    await assert.rejects(alice);
    assert.equal(await client.bootstrapWorkspace(), generationB);
    assert.equal(bob.getItem("learning-draft:01:cours"), "Bob's draft");
    assert.deepEqual(client.getArchivedDrafts(), []);
  });
});

test("account drafts, restore preparations and archives stay isolated including a late old-editor cleanup", async () => {
  await harness(async (client, raw) => {
    raw.setItem("learning-draft:01:cours", "Legacy local note");
    client.configureWorkspaceIdentity(true, "alice");
    const alice = client.getWorkspaceStorage();
    alice.setItem("workspace-generation", generationA);
    alice.setItem("learning-draft:01:cours", "Alice private draft");
    alice.setItem("backup-preparation", "Alice restore");
    await client.acceptRestoredGeneration(generationB);
    assert.equal(
      client.getArchivedDrafts()[0]?.drafts["learning-draft:01:cours"],
      "Alice private draft",
    );
    client.configureWorkspaceIdentity(true, "bob");
    const bob = client.getWorkspaceStorage();
    assert.equal(bob.getItem("learning-draft:01:cours"), null);
    assert.equal(bob.getItem("backup-preparation"), null);
    assert.deepEqual(client.getArchivedDrafts(), []);
    bob.setItem("learning-draft:01:cours", "Bob private draft");
    alice.setItem("learning-draft:01:cours", "Late Alice cleanup");
    assert.equal(bob.getItem("learning-draft:01:cours"), "Bob private draft");
    bob.clear();
    assert.equal(
      alice.getItem("learning-draft:01:cours"),
      "Late Alice cleanup",
    );
    assert.equal(raw.getItem("learning-draft:01:cours"), "Legacy local note");
    client.configureWorkspaceIdentity(false, null);
    assert.equal(
      client.getWorkspaceStorage().getItem("learning-draft:01:cours"),
      "Legacy local note",
    );
    assert.deepEqual(client.getArchivedDrafts(), []);
  });
});

test("a changed-cookie rejection suspends personal requests until identity is revalidated", async () => {
  await harness(async (client, _storage, events) => {
    client.configureWorkspaceIdentity(true, "alice");
    let requests = 0;
    globalThis.fetch = async (input) => {
      requests++;
      return input === "/api/workspace"
        ? Response.json({ accountId: "alice", generation: generationA })
        : Response.json({ code: "ACCOUNT_CHANGED" }, { status: 409 });
    };
    await assert.rejects(
      client.appFetch("/api/learning"),
      (error: unknown) =>
        error instanceof client.WorkspaceClientError && error.status === 409,
    );
    assert.deepEqual(events, ["account-changed"]);
    await assert.rejects(
      client.appFetch("/api/learning", { method: "POST", body: "old draft" }),
    );
    assert.equal(requests, 2);
    client.configureWorkspaceIdentity(true, null);
    await assert.rejects(client.bootstrapWorkspace());
    assert.equal(requests, 2);
  });
});

test("restoration keeps its original generation while retaining account guards and accepts its changed-generation receipt", async () => {
  await harness(async (client, _storage, events) => {
    client.configureWorkspaceIdentity(true, "alice");
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "/api/backups/restore");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("X-Account-Id"), "alice");
      assert.equal(headers.get("X-Workspace-Generation"), generationA);
      return Response.json(
        { generation: generationB },
        { headers: { "X-Workspace-Generation": generationB } },
      );
    };
    const result = await client.appFetch(
      "/api/backups/restore",
      { method: "POST", body: "{}" },
      { generation: generationA, allowWorkspaceChange: true },
    );
    assert.deepEqual(await result.json(), { generation: generationB });
    assert.deepEqual(events, []);
  });
});

test("only the verified owner adopts local drafts and preserves conflicting account values and source bytes", async () => {
  await harness(async (client, raw) => {
    const source = {
      "workspace-generation": generationA,
      "learning-draft:01:cours": '{ "note": "Текст\n", "extra": 1 }',
      "backup-preparation": "old restore preparation",
      "workspace-archive:old": JSON.stringify([
        {
          generation: "old",
          archivedAt: "2026-09-01T00:00:00Z",
          drafts: { "resource-notes:ulp-001": "ancienne note" },
        },
      ]),
    };
    for (const [key, value] of Object.entries(source)) raw.setItem(key, value);
    client.adoptLegacyWorkspaceDrafts({ id: "member", role: "member" });
    assert.deepEqual(Object.fromEntries(raw.values), source);
    raw.setItem(
      "account:owner:learning-draft:01:cours",
      "Existing owner draft",
    );
    raw.setItem(
      "account:owner:backup-preparation",
      "Existing owner preparation",
    );
    client.adoptLegacyWorkspaceDrafts({ id: "owner", role: "owner" });
    client.configureWorkspaceIdentity(true, "owner");
    const owner = client.getWorkspaceStorage();
    assert.equal(
      owner.getItem("learning-draft:01:cours"),
      "Existing owner draft",
    );
    assert.equal(
      owner.getItem("backup-preparation"),
      "Existing owner preparation",
    );
    const snapshot = raw.getItem(owner.getItem("workspace-legacy-adopted")!);
    assert.deepEqual(JSON.parse(snapshot!), source);
    for (const [key, value] of Object.entries(source))
      assert.equal(raw.getItem(key), value);
    assert.ok(
      client
        .getArchivedDrafts()
        .some(
          (archive) =>
            archive.drafts["learning-draft:01:cours"] ===
            source["learning-draft:01:cours"],
        ),
    );
    const copied = [...raw.values];
    client.adoptLegacyWorkspaceDrafts({ id: "owner", role: "owner" });
    assert.deepEqual([...raw.values], copied);
    client.configureWorkspaceIdentity(true, "member");
    assert.deepEqual(client.getArchivedDrafts(), []);
  });
});

test("an interrupted legacy adoption retains source drafts and can finish without replacing an existing copy", async () => {
  await harness(async (client, raw) => {
    raw.setItem("learning-draft:01:cours", "Texte à garder");
    raw.setItem("backup-preparation", "Préparation à garder");
    const write = raw.setItem.bind(raw);
    raw.setItem = (key, value) => {
      if (key === "account:owner:learning-draft:01:cours")
        throw new Error("Storage quota");
      write(key, value);
    };
    assert.throws(
      () => client.adoptLegacyWorkspaceDrafts({ id: "owner", role: "owner" }),
      /brouillons restent conservés/,
    );
    assert.equal(raw.getItem("learning-draft:01:cours"), "Texte à garder");
    assert.equal(raw.getItem("backup-preparation"), "Préparation à garder");
    assert.equal(raw.getItem("account:owner:workspace-legacy-adopted"), null);
    raw.setItem = write;
    client.adoptLegacyWorkspaceDrafts({ id: "owner", role: "owner" });
    assert.equal(
      raw.getItem("account:owner:learning-draft:01:cours"),
      "Texte à garder",
    );
    assert.equal(
      raw.getItem("account:owner:backup-preparation"),
      "Préparation à garder",
    );
    assert.ok(raw.getItem("account:owner:workspace-legacy-adopted"));
    assert.equal(
      [...raw.values.keys()].filter((key) =>
        key.startsWith("account:owner:workspace-legacy-source"),
      ).length,
      1,
    );
  });
});
