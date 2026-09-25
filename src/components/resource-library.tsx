"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadResourceLibrary } from "@/lib/resource-client";
import { formatResourceTime } from "@/lib/resource-time";
import type { LearningResource, ResourceState } from "@/lib/resource-types";
import "./resources.css";

const kindLabels = { podcast: "Podcast", video: "Vidéo", guide: "Guide audio" };
export function ResourceLibrary({
  resources,
}: {
  resources: LearningResource[];
}) {
  const [kind, setKind] = useState("all");
  const [states, setStates] = useState<ResourceState[]>([]);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    loadResourceLibrary(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setStates(value.resources.map((entry) => entry.state));
          setError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [reload]);
  const shown = resources.filter(
    (resource) => kind === "all" || resource.kind === kind,
  );
  return (
    <div className="resource-library">
      <section
        className="resource-intro"
        aria-labelledby="resource-intro-title"
      >
        <div>
          <p className="eyebrow">Module 01 · Les premiers pas</p>
          <h2 id="resource-intro-title">Une écoute avec un objectif</h2>
          <p>
            Reconnaître une lettre, retrouver une salutation, entendre une
            présentation. Choisis une ressource, puis reviens au cours pour
            consolider ce que tu as repéré.
          </p>
        </div>
        <span className="resource-count">
          <strong>{resources.length}</strong> ressources choisies
        </span>
      </section>
      <div className="resource-filters" aria-label="Filtrer les ressources">
        {[
          ["all", "Tout"],
          ["podcast", "Podcasts"],
          ["video", "Vidéos"],
          ["guide", "Guides audio"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            onClick={() => setKind(value!)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p className="resource-error" role="alert">
          Tes repères sont momentanément indisponibles. Les ressources restent
          consultables.{" "}
          <button type="button" onClick={() => setReload((value) => value + 1)}>
            Recharger mes repères
          </button>
        </p>
      )}
      <div className="resource-cards">
        {shown.map((resource) => {
          const state = states.find(
            (entry) => entry.resourceId === resource.id,
          );
          return (
            <article
              key={resource.id}
              className={`resource-card resource-card-${resource.kind}`}
              data-resource-id={resource.id}
            >
              <div className="resource-card-top">
                <span className="resource-kind">
                  {kindLabels[resource.kind]}
                </span>
                <span>
                  {resource.durationSeconds !== null
                    ? `≈ ${formatResourceTime(resource.durationSeconds)}`
                    : "À consulter librement"}
                </span>
              </div>
              <h2>
                <Link href={`/ressources/${resource.id}`}>
                  {resource.title}
                </Link>
              </h2>
              <p className="resource-author">{resource.author}</p>
              <p>{resource.description}</p>
              <p className="resource-card-objective">
                <strong>Pour travailler</strong>
                {resource.objective}
              </p>
              <p className="resource-small">{resource.language}</p>
              <div className="resource-card-bottom">
                <Link
                  className="resource-open-link"
                  href={`/ressources/${resource.id}`}
                >
                  Ouvrir la ressource <span aria-hidden="true">↗</span>
                </Link>
                <div className="resource-card-state">
                  {state?.positionSeconds !== null &&
                  state?.positionSeconds !== undefined ? (
                    <span>
                      Repère à {formatResourceTime(state.positionSeconds)}
                    </span>
                  ) : state?.openedAt ? (
                    <span>Déjà ouverte</span>
                  ) : null}
                  {state?.notes && <span>Notes conservées</span>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <p className="resource-library-footer">
        Les contenus originaux restent chez leurs auteurs. Chaque fiche garde le
        lien officiel, les consignes d’écoute et tes notes au même endroit.
      </p>
    </div>
  );
}
