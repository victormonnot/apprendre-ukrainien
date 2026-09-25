export type BackupSummary = {
  documentNotes: number;
  submittedExercises: number;
  activeCards: number;
  reviewAttempts: number;
  savedLanguageItems: number;
  audioClips: number;
  audioBytes: number;
  sceneAttempts: number;
  resourceNotes: number;
  resourceBookmarks: number;
};
export type BackupFile = {
  id: string;
  createdAt: string;
  sizeBytes: number;
  kind: "manual" | "safety";
};
export type BackupInspection = {
  id: string;
  sha256: string;
  sizeBytes: number;
  summary: BackupSummary;
  expiresAt: string;
};
export type RestoreCommand = {
  inspectionId: string;
  sha256: string;
  requestId: string;
  expectedGeneration: string;
};
export type RestoreResult = {
  requestId: string;
  generation: string;
  safetyBackupId: string;
  restoredAt: string;
};
export const BACKUP_MAX_BYTES = 256 * 1024 * 1024;
