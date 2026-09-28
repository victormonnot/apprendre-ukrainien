import "server-only";
import { getScene } from "@/content/scenes";
import { openSceneStore } from "./scene-store";
import { RequestError } from "./local-request";
import { getRequestStore } from "./account-context";

export function getSceneStore() {
  return getRequestStore("scenes", openSceneStore);
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
