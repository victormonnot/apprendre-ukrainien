"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { documentHref, getModule } from "@/content/catalog";
import { loadLearning } from "@/lib/learning-client";
import {
  selfReportLabels,
  type LearningOverview as Overview,
} from "@/lib/learning-types";

export function LearningOverview() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    loadLearning(controller.signal)
      .then((data) => {
        setOverview(data);
        setError("");
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Le suivi est indisponible.",
          );
      });
    return () => controller.abort();
  }, [retry]);

  if (error)
    return (
      <section className="resume-card">
        <p role="alert">{error}</p>
        <button
          className="button button-secondary"
          onClick={() => setRetry((value) => value + 1)}
        >
          Réessayer le suivi
        </button>
      </section>
    );
  if (!overview)
    return (
      <div className="resume-placeholder" role="status">
        Chargement de ton suivi…
      </div>
    );
  const recent = overview.lastActivity;
  const learningModule = recent && getModule(recent.moduleId);
  const document =
    learningModule &&
    learningModule.documents.find((item) => item.view === recent?.view);
  if (!recent || !learningModule || !document)
    return (
      <section className="resume-card resume-empty">
        <h2>Ton parcours commence ici</h2>
        <p>
          Tu peux garder un passage, prendre des notes et noter ce que tu as
          travaillé. Aucun acquis n’est supposé au départ.
        </p>
      </section>
    );

  const href =
    documentHref(recent.moduleId, recent.view) +
    (recent.sectionId ? `#${encodeURIComponent(recent.sectionId)}` : "");
  return (
    <section className="resume-card" aria-labelledby="resume-heading">
      <div className="resume-heading">
        <div>
          <p className="eyebrow">Revenir à mon travail</p>
          <h2 id="resume-heading">
            Module {learningModule.id} · {document.label}
          </h2>
          <p>{learningModule.title}</p>
        </div>
        <Link href={href} className="button button-primary">
          Reprendre ma lecture <span aria-hidden="true">→</span>
        </Link>
      </div>
      <ul className="document-progress-list">
        {learningModule.documents.map((item) => {
          const saved = overview.documents.find(
            (state) =>
              state.moduleId === learningModule.id && state.view === item.view,
          );
          return (
            <li key={item.view}>
              <Link href={documentHref(learningModule.id, item.view)}>
                {item.label}
              </Link>
              <span>{saved?.lastViewedAt ? "Consultée" : "À découvrir"}</span>
              <span className="personal-report">
                {saved?.selfReport
                  ? selfReportLabels[saved.selfReport.level]
                  : "Bilan non renseigné"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="progress-explanation">
        Les bilans viennent de toi. Une consultation ou un premier succès ne
        valide pas la maîtrise.
      </p>
    </section>
  );
}
