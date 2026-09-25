import "server-only";
import { createHash } from "node:crypto";
import { audioGroups } from "@/content/audio";
import type {
  AudioCatalogue,
  AudioClip,
  AudioSource,
  AudioVoiceId,
} from "@/lib/audio-types";
import { openAudioStore } from "./audio-store";
import {
  audioVoices,
  describeAudio,
  synthesizeAudio,
  AudioProviderError,
} from "./audio-provider";
import { resolveAudioText } from "./audio-input";
import { getLanguageStore } from "./language-service";
import { getReviewStore } from "./review-service";
import { RequestError } from "./local-request";
import {
  assertWorkspaceGeneration,
  getWorkspaceGeneration,
  WorkspaceChangedError,
} from "./workspace-generation";

const state = globalThis as typeof globalThis & {
  audioStore?: ReturnType<typeof openAudioStore>;
  audioRequests?: Map<string, Promise<AudioClip>>;
  audioCalls?: Map<string, number[]>;
};
export function getAudioStore() {
  state.audioStore ??= openAudioStore();
  return state.audioStore;
}
export async function getAudioCatalogue(): Promise<AudioCatalogue> {
  const voices = await audioVoices();
  return {
    voices,
    defaultVoiceId:
      voices.find((voice) => voice.available)?.id ?? "macos-lesya",
    groups: audioGroups,
  };
}
export async function requestAudio(
  userId: string,
  source: AudioSource,
  voiceId: AudioVoiceId,
): Promise<AudioClip> {
  const generation = getWorkspaceGeneration();
  const text = resolveAudioText(source, {
    getResult: (id) => getLanguageStore().getResult(userId, id),
    getActiveReview: () => getReviewStore().getOverview(userId).active,
  });
  const descriptor = describeAudio(voiceId, text);
  const store = getAudioStore();
  const cached = store.findClip(userId, descriptor);
  if (cached) return cached;
  state.audioRequests ??= new Map();
  state.audioCalls ??= new Map();
  const owner = `${generation}:${userId}`;
  const key = `${owner}:${createHash("sha256").update(JSON.stringify(descriptor)).digest("hex")}`;
  const pending = state.audioRequests.get(key);
  if (pending) return pending;
  if (
    [...state.audioRequests.keys()].some((entry) =>
      entry.startsWith(`${owner}:`),
    )
  )
    throw new AudioProviderError(
      "Un son est déjà en préparation. Réessaie dans un instant.",
      429,
    );
  const now = Date.now();
  const recent = (state.audioCalls.get(owner) ?? []).filter(
    (time) => now - time < 60_000,
  );
  if (recent.length >= 12)
    throw new AudioProviderError(
      "Plusieurs sons viennent d’être créés. Réessaie dans une minute ; les sons déjà disponibles restent lisibles.",
      429,
    );
  const promise = (async () => {
    const voices = await audioVoices();
    assertWorkspaceGeneration(generation);
    if (!voices.find((voice) => voice.id === voiceId)?.available)
      throw new AudioProviderError(
        "Cette voix ne peut pas créer ce son pour le moment. Choisis une voix disponible ; les sons déjà créés restent lisibles.",
        503,
      );
    state.audioCalls!.set(owner, [...recent, now]);
    const result = await synthesizeAudio(descriptor);
    assertWorkspaceGeneration(generation);
    return store.saveClip(userId, descriptor, result.bytes, result.mimeType);
  })().catch((error: unknown) => {
    if (error instanceof WorkspaceChangedError)
      throw new RequestError(error.message, error.status);
    throw error;
  });
  state.audioRequests.set(key, promise);
  try {
    return await promise;
  } finally {
    if (state.audioRequests.get(key) === promise)
      state.audioRequests.delete(key);
  }
}
