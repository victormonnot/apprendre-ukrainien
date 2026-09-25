import { appFetch, WorkspaceClientError } from "./workspace-client";
import type { ResourceCommand, ResourceWorkspace } from "./resource-types";

export class ResourceRequestError extends Error {
  readonly status: number;
  readonly workspace?: ResourceWorkspace;
  constructor(status: number, message: string, workspace?: ResourceWorkspace) {
    super(message);
    this.name = "ResourceRequestError";
    this.status = status;
    this.workspace = workspace;
  }
}

async function requestResource<T>(
  query = "",
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await appFetch(`/api/resources${query}`, {
      ...init,
      cache: "no-store",
    });
  } catch (error) {
    if (
      error instanceof WorkspaceClientError ||
      (error instanceof Error && error.name === "AbortError")
    )
      throw error;
    throw new ResourceRequestError(
      0,
      "L’application est injoignable. Tes notes restent ici ; tu peux réessayer.",
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ResourceRequestError(
      response.status,
      "La réponse est indisponible. Réessaie sans fermer cette page.",
    );
  }
  if (!response.ok) {
    const payload =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>)
        : {};
    const message =
      typeof payload.message === "string"
        ? payload.message
        : "La ressource est momentanément indisponible.";
    throw new ResourceRequestError(
      response.status,
      message,
      response.status === 409
        ? (payload.workspace as ResourceWorkspace | undefined)
        : undefined,
    );
  }
  return body as T;
}

export function loadResourceLibrary(signal?: AbortSignal) {
  return requestResource<{ resources: ResourceWorkspace[] }>("", { signal });
}

export function loadResourceWorkspace(id: string, signal?: AbortSignal) {
  return requestResource<ResourceWorkspace>(`?${new URLSearchParams({ id })}`, {
    signal,
  });
}

export function updateResource(command: ResourceCommand) {
  return requestResource<ResourceWorkspace>("", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
}
