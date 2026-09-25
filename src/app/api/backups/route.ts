import { getBackupStore } from "@/lib/server/backup-service";
import { getLearningStore } from "@/lib/server/learning-service";
import { backupErrorResponse } from "@/lib/server/backup-http";
import {
  json,
  readLocalJson,
  requireLocalRequest,
  requireWorkspaceGeneration,
  RequestError,
} from "@/lib/server/local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    requireLocalRequest(request);
    getLearningStore().getLocalUserId();
    return json(getBackupStore().getOverview());
  } catch (error) {
    return backupErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    requireLocalRequest(request, true);
    const body = await readLocalJson(request);
    requireWorkspaceGeneration(request);
    if (Object.keys(body).join(",") !== "type" || body.type !== "create")
      throw new RequestError("Cette demande de sauvegarde est invalide.");
    getLearningStore().getLocalUserId();
    return json(getBackupStore().createBackup());
  } catch (error) {
    return backupErrorResponse(error);
  }
}
