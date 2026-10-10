"use client";

import { PersonalGate } from "./auth-context";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { CafeScene, SoundWave } from "@/components/cafe-scene";
import { SceneListening } from "@/components/scene-listening";
import { ScenePractice } from "@/components/scene-practice";
import {
  loadLanguageLibrary,
  saveLanguageReference,
} from "@/lib/language-client";
import { loadReviews, updateReviews } from "@/lib/review-client";
import type { LanguageLibrary } from "@/lib/language-types";
import type { SceneDefinition, SceneRoleId } from "@/lib/scene-types";
import { rehypeUkrainianLanguage } from "@/lib/markdown";
import "./cafe-workspace.css";

function Icon({ name }: { name: "eye" | "pen" | "previous" | "next" }) {
  const paths = {
    eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    pen: "M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4",
    previous: "M15 18l-6-6 6-6",
    next: "M9 18l6-6-6-6",
  };
  return (
    <svg className="cafe-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

export function CafeWorkspace(
  props: Parameters<typeof CafeWorkspaceContent>[0],
) {
  return (
    <PersonalGate>
      <CafeWorkspaceContent {...props} />
    </PersonalGate>
  );
}

function CafeWorkspaceContent({ scenes }: { scenes: SceneDefinition[] }) {
  const [variant, setVariant] = useState(scenes[0]!.variantId);
  const scene = scenes.find((item) => item.variantId === variant)!;
  const [selectedId, setSelectedId] = useState(scene.lines[0]!.id);
  const selected =
    scene.lines.find((line) => line.id === selectedId) ?? scene.lines[0]!;
  const selectedIndex = scene.lines.indexOf(selected);
  const [mode, setMode] = useState<"observe" | "write">("observe");
  const [translation, setTranslation] = useState(false);
  const [help, setHelp] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [library, setLibrary] = useState<LanguageLibrary | null>(null);
  const [activeReferences, setActiveReferences] = useState<string[]>([]);
  const [busyReference, setBusyReference] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [referenceNotice, setReferenceNotice] = useState("");
  const beforeLeaveRef = useRef<() => Promise<boolean>>(async () => true);
  const inspectorRef = useRef<HTMLElement | null>(null);
  const selectLine = useCallback((id: string) => setSelectedId(id), []);
  const speakerOf = (id: SceneRoleId) =>
    scene.characters.find((person) => person.id === id)!;
  const selectedSpeaker = speakerOf(selected.speakerId);
  useEffect(() => {
    const controller = new AbortController();
    loadLanguageLibrary(controller.signal)
      .then(setLibrary)
      .catch(() => {
        if (!controller.signal.aborted)
          setReferenceError(
            "Les fiches sont momentanément indisponibles. Réessaie leur chargement.",
          );
      });
    loadReviews(controller.signal)
      .then((value) =>
        setActiveReferences(
          value.elements
            .filter((entry) => entry.active)
            .map((entry) => entry.id),
        ),
      )
      .catch(() => {
        /* Adding an existing reference is idempotent. */
      });
    return () => controller.abort();
  }, []);

  function focusLine(id: string) {
    setSelectedId(id);
    setHelp(false);
    setReferenceNotice("");
  }
  async function chooseVariant(id: string) {
    if (id === variant || !(await beforeLeaveRef.current())) return;
    const next = scenes.find((item) => item.variantId === id)!;
    setVariant(id);
    setSelectedId(next.lines[0]!.id);
    setHelp(false);
    setReferenceNotice("");
  }
  async function chooseMode(next: "observe" | "write") {
    if (next === mode || !(await beforeLeaveRef.current())) return;
    setMode(next);
  }
  async function referenceAction(id: string, action: "save" | "review") {
    if (busyReference) return;
    setBusyReference(id);
    setReferenceError(null);
    setReferenceNotice("");
    try {
      if (action === "save") {
        const value = await saveLanguageReference(id);
        setLibrary((old) =>
          old ? { ...old, savedReferenceIds: value.savedReferenceIds } : old,
        );
        setReferenceNotice("Expression enregistrée dans l’atelier.");
      } else {
        const value = await updateReviews({ type: "activate", elementId: id });
        setActiveReferences(
          value.elements
            .filter((entry) => entry.active)
            .map((entry) => entry.id),
        );
        setReferenceNotice(
          "Expression ajoutée aux révisions avec ses cartes existantes.",
        );
      }
    } catch (failure) {
      setReferenceError(
        failure instanceof Error
          ? failure.message
          : "Cette action a échoué. Réessaie.",
      );
    } finally {
      setBusyReference(null);
    }
  }
  return (
    <div className="cafe-workspace">
      <section className="cafe-scene-intro" aria-labelledby="cafe-scene-title">
        <CafeScene
          ambience={scenes.indexOf(scene) === 0 ? "day" : "golden"}
          focus={mode === "observe" ? selected.speakerId : null}
          bubble={
            mode === "observe"
              ? {
                  key: `${scene.variantId}:${selected.id}`,
                  speakerId: selected.speakerId,
                  name: selectedSpeaker.name,
                  text: selected.ukrainian,
                  playing,
                }
              : null
          }
        />
        <div className="cafe-scene-description">
          <div className="cafe-scene-meta">
            <span className="cafe-badge">Module {scene.moduleId}</span>
            <span>{scene.lines.length} répliques · Débutant</span>
          </div>
          <h2 id="cafe-scene-title">{scene.title}</h2>
          <p className="cafe-scene-setting">{scene.setting}</p>
          <ul className="cafe-cast" aria-label="Personnages">
            {scene.characters.map((person) => (
              <li key={person.id} className={`cafe-cast-${person.id}`}>
                <span
                  className={`cafe-avatar cafe-avatar-${person.id}`}
                  aria-hidden="true"
                >
                  {person.name.slice(0, 1)}
                </span>
                <div>
                  <strong>
                    {person.name} <span lang="uk">· {person.ukrainian}</span>
                  </strong>
                  <p>{person.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <div className="cafe-navigation">
        <div className="cafe-modes" role="group" aria-label="Activité au café">
          <button
            type="button"
            aria-pressed={mode === "observe"}
            onClick={() => void chooseMode("observe")}
          >
            <Icon name="eye" />
            Observer la scène
          </button>
          <button
            type="button"
            aria-pressed={mode === "write"}
            onClick={() => void chooseMode("write")}
          >
            <Icon name="pen" />
            Prendre un rôle
          </button>
        </div>
        <div className="cafe-select-field">
          <label htmlFor="cafe-variant">Version de la scène</label>
          <select
            id="cafe-variant"
            value={variant}
            onChange={(event) => void chooseVariant(event.target.value)}
          >
            {scenes.map((item) => (
              <option key={item.variantId} value={item.variantId}>
                {item.variantLabel}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="cafe-variant-note">
        <strong>Objectif</strong> {scene.description} Chaque version conserve
        ses propres essais.
      </p>
      {mode === "observe" ? (
        <div className="cafe-observation">
          <section
            className="cafe-dialogue"
            aria-labelledby="cafe-dialogue-title"
          >
            <div className="cafe-dialogue-heading">
              <div>
                <h2 id="cafe-dialogue-title">La conversation</h2>
                <p>Choisis une réplique pour l’écouter et la comprendre.</p>
              </div>
              <label className="cafe-switch">
                <input
                  type="checkbox"
                  role="switch"
                  checked={translation}
                  onChange={(event) => setTranslation(event.target.checked)}
                />
                Traduction française
              </label>
            </div>
            <ol className="cafe-transcript">
              {scene.lines.map((line, index) => {
                const person = speakerOf(line.speakerId);
                const current = line.id === selected.id;
                return (
                  <li
                    key={line.id}
                    className={`cafe-line cafe-line-${line.speakerId}${current ? " cafe-line-selected" : ""}`}
                  >
                    {line.direction && (
                      <p className="cafe-direction">{line.direction}</p>
                    )}
                    <div className="cafe-line-row">
                      <span
                        className={`cafe-avatar cafe-avatar-${line.speakerId}`}
                        aria-hidden="true"
                      >
                        {person.name.slice(0, 1)}
                      </span>
                      <button
                        type="button"
                        className="cafe-line-button"
                        data-scene-line={line.id}
                        aria-current={current ? "true" : undefined}
                        onClick={() => {
                          focusLine(line.id);
                          if (
                            window.matchMedia("(max-width: 1100px)").matches
                          ) {
                            inspectorRef.current?.scrollIntoView({
                              block: "start",
                            });
                            inspectorRef.current?.focus({
                              preventScroll: true,
                            });
                          }
                        }}
                        aria-label={`Réplique ${index + 1} · ${person.name} · ${line.ukrainian}`}
                      >
                        <span className="cafe-speaker">
                          {person.name}
                          <span className="cafe-line-number">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          {current && playing && <SoundWave />}
                        </span>
                        <span className="cafe-line-uk" lang="uk">
                          {line.ukrainian}
                        </span>
                        {translation && (
                          <span className="cafe-line-fr">{line.french}</span>
                        )}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
          <aside
            className="cafe-inspector"
            aria-label="Écouter et comprendre la réplique"
            ref={inspectorRef}
            tabIndex={-1}
            data-scene-speaker={selected.speakerId}
          >
            <section
              className={`cafe-focus cafe-focus-${selected.speakerId}`}
              aria-labelledby="cafe-focus-title"
            >
              <div className="cafe-focus-top">
                <div>
                  <h2 id="cafe-focus-title" className="cafe-focus-count">
                    Réplique {selectedIndex + 1} sur {scene.lines.length}
                  </h2>
                  <span className="cafe-progress" aria-hidden="true">
                    <span
                      style={{
                        width: `${((selectedIndex + 1) / scene.lines.length) * 100}%`,
                      }}
                    />
                  </span>
                </div>
                <div className="cafe-stepper">
                  <button
                    type="button"
                    aria-label="Réplique précédente"
                    disabled={selectedIndex === 0}
                    onClick={() =>
                      focusLine(scene.lines[selectedIndex - 1]!.id)
                    }
                  >
                    <Icon name="previous" />
                  </button>
                  <button
                    type="button"
                    aria-label="Réplique suivante"
                    disabled={selectedIndex === scene.lines.length - 1}
                    onClick={() =>
                      focusLine(scene.lines[selectedIndex + 1]!.id)
                    }
                  >
                    <Icon name="next" />
                  </button>
                </div>
              </div>
              <p className="cafe-focus-speaker">
                <span
                  className={`cafe-avatar cafe-avatar-${selected.speakerId}`}
                  aria-hidden="true"
                >
                  {selectedSpeaker.name.slice(0, 1)}
                </span>
                {selectedSpeaker.name}
                <span lang="uk">{selectedSpeaker.ukrainian}</span>
              </p>
              <p className="cafe-focus-uk" lang="uk">
                {selected.ukrainian}
              </p>
              <p className="cafe-focus-fr">{selected.french}</p>
            </section>
            <SceneListening
              key={`${scene.variantId}:${scene.version}`}
              scene={scene}
              selectedLineId={selected.id}
              onSelectLine={selectLine}
              onActivity={setPlaying}
            />
            <section className="cafe-line-help">
              <button
                type="button"
                className="cafe-disclosure"
                aria-expanded={help}
                onClick={() => setHelp((value) => !value)}
              >
                {help
                  ? "Masquer l’aide de prononciation"
                  : "Afficher l’aide de prononciation"}
                <Icon name="next" />
              </button>
              {help && (
                <div className="cafe-pronunciation">
                  <Markdown rehypePlugins={[rehypeUkrainianLanguage]}>
                    {selected.help}
                  </Markdown>
                  <p className="cafe-small">
                    Repères français approximatifs ; la voix reste une synthèse.
                  </p>
                </div>
              )}
            </section>
            <section className="cafe-keep" aria-labelledby="cafe-keep-title">
              <h3 id="cafe-keep-title">Garder une expression</h3>
              {!library && !referenceError && (
                <p className="cafe-small" role="status">
                  Chargement des fiches…
                </p>
              )}
              {selected.referenceIds.map((id) => {
                const reference = library?.references.find(
                  (entry) => entry.id === id,
                );
                if (!reference) return null;
                const saved = library!.savedReferenceIds.includes(id);
                const reviewed = activeReferences.includes(id);
                return (
                  <div className="cafe-reference" key={id}>
                    <p>
                      <strong lang="uk">{reference.label}</strong>
                      <span>{reference.french}</span>
                    </p>
                    <div className="cafe-actions">
                      <button
                        type="button"
                        data-done={saved}
                        disabled={!!busyReference || saved}
                        onClick={() => void referenceAction(id, "save")}
                      >
                        {saved ? "Enregistrée" : "Enregistrer l’expression"}
                      </button>
                      <button
                        type="button"
                        data-done={reviewed}
                        disabled={!!busyReference || reviewed}
                        onClick={() => void referenceAction(id, "review")}
                      >
                        {reviewed
                          ? "Dans mes révisions"
                          : "Ajouter aux révisions"}
                      </button>
                    </div>
                    <Link href={reference.sourceHref}>
                      Voir la fiche de vocabulaire ↗
                    </Link>
                  </div>
                );
              })}
              {referenceError && (
                <div className="cafe-error" role="alert">
                  {referenceError}
                  {!library && (
                    <button
                      type="button"
                      onClick={() => {
                        setReferenceError(null);
                        loadLanguageLibrary()
                          .then(setLibrary)
                          .catch(() =>
                            setReferenceError(
                              "Les fiches restent indisponibles. Réessaie.",
                            ),
                          );
                      }}
                    >
                      Recharger les fiches
                    </button>
                  )}
                </div>
              )}
              {referenceNotice && (
                <p className="cafe-notice" role="status">
                  {referenceNotice}
                </p>
              )}
              <div className="cafe-reference-links">
                <Link href="/atelier">Mes fiches dans l’atelier</Link>
                <Link href="/revisions">Mes révisions</Link>
              </div>
            </section>
          </aside>
        </div>
      ) : (
        <ScenePractice
          key={`${scene.variantId}:${scene.version}`}
          scene={scene}
          beforeLeaveRef={beforeLeaveRef}
        />
      )}
      <footer className="cafe-footer">
        <Link href={scene.sourceHref}>
          Revoir le premier échange dans le cours ↗
        </Link>
        <p>
          Expressions du module 01, assemblées dans deux scènes préparées.
          L’écoute et les essais n’attribuent pas de maîtrise automatique.
        </p>
      </footer>
    </div>
  );
}
