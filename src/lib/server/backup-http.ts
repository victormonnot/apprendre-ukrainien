import "server-only";
import { BackupError } from "./backup-store";
import { json, RequestError } from "./local-request";

export function backupErrorResponse(error: unknown) {
  if (error instanceof BackupError || error instanceof RequestError)
    return json({ message: error.message }, error.status);
  console.error(
    "Backup request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return json(
    {
      message:
        "L’opération n’a pas pu être terminée. Conserve le fichier et réessaie.",
    },
    503,
  );
}
