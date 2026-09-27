import assert from "node:assert/strict";
import test from "node:test";
import type { AudioVoiceId } from "../../src/lib/audio-types.ts";

const storageKey = "ukrainian-audio-voice";
const changeEvent = "ukrainian-audio-voice-changed";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  failWrites = false;
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
    if (this.failWrites) throw new Error("Storage unavailable");
    this.values.set(key, value);
  }
}

let moduleId = 0;
async function harness(
  operation: (
    client: typeof import("../../src/lib/audio-preference.ts"),
    storage: MemoryStorage,
    events: EventTarget,
  ) => void,
) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousFetch = globalThis.fetch;
  const storage = new MemoryStorage();
  const events = Object.assign(new EventTarget(), { localStorage: storage });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: events,
  });
  globalThis.fetch = async () =>
    assert.fail("a preference change must never generate audio");
  try {
    const url = new URL("../../src/lib/audio-preference.ts", import.meta.url);
    url.searchParams.set("test", String(moduleId++));
    const client = (await import(
      url.href
    )) as typeof import("../../src/lib/audio-preference.ts");
    operation(client, storage, events);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow)
      Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

function storageEvent(
  events: EventTarget,
  storage: Storage,
  value: string | null,
  key = storageKey,
) {
  const event = new Event("storage");
  Object.defineProperties(event, {
    key: { value: key },
    storageArea: { value: storage },
    newValue: { value },
  });
  events.dispatchEvent(event);
}

test("saved voice preferences map retired choices to the matching new voice without writing or notifying", async () => {
  await harness((client, storage) => {
    const changes: (AudioVoiceId | null)[] = [];
    const unsubscribe = client.subscribeAudioVoicePreference((voice) =>
      changes.push(voice),
    );
    for (const [saved, expected] of [
      ["openai-marin", "openai-cedar"],
      ["macos-lesya", "openai-nova"],
      ["openai-cedar", "openai-cedar"],
      ["openai-nova", "openai-nova"],
      ["unknown", null],
    ] as const) {
      storage.setItem(storageKey, saved);
      assert.equal(client.readAudioVoicePreference(), expected);
      assert.equal(storage.getItem(storageKey), saved);
    }
    storage.removeItem(storageKey);
    assert.equal(client.readAudioVoicePreference(), null);
    assert.deepEqual(changes, []);
    unsubscribe();
  });
});

test("explicit choices and cross-tab events publish only current voice IDs and ignore unrelated storage", async () => {
  await harness((client, storage, events) => {
    const changes: (AudioVoiceId | null)[] = [];
    const unsubscribe = client.subscribeAudioVoicePreference((voice) =>
      changes.push(voice),
    );
    client.saveAudioVoicePreference("openai-marin");
    assert.equal(storage.getItem(storageKey), "openai-cedar");
    client.saveAudioVoicePreference("macos-lesya");
    assert.equal(storage.getItem(storageKey), "openai-nova");
    events.dispatchEvent(
      new CustomEvent(changeEvent, { detail: "openai-marin" }),
    );
    storageEvent(events, storage, "macos-lesya");
    storageEvent(events, storage, "openai-nova");
    storageEvent(events, storage, null);
    assert.deepEqual(changes, [
      "openai-cedar",
      "openai-nova",
      "openai-cedar",
      "openai-nova",
      "openai-nova",
      null,
    ]);
    events.dispatchEvent(new CustomEvent(changeEvent, { detail: "unknown" }));
    storageEvent(events, storage, "unknown");
    storageEvent(events, storage, "openai-cedar", "another-app");
    storageEvent(events, new MemoryStorage(), "openai-cedar");
    assert.equal(changes.length, 6);
    unsubscribe();
    client.saveAudioVoicePreference("openai-cedar");
    storageEvent(events, storage, "openai-nova");
    assert.equal(changes.length, 6);
  });
});

test("unavailable preference storage keeps a normalized in-memory choice until another tab changes it", async () => {
  await harness((client, storage, events) => {
    const changes: (AudioVoiceId | null)[] = [];
    const unsubscribe = client.subscribeAudioVoicePreference((voice) =>
      changes.push(voice),
    );
    storage.failWrites = true;
    client.saveAudioVoicePreference("macos-lesya");
    assert.equal(client.readAudioVoicePreference(), "openai-nova");
    assert.equal(storage.getItem(storageKey), null);
    assert.deepEqual(changes, ["openai-nova"]);
    storage.failWrites = false;
    storage.setItem(storageKey, "openai-marin");
    storageEvent(events, storage, "openai-marin");
    assert.equal(client.readAudioVoicePreference(), "openai-cedar");
    assert.deepEqual(changes, ["openai-nova", "openai-cedar"]);
    unsubscribe();
  });
});
