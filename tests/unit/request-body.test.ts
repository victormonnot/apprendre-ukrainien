import assert from "node:assert/strict";
import test from "node:test";
import { readBodyChunk } from "../../src/lib/server/request-body.ts";

test("normal request bytes are preserved", async () => {
  const bytes = new TextEncoder().encode("привіт");
  const reader = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  }).getReader();
  assert.deepEqual(
    (await readBodyChunk(reader, Date.now() + 1000)).value,
    bytes,
  );
  assert.equal((await readBodyChunk(reader, Date.now() + 1000)).done, true);
  reader.releaseLock();
});
test("a stalled body is cancelled at the total deadline", async () => {
  let cancelled = false;
  const reader = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  }).getReader();
  await assert.rejects(
    readBodyChunk(reader, Date.now() + 15),
    /REQUEST_BODY_TIMEOUT/,
  );
  assert.equal(cancelled, true);
  reader.releaseLock();
});
test("an elapsed deadline never accepts another chunk", async () => {
  const reader = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array([1]));
    },
  }).getReader();
  await assert.rejects(
    readBodyChunk(reader, Date.now() - 1),
    /REQUEST_BODY_TIMEOUT/,
  );
  reader.releaseLock();
});
