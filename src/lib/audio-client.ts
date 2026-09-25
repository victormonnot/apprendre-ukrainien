import { appFetch, WorkspaceClientError } from "./workspace-client";
import type {
  AudioCatalogue,
  AudioClip,
  AudioSource,
  AudioVoiceId,
} from "./audio-types";

export class AudioRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AudioRequestError";
    this.status = status;
  }
}

async function request<T>(init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await appFetch("/api/audio", { ...init, cache: "no-store" });
  } catch (error) {
    if (
      error instanceof WorkspaceClientError ||
      (error instanceof Error && error.name === "AbortError")
    )
      throw error;
    throw new AudioRequestError(
      0,
      "Le service audio est injoignable. Tu peux réessayer.",
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AudioRequestError(
      response.status,
      "La réponse audio est indisponible. Réessaie.",
    );
  }
  if (!response.ok) {
    throw new AudioRequestError(
      response.status,
      typeof body === "object" &&
        body !== null &&
        "message" in body &&
        typeof body.message === "string"
        ? body.message
        : "Cet audio est momentanément indisponible.",
    );
  }
  return body as T;
}

let catalogue: AudioCatalogue | null = null;
let catalogueRequest: Promise<AudioCatalogue> | null = null;

export function loadAudioCatalogue(refresh = false): Promise<AudioCatalogue> {
  if (refresh) catalogue = null;
  if (catalogue) return Promise.resolve(catalogue);
  if (!catalogueRequest) {
    catalogueRequest = request<AudioCatalogue>()
      .then((value) => {
        catalogue = value;
        return value;
      })
      .finally(() => {
        catalogueRequest = null;
      });
  }
  return catalogueRequest;
}

export function prepareAudio(
  source: AudioSource,
  voiceId: AudioVoiceId,
  signal?: AbortSignal,
) {
  return request<AudioClip>({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, voiceId }),
    signal,
  });
}
