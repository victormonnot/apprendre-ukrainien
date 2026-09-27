import type { AudioVoiceId } from "./audio-types";

const STORAGE_KEY = "ukrainian-audio-voice";
const CHANGE_EVENT = "ukrainian-audio-voice-changed";
let unsavedPreference: AudioVoiceId | undefined;

function normalizeVoice(value: unknown): AudioVoiceId | null {
  if (value === "openai-cedar" || value === "openai-marin")
    return "openai-cedar";
  if (value === "openai-nova" || value === "macos-lesya") return "openai-nova";
  return null;
}

export function readAudioVoicePreference(): AudioVoiceId | null {
  if (unsavedPreference) return unsavedPreference;
  try {
    return normalizeVoice(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveAudioVoicePreference(voice: AudioVoiceId): void {
  const selected = normalizeVoice(voice);
  if (!selected) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, selected);
    unsavedPreference = undefined;
  } catch {
    unsavedPreference = selected;
  }
  // The storage event only reaches other documents, so notify this page too.
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: selected }));
}

export function subscribeAudioVoicePreference(
  listener: (voice: AudioVoiceId | null) => void,
): () => void {
  const onChange = (event: Event) => {
    const voice = normalizeVoice((event as CustomEvent<unknown>).detail);
    if (voice) listener(voice);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    try {
      if (event.storageArea !== window.localStorage) return;
    } catch {
      return;
    }
    const voice = normalizeVoice(event.newValue);
    if (event.newValue !== null && voice === null) return;
    unsavedPreference = undefined;
    listener(voice);
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
