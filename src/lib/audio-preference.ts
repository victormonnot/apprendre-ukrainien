import type { AudioVoiceId } from "./audio-types";

const STORAGE_KEY = "ukrainian-audio-voice";
const CHANGE_EVENT = "ukrainian-audio-voice-changed";
let unsavedPreference: AudioVoiceId | undefined;

function isVoice(value: unknown): value is AudioVoiceId {
  return (
    value === "macos-lesya" ||
    value === "openai-marin" ||
    value === "openai-cedar" ||
    value === "openai-nova"
  );
}

export function readAudioVoicePreference(): AudioVoiceId | null {
  if (unsavedPreference) return unsavedPreference;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isVoice(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function saveAudioVoicePreference(voice: AudioVoiceId): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, voice);
    unsavedPreference = undefined;
  } catch {
    unsavedPreference = voice;
  }
  // The storage event only reaches other documents, so notify this page too.
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: voice }));
}

export function subscribeAudioVoicePreference(
  listener: (voice: AudioVoiceId | null) => void,
): () => void {
  const onChange = (event: Event) => {
    const voice: unknown = (event as CustomEvent<unknown>).detail;
    if (isVoice(voice)) listener(voice);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    try {
      if (event.storageArea !== window.localStorage) return;
    } catch {
      return;
    }
    if (event.newValue !== null && !isVoice(event.newValue)) return;
    unsavedPreference = undefined;
    listener(event.newValue);
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
