import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./database";

export const WORKSPACE_CHANGED_MESSAGE =
  "Une sauvegarde a été restaurée depuis l’ouverture de cet onglet. Tes textes restent ici. Recharge la page pour travailler avec les données restaurées ; les anciens brouillons seront conservés dans une archive exportable.";

export class WorkspaceChangedError extends Error {
  readonly status = 409;
  readonly code = "WORKSPACE_CHANGED";
  constructor() {
    super(WORKSPACE_CHANGED_MESSAGE);
    this.name = "WorkspaceChangedError";
  }
}

const state = globalThis as typeof globalThis & {
  workspaceGenerationDatabase?: DatabaseSync;
};

export function getWorkspaceGeneration(): string {
  state.workspaceGenerationDatabase ??= openDatabase();
  const row = state.workspaceGenerationDatabase
    .prepare("SELECT generation FROM workspace_state WHERE id = 1")
    .get();
  if (
    typeof row?.generation !== "string" ||
    !/^[0-9a-f]{32}$/.test(row.generation)
  )
    throw new Error("The workspace generation is unavailable.");
  return row.generation;
}

export function assertWorkspaceGeneration(expected: string | null): void {
  if (expected !== getWorkspaceGeneration()) throw new WorkspaceChangedError();
}
