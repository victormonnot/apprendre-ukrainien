import { handleAuth } from "@/lib/server/auth-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return handleAuth(request, "status");
}
