import { readBodyChunk } from "@/lib/server/request-body";
import { getRequestAccount } from "@/lib/server/account-context";
import { withAccount } from "@/lib/server/account-request";
import { BACKUP_MAX_BYTES } from "@/lib/backup-types";
import { getBackupStore } from "@/lib/server/backup-service";
import { backupErrorResponse } from "@/lib/server/backup-http";
import {
  json,
  requireLocalRequest,
  requireWorkspaceGeneration,
  RequestError,
} from "@/lib/server/local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let activeInspections = 0;
async function handlePOST(request: Request) {
  let reserved = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    requireLocalRequest(request, true);
    if (activeInspections >= 2)
      throw new RequestError(
        "Deux imports sont déjà en cours. Réessaie dans un instant.",
        429,
      );
    activeInspections++;
    reserved = true;
    if (request.headers.get("content-type") !== "application/octet-stream")
      throw new RequestError("Un fichier de sauvegarde est attendu.", 415);
    const maximum =
      getRequestAccount()?.role === "member"
        ? 8 * 1024 * 1024
        : BACKUP_MAX_BYTES;
    const limitMessage = `Le fichier dépasse la limite de ${maximum / 1024 / 1024} Mio.`;
    const length = Number(request.headers.get("content-length"));
    if (Number.isFinite(length) && length > maximum)
      throw new RequestError(limitMessage, 413);
    reader = request.body?.getReader();
    if (!reader) throw new RequestError("Le fichier est vide.");
    const parts: Uint8Array[] = [];
    let size = 0;
    const deadline = Date.now() + 60_000;
    while (true) {
      const { done, value } = await readBodyChunk(reader, deadline);
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new RequestError(limitMessage, 413);
      }
      parts.push(value);
    }
    requireWorkspaceGeneration(request);
    return json(getBackupStore().inspectBackup(Buffer.concat(parts, size)));
  } catch (error) {
    return backupErrorResponse(error);
  } finally {
    reader?.releaseLock();
    if (reserved) activeInspections--;
  }
}

export const POST = withAccount(handlePOST);
