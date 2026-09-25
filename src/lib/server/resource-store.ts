import { isDeepStrictEqual } from "node:util";
import type {
  LearningResource,
  ResourceCommand,
  ResourceWorkspace,
} from "../resource-types.ts";
import { openDatabase, transaction, type DatabaseOptions } from "./database.ts";
import {
  ResourceInputError,
  validateResourceCommand,
  validateResourcePosition,
} from "./resource-input.ts";

type StoreOptions = DatabaseOptions & { now?: () => Date };
type StateRow = {
  notes: string;
  notes_revision: number;
  position_seconds: number | null;
  position_revision: number;
  opened_at: string | null;
  updated_at: string | null;
};

export class ResourceConflictError extends Error {
  readonly currentWorkspace: ResourceWorkspace;
  constructor(currentWorkspace: ResourceWorkspace) {
    super(
      "Cet enregistrement a changé dans un autre onglet. Compare les versions avant de réessayer.",
    );
    this.name = "ResourceConflictError";
    this.currentWorkspace = currentWorkspace;
  }
}

export class ResourceRequestConflictError extends Error {
  readonly currentWorkspace: ResourceWorkspace;
  constructor(currentWorkspace: ResourceWorkspace) {
    super("Cette demande a déjà été utilisée pour un autre enregistrement.");
    this.name = "ResourceRequestConflictError";
    this.currentWorkspace = currentWorkspace;
  }
}

export function openResourceStore(
  directory?: string,
  options: StoreOptions = {},
) {
  const database = openDatabase(directory, options);
  const now = () => (options.now?.() ?? new Date()).toISOString();

  function getWorkspace(
    userId: string,
    resource: LearningResource,
  ): ResourceWorkspace {
    const row = database
      .prepare(
        "SELECT * FROM resource_states WHERE user_id = ? AND resource_id = ?",
      )
      .get(userId, resource.id) as StateRow | undefined;
    return {
      resource: structuredClone(resource),
      state: {
        resourceId: resource.id,
        notes: row?.notes ?? "",
        notesRevision: row?.notes_revision ?? 0,
        positionSeconds: row?.position_seconds ?? null,
        positionRevision: row?.position_revision ?? 0,
        openedAt: row?.opened_at ?? null,
        updatedAt: row?.updated_at ?? null,
      },
    };
  }

  return {
    getWorkspace,
    applyCommand(
      userId: string,
      resource: LearningResource,
      input: ResourceCommand,
    ): ResourceWorkspace {
      const command = validateResourceCommand(input);
      if (resource.id !== command.resourceId)
        throw new ResourceInputError(
          "Cette demande ne correspond pas à la ressource.",
        );
      return transaction(database, () => {
        const workspace = getWorkspace(userId, resource);
        const previous = database
          .prepare(
            "SELECT command FROM resource_requests WHERE user_id = ? AND request_id = ?",
          )
          .get(userId, command.requestId) as { command: string } | undefined;
        if (previous) {
          if (!isDeepStrictEqual(JSON.parse(previous.command), command))
            throw new ResourceRequestConflictError(workspace);
          return workspace;
        }
        const timestamp = now();
        if (command.type === "open") {
          database
            .prepare(
              `INSERT INTO resource_states (user_id, resource_id, opened_at) VALUES (?, ?, ?)
            ON CONFLICT (user_id, resource_id) DO UPDATE SET opened_at = excluded.opened_at`,
            )
            .run(userId, resource.id, timestamp);
        } else if (command.type === "save-notes") {
          if (command.expectedRevision !== workspace.state.notesRevision)
            throw new ResourceConflictError(workspace);
          database
            .prepare(
              `INSERT INTO resource_states (user_id, resource_id, notes, notes_revision, updated_at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (user_id, resource_id) DO UPDATE SET notes = excluded.notes, notes_revision = excluded.notes_revision, updated_at = excluded.updated_at`,
            )
            .run(
              userId,
              resource.id,
              command.notes,
              workspace.state.notesRevision + 1,
              timestamp,
            );
        } else {
          if (command.expectedRevision !== workspace.state.positionRevision)
            throw new ResourceConflictError(workspace);
          validateResourcePosition(resource, command.positionSeconds);
          database
            .prepare(
              `INSERT INTO resource_states (user_id, resource_id, position_seconds, position_revision, updated_at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (user_id, resource_id) DO UPDATE SET position_seconds = excluded.position_seconds, position_revision = excluded.position_revision, updated_at = excluded.updated_at`,
            )
            .run(
              userId,
              resource.id,
              command.positionSeconds,
              workspace.state.positionRevision + 1,
              timestamp,
            );
        }
        database
          .prepare(
            "INSERT INTO resource_requests (user_id, request_id, command, created_at) VALUES (?, ?, ?, ?)",
          )
          .run(userId, command.requestId, JSON.stringify(command), timestamp);
        return getWorkspace(userId, resource);
      });
    },
    close() {
      database.close();
    },
  };
}

export type ResourceStore = ReturnType<typeof openResourceStore>;
