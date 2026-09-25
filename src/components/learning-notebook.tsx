"use client";

import { useEffect, useId, useState } from "react";
import { NoteConflictError } from "@/lib/learning-client";
import {
  NOTE_MAX_LENGTH,
  REPORT_MAX_LENGTH,
  selfReportLabels,
  type LearningDocumentState,
  type LearningNote,
  type SelfReport,
  type SelfReportLevel,
} from "@/lib/learning-types";
import "./learning-notebook.css";

type LearningNotebookProps = {
  state: LearningDocumentState;
  onSaveNote: (
    text: string,
    expectedRevision: number,
  ) => Promise<LearningDocumentState>;
  onSaveSelfReport: (
    level: SelfReportLevel,
    detail: string,
  ) => Promise<LearningDocumentState>;
};

type NotebookDraft = {
  version: 1;
  note?: { text: string; base: LearningNote };
  report?: { level: SelfReportLevel; detail: string; base: SelfReport | null };
};

function draftKey(state: LearningDocumentState) {
  return `learning-draft:${state.moduleId}:${state.view}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isNote(value: unknown): value is LearningNote {
  return (
    isRecord(value) &&
    typeof value.text === "string" &&
    value.text.length <= NOTE_MAX_LENGTH &&
    typeof value.revision === "number" &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0 &&
    (value.updatedAt === null || isTimestamp(value.updatedAt))
  );
}

function isLevel(value: unknown): value is SelfReportLevel {
  return typeof value === "string" && Object.hasOwn(selfReportLabels, value);
}

function isReport(value: unknown): value is SelfReport {
  return (
    isRecord(value) &&
    isLevel(value.level) &&
    typeof value.detail === "string" &&
    value.detail.length <= REPORT_MAX_LENGTH &&
    isTimestamp(value.updatedAt)
  );
}

function readDraft(state: LearningDocumentState): NotebookDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = sessionStorage.getItem(draftKey(state));
    if (!stored || stored.length > 100_000) return null;
    const value: unknown = JSON.parse(stored);
    if (!isRecord(value) || value.version !== 1) return null;
    if (
      value.note !== undefined &&
      (!isRecord(value.note) ||
        typeof value.note.text !== "string" ||
        value.note.text.length > NOTE_MAX_LENGTH ||
        !isNote(value.note.base))
    ) {
      return null;
    }
    if (
      value.report !== undefined &&
      (!isRecord(value.report) ||
        !isLevel(value.report.level) ||
        typeof value.report.detail !== "string" ||
        value.report.detail.length > REPORT_MAX_LENGTH ||
        (value.report.base !== null && !isReport(value.report.base)))
    ) {
      return null;
    }
    return value as NotebookDraft;
  } catch {
    return null;
  }
}

function savedDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "La sauvegarde est indisponible. Ton brouillon est conservé : tu peux réessayer.";
}

export function LearningNotebook({
  state,
  onSaveNote,
  onSaveSelfReport,
}: LearningNotebookProps) {
  const id = useId();
  const [restoredDraft] = useState(() => readDraft(state));
  const [savedNote, setSavedNote] = useState(
    restoredDraft?.note?.base ?? state.note,
  );
  const [noteDraft, setNoteDraft] = useState(
    restoredDraft?.note?.text ?? state.note.text,
  );
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<LearningNote | null>(null);
  const [comparedVersions, setComparedVersions] = useState(false);
  const [savedReport, setSavedReport] = useState(
    restoredDraft?.report ? restoredDraft.report.base : state.selfReport,
  );
  const [reportLevel, setReportLevel] = useState<SelfReportLevel>(
    restoredDraft?.report?.level ?? state.selfReport?.level ?? "to_review",
  );
  const [reportDetail, setReportDetail] = useState(
    restoredDraft?.report?.detail ?? state.selfReport?.detail ?? "",
  );
  const [reportSaving, setReportSaving] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const noteDirty = noteDraft !== savedNote.text;
  const reportDirty =
    reportLevel !== (savedReport?.level ?? "to_review") ||
    reportDetail !== (savedReport?.detail ?? "");
  const dirty = noteDirty || reportDirty;
  const detailRequired = [
    "with_help",
    "first_success",
    "delayed_success",
  ].includes(reportLevel);

  useEffect(() => {
    const key = draftKey(state);
    try {
      if (!noteDirty && !reportDirty) {
        sessionStorage.removeItem(key);
        return;
      }
      const draft: NotebookDraft = { version: 1 };
      if (noteDirty) draft.note = { text: noteDraft, base: savedNote };
      if (reportDirty) {
        draft.report = {
          level: reportLevel,
          detail: reportDetail,
          base: savedReport,
        };
      }
      sessionStorage.setItem(key, JSON.stringify(draft));
    } catch {
      // Temporary browser storage may be disabled or full; explicit saving still works.
    }
  }, [
    state,
    noteDirty,
    noteDraft,
    savedNote,
    reportDirty,
    reportLevel,
    reportDetail,
    savedReport,
  ]);

  useEffect(() => {
    if (!dirty) return;

    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    function beforeLinkNavigation(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.hasAttribute("download")) return;
      if (link.target && link.target !== "_self") return;

      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      ) {
        return;
      }
      if (!["http:", "https:"].includes(destination.protocol)) return;

      if (
        !window.confirm(
          "Ton carnet contient un brouillon non enregistré. Quitter cette fiche sans enregistrer les modifications ?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeLinkNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeLinkNavigation, true);
    };
  }, [dirty]);

  async function saveNote(expectedRevision = savedNote.revision) {
    if (noteSaving) return;
    const snapshot = noteDraft;
    setNoteSaving(true);
    setNoteError(null);
    try {
      const result = await onSaveNote(snapshot, expectedRevision);
      setSavedNote(result.note);
      setConflict(null);
      setComparedVersions(false);
    } catch (error) {
      if (error instanceof NoteConflictError) {
        setConflict(error.currentNote);
        setComparedVersions(false);
      } else {
        setNoteError(errorMessage(error));
      }
    } finally {
      setNoteSaving(false);
    }
  }

  async function saveReport() {
    if (reportSaving) return;
    if (detailRequired && !reportDetail.trim()) {
      setReportError("Ajoute un repère pour situer cette réussite.");
      return;
    }
    const levelSnapshot = reportLevel;
    const detailSnapshot = reportDetail;
    setReportSaving(true);
    setReportError(null);
    try {
      const result = await onSaveSelfReport(levelSnapshot, detailSnapshot);
      setSavedReport(result.selfReport);
    } catch (error) {
      setReportError(errorMessage(error));
    } finally {
      setReportSaving(false);
    }
  }

  function loadSavedVersion() {
    if (!conflict) return;
    setSavedNote(conflict);
    setNoteDraft(conflict.text);
    setConflict(null);
    setComparedVersions(false);
    setNoteError(null);
  }

  return (
    <div className="learning-notebook">
      {restoredDraft && dirty && (
        <p className="notebook-restored" role="status">
          Brouillon non enregistré retrouvé dans cet onglet.
        </p>
      )}
      <form
        className="notebook-section"
        onSubmit={(event) => {
          event.preventDefault();
          if (!conflict) void saveNote();
        }}
      >
        <div className="notebook-heading">
          <h3>Mes notes sur cette fiche</h3>
          <p>Questions, exemples et points à garder sous la main.</p>
        </div>
        <label htmlFor={`${id}-note`}>Ma note personnelle</label>
        <textarea
          id={`${id}-note`}
          value={noteDraft}
          onChange={(event) => setNoteDraft(event.target.value)}
          maxLength={NOTE_MAX_LENGTH}
          rows={7}
          aria-describedby={`${id}-note-hint ${id}-note-status`}
        />
        <p className="notebook-hint" id={`${id}-note-hint`}>
          Enregistre ta note avant de quitter la fiche.{" "}
          {NOTE_MAX_LENGTH.toLocaleString("fr-FR")} caractères maximum. Le
          navigateur peut garder un brouillon temporaire dans cet onglet ;
          utilise le bouton pour le sauvegarder durablement.
        </p>
        <div className="notebook-save-row">
          <button
            className="notebook-button"
            type="submit"
            disabled={noteSaving || !noteDirty || !!conflict}
          >
            {noteSaving ? "Enregistrement…" : "Enregistrer ma note"}
          </button>
          <p className="notebook-status" id={`${id}-note-status`} role="status">
            {noteSaving
              ? "Enregistrement de la note en cours."
              : noteDirty
                ? "Brouillon non enregistré."
                : savedNote.updatedAt
                  ? `Note enregistrée le ${savedDate(savedNote.updatedAt)}.`
                  : "Aucune note enregistrée."}
          </p>
        </div>
        {noteError && (
          <p className="notebook-error" role="alert">
            {noteError} Ton brouillon reste disponible ici.
          </p>
        )}
        {conflict && (
          <section
            className="notebook-conflict"
            aria-labelledby={`${id}-conflict-heading`}
          >
            <h4 id={`${id}-conflict-heading`}>
              Une autre version a été enregistrée
            </h4>
            <p role="alert">
              Ton brouillon est conservé dans le champ ci-dessus. Compare-le à
              la version enregistrée avant de choisir celle à garder.
            </p>
            <p className="notebook-conflict-label">
              Version enregistrée
              {conflict.updatedAt && ` le ${savedDate(conflict.updatedAt)}`}
            </p>
            <div className="notebook-saved-version">
              {conflict.text || "La note enregistrée est vide."}
            </div>
            <button
              className="notebook-button notebook-button-secondary"
              type="button"
              onClick={loadSavedVersion}
              disabled={noteSaving}
              aria-describedby={`${id}-load-hint`}
            >
              Charger la version enregistrée
            </button>
            <p className="notebook-hint" id={`${id}-load-hint`}>
              Ce choix remplace ton brouillon par la version affichée ci-dessus.
            </p>
            <label className="notebook-checkbox">
              <input
                type="checkbox"
                checked={comparedVersions}
                onChange={(event) => setComparedVersions(event.target.checked)}
                disabled={noteSaving}
              />
              <span>J’ai comparé les deux versions.</span>
            </label>
            <button
              className="notebook-button"
              type="button"
              onClick={() => void saveNote(conflict.revision)}
              disabled={!comparedVersions || noteSaving}
            >
              Remplacer la version enregistrée par mon brouillon
            </button>
          </section>
        )}
      </form>

      <form
        className="notebook-section"
        onSubmit={(event) => {
          event.preventDefault();
          void saveReport();
        }}
      >
        <div className="notebook-heading">
          <h3>Mon bilan de travail</h3>
          <p>
            Ce repère vient de toi. Les résultats corrigés seront distingués de
            ce bilan.
          </p>
        </div>
        <label htmlFor={`${id}-report-level`}>
          Où j’en suis sur cette fiche
        </label>
        <select
          id={`${id}-report-level`}
          value={reportLevel}
          onChange={(event) =>
            setReportLevel(event.target.value as SelfReportLevel)
          }
        >
          {Object.entries(selfReportLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label htmlFor={`${id}-report-detail`}>
          Repère de travail (exercice, aide utilisée, rappel…)
        </label>
        <textarea
          id={`${id}-report-detail`}
          value={reportDetail}
          onChange={(event) => setReportDetail(event.target.value)}
          maxLength={REPORT_MAX_LENGTH}
          required={detailRequired}
          rows={3}
          aria-describedby={`${id}-report-hint`}
        />
        <p className="notebook-hint" id={`${id}-report-hint`}>
          {detailRequired
            ? "Précise ce que tu as réussi et dans quelles conditions. Ce repère est requis."
            : "Tu peux préciser ce que tu as travaillé ou ce qui reste à revoir."}{" "}
          {REPORT_MAX_LENGTH.toLocaleString("fr-FR")} caractères maximum.
        </p>
        <div className="notebook-save-row">
          <button
            className="notebook-button"
            type="submit"
            disabled={reportSaving || (!reportDirty && !!savedReport)}
          >
            {reportSaving ? "Enregistrement…" : "Enregistrer mon bilan"}
          </button>
          <p className="notebook-status" role="status">
            {reportSaving
              ? "Enregistrement du bilan en cours."
              : reportDirty
                ? "Bilan non enregistré."
                : savedReport
                  ? `Bilan enregistré le ${savedDate(savedReport.updatedAt)}.`
                  : "Aucun bilan enregistré."}
          </p>
        </div>
        {reportError && (
          <p className="notebook-error" role="alert">
            {reportError} Ton brouillon reste disponible ici.
          </p>
        )}
      </form>
    </div>
  );
}
