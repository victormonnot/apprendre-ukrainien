import assert from "node:assert/strict";
import test from "node:test";
import {
  computeEnvelope,
  ENVELOPE_RATE,
  envelopeAt,
} from "../../src/lib/voice-envelope.ts";

const RATE = 6_000;

function tone(seconds: number, amplitude: number) {
  return Float32Array.from(
    { length: Math.round(seconds * RATE) },
    (_, index) => Math.sin((index / RATE) * 2 * Math.PI * 200) * amplitude,
  );
}

test("silence produces a closed mouth for every frame", () => {
  const envelope = computeEnvelope(new Float32Array(RATE), RATE);
  assert.equal(envelope.length, ENVELOPE_RATE);
  assert.ok(envelope.every((level) => level === 0));
});

test("speech bursts open the mouth and pauses close it", () => {
  const samples = new Float32Array(RATE);
  samples.set(tone(0.3, 0.5), 0);
  samples.set(tone(0.3, 0.1), Math.round(0.6 * RATE));
  const envelope = computeEnvelope(samples, RATE);
  assert.ok(envelopeAt(envelope, 0.15) > 0.9, "loud syllable");
  assert.equal(envelopeAt(envelope, 0.45), 0, "pause");
  const quiet = envelopeAt(envelope, 0.75);
  assert.ok(quiet > 0 && quiet < 0.25, "quiet syllable stays half closed");
  assert.ok(envelope.every((level) => level >= 0 && level <= 1));
});

test("reading outside the clip or between frames stays within bounds", () => {
  const envelope = Float32Array.from([0, 1, 0]);
  assert.equal(envelopeAt(envelope, -1), 0);
  assert.equal(envelopeAt(envelope, 10), 0);
  assert.equal(envelopeAt(envelope, 0.5 / ENVELOPE_RATE), 0.5);
  assert.equal(envelopeAt(envelope, 1 / ENVELOPE_RATE), 1);
});
