import { appFetch, WorkspaceClientError } from "./workspace-client";
import type { SceneCommand, SceneRoleId, SceneWorkspace } from "./scene-types";

export class SceneRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SceneRequestError";
    this.status = status;
  }
}

async function requestScene(
  query = "",
  init: RequestInit = {},
): Promise<SceneWorkspace> {
  let response: Response;
  try {
    response = await appFetch(`/api/scenes${query}`, {
      ...init,
      cache: "no-store",
    });
  } catch (error) {
    if (
      error instanceof WorkspaceClientError ||
      (error instanceof Error && error.name === "AbortError")
    )
      throw error;
    throw new SceneRequestError(
      0,
      "L’application est injoignable. Tes réponses restent ici ; tu peux réessayer.",
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SceneRequestError(
      response.status,
      "La réponse est indisponible. Réessaie sans fermer cette page.",
    );
  }
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : "La scène est momentanément indisponible.";
    throw new SceneRequestError(response.status, message);
  }
  return body as SceneWorkspace;
}

export function loadSceneWorkspace(
  sceneId: string,
  variantId: string,
  roleId: SceneRoleId,
  signal?: AbortSignal,
) {
  return requestScene(
    `?${new URLSearchParams({ scene: sceneId, variant: variantId, role: roleId })}`,
    { signal },
  );
}

export function updateScene(command: SceneCommand) {
  return requestScene("", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
}
