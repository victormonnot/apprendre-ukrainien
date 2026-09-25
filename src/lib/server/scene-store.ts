import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type {
  SceneAttempt,
  SceneCommand,
  SceneDefinition,
  SceneFeedback,
  SceneRoleId,
  SceneWorkspace,
} from "../scene-types.ts";
import { openDatabase, transaction, type DatabaseOptions } from "./database.ts";
import {
  sceneRole,
  SceneInputError,
  validateSceneAnswers,
  validateSceneCommand,
} from "./scene-input.ts";

type StoreOptions = DatabaseOptions & { now?: () => Date };
type DraftRow = {
  definition: string;
  revision: number;
  answers: string;
  help_used: number;
  updated_at: string;
};
type AttemptRow = {
  id: string;
  request_id: string;
  definition: string;
  role_id: SceneRoleId;
  answers: string;
  help_used: number;
  feedback: string;
  submitted_at: string;
};

function attemptState(row: AttemptRow): SceneAttempt {
  return {
    id: row.id,
    requestId: row.request_id,
    scene: JSON.parse(row.definition) as SceneDefinition,
    roleId: row.role_id,
    answers: JSON.parse(row.answers) as Record<string, string>,
    helpUsed: row.help_used === 1,
    feedback: JSON.parse(row.feedback) as SceneFeedback[],
    submittedAt: row.submitted_at,
  };
}

function comparable(value: string) {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("uk")
    .replace(/\p{P}/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export class SceneConflictError extends Error {
  readonly currentWorkspace: SceneWorkspace;
  constructor(currentWorkspace: SceneWorkspace) {
    super(
      "Cette scène a changé dans un autre onglet. Recharge les réponses enregistrées avant de poursuivre.",
    );
    this.name = "SceneConflictError";
    this.currentWorkspace = currentWorkspace;
  }
}

export class SceneRequestConflictError extends Error {
  constructor() {
    super("Cette demande a déjà été utilisée pour une autre réponse.");
    this.name = "SceneRequestConflictError";
  }
}

export function openSceneStore(directory?: string, options: StoreOptions = {}) {
  const database = openDatabase(directory, options);
  const now = () => (options.now?.() ?? new Date()).toISOString();

  function getWorkspace(
    userId: string,
    definition: SceneDefinition,
    roleId: SceneRoleId,
  ): SceneWorkspace {
    if (
      !sceneRole(roleId) ||
      !definition.characters.some((character) => character.id === roleId)
    )
      throw new SceneInputError("Ce personnage est introuvable.");
    const row = database
      .prepare(
        `SELECT * FROM scene_drafts
      WHERE user_id = ? AND scene_id = ? AND variant_id = ? AND definition_version = ? AND role_id = ?`,
      )
      .get(
        userId,
        definition.id,
        definition.variantId,
        definition.version,
        roleId,
      ) as DraftRow | undefined;
    const scene = row
      ? (JSON.parse(row.definition) as SceneDefinition)
      : structuredClone(definition);
    return {
      scene,
      roleId,
      draft: {
        revision: row?.revision ?? 0,
        answers: row
          ? (JSON.parse(row.answers) as Record<string, string>)
          : Object.fromEntries(
              scene.lines
                .filter((line) => line.speakerId === roleId)
                .map((line) => [line.id, ""]),
            ),
        helpUsed: row?.help_used === 1,
        updatedAt: row?.updated_at ?? null,
      },
      attempts: (
        database
          .prepare(
            `SELECT * FROM scene_attempts
        WHERE user_id = ? AND scene_id = ? AND variant_id = ? AND role_id = ?
        ORDER BY submitted_at DESC, rowid DESC`,
          )
          .all(
            userId,
            definition.id,
            definition.variantId,
            roleId,
          ) as AttemptRow[]
      ).map(attemptState),
    };
  }

  return {
    getWorkspace,
    applyCommand(
      userId: string,
      definition: SceneDefinition,
      input: SceneCommand,
    ): SceneWorkspace {
      const command = validateSceneCommand(input);
      return transaction(database, () => {
        if (
          definition.id !== command.sceneId ||
          definition.variantId !== command.variantId ||
          definition.version !== command.version
        )
          throw new SceneConflictError(
            getWorkspace(userId, definition, command.roleId),
          );
        const workspace = getWorkspace(userId, definition, command.roleId);
        const previous = database
          .prepare(
            "SELECT command FROM scene_requests WHERE user_id = ? AND request_id = ?",
          )
          .get(userId, command.requestId) as { command: string } | undefined;
        if (previous) {
          if (!isDeepStrictEqual(JSON.parse(previous.command), command))
            throw new SceneRequestConflictError();
          return workspace;
        }
        const answers = validateSceneAnswers(workspace.scene, command);
        if (workspace.draft.revision !== command.expectedRevision)
          throw new SceneConflictError(workspace);
        const timestamp = now();
        const revision = workspace.draft.revision + 1;
        const helpUsed = workspace.draft.helpUsed || command.helpUsed;
        if (command.type === "submit") {
          const feedback: SceneFeedback[] = workspace.scene.lines
            .filter((line) => line.speakerId === command.roleId)
            .map((line) => ({
              lineId: line.id,
              answer: answers[line.id]!,
              reference: line.ukrainian,
              status:
                comparable(answers[line.id]!) === comparable(line.ukrainian)
                  ? "matches"
                  : "compare",
            }));
          database
            .prepare(
              `INSERT INTO scene_attempts
            (id, user_id, request_id, scene_id, variant_id, definition_version, role_id, definition, answers, help_used, feedback, submitted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              randomUUID(),
              userId,
              command.requestId,
              definition.id,
              definition.variantId,
              definition.version,
              command.roleId,
              JSON.stringify(workspace.scene),
              JSON.stringify(answers),
              Number(helpUsed),
              JSON.stringify(feedback),
              timestamp,
            );
        }
        const draftAnswers =
          command.type === "save"
            ? answers
            : Object.fromEntries(Object.keys(answers).map((id) => [id, ""]));
        database
          .prepare(
            `INSERT INTO scene_drafts
          (user_id, scene_id, variant_id, definition_version, role_id, definition, revision, answers, help_used, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (user_id, scene_id, variant_id, definition_version, role_id) DO UPDATE SET
          revision = excluded.revision, answers = excluded.answers, help_used = excluded.help_used, updated_at = excluded.updated_at`,
          )
          .run(
            userId,
            definition.id,
            definition.variantId,
            definition.version,
            command.roleId,
            JSON.stringify(workspace.scene),
            revision,
            JSON.stringify(draftAnswers),
            Number(command.type === "save" && helpUsed),
            timestamp,
          );
        database
          .prepare(
            "INSERT INTO scene_requests (user_id, request_id, command, created_at) VALUES (?, ?, ?, ?)",
          )
          .run(userId, command.requestId, JSON.stringify(command), timestamp);
        return getWorkspace(userId, definition, command.roleId);
      });
    },
    close() {
      database.close();
    },
  };
}

export type SceneStore = ReturnType<typeof openSceneStore>;
