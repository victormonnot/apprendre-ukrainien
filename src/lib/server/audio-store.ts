import { createHash, randomUUID } from "node:crypto";
import {
  AUDIO_TEXT_MAX_LENGTH,
  type AudioClip,
  type AudioDescriptor,
} from "../audio-types.ts";
import { openDatabase, transaction, type DatabaseOptions } from "./database.ts";

type StoreOptions = DatabaseOptions & { now?: () => Date };
type ClipRow = {
  id: string;
  text: string;
  voice_id: AudioClip["voiceId"];
  voice_label: string;
  provider: AudioClip["provider"];
  model: string;
  mime_type: AudioClip["mimeType"];
  bytes: Uint8Array;
  created_at: string;
};

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const METADATA_COLUMNS =
  "id, text, voice_id, voice_label, provider, model, mime_type, created_at";

export class AudioValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioValidationError";
  }
}

function canonicalDescriptor(descriptor: AudioDescriptor): AudioDescriptor {
  const text = descriptor.text.normalize("NFC").trim().replace(/\s+/gu, " ");
  const validVoice =
    (descriptor.provider === "macos" && descriptor.voiceId === "macos-lesya") ||
    (descriptor.provider === "openai" &&
      (descriptor.voiceId === "openai-marin" ||
        descriptor.voiceId === "openai-cedar" ||
        descriptor.voiceId === "openai-nova"));
  if (
    text.length === 0 ||
    text.length > AUDIO_TEXT_MAX_LENGTH ||
    !validVoice ||
    descriptor.voiceLabel.trim().length === 0 ||
    descriptor.voiceLabel.length > 200 ||
    descriptor.model.trim().length === 0 ||
    descriptor.model.length > 200 ||
    !Number.isSafeInteger(descriptor.instructionsVersion) ||
    descriptor.instructionsVersion < 1
  ) {
    throw new AudioValidationError("Invalid audio descriptor.");
  }
  return { ...descriptor, text };
}

function descriptorKey(descriptor: AudioDescriptor): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        text: descriptor.text,
        voiceId: descriptor.voiceId,
        provider: descriptor.provider,
        model: descriptor.model,
        instructionsVersion: descriptor.instructionsVersion,
      }),
    )
    .digest("hex");
}

function isWave(bytes: Buffer): boolean {
  if (
    bytes.length < 44 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WAVE" ||
    bytes.readUInt32LE(4) + 8 !== bytes.length
  ) {
    return false;
  }
  let hasFormat = false;
  let hasData = false;
  let position = 12;
  while (position + 8 <= bytes.length) {
    const kind = bytes.toString("ascii", position, position + 4);
    const size = bytes.readUInt32LE(position + 4);
    const start = position + 8;
    const end = start + size;
    if (end > bytes.length) return false;
    if (kind === "fmt ") {
      if (
        size < 16 ||
        bytes.readUInt16LE(start + 2) === 0 ||
        bytes.readUInt32LE(start + 4) === 0
      ) {
        return false;
      }
      hasFormat = true;
    }
    if (kind === "data" && size > 0) hasData = true;
    position = end + (size % 2);
  }
  return hasFormat && hasData && position === bytes.length;
}

function isMp3(bytes: Buffer): boolean {
  let position = 0;
  if (bytes.toString("ascii", 0, 3) === "ID3") {
    if (bytes.length < 10 || ![2, 3, 4].includes(bytes[3]!)) return false;
    const sizeBytes = bytes.subarray(6, 10);
    if (sizeBytes.some((byte) => byte >= 128)) return false;
    const size = sizeBytes.reduce((total, byte) => total * 128 + byte, 0);
    position = 10 + size;
    if (bytes[3] === 4 && (bytes[5]! & 0x10) !== 0) position += 10;
  }
  if (position + 4 > bytes.length) return false;
  const first = bytes[position]!;
  const second = bytes[position + 1]!;
  const third = bytes[position + 2]!;
  const validHeader =
    first === 0xff &&
    (second & 0xe0) === 0xe0 &&
    (second & 0x18) !== 0x08 &&
    (second & 0x06) === 0x02 &&
    (third & 0xf0) !== 0x00 &&
    (third & 0xf0) !== 0xf0 &&
    (third & 0x0c) !== 0x0c;
  if (!validHeader) return false;
  const version = (second >> 3) & 3;
  const bitrates =
    version === 3
      ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const bitrate = bitrates[third >> 4]! * 1000;
  const frequency =
    [44100, 48000, 32000][(third >> 2) & 3]! /
    (version === 3 ? 1 : version === 2 ? 2 : 4);
  const frameSize =
    Math.floor(((version === 3 ? 144 : 72) * bitrate) / frequency) +
    ((third >> 1) & 1);
  return position + frameSize <= bytes.length;
}

function validateBytes(bytes: Uint8Array, mimeType: AudioClip["mimeType"]) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_AUDIO_BYTES
  ) {
    throw new AudioValidationError(
      "Audio files must contain between 1 byte and 8 MiB of data.",
    );
  }
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    (mimeType !== "audio/wav" && mimeType !== "audio/mpeg") ||
    !(mimeType === "audio/wav" ? isWave(buffer) : isMp3(buffer))
  ) {
    throw new AudioValidationError(
      "Audio data does not match its WAV or MP3 format.",
    );
  }
}

function clipState(row: ClipRow): AudioClip {
  return {
    id: row.id,
    text: row.text,
    voiceId: row.voice_id,
    voiceLabel: row.voice_label,
    provider: row.provider,
    model: row.model,
    mimeType: row.mime_type,
    createdAt: row.created_at,
    url: `/api/audio/${row.id}`,
  };
}

export function openAudioStore(directory?: string, options: StoreOptions = {}) {
  const database = openDatabase(directory, options);

  function findByKey(userId: string, key: string): AudioClip | null {
    const row = database
      .prepare(
        `SELECT ${METADATA_COLUMNS} FROM audio_clips WHERE user_id = ? AND cache_key = ?`,
      )
      .get(userId, key) as ClipRow | undefined;
    return row ? clipState(row) : null;
  }

  return {
    findClip(userId: string, descriptor: AudioDescriptor): AudioClip | null {
      return findByKey(userId, descriptorKey(canonicalDescriptor(descriptor)));
    },

    saveClip(
      userId: string,
      descriptor: AudioDescriptor,
      bytes: Uint8Array,
      mimeType: AudioClip["mimeType"],
    ): AudioClip {
      const canonical = canonicalDescriptor(descriptor);
      validateBytes(bytes, mimeType);
      const key = descriptorKey(canonical);
      return transaction(database, () => {
        const existing = findByKey(userId, key);
        if (existing) return existing;
        database
          .prepare(
            `INSERT INTO audio_clips
              (id, user_id, cache_key, text, voice_id, voice_label, provider, model,
               instructions_version, mime_type, bytes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            randomUUID(),
            userId,
            key,
            canonical.text,
            canonical.voiceId,
            canonical.voiceLabel,
            canonical.provider,
            canonical.model,
            canonical.instructionsVersion,
            mimeType,
            bytes,
            (options.now?.() ?? new Date()).toISOString(),
          );
        return findByKey(userId, key)!;
      });
    },

    getClip(
      userId: string,
      id: string,
    ): { clip: AudioClip; bytes: Uint8Array } | null {
      const row = database
        .prepare("SELECT * FROM audio_clips WHERE user_id = ? AND id = ?")
        .get(userId, id) as ClipRow | undefined;
      return row ? { clip: clipState(row), bytes: row.bytes } : null;
    },

    close() {
      database.close();
    },
  };
}

export type AudioStore = ReturnType<typeof openAudioStore>;
