import "server-only";
import { getResource } from "@/content/resources";
import { RequestError } from "./local-request";
import { openResourceStore } from "./resource-store";
import { getRequestStore } from "./account-context";

export function getResourceStore() {
  return getRequestStore("resources", openResourceStore);
}

export function requireResource(id: string) {
  const resource = getResource(id);
  if (!resource)
    throw new RequestError("Cette ressource est introuvable.", 404);
  return resource;
}
