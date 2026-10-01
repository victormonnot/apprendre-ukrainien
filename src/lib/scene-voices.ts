import type { AudioVoiceId } from "./audio-types";
import type { SceneRoleId } from "./scene-types";

// Casting is a playback choice; published dialogue and saved attempts stay intact.
export const sceneVoiceIds: Readonly<Record<SceneRoleId, AudioVoiceId>> =
  Object.freeze({
    anna: "openai-nova",
    maxime: "openai-cedar",
  });
