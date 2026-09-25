import "server-only";
import { getResource } from "@/content/resources";
import { RequestError } from "./local-request";
import { openResourceStore } from "./resource-store";

const state = globalThis as typeof globalThis & {
  resourceStore?: ReturnType<typeof openResourceStore>;
};

export function getResourceStore() {
  state.resourceStore ??= openResourceStore();
  return state.resourceStore;
}

export function requireResource(id: string) {
  const resource = getResource(id);
  if (!resource)
    throw new RequestError("Cette ressource est introuvable.", 404);
  return resource;
}
