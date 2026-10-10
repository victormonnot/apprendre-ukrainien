/** Loudness frames per second used to animate a speaking character. */
export const ENVELOPE_RATE = 60;
const SILENCE = 0.15;

/**
 * Turns decoded samples into a 0–1 loudness curve: one RMS value per frame,
 * normalised on the loud passages, with quiet frames treated as silence.
 */
export function computeEnvelope(
  samples: Float32Array,
  sampleRate: number,
  rate = ENVELOPE_RATE,
): Float32Array {
  const size = Math.max(1, Math.round(sampleRate / rate));
  const levels = new Float32Array(Math.ceil(samples.length / size));
  for (let frame = 0; frame < levels.length; frame++) {
    const start = frame * size;
    const end = Math.min(samples.length, start + size);
    let sum = 0;
    for (let index = start; index < end; index++) sum += samples[index]! ** 2;
    levels[frame] = Math.sqrt(sum / (end - start));
  }
  const sorted = Float32Array.from(levels).sort();
  const reference = sorted[Math.floor((sorted.length - 1) * 0.95)] ?? 0;
  if (reference < 1e-4) return levels.fill(0);
  for (let frame = 0; frame < levels.length; frame++) {
    const level = Math.min(1, levels[frame]! / reference);
    levels[frame] =
      level < SILENCE ? 0 : ((level - SILENCE) / (1 - SILENCE)) ** 0.75;
  }
  return levels;
}

/** Reads the curve at a playback time, interpolating between frames. */
export function envelopeAt(
  envelope: Float32Array,
  time: number,
  rate = ENVELOPE_RATE,
) {
  const position = time * rate;
  const index = Math.floor(position);
  if (index < 0 || index >= envelope.length) return 0;
  const current = envelope[index]!;
  const next = envelope[Math.min(envelope.length - 1, index + 1)]!;
  return current + (next - current) * (position - index);
}

const envelopes = new Map<string, Promise<Float32Array | null>>();

/** Decodes a clip once per URL; playback itself never goes through Web Audio. */
export function loadVoiceEnvelope(url: string) {
  let envelope = envelopes.get(url);
  if (!envelope) {
    envelope = (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const context = new OfflineAudioContext(1, 1, 44100);
        const buffer = await context.decodeAudioData(
          await response.arrayBuffer(),
        );
        return computeEnvelope(buffer.getChannelData(0), buffer.sampleRate);
      } catch {
        return null;
      }
    })();
    envelopes.set(url, envelope);
  }
  return envelope;
}
