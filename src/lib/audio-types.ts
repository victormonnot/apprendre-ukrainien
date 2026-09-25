export type AudioVoiceId = "macos-lesya" | "openai-marin" | "openai-cedar";
export type AudioVoice = {
  id: AudioVoiceId;
  label: string;
  provider: "macos" | "openai";
  available: boolean;
  description: string;
};
export type AudioSource =
  | { kind: "reference"; elementId: string }
  | { kind: "segment"; segmentId: string }
  | {
      kind: "scene";
      sceneId: string;
      variantId: string;
      version: number;
      lineId: string;
    }
  | {
      kind: "language";
      resultId: string;
      entryIndex: number;
      exampleIndex: number | null;
    }
  | { kind: "review"; attemptId: string };
export type AudioClip = {
  id: string;
  text: string;
  voiceId: AudioVoiceId;
  voiceLabel: string;
  provider: "macos" | "openai";
  model: string;
  mimeType: "audio/wav" | "audio/mpeg";
  createdAt: string;
  url: string;
};
export type AudioDescriptor = {
  text: string;
  voiceId: AudioVoiceId;
  voiceLabel: string;
  provider: "macos" | "openai";
  model: string;
  instructionsVersion: number;
};
export type AudioSegment = {
  id: string;
  text: string;
  french: string;
  sourceHref: string;
  source: AudioSource;
};
export type AudioCatalogue = {
  voices: AudioVoice[];
  defaultVoiceId: AudioVoiceId | null;
  groups: {
    id: string;
    title: string;
    description: string;
    segments: AudioSegment[];
  }[];
};
export const AUDIO_TEXT_MAX_LENGTH = 1_000;
