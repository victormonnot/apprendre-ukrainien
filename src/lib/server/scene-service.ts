import "server-only";
import { getScene } from "@/content/scenes";
import { openSceneStore } from "./scene-store";
import { RequestError } from "./local-request";

const state = globalThis as typeof globalThis & {
  sceneStore?: ReturnType<typeof openSceneStore>;
};

export function getSceneStore() {
  state.sceneStore ??= openSceneStore();
  return state.sceneStore;
}

export function requireScene(
  sceneId: string,
  variantId: string,
  version?: number,
) {
  const scene = getScene(sceneId, variantId, version);
  if (!scene) throw new RequestError("Cette scène est introuvable.", 404);
  return scene;
}
