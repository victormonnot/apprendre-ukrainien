"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ResourcePlayer } from "@/components/resource-player";
import { ResourceNotes } from "@/components/resource-notes";
import {
  loadResourceWorkspace,
  ResourceRequestError,
  updateResource,
} from "@/lib/resource-client";
import { formatResourceTime, parseResourceTime } from "@/lib/resource-time";
import type {
  LearningResource,
  ResourceCommand,
  ResourceState,
} from "@/lib/resource-types";
import "./resources.css";

function latest(first: string | null, second: string | null) {
  return !first || (second && second > first) ? second : first;
}
export function ResourceWorkspace({
  resource,
}: {
  resource: LearningResource;
}) {
  const [state, setState] = useState<ResourceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [manualTime, setManualTime] = useState("");
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);
  const [bookmarkNotice, setBookmarkNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Extract<
    ResourceCommand,
    { type: "save-position" }
  > | null>(null);
  const [conflict, setConflict] = useState<ResourceState | null>(null);
  const [playerSession, setPlayerSession] = useState(0);
  const [playerPosition, setPlayerPosition] = useState<number | null>(null);
  const mounted = useRef(false);
  const busyRef = useRef(false);
  const mergeState = useCallback(
    (value: ResourceState) =>
      setState((previous) => {
        if (!previous) return value;
        return {
          resourceId: value.resourceId,
          notes:
            value.notesRevision >= previous.notesRevision
              ? value.notes
              : previous.notes,
          notesRevision: Math.max(value.notesRevision, previous.notesRevision),
          positionSeconds:
            value.positionRevision >= previous.positionRevision
              ? value.positionSeconds
              : previous.positionSeconds,
          positionRevision: Math.max(
            value.positionRevision,
            previous.positionRevision,
          ),
          openedAt: latest(previous.openedAt, value.openedAt),
          updatedAt: latest(previous.updatedAt, value.updatedAt),
        };
      }),
    [],
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    loadResourceWorkspace(resource.id, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        mergeState(result.state);
        setPlayerPosition(result.state.positionSeconds);
        setLoading(false);
        setError(null);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setLoading(false);
        setError(
          failure instanceof Error
            ? failure.message
            : "Le suivi de cette ressource est indisponible.",
        );
      });
    return () => controller.abort();
  }, [resource.id, mergeState, reload]);

  const opened = useCallback(() => {
    updateResource({
      type: "open",
      requestId: crypto.randomUUID(),
      resourceId: resource.id,
    })
      .then((value) => {
        if (mounted.current) mergeState(value.state);
      })
      .catch(() => {
        if (mounted.current)
          setError(
            "Le lecteur reste utilisable, mais l’ouverture n’a pas pu être enregistrée.",
          );
      });
  }, [resource.id, mergeState]);
  const onTime = useCallback((seconds: number) => {
    if (Number.isFinite(seconds) && seconds >= 0)
      setCurrentTime(Math.floor(seconds));
  }, []);
  const candidate = manualTime.trim()
    ? parseResourceTime(manualTime)
    : currentTime;
  async function savePosition(clear = false) {
    if (!state || busyRef.current || conflict) return;
    if (!clear && candidate === null && !pending) {
      setBookmarkError(
        "Utilise la position du lecteur ou saisis un repère comme 3:25.",
      );
      return;
    }
    const command = pending ?? {
      type: "save-position" as const,
      requestId: crypto.randomUUID(),
      resourceId: resource.id,
      expectedRevision: state.positionRevision,
      positionSeconds: clear ? null : candidate,
    };
    busyRef.current = true;
    setBusy(true);
    setPending(command);
    setBookmarkError(null);
    setBookmarkNotice("");
    try {
      const result = await updateResource(command);
      if (!mounted.current) return;
      mergeState(result.state);
      if (result.state.positionSeconds !== command.positionSeconds) {
        setConflict(result.state);
        setBookmarkError(
          "Le repère a changé dans un autre onglet après cet enregistrement.",
        );
      } else {
        setPending(null);
        setManualTime("");
        setBookmarkNotice(
          command.positionSeconds === null
            ? "Repère effacé."
            : `Repère conservé à ${formatResourceTime(command.positionSeconds)}.`,
        );
      }
    } catch (failure) {
      if (!mounted.current) return;
      setBookmarkError(
        failure instanceof Error
          ? failure.message
          : "Le repère n’a pas pu être enregistré.",
      );
      if (failure instanceof ResourceRequestError && failure.workspace) {
        setConflict(failure.workspace.state);
        mergeState(failure.workspace.state);
      }
      if (failure instanceof ResourceRequestError && failure.status === 400)
        setPending(null);
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function resolvePosition() {
    if (!conflict) return;
    // Keep the learner's proposed time, then require another explicit save.
    if (
      pending?.positionSeconds !== null &&
      pending?.positionSeconds !== undefined
    )
      setManualTime(formatResourceTime(pending.positionSeconds));
    setPending(null);
    setConflict(null);
    setBookmarkError(null);
    setBookmarkNotice(
      "Le repère enregistré est affiché. Tu peux conserver un autre instant après comparaison.",
    );
  }
  return (
    <div className="resource-workspace">
      <div className="resource-main-column">
        <section
          className="resource-goal"
          aria-labelledby="resource-goal-title"
        >
          <p className="eyebrow">Ton objectif</p>
          <h2 id="resource-goal-title">{resource.objective}</h2>
          <ol>
            {resource.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
        <section
          className="resource-media-section"
          aria-label="Ressource originale"
        >
          {resource.media ? (
            <>
              {loading ? (
                <p role="status">Chargement du repère enregistré…</p>
              ) : (
                <ResourcePlayer
                  key={`${resource.id}:${playerSession}`}
                  resource={resource}
                  initialPosition={playerPosition}
                  onPositionChange={onTime}
                  onOpen={opened}
                />
              )}
              <p className="resource-small">
                Le contenu est lu depuis son hébergeur. Une connexion internet
                est nécessaire ; le fichier n’est pas copié dans l’application.
              </p>
            </>
          ) : (
            <div className="resource-guide-opening">
              <span aria-hidden="true">Aa</span>
              <h2>Un guide à consulter à la source</h2>
              <p>
                Les mots et leurs enregistrements se consultent sur le site de
                l’auteur. Garde ici tes notes et les liens vers le cours.
              </p>
            </div>
          )}
          <a
            className="resource-source-link"
            href={resource.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={opened}
          >
            Ouvrir la source officielle ↗
          </a>
          <p className="resource-small">
            {resource.author} · {resource.language}
          </p>
        </section>
        {error && (
          <div className="resource-error" role="alert">
            {error}
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setReload((value) => value + 1);
              }}
            >
              Recharger mon suivi
            </button>
          </div>
        )}
        {state && (
          <ResourceNotes key={resource.id} state={state} onState={mergeState} />
        )}
      </div>
      <aside
        className="resource-side-column"
        aria-label="Reprise et liens avec le parcours"
      >
        {resource.media && (
          <section
            className="resource-bookmark"
            aria-labelledby="resource-bookmark-title"
          >
            <h2 id="resource-bookmark-title">Mon point de reprise</h2>
            <p className="resource-saved-position">
              {state?.positionSeconds !== null &&
              state?.positionSeconds !== undefined
                ? formatResourceTime(state.positionSeconds)
                : "Aucun repère"}
            </p>
            <p className="resource-small">
              Garde un instant précis pour retrouver le passage à la prochaine
              ouverture.
            </p>
            {state?.positionSeconds !== null &&
              state?.positionSeconds !== undefined && (
                <button
                  type="button"
                  onClick={() => {
                    setPlayerPosition(state.positionSeconds);
                    setCurrentTime(null);
                    setPlayerSession((value) => value + 1);
                  }}
                >
                  Préparer la reprise à{" "}
                  {formatResourceTime(state.positionSeconds)}
                </button>
              )}
            <p className="resource-current-position">
              Position du lecteur :{" "}
              <strong>
                {currentTime === null ? "—" : formatResourceTime(currentTime)}
              </strong>
            </p>
            <label htmlFor="resource-manual-time">
              Ou saisir un repère (mm:ss)
            </label>
            <input
              id="resource-manual-time"
              type="text"
              inputMode="text"
              placeholder="3:25"
              maxLength={12}
              value={manualTime}
              disabled={busy || !!pending || !!conflict}
              onChange={(event) => {
                setManualTime(event.target.value);
                setBookmarkNotice("");
              }}
              aria-describedby="resource-time-help"
            />
            <p id="resource-time-help" className="resource-small">
              Utile aussi si tu écoutes sur le site d’origine. Pour une heure :
              1:00:00.
            </p>
            <div className="resource-actions">
              <button
                className="resource-primary"
                type="button"
                disabled={
                  !state ||
                  busy ||
                  !!conflict ||
                  (candidate === null && !pending)
                }
                onClick={() => void savePosition()}
              >
                {busy
                  ? "Enregistrement…"
                  : pending
                    ? "Réessayer le repère"
                    : "Garder ce repère"}
              </button>
              {state?.positionSeconds !== null &&
                state?.positionSeconds !== undefined && (
                  <button
                    type="button"
                    disabled={busy || !!pending || !!conflict}
                    onClick={() => void savePosition(true)}
                  >
                    Effacer le repère
                  </button>
                )}
            </div>
            {manualTime.trim() && candidate === null && (
              <p className="resource-error">
                Utilise le format minutes:secondes, par exemple 3:25.
              </p>
            )}
            {bookmarkError && (
              <p className="resource-error" role="alert">
                {bookmarkError}
              </p>
            )}
            {conflict && (
              <div className="resource-conflict">
                <p>
                  Repère de l’autre onglet :{" "}
                  {conflict.positionSeconds === null
                    ? "aucun"
                    : formatResourceTime(conflict.positionSeconds)}
                  .
                </p>
                <button type="button" onClick={resolvePosition}>
                  J’ai comparé les repères
                </button>
              </div>
            )}
            {bookmarkNotice && (
              <p className="resource-notice" role="status">
                {bookmarkNotice}
              </p>
            )}
          </section>
        )}
        <section className="resource-connections">
          <h2>Revenir à ce que j’apprends</h2>
          {resource.connections.map((connection) => (
            <Link key={connection.href} href={connection.href}>
              {connection.label}
              <span aria-hidden="true">↗</span>
            </Link>
          ))}
        </section>
        <p className="resource-small">
          L’ouverture d’une ressource et un repère d’écoute n’indiquent pas que
          la leçon est maîtrisée.
        </p>
      </aside>
    </div>
  );
}
