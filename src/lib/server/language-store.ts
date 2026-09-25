import { createHash, randomUUID } from "node:crypto";
import { getReviewElement } from "../../content/reviews.ts";
import type {
  LanguageInput,
  LanguageResult,
  LanguageResultContent,
} from "../language-types.ts";
import { openDatabase, transaction, type DatabaseOptions } from "./database.ts";

type StoreOptions = DatabaseOptions & { now?: () => Date };
type ResultRow = {
  id: string;
  request_id: string;
  input_key: string;
  input: string;
  content: string;
  model: string;
  created_at: string;
  saved_at: string | null;
};

function resultState(row: ResultRow): LanguageResult {
  return {
    id: row.id,
    requestId: row.request_id,
    input: JSON.parse(row.input) as LanguageInput,
    content: JSON.parse(row.content) as LanguageResultContent,
    model: row.model,
    createdAt: row.created_at,
    savedAt: row.saved_at,
  };
}

function normalizeText(value: string) {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}

export function languageInputKey(input: LanguageInput): string {
  const source = input.source;
  const canonical = {
    mode: input.mode,
    text: normalizeText(input.text),
    context: normalizeText(input.context),
    source:
      source === null
        ? null
        : source.kind === "document"
          ? {
              kind: source.kind,
              moduleId: source.moduleId,
              view: source.view,
              anchor: source.anchor,
            }
          : {
              kind: source.kind,
              exerciseId: source.exerciseId,
              attemptId: source.attemptId,
            },
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export class LanguageRequestConflictError extends Error {
  constructor() {
    super("This request identifier already belongs to another language input.");
    this.name = "LanguageRequestConflictError";
  }
}

export class LanguageResultNotFoundError extends Error {
  constructor() {
    super("This language result does not exist.");
    this.name = "LanguageResultNotFoundError";
  }
}

export class LanguageReferenceNotFoundError extends Error {
  constructor() {
    super("This language reference does not exist.");
    this.name = "LanguageReferenceNotFoundError";
  }
}

export function openLanguageStore(
  directory?: string,
  options: StoreOptions = {},
) {
  const database = openDatabase(directory, options);
  const now = () => (options.now?.() ?? new Date()).toISOString();

  function getResult(userId: string, resultId: string): LanguageResult | null {
    const row = database
      .prepare("SELECT * FROM language_results WHERE user_id = ? AND id = ?")
      .get(userId, resultId) as ResultRow | undefined;
    return row ? resultState(row) : null;
  }

  function getByRequestId(
    userId: string,
    requestId: string,
  ): LanguageResult | null {
    const row = database
      .prepare(
        "SELECT * FROM language_results WHERE user_id = ? AND request_id = ?",
      )
      .get(userId, requestId) as ResultRow | undefined;
    return row ? resultState(row) : null;
  }

  function listSavedResults(userId: string): LanguageResult[] {
    return (
      database
        .prepare(
          `SELECT * FROM language_results WHERE user_id = ? AND saved_at IS NOT NULL
           ORDER BY saved_at DESC, created_at DESC, id`,
        )
        .all(userId) as ResultRow[]
    ).map(resultState);
  }

  function listSavedReferenceIds(userId: string): string[] {
    return (
      database
        .prepare(
          `SELECT element_id FROM language_saved_references WHERE user_id = ?
           ORDER BY saved_at DESC, element_id`,
        )
        .all(userId) as { element_id: string }[]
    ).map((row) => row.element_id);
  }

  return {
    getResult,
    getByRequestId,
    listSavedResults,
    listSavedReferenceIds,

    recordResult(
      userId: string,
      result: {
        requestId: string;
        input: LanguageInput;
        content: LanguageResultContent;
        model: string;
      },
    ): LanguageResult {
      return transaction(database, () => {
        const inputKey = languageInputKey(result.input);
        const existing = getByRequestId(userId, result.requestId);
        if (existing) {
          if (languageInputKey(existing.input) !== inputKey) {
            throw new LanguageRequestConflictError();
          }
          return existing;
        }
        const id = randomUUID();
        database
          .prepare(
            `INSERT INTO language_results
             (id, user_id, request_id, input_key, input, content, model, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            id,
            userId,
            result.requestId,
            inputKey,
            JSON.stringify(result.input),
            JSON.stringify(result.content),
            result.model,
            now(),
          );
        return getResult(userId, id)!;
      });
    },

    saveResult(userId: string, resultId: string): LanguageResult {
      return transaction(database, () => {
        const result = getResult(userId, resultId);
        if (!result) throw new LanguageResultNotFoundError();
        if (result.savedAt !== null) return result;
        const existing = database
          .prepare(
            `SELECT * FROM language_results
             WHERE user_id = ? AND input_key = ? AND saved_at IS NOT NULL`,
          )
          .get(userId, languageInputKey(result.input)) as ResultRow | undefined;
        if (existing) return resultState(existing);
        database
          .prepare(
            "UPDATE language_results SET saved_at = ? WHERE user_id = ? AND id = ?",
          )
          .run(now(), userId, resultId);
        return getResult(userId, resultId)!;
      });
    },

    saveReference(userId: string, elementId: string): string[] {
      if (!getReviewElement(elementId)) {
        throw new LanguageReferenceNotFoundError();
      }
      database
        .prepare(
          `INSERT INTO language_saved_references (user_id, element_id, saved_at)
           VALUES (?, ?, ?) ON CONFLICT (user_id, element_id) DO NOTHING`,
        )
        .run(userId, elementId, now());
      return listSavedReferenceIds(userId);
    },

    close() {
      database.close();
    },
  };
}

export type LanguageStore = ReturnType<typeof openLanguageStore>;
