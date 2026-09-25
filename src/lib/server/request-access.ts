import { timingSafeEqual } from "node:crypto";

export type RequestAccessEnvironment = {
  APP_ORIGIN?: string;
  APP_PROXY_SECRET?: string;
};
export type RequestAccessContext = {
  mode: "local" | "hosted";
  origin: string;
};

export class RequestAccessError extends Error {
  readonly status: number;
  readonly code:
    "ACCESS_CONFIGURATION_INVALID" | "ACCESS_DENIED" | "ORIGIN_DENIED";

  constructor(
    message: string,
    status: number,
    code: RequestAccessError["code"],
  ) {
    super(message);
    this.name = "RequestAccessError";
    this.status = status;
    this.code = code;
  }
}

function invalidConfiguration(): never {
  throw new RequestAccessError(
    "L’accès à l’application n’est pas correctement configuré.",
    503,
    "ACCESS_CONFIGURATION_INVALID",
  );
}
function denied(): never {
  throw new RequestAccessError(
    "Cette requête ne provient pas d’un accès autorisé à l’application.",
    403,
    "ACCESS_DENIED",
  );
}

/** Verifies the connection boundary only; it never opens personal storage. */
export function assertRequestAccess(
  request: Request,
  environment: RequestAccessEnvironment = {
    APP_ORIGIN: process.env.APP_ORIGIN,
    APP_PROXY_SECRET: process.env.APP_PROXY_SECRET,
  },
): RequestAccessContext {
  const configuredOrigin = environment.APP_ORIGIN;
  const secret = environment.APP_PROXY_SECRET;
  const host = request.headers.get("host");
  if (configuredOrigin !== undefined || secret !== undefined) {
    if (
      typeof configuredOrigin !== "string" ||
      typeof secret !== "string" ||
      !/^[0-9a-fA-F]{64}$/.test(secret)
    )
      invalidConfiguration();
    let origin: URL;
    try {
      origin = new URL(configuredOrigin);
    } catch {
      invalidConfiguration();
    }
    if (
      origin.protocol !== "https:" ||
      origin.username !== "" ||
      origin.password !== "" ||
      origin.pathname !== "/" ||
      origin.search !== "" ||
      origin.hash !== "" ||
      origin.origin !== configuredOrigin
    )
      invalidConfiguration();
    if (host !== origin.host) denied();
    const supplied = request.headers.get("x-app-proxy-secret");
    if (supplied === null) denied();
    const actualBytes = Buffer.from(supplied, "utf8");
    const expectedBytes = Buffer.from(secret, "utf8");
    if (
      actualBytes.byteLength !== expectedBytes.byteLength ||
      !timingSafeEqual(actualBytes, expectedBytes)
    )
      denied();
    return { mode: "hosted", origin: configuredOrigin };
  }

  if (!host) denied();
  let target: URL;
  try {
    const protocol = new URL(request.url).protocol;
    if (protocol !== "http:" && protocol !== "https:") denied();
    target = new URL(`${protocol}//${host}`);
  } catch {
    denied();
  }
  if (
    target.host !== host ||
    !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)
  )
    denied();
  return { mode: "local", origin: target.origin };
}

/** Checks browser origin separately so page navigation can use the same access gate. */
export function assertRequestOrigin(
  request: Request,
  access: RequestAccessContext,
  mutation = false,
): void {
  const origin = request.headers.get("origin");
  if (
    (mutation && origin !== access.origin) ||
    (origin !== null && origin !== access.origin) ||
    request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site"
  )
    throw new RequestAccessError(
      "Cette requête ne provient pas de l’application.",
      403,
      "ORIGIN_DENIED",
    );
}
