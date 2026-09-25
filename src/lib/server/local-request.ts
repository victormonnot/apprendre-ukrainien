import "server-only";
import {
  assertRequestAccess,
  assertRequestOrigin,
  RequestAccessError,
} from "./request-access";
import {
  assertWorkspaceGeneration,
  getWorkspaceGeneration,
  WORKSPACE_CHANGED_MESSAGE,
  WorkspaceChangedError,
} from "./workspace-generation";

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200) {
  const headers: Record<string, string> = {
    "Cache-Control": "private, no-store",
    Vary: "Origin",
  };
  if (![401, 403, 503].includes(status)) {
    try {
      headers["X-Workspace-Generation"] = getWorkspaceGeneration();
    } catch {
      /* Storage failures still need a usable HTTP response. */
    }
  }
  if (
    status === 409 &&
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    body.message === WORKSPACE_CHANGED_MESSAGE
  )
    body = { ...body, code: "WORKSPACE_CHANGED" };
  return Response.json(body, {
    status,
    headers,
  });
}

export function requireWorkspaceGeneration(request: Request) {
  try {
    assertWorkspaceGeneration(request.headers.get("X-Workspace-Generation"));
  } catch (error) {
    if (error instanceof WorkspaceChangedError)
      throw new RequestError(error.message, error.status);
    throw error;
  }
}

export function requireLocalRequest(
  request: Request,
  mutation = false,
  options: { checkGeneration?: boolean } = {},
) {
  try {
    const access = assertRequestAccess(request);
    assertRequestOrigin(request, access, mutation);
  } catch (error) {
    if (error instanceof RequestAccessError)
      throw new RequestError(error.message, error.status);
    throw error;
  }
  if (
    options.checkGeneration !== false &&
    (mutation || request.headers.has("X-Workspace-Generation"))
  )
    requireWorkspaceGeneration(request);
}

export async function readLocalJson(
  request: Request,
  options: { checkGeneration?: boolean } = {},
): Promise<Record<string, unknown>> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim() !==
    "application/json"
  ) {
    throw new RequestError("Un document JSON est attendu.", 415);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("La requête est vide.");
  let size = 0;
  let text = "";
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 128 * 1024) {
      await reader.cancel();
      throw new RequestError("La requête est trop volumineuse.", 413);
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  let body: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    body = value as Record<string, unknown>;
  } catch {
    throw new RequestError("La requête JSON est invalide.");
  }
  if (options.checkGeneration !== false) requireWorkspaceGeneration(request);
  return body;
}
