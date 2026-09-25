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
export async function POST(request: Request) {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    requireLocalRequest(request, true);
    if (request.headers.get("content-type") !== "application/octet-stream")
      throw new RequestError("Un fichier de sauvegarde est attendu.", 415);
    const length = Number(request.headers.get("content-length"));
    if (Number.isFinite(length) && length > BACKUP_MAX_BYTES)
      throw new RequestError("Le fichier dépasse la limite de 256 Mio.", 413);
    reader = request.body?.getReader();
    if (!reader) throw new RequestError("Le fichier est vide.");
    const parts: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BACKUP_MAX_BYTES) {
        await reader.cancel();
        throw new RequestError("Le fichier dépasse la limite de 256 Mio.", 413);
      }
      parts.push(value);
    }
    requireWorkspaceGeneration(request);
    return json(getBackupStore().inspectBackup(Buffer.concat(parts, size)));
  } catch (error) {
    return backupErrorResponse(error);
  } finally {
    reader?.releaseLock();
  }
}
