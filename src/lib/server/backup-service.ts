import "server-only";
import { openBackupStore } from "./backup-store";
import { getRequestStore } from "./account-context";
export function getBackupStore() {
  return getRequestStore("backups", openBackupStore);
}
