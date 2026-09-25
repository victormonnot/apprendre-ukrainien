import type { DocumentView } from "../content/catalog.ts";

export type SelfReportLevel =
  | "to_review"
  | "understood"
  | "with_help"
  | "first_success"
  | "delayed_success";

export const selfReportLabels: Record<SelfReportLevel, string> = {
  to_review: "À retravailler",
  understood: "Compris selon moi",
  with_help: "Réussi avec aide",
  first_success: "Premier succès sans aide",
  delayed_success: "Retrouvé sans aide un autre jour",
};

export type LearningNote = {
  text: string;
  revision: number;
  updatedAt: string | null;
};

export type SelfReport = {
  level: SelfReportLevel;
  detail: string;
  updatedAt: string;
};

export type LearningDocumentState = {
  moduleId: string;
  view: DocumentView;
  lastViewedAt: string | null;
  checkpoint: { sectionId: string | null; updatedAt: string } | null;
  note: LearningNote;
  selfReport: SelfReport | null;
};

export type LearningOverview = {
  documents: LearningDocumentState[];
  lastActivity: {
    moduleId: string;
    view: DocumentView;
    sectionId: string | null;
    updatedAt: string;
  } | null;
};

export type LearningCommand = { moduleId: string; view: DocumentView } & (
  | { type: "visit" }
  | { type: "checkpoint"; sectionId: string | null }
  | { type: "note"; text: string; expectedRevision: number }
  | { type: "self-report"; level: SelfReportLevel; detail: string }
);

export const NOTE_MAX_LENGTH = 20_000;
export const REPORT_MAX_LENGTH = 2_000;
