"use client";

import { useEffect, useState } from "react";
import type { DocumentView } from "@/content/catalog";
import { LearningNotebook } from "@/components/learning-notebook";
import { updateLearning } from "@/lib/learning-client";
import {
  selfReportLabels,
  type LearningDocumentState,
} from "@/lib/learning-types";

type Props = {
  moduleId: string;
  view: DocumentView;
  sections: { id: string; title: string }[];
};

export function DocumentProgress({ moduleId, view, sections }: Props) {
  const [state, setState] = useState<LearningDocumentState | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selectedSection, setSelectedSection] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    updateLearning({ type: "visit", moduleId, view })
      .then((document) => {
        if (!active) return;
        setState(document);
        setSelectedSection(document.checkpoint?.sectionId ?? "");
        setError("");
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Le suivi est indisponible.",
          );
      });
    return () => {
      active = false;
    };
  }, [moduleId, view, retry]);

  if (!state) {
    return (
      <div className="personal-work personal-work-status">
        <p role={error ? "alert" : "status"}>
          {error || "Chargement du suivi…"}
        </p>
        {error && (
          <button
            className="button button-secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            Réessayer le suivi
          </button>
        )}
      </div>
    );
  }

  const checkpoint = state.checkpoint;
  const savedSection = sections.find(
    (section) => section.id === checkpoint?.sectionId,
  );
  const missingSection = checkpoint?.sectionId && !savedSection;

  async function saveCheckpoint() {
    setSaving(true);
    setMessage("");
    try {
      const next = await updateLearning({
        type: "checkpoint",
        moduleId,
        view,
        sectionId: selectedSection || null,
      });
      setState((previous) =>
        previous ? { ...previous, checkpoint: next.checkpoint } : next,
      );
      setMessage("Point de reprise enregistré.");
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Le point de reprise n’a pas été enregistré.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="personal-work">
      <summary>
        <span>Mon suivi et mes notes</span>
        <span className="personal-work-summary">
          {state.selfReport
            ? selfReportLabels[state.selfReport.level]
            : "Consultée · bilan à renseigner"}
        </span>
      </summary>
      <div className="personal-work-content">
        <div className="checkpoint-controls">
          <div>
            <h2>Mon point de reprise</h2>
            <p>Choisis le passage à retrouver lors de ta prochaine visite.</p>
          </div>
          {checkpoint && (
            <p className="checkpoint-current">
              {missingSection ? (
                "Le passage a été déplacé. Ta note est conservée ; choisis un nouveau repère."
              ) : (
                <a
                  href={savedSection ? `#${savedSection.id}` : "#main-content"}
                >
                  Aller au passage enregistré :{" "}
                  {savedSection?.title ?? "début de la fiche"}
                </a>
              )}
            </p>
          )}
          <label htmlFor="reading-checkpoint">Passage à retrouver</label>
          <div className="checkpoint-actions">
            <select
              id="reading-checkpoint"
              value={selectedSection}
              onChange={(event) => setSelectedSection(event.target.value)}
            >
              <option value="">Début de la fiche</option>
              {missingSection && (
                <option value={checkpoint.sectionId ?? ""} disabled>
                  Ancien passage indisponible
                </option>
              )}
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.title}
                </option>
              ))}
            </select>
            <button
              className="button button-secondary"
              disabled={
                saving ||
                Boolean(
                  missingSection && selectedSection === checkpoint.sectionId,
                )
              }
              onClick={saveCheckpoint}
            >
              {saving ? "Enregistrement…" : "Garder ce passage"}
            </button>
          </div>
          <p className="save-feedback" role="status">
            {message}
          </p>
        </div>
        <LearningNotebook
          state={state}
          onSaveNote={async (text, expectedRevision) => {
            const next = await updateLearning({
              type: "note",
              moduleId,
              view,
              text,
              expectedRevision,
            });
            setState((previous) =>
              previous ? { ...previous, note: next.note } : next,
            );
            return next;
          }}
          onSaveSelfReport={async (level, detail) => {
            const next = await updateLearning({
              type: "self-report",
              moduleId,
              view,
              level,
              detail,
            });
            setState((previous) =>
              previous ? { ...previous, selfReport: next.selfReport } : next,
            );
            return next;
          }}
        />
      </div>
    </details>
  );
}
