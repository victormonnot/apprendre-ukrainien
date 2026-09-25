import {
  json,
  requireLocalRequest,
  RequestError,
} from "@/lib/server/local-request";
import { getWorkspaceGeneration } from "@/lib/server/workspace-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  try {
    requireLocalRequest(request, false, { checkGeneration: false });
    return json({ generation: getWorkspaceGeneration() });
  } catch (error) {
    if (error instanceof RequestError)
      return json({ message: error.message }, error.status);
    return json(
      { message: "La version des données est momentanément indisponible." },
      503,
    );
  }
}
