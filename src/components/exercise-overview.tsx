"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { appFetch, WorkspaceClientError } from "@/lib/workspace-client";
import type { ExerciseAssessment } from "@/lib/exercise-types";

type Summary = {
  id: string;
  number: number;
  title: string;
  hasDraft: boolean;
  submissions: number;
  latestStatus: ExerciseAssessment["status"] | null;
};
const statuses = {
  corrected: "Correction disponible",
  partial: "Correction partielle",
  pending: "En attente de correction",
};

export function ExerciseOverview({ moduleId }: { moduleId: string }) {
  const [summaries, setSummaries] = useState<Summary[] | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    appFetch(`/api/exercises?moduleId=${encodeURIComponent(moduleId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{ exercises: Summary[] }>;
      })
      .then((value) => {
        setSummaries(value.exercises);
        setError("");
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof WorkspaceClientError
              ? failure.message
              : "Le suivi des exercices est indisponible.",
          );
      });
    return () => controller.abort();
  }, [moduleId, retry]);
  const active = summaries?.filter(
    (exercise) => exercise.hasDraft || exercise.submissions > 0,
  );
  return (
    <section
      className="exercise-overview"
      aria-label={`Travail sur les exercices du module ${moduleId}`}
    >
      <h3>Mes exercices</h3>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <button
            className="button button-secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            Réessayer
          </button>
        </>
      ) : !summaries ? (
        <p role="status">Chargement du travail enregistré…</p>
      ) : !active?.length ? (
        <p>
          Les exercices du cours et de la fiche partagent les mêmes réponses.
          Aucun exercice n’a encore été commencé.
        </p>
      ) : (
        <>
          <ul>
            {active.map((exercise) => (
              <li key={exercise.id}>
                <Link
                  href={`/parcours/${moduleId}/exercices#exercice-${exercise.number}`}
                >
                  Exercice {exercise.number} · {exercise.title}
                </Link>
                <span>
                  {exercise.hasDraft ? "Brouillon en cours · " : ""}
                  {exercise.submissions > 0
                    ? `${exercise.submissions} tentative${exercise.submissions > 1 ? "s" : ""} remise${exercise.submissions > 1 ? "s" : ""}`
                    : "Aucune remise"}
                </span>
                {exercise.latestStatus && (
                  <span>{statuses[exercise.latestStatus]}</span>
                )}
              </li>
            ))}
          </ul>
          <p>
            Ces retours portent sur tes réponses écrites. Ils sont distincts de
            ton bilan personnel et ne valident pas une maîtrise durable.
          </p>
        </>
      )}
    </section>
  );
}
