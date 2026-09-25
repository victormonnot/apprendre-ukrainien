import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  EXERCISE_WORK_NOTE_MAX_LENGTH,
  type ExerciseAnswers,
  type ExerciseAssessment,
  type ExerciseAttempt,
  type ExerciseDefinition,
  type ExerciseWorkspaceState,
} from "../exercise-types.ts";
import { openDatabase, transaction, type DatabaseOptions } from "./database.ts";

type StoreOptions = DatabaseOptions & { now?: () => Date };

type AttemptRow = {
  id: string;
  exercise_id: string;
  definition_version: number;
  definition: string;
  attempt_number: number;
  status: ExerciseAttempt["status"];
  revision: number;
  retry_of: string | null;
  answers: string;
  work_note: string;
  assessment: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
};

function attemptState(row: AttemptRow): ExerciseAttempt {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    definitionVersion: row.definition_version,
    definition: JSON.parse(row.definition) as ExerciseDefinition,
    number: row.attempt_number,
    status: row.status,
    revision: row.revision,
    retryOf: row.retry_of,
    answers: JSON.parse(row.answers) as ExerciseAnswers,
    workNote: row.work_note,
    assessment:
      row.assessment === null
        ? null
        : (JSON.parse(row.assessment) as ExerciseAssessment),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
  };
}

function blankAnswers(definition: ExerciseDefinition): ExerciseAnswers {
  return Object.fromEntries(
    definition.items.map((item) => [
      item.id,
      {
        fields: Object.fromEntries(item.fields.map((field) => [field.id, ""])),
        aid: null,
      },
    ]),
  );
}

export class ExerciseConflictError extends Error {
  readonly currentWorkspace: ExerciseWorkspaceState;

  constructor(currentWorkspace: ExerciseWorkspaceState) {
    super("This attempt has changed or uses another exercise version.");
    this.name = "ExerciseConflictError";
    this.currentWorkspace = currentWorkspace;
  }
}

export class ExerciseAttemptNotFoundError extends Error {
  constructor() {
    super("This exercise attempt does not exist.");
    this.name = "ExerciseAttemptNotFoundError";
  }
}

export function openExerciseStore(
  directory?: string,
  options: StoreOptions = {},
) {
  const database = openDatabase(directory, options);
  const now = () => (options.now?.() ?? new Date()).toISOString();

  function getWorkspace(
    userId: string,
    exerciseId: string,
  ): ExerciseWorkspaceState {
    const attempts = (
      database
        .prepare(
          `SELECT * FROM exercise_attempts WHERE user_id = ? AND exercise_id = ?
           ORDER BY attempt_number DESC`,
        )
        .all(userId, exerciseId) as AttemptRow[]
    ).map(attemptState);
    return {
      exerciseId,
      draft: attempts.find((attempt) => attempt.status === "draft") ?? null,
      attempts: attempts.filter((attempt) => attempt.status === "submitted"),
    };
  }

  function getAttempt(userId: string, exerciseId: string, attemptId: string) {
    const row = database
      .prepare(
        "SELECT * FROM exercise_attempts WHERE id = ? AND user_id = ? AND exercise_id = ?",
      )
      .get(attemptId, userId, exerciseId) as AttemptRow | undefined;
    if (!row) throw new ExerciseAttemptNotFoundError();
    return attemptState(row);
  }

  function conflict(userId: string, exerciseId: string): never {
    throw new ExerciseConflictError(getWorkspace(userId, exerciseId));
  }

  function appendEvent(
    userId: string,
    exerciseId: string,
    attemptId: string,
    kind: "started" | "draft_saved" | "submitted",
    revision: number,
    timestamp: string,
  ) {
    database
      .prepare(
        `INSERT INTO exercise_events
         (user_id, exercise_id, attempt_id, kind, revision, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(userId, exerciseId, attemptId, kind, revision, timestamp);
  }

  function validateWrite(expectedRevision: number, workNote: string) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new RangeError("Expected a positive attempt revision.");
    }
    if (workNote.length > EXERCISE_WORK_NOTE_MAX_LENGTH) {
      throw new RangeError("Exercise work note is too long.");
    }
  }

  return {
    getWorkspace,

    startAttempt(
      userId: string,
      definition: ExerciseDefinition,
      retryOf?: string,
    ): ExerciseWorkspaceState {
      return transaction(database, () => {
        if (retryOf !== undefined) {
          const parent = getAttempt(userId, definition.id, retryOf);
          if (parent.status !== "submitted") conflict(userId, definition.id);
        }
        const workspace = getWorkspace(userId, definition.id);
        if (workspace.draft) {
          if (workspace.draft.definitionVersion !== definition.version) {
            conflict(userId, definition.id);
          }
          return workspace;
        }
        const timestamp = now();
        const id = randomUUID();
        const number = (workspace.attempts[0]?.number ?? 0) + 1;
        database
          .prepare(
            `INSERT INTO exercise_attempts
             (id, user_id, exercise_id, definition_version, definition, attempt_number, status, revision,
              retry_of, answers, work_note, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?, '', ?, ?)`,
          )
          .run(
            id,
            userId,
            definition.id,
            definition.version,
            JSON.stringify(definition),
            number,
            retryOf ?? null,
            JSON.stringify(blankAnswers(definition)),
            timestamp,
            timestamp,
          );
        appendEvent(userId, definition.id, id, "started", 1, timestamp);
        return getWorkspace(userId, definition.id);
      });
    },

    saveDraft(
      userId: string,
      definition: ExerciseDefinition,
      attemptId: string,
      expectedRevision: number,
      answers: ExerciseAnswers,
      workNote: string,
    ): ExerciseWorkspaceState {
      validateWrite(expectedRevision, workNote);
      return transaction(database, () => {
        const attempt = getAttempt(userId, definition.id, attemptId);
        if (
          attempt.status !== "draft" ||
          attempt.definitionVersion !== definition.version ||
          attempt.revision !== expectedRevision
        ) {
          conflict(userId, definition.id);
        }
        const timestamp = now();
        const revision = attempt.revision + 1;
        database
          .prepare(
            `UPDATE exercise_attempts SET answers = ?, work_note = ?, revision = ?, updated_at = ?
             WHERE id = ? AND user_id = ? AND exercise_id = ?`,
          )
          .run(
            JSON.stringify(answers),
            workNote,
            revision,
            timestamp,
            attemptId,
            userId,
            definition.id,
          );
        appendEvent(
          userId,
          definition.id,
          attemptId,
          "draft_saved",
          revision,
          timestamp,
        );
        return getWorkspace(userId, definition.id);
      });
    },

    submitAttempt(
      userId: string,
      definition: ExerciseDefinition,
      attemptId: string,
      expectedRevision: number,
      answers: ExerciseAnswers,
      workNote: string,
      assessment: ExerciseAssessment,
    ): ExerciseWorkspaceState {
      validateWrite(expectedRevision, workNote);
      return transaction(database, () => {
        const attempt = getAttempt(userId, definition.id, attemptId);
        if (attempt.definitionVersion !== definition.version) {
          conflict(userId, definition.id);
        }
        if (attempt.status === "submitted") {
          if (
            attempt.workNote !== workNote ||
            !isDeepStrictEqual(attempt.answers, answers)
          ) {
            conflict(userId, definition.id);
          }
          return getWorkspace(userId, definition.id);
        }
        if (attempt.revision !== expectedRevision) {
          conflict(userId, definition.id);
        }
        const timestamp = now();
        const revision = attempt.revision + 1;
        database
          .prepare(
            `UPDATE exercise_attempts
             SET status = 'submitted', answers = ?, work_note = ?, assessment = ?,
               revision = ?, updated_at = ?, submitted_at = ?
             WHERE id = ? AND user_id = ? AND exercise_id = ?`,
          )
          .run(
            JSON.stringify(answers),
            workNote,
            JSON.stringify(assessment),
            revision,
            timestamp,
            timestamp,
            attemptId,
            userId,
            definition.id,
          );
        appendEvent(
          userId,
          definition.id,
          attemptId,
          "submitted",
          revision,
          timestamp,
        );
        return getWorkspace(userId, definition.id);
      });
    },

    close() {
      database.close();
    },
  };
}

export type ExerciseStore = ReturnType<typeof openExerciseStore>;
