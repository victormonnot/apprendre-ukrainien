import { NextResponse, type NextRequest } from "next/server";
import {
  assertRequestAccess,
  RequestAccessError,
} from "@/lib/server/request-access";

export function proxy(request: NextRequest) {
  try {
    assertRequestAccess(request);
    return NextResponse.next();
  } catch (error) {
    const status = error instanceof RequestAccessError ? error.status : 503;
    const message =
      error instanceof RequestAccessError
        ? error.message
        : "L’accès à l’application est momentanément indisponible.";
    return NextResponse.json(
      { message },
      {
        status,
        headers: {
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }
}

export const config = {
  // API handlers check access themselves before reading data or request bodies.
  // Keeping them out of Proxy avoids Next's body clone limit on backup uploads.
  matcher: "/((?!api/).*)",
};
