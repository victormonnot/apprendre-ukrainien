import "server-only";
import { openBackupStore } from "./backup-store";

const state = globalThis as typeof globalThis & {
  backupStore?: ReturnType<typeof openBackupStore>;
};
export function getBackupStore() {
  state.backupStore ??= openBackupStore();
  return state.backupStore;
}
