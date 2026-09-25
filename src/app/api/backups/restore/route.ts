import { getBackupStore } from "@/lib/server/backup-service";
import { backupErrorResponse } from "@/lib/server/backup-http";
import {
  json,
  readLocalJson,
  requireLocalRequest,
  RequestError,
} from "@/lib/server/local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    // The store checks the exact receipt before the generation, so a lost response
    // can be retried after a successful restore. Origin validation still applies.
    requireLocalRequest(request, true, { checkGeneration: false });
    const body = await readLocalJson(request, { checkGeneration: false });
    if (
      Object.keys(body).sort().join(",") !==
        "expectedGeneration,inspectionId,requestId,sha256" ||
      ![
        body.inspectionId,
        body.sha256,
        body.requestId,
        body.expectedGeneration,
      ].every((value) => typeof value === "string") ||
      request.headers.get("x-workspace-generation") !== body.expectedGeneration
    )
      throw new RequestError(
        "Cette confirmation de restauration est invalide.",
      );
    return json(
      getBackupStore().restoreBackup({
        inspectionId: body.inspectionId as string,
        sha256: body.sha256 as string,
        requestId: body.requestId as string,
        expectedGeneration: body.expectedGeneration as string,
      }),
    );
  } catch (error) {
    return backupErrorResponse(error);
  }
}
