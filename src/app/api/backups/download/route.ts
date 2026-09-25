import { getBackupStore } from "@/lib/server/backup-service";
import { backupErrorResponse } from "@/lib/server/backup-http";
import { requireLocalRequest, RequestError } from "@/lib/server/local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    requireLocalRequest(request);
    const params = new URL(request.url).searchParams;
    if (params.size !== 1 || !params.has("id"))
      throw new RequestError("Choisis une sauvegarde à télécharger.");
    const { file, bytes } = getBackupStore().readBackup(params.get("id")!);
    const date = file.createdAt.slice(0, 10);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Disposition": `attachment; filename="ukrainien-${date}-${file.id}.sqlite3"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        Vary: "Origin",
      },
    });
  } catch (error) {
    return backupErrorResponse(error);
  }
}
