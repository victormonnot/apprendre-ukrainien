import assert from "node:assert/strict";
import test from "node:test";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  failArchives = false;
  failGeneration = false;
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
    if (this.failArchives && key.startsWith("workspace-archive:"))
      throw new Error("Storage is full");
    if (this.failGeneration && key === "workspace-generation")
      throw new Error("Generation storage is full");
    this.values.set(key, value);
  }
}

let moduleId = 0;
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
      dispatchEvent: (event: Event) => {
        events.push(event.type);
        return true;
      },
    },
  });
  try {
    const url = new URL("../../src/lib/workspace-client.ts", import.meta.url);
    url.searchParams.set("test", String(moduleId++));
    const client = (await import(
      url.href
    )) as typeof import("../../src/lib/workspace-client.ts");
    await operation(client, storage, events);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow)
      Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

const previous = "1".repeat(32);
const restored = "2".repeat(32);

test("bootstrap archives all old application drafts before exposing restored data and retains other storage", async () => {
  await harness(async (client, storage) => {
    storage.setItem("workspace-generation", previous);
    const drafts = {
      "learning-draft:01:cours": '{"note":"мова"}',
      "exercise-draft:01-1": '{"answer":"А"}',
      "ukrainian-review-draft:attempt": "Привіт",
      "ukrainian-language-draft:general": '{"input":"Bonjour"}',
      "cafe-draft:01-cafe:rencontre:1:anna": '{"answer":"Дякую"}',
      "resource-notes:ulp-001": '{"notes":"À réécouter"}',
    };
    for (const [key, text] of Object.entries(drafts))
      storage.setItem(key, text);
    storage.setItem("ukrainian-audio-voice", "macos-lesya");
    storage.setItem("another-app", "untouched");
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ generation: restored });
    };
    assert.deepEqual(
      await Promise.all([
        client.bootstrapWorkspace(),
        client.bootstrapWorkspace(),
      ]),
      [restored, restored],
    );
    assert.equal(calls, 1);
    for (const key of Object.keys(drafts))
      assert.equal(storage.getItem(key), null);
    assert.equal(storage.getItem("workspace-generation"), restored);
    assert.equal(storage.getItem("ukrainian-audio-voice"), "macos-lesya");
    assert.equal(storage.getItem("another-app"), "untouched");
    const archives = client.getArchivedDrafts();
    assert.equal(archives.length, 1);
    assert.equal(archives[0]!.generation, previous);
    assert.deepEqual(archives[0]!.drafts, drafts);
  });
});

test("a mounted tab retains its original generation and announces a restoration without changing the response", async () => {
  await harness(async (client, storage, events) => {
    storage.setItem("workspace-generation", previous);
    const sent: {
      url: string;
      header: string | null;
      contentType: string | null;
    }[] = [];
    let bootstraps = 0;
    globalThis.fetch = async (input, init) => {
      if (input === "/api/workspace") {
        bootstraps++;
        return Response.json({ generation: previous });
      }
      const headers = new Headers(init?.headers);
      sent.push({
        url: String(input),
        header: headers.get("X-Workspace-Generation"),
        contentType: headers.get("Content-Type"),
      });
      return Response.json(
        { message: "Données restaurées", code: "WORKSPACE_CHANGED" },
        { status: 409, headers: { "X-Workspace-Generation": restored } },
      );
    };
    const response = await client.appFetch("/api/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      message: "Données restaurées",
      code: "WORKSPACE_CHANGED",
    });
    await client.appFetch("/api/learning");
    assert.equal(await client.bootstrapWorkspace(), previous);
    assert.equal(bootstraps, 1);
    assert.deepEqual(
      sent.map((entry) => entry.header),
      [previous, previous],
    );
    assert.equal(sent[0]!.contentType, "application/json");
    assert.deepEqual(events, ["workspace-changed", "workspace-changed"]);
    assert.equal(storage.getItem("workspace-generation"), previous);
  });
});

test("failed archival preserves every source draft and can retry safely", async () => {
  await harness(async (client, storage) => {
    storage.setItem("workspace-generation", previous);
    storage.setItem("learning-draft:01:cours", "texte à ne pas perdre");
    storage.failArchives = true;
    globalThis.fetch = async () => Response.json({ generation: restored });
    await assert.rejects(
      client.bootstrapWorkspace(),
      (error: unknown) =>
        error instanceof client.WorkspaceClientError &&
        error.message.includes("archivés"),
    );
    assert.equal(
      storage.getItem("learning-draft:01:cours"),
      "texte à ne pas perdre",
    );
    assert.equal(storage.getItem("workspace-generation"), previous);
    storage.failArchives = false;
    assert.equal(await client.bootstrapWorkspace(), restored);
    assert.equal(
      client.getArchivedDrafts()[0]!.drafts["learning-draft:01:cours"],
      "texte à ne pas perdre",
    );
  });
});

test("explicitly accepting restored data keeps earlier archives and isolates unversioned drafts", async () => {
  await harness(async (client, storage) => {
    storage.setItem("resource-notes:ulp-001", "ancien brouillon sans version");
    globalThis.fetch = async () => Response.json({ generation: previous });
    await client.bootstrapWorkspace();
    storage.setItem(
      "resource-notes:ulp-001",
      "nouveau brouillon avant restauration",
    );
    await client.acceptRestoredGeneration(restored);
    const archives = client.getArchivedDrafts();
    assert.equal(archives.length, 2);
    assert.deepEqual(
      new Set(archives.map((archive) => archive.generation)),
      new Set(["unversioned", previous]),
    );
    assert.equal(
      archives.find((archive) => archive.generation === previous)!.drafts[
        "resource-notes:ulp-001"
      ],
      "nouveau brouillon avant restauration",
    );
    assert.equal(
      archives.find((archive) => archive.generation === "unversioned")!.drafts[
        "resource-notes:ulp-001"
      ],
      "ancien brouillon sans version",
    );
    assert.equal(storage.getItem("resource-notes:ulp-001"), null);
    assert.equal(await client.bootstrapWorkspace(), restored);
  });
});

test("a successful response from a different generation never reaches an existing editor", async () => {
  await harness(async (client, storage, events) => {
    storage.setItem("workspace-generation", previous);
    globalThis.fetch = async (input) =>
      input === "/api/workspace"
        ? Response.json({ generation: previous })
        : Response.json(
            { notes: "Restored notes" },
            { headers: { "X-Workspace-Generation": restored } },
          );
    await assert.rejects(
      client.appFetch("/api/resources"),
      (error: unknown) =>
        error instanceof client.WorkspaceClientError && error.status === 409,
    );
    assert.deepEqual(events, ["workspace-changed"]);
    assert.equal(await client.bootstrapWorkspace(), previous);
  });
});

test("generation storage failure does not block an empty workspace", async () => {
  await harness(async (client, storage) => {
    storage.failGeneration = true;
    globalThis.fetch = async () => Response.json({ generation: previous });
    assert.equal(await client.bootstrapWorkspace(), previous);
    assert.equal(storage.getItem("workspace-generation"), null);
    assert.deepEqual(client.getArchivedDrafts(), []);
    assert.equal(await client.bootstrapWorkspace(), previous);
  });
});

test("quota recovery exports active drafts and older archives without changing storage", async () => {
  await harness(async (client, storage) => {
    storage.setItem("workspace-generation", previous);
    storage.setItem("resource-notes:ulp-001", "texte resté hors archive");
    storage.setItem(
      "workspace-archive:unversioned",
      JSON.stringify([
        {
          generation: "unversioned",
          archivedAt: "2026-09-25T00:00:00.000Z",
          drafts: { "learning-draft:01:cours": "ancienne note" },
        },
      ]),
    );
    storage.setItem("another-app", "private value not to export");
    storage.failArchives = true;
    globalThis.fetch = async () => Response.json({ generation: restored });
    await assert.rejects(client.bootstrapWorkspace());
    const before = [...storage.values];
    const originalDocument = Object.getOwnPropertyDescriptor(
      globalThis,
      "document",
    );
    const originalCreateObjectUrl = URL.createObjectURL;
    const blobs: Blob[] = [];
    let clicked = false;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        body: { append() {} },
        createElement: () => ({
          href: "",
          download: "",
          click() {
            clicked = true;
          },
          remove() {},
        }),
      },
    });
    URL.createObjectURL = (blob) => {
      blobs.push(blob as Blob);
      return "blob:workspace-test";
    };
    try {
      client.exportCurrentDrafts();
      assert.equal(clicked, true);
      const data = JSON.parse(await blobs[0]!.text());
      assert.equal(data.format, "ukrainian-workspace-drafts");
      assert.equal(data.current.generation, previous);
      assert.deepEqual(data.current.drafts, {
        "resource-notes:ulp-001": "texte resté hors archive",
      });
      assert.equal(
        data.archives[0].drafts["learning-draft:01:cours"],
        "ancienne note",
      );
      assert.deepEqual([...storage.values], before);
      assert.ok(!JSON.stringify(data).includes("private value not to export"));
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      if (originalDocument)
        Object.defineProperty(globalThis, "document", originalDocument);
      else Reflect.deleteProperty(globalThis, "document");
    }
  });
});
