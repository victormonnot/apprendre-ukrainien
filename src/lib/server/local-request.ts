import "server-only";

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Origin" },
  });
}

export function requireLocalRequest(request: Request, mutation = false) {
  const host = request.headers.get("host");
  const protocol = new URL(request.url).protocol;
  const target = host ? new URL(`${protocol}//${host}`) : null;
  if (
    !target ||
    target.host !== host ||
    !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)
  ) {
    throw new RequestError(
      "Le suivi personnel est accessible depuis l’application locale.",
      403,
    );
  }
  const origin = request.headers.get("origin");
  if (
    (mutation && origin !== target.origin) ||
    (origin && origin !== target.origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new RequestError(
      "Cette requête ne provient pas de l’application.",
      403,
    );
  }
}

export async function readLocalJson(
  request: Request,
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
  return body;
}
