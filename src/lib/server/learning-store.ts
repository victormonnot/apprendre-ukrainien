import { randomUUID } from "node:crypto";
import type { DocumentView } from "../../content/catalog.ts";
import {
  NOTE_MAX_LENGTH,
  REPORT_MAX_LENGTH,
  type LearningDocumentState,
  type LearningNote,
  type LearningOverview,
  type SelfReportLevel,
} from "../learning-types.ts";
import { openDatabase, transaction, type DatabaseOptions } from "./database.ts";

type StoreOptions = DatabaseOptions & {
  now?: () => Date;
};

type DocumentRow = {
  module_id: string;
  document_view: DocumentView;
  last_viewed_at: string | null;
  checkpoint_section_id: string | null;
  checkpoint_updated_at: string | null;
  self_report_level: SelfReportLevel | null;
  self_report_detail: string;
  self_report_updated_at: string | null;
  note_text: string | null;
  note_revision: number | null;
  note_updated_at: string | null;
};

const documentQuery = `
  SELECT p.*, n.text AS note_text, n.revision AS note_revision,
    n.updated_at AS note_updated_at
  FROM document_progress p
  LEFT JOIN document_notes n ON n.user_id = p.user_id
    AND n.module_id = p.module_id AND n.document_view = p.document_view
`;

function documentState(row: DocumentRow): LearningDocumentState {
  return {
    moduleId: row.module_id,
    view: row.document_view,
    lastViewedAt: row.last_viewed_at,
    checkpoint: row.checkpoint_updated_at
      ? {
          sectionId: row.checkpoint_section_id,
          updatedAt: row.checkpoint_updated_at,
        }
      : null,
    note: {
      text: row.note_text ?? "",
      revision: row.note_revision ?? 0,
      updatedAt: row.note_updated_at,
    },
    selfReport:
      row.self_report_level && row.self_report_updated_at
        ? {
            level: row.self_report_level,
            detail: row.self_report_detail,
            updatedAt: row.self_report_updated_at,
          }
        : null,
  };
}

export class NoteConflictError extends Error {
  readonly currentNote: LearningNote;

  constructor(currentNote: LearningNote) {
    super("This note was updated by another editor.");
    this.name = "NoteConflictError";
    this.currentNote = currentNote;
  }
}

export function openLearningStore(
  directory?: string,
  options: StoreOptions = {},
) {
  const database = openDatabase(directory, options);
  const now = () => (options.now?.() ?? new Date()).toISOString();

  function ensureDocument(
    userId: string,
    moduleId: string,
    view: DocumentView,
  ) {
    database
      .prepare(
        `INSERT INTO document_progress (user_id, module_id, document_view)
         VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
      )
      .run(userId, moduleId, view);
  }

  function getDocument(
    userId: string,
    moduleId: string,
    view: DocumentView,
  ): LearningDocumentState {
    const row = database
      .prepare(
        `${documentQuery} WHERE p.user_id = ? AND p.module_id = ? AND p.document_view = ?`,
      )
      .get(userId, moduleId, view) as DocumentRow | undefined;
    return row
      ? documentState(row)
      : {
          moduleId,
          view,
          lastViewedAt: null,
          checkpoint: null,
          note: { text: "", revision: 0, updatedAt: null },
          selfReport: null,
        };
  }

  function appendEvent(
    userId: string,
    moduleId: string,
    view: DocumentView,
    kind: "visit" | "checkpoint" | "note_updated" | "self_report",
    timestamp: string,
    values: {
      sectionId?: string | null;
      level?: SelfReportLevel;
      detail?: string;
      noteRevision?: number;
    } = {},
  ) {
    database
      .prepare(
        `INSERT INTO learning_events
         (user_id, module_id, document_view, kind, section_id, self_report_level, self_report_detail, note_revision, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        moduleId,
        view,
        kind,
        values.sectionId ?? null,
        values.level ?? null,
        values.detail ?? null,
        values.noteRevision ?? null,
        timestamp,
      );
  }

  return {
    getLocalUserId(): string {
      const existing = database
        .prepare("SELECT id FROM profiles WHERE is_local = 1")
        .get();
      if (existing) return existing.id as string;

      return transaction(database, () => {
        const concurrent = database
          .prepare("SELECT id FROM profiles WHERE is_local = 1")
          .get();
        if (concurrent) return concurrent.id as string;
        const userId = randomUUID();
        database
          .prepare(
            "INSERT INTO profiles (id, is_local, created_at) VALUES (?, 1, ?)",
          )
          .run(userId, now());
        return userId;
      });
    },

    getDocument,

    getOverview(userId: string): LearningOverview {
      const documents = database
        .prepare(
          `${documentQuery} WHERE p.user_id = ? ORDER BY p.module_id, p.document_view`,
        )
        .all(userId) as DocumentRow[];
      const activity = database
        .prepare(
          `SELECT module_id, document_view, section_id, created_at FROM learning_events
           WHERE user_id = ? AND kind IN ('visit', 'checkpoint') ORDER BY id DESC LIMIT 1`,
        )
        .get(userId) as
        | {
            module_id: string;
            document_view: DocumentView;
            section_id: string | null;
            created_at: string;
          }
        | undefined;

      return {
        documents: documents.map(documentState),
        lastActivity: activity
          ? {
              moduleId: activity.module_id,
              view: activity.document_view,
              sectionId: activity.section_id,
              updatedAt: activity.created_at,
            }
          : null,
      };
    },

    recordVisit(userId: string, moduleId: string, view: DocumentView) {
      return transaction(database, () => {
        const timestamp = now();
        ensureDocument(userId, moduleId, view);
        database
          .prepare(
            `UPDATE document_progress SET last_viewed_at = ?
             WHERE user_id = ? AND module_id = ? AND document_view = ?`,
          )
          .run(timestamp, userId, moduleId, view);
        const state = getDocument(userId, moduleId, view);
        appendEvent(userId, moduleId, view, "visit", timestamp, {
          sectionId: state.checkpoint?.sectionId ?? null,
        });
        return state;
      });
    },

    saveCheckpoint(
      userId: string,
      moduleId: string,
      view: DocumentView,
      sectionId: string | null,
    ) {
      return transaction(database, () => {
        const timestamp = now();
        ensureDocument(userId, moduleId, view);
        database
          .prepare(
            `UPDATE document_progress SET checkpoint_section_id = ?, checkpoint_updated_at = ?
             WHERE user_id = ? AND module_id = ? AND document_view = ?`,
          )
          .run(sectionId, timestamp, userId, moduleId, view);
        appendEvent(userId, moduleId, view, "checkpoint", timestamp, {
          sectionId,
        });
        return getDocument(userId, moduleId, view);
      });
    },

    saveNote(
      userId: string,
      moduleId: string,
      view: DocumentView,
      text: string,
      expectedRevision: number,
    ) {
      if (text.length > NOTE_MAX_LENGTH)
        throw new RangeError("Note is too long.");
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        throw new RangeError("Expected a nonnegative note revision.");
      }

      return transaction(database, () => {
        const timestamp = now();
        ensureDocument(userId, moduleId, view);
        const currentNote = getDocument(userId, moduleId, view).note;
        if (currentNote.revision !== expectedRevision) {
          throw new NoteConflictError(currentNote);
        }
        const revision = currentNote.revision + 1;
        database
          .prepare(
            `INSERT INTO document_notes
             (user_id, module_id, document_view, text, revision, updated_at) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (user_id, module_id, document_view)
             DO UPDATE SET text = excluded.text, revision = excluded.revision, updated_at = excluded.updated_at`,
          )
          .run(userId, moduleId, view, text, revision, timestamp);
        appendEvent(userId, moduleId, view, "note_updated", timestamp, {
          noteRevision: revision,
        });
        return getDocument(userId, moduleId, view);
      });
    },

    saveSelfReport(
      userId: string,
      moduleId: string,
      view: DocumentView,
      level: SelfReportLevel,
      detail: string,
    ) {
      if (detail.length > REPORT_MAX_LENGTH) {
        throw new RangeError("Self-report detail is too long.");
      }

      return transaction(database, () => {
        const timestamp = now();
        ensureDocument(userId, moduleId, view);
        database
          .prepare(
            `UPDATE document_progress SET self_report_level = ?, self_report_detail = ?, self_report_updated_at = ?
             WHERE user_id = ? AND module_id = ? AND document_view = ?`,
          )
          .run(level, detail, timestamp, userId, moduleId, view);
        appendEvent(userId, moduleId, view, "self_report", timestamp, {
          level,
          detail,
        });
        return getDocument(userId, moduleId, view);
      });
    },

    close() {
      database.close();
    },
  };
}

export type LearningStore = ReturnType<typeof openLearningStore>;
