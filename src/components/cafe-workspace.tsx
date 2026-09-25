"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { SceneListening } from "@/components/scene-listening";
import { ScenePractice } from "@/components/scene-practice";
import {
  loadLanguageLibrary,
  saveLanguageReference,
} from "@/lib/language-client";
import { loadReviews, updateReviews } from "@/lib/review-client";
import type { LanguageLibrary } from "@/lib/language-types";
import type { SceneDefinition } from "@/lib/scene-types";
import { rehypeUkrainianLanguage } from "@/lib/markdown";
import "./cafe-workspace.css";

function CafeIllustration({ speaker }: { speaker: string }) {
  return (
    <svg className="cafe-illustration" viewBox="0 0 800 300" aria-hidden="true">
      <rect width="800" height="300" fill="#ede1d1" />
      <path d="M0 233H800V300H0Z" fill="#d3bda5" />
      <path
        d="M487 234V41Q487 13 515 13H679Q707 13 707 41V234"
        fill="#c2d9de"
        stroke="#795b44"
        strokeWidth="9"
      />
      <path
        d="M496 143L537 124 578 157 618 123 702 152V230H496Z"
        fill="#a6beb8"
      />
      <circle cx="649" cy="69" r="23" fill="#f6d789" />
      <path d="M599 19V232M491 112H704" stroke="#795b44" strokeWidth="7" />
      <path
        d="M150 0V43M151 45L120 90H182Z"
        fill="#38504e"
        stroke="#38504e"
        strokeWidth="5"
      />
      <rect x="234" y="38" width="181" height="68" rx="5" fill="#355451" />
      <text
        x="325"
        y="80"
        textAnchor="middle"
        fill="#fff4dc"
        fontFamily="Georgia, serif"
        fontSize="27"
      >
        Кава
      </text>
      <path
        d="M53 237V181M53 211C10 216 23 175 49 196M55 203C95 194 83 168 55 191"
        stroke="#566b46"
        strokeWidth="9"
        fill="none"
      />
      <path d="M32 226H76L69 263H40Z" fill="#ad653e" />
      <ellipse cx="420" cy="280" rx="190" ry="12" fill="#bfa88e" />
      <g opacity={speaker === "anna" ? 1 : 0.8}>
        <path
          d="M213 272V222Q213 157 272 161Q327 160 327 222V272"
          fill="#ac5c43"
        />
        <path
          d="M233 144Q213 103 237 88Q266 66 292 91L307 153"
          fill="#473329"
        />
        <ellipse cx="267" cy="125" rx="30" ry="38" fill="#e2ae8b" />
        <path
          d="M231 113Q241 72 280 88L299 109Q273 106 262 94Q251 111 231 120Z"
          fill="#473329"
        />
        <path
          d="M254 140Q265 148 274 138"
          stroke="#805349"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <path d="M267 156V171" stroke="#e2ae8b" strokeWidth="18" />
        <circle cx="258" cy="123" r="2" fill="#473329" />
        <circle cx="279" cy="122" r="2" fill="#473329" />
        <path
          d="M282 195L330 220 352 215"
          fill="none"
          stroke="#e2ae8b"
          strokeWidth="16"
          strokeLinecap="round"
        />
      </g>
      <g opacity={speaker === "maxime" ? 1 : 0.8}>
        <path
          d="M512 272V221Q512 158 563 161Q620 161 620 228V272"
          fill="#476962"
        />
        <ellipse cx="563" cy="123" rx="30" ry="38" fill="#d9a381" />
        <path
          d="M532 117L532 98Q539 70 574 83Q598 84 596 116L584 104Q552 113 540 103Z"
          fill="#493c32"
        />
        <path
          d="M552 141Q563 148 574 138"
          stroke="#805349"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <path d="M562 156V171" stroke="#d9a381" strokeWidth="18" />
        <circle cx="550" cy="123" r="2" fill="#473329" />
        <circle cx="573" cy="123" r="2" fill="#473329" />
        <path
          d="M544 194L496 222 480 215"
          fill="none"
          stroke="#d9a381"
          strokeWidth="16"
          strokeLinecap="round"
        />
      </g>
      <path
        d="M350 246L336 293M476 246L490 293"
        stroke="#5e4936"
        strokeWidth="9"
      />
      <ellipse cx="416" cy="233" rx="116" ry="17" fill="#70523b" />
      <ellipse cx="416" cy="228" rx="116" ry="15" fill="#a47b55" />
      <path d="M371 202H395V216Q383 230 371 216Z" fill="#fff6e4" />
      <path
        d="M394 204Q410 204 399 215"
        stroke="#fff6e4"
        strokeWidth="4"
        fill="none"
      />
      <path d="M441 202H465V216Q453 230 441 216Z" fill="#fff6e4" />
      <path
        d="M464 204Q480 204 469 215"
        stroke="#fff6e4"
        strokeWidth="4"
        fill="none"
      />
      <path
        d="M380 194Q371 186 379 178M450 194Q442 186 450 178"
        stroke="#fff6e4"
        strokeWidth="2"
        fill="none"
        opacity=".7"
      />
    </svg>
  );
}

export function CafeWorkspace({ scenes }: { scenes: SceneDefinition[] }) {
  const [variant, setVariant] = useState(scenes[0]!.variantId);
  const scene = scenes.find((item) => item.variantId === variant)!;
  const [selectedId, setSelectedId] = useState(scene.lines[0]!.id);
  const selected =
    scene.lines.find((line) => line.id === selectedId) ?? scene.lines[0]!;
  const [mode, setMode] = useState<"observe" | "write">("observe");
  const [translation, setTranslation] = useState(false);
  const [help, setHelp] = useState(false);
  const [library, setLibrary] = useState<LanguageLibrary | null>(null);
  const [activeReferences, setActiveReferences] = useState<string[]>([]);
  const [busyReference, setBusyReference] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [referenceNotice, setReferenceNotice] = useState("");
  const beforeLeaveRef = useRef<() => Promise<boolean>>(async () => true);
  const inspectorRef = useRef<HTMLElement | null>(null);
  const selectLine = useCallback((id: string) => setSelectedId(id), []);
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
        <div className="cafe-scene-art">
          <CafeIllustration speaker={selected.speakerId} />
          <span className="cafe-place-label">
            Un café, deux nouvelles connaissances.
          </span>
        </div>
        <div className="cafe-scene-description">
          <div className="cafe-scene-meta">
            <span className="cafe-badge">Module 01</span>
            <span>{scene.lines.length} répliques · Débutant</span>
          </div>
          <h2 id="cafe-scene-title">{scene.title}</h2>
          <p>{scene.setting}</p>
          <div className="cafe-cast">
            {scene.characters.map((person) => (
              <div key={person.id}>
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
              </div>
            ))}
          </div>
        </div>
      </section>
      <div className="cafe-navigation">
        <div className="cafe-modes" aria-label="Activité au café">
          <button
            type="button"
            aria-pressed={mode === "observe"}
            onClick={() => void chooseMode("observe")}
          >
            Observer la scène
          </button>
          <button
            type="button"
            aria-pressed={mode === "write"}
            onClick={() => void chooseMode("write")}
          >
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
        {scene.description} Chaque version conserve ses propres essais.
      </p>
      {mode === "observe" ? (
        <div className="cafe-observation">
          <section
            className="cafe-dialogue"
            aria-labelledby="cafe-dialogue-title"
          >
            <div className="cafe-dialogue-heading">
              <h2 id="cafe-dialogue-title">La conversation</h2>
              <label className="cafe-checkbox">
                <input
                  type="checkbox"
                  checked={translation}
                  onChange={(event) => setTranslation(event.target.checked)}
                />
                Traduction française
              </label>
            </div>
            <ol className="cafe-transcript">
              {scene.lines.map((line, index) => (
                <li
                  key={line.id}
                  className={`cafe-line cafe-line-${line.speakerId}${line.id === selected.id ? " cafe-line-selected" : ""}`}
                >
                  {line.direction && (
                    <p className="cafe-direction">{line.direction}</p>
                  )}
                  <button
                    type="button"
                    data-scene-line={line.id}
                    aria-current={line.id === selected.id ? "true" : undefined}
                    onClick={() => {
                      setSelectedId(line.id);
                      setHelp(false);
                      setReferenceNotice("");
                      if (window.matchMedia("(max-width: 1100px)").matches) {
                        inspectorRef.current?.scrollIntoView({
                          block: "start",
                        });
                        inspectorRef.current?.focus({ preventScroll: true });
                      }
                    }}
                    aria-label={`Réplique ${index + 1} · ${scene.characters.find((person) => person.id === line.speakerId)!.name} · ${line.ukrainian}`}
                  >
                    <span className="cafe-speaker">
                      {String(index + 1).padStart(2, "0")} ·{" "}
                      {
                        scene.characters.find(
                          (person) => person.id === line.speakerId,
                        )!.name
                      }
                    </span>
                    <span className="cafe-line-uk" lang="uk">
                      {line.ukrainian}
                    </span>
                    {translation && (
                      <span className="cafe-line-fr">{line.french}</span>
                    )}
                  </button>
                </li>
              ))}
            </ol>
          </section>
          <aside
            className="cafe-inspector"
            aria-label="Écouter et comprendre la réplique"
            ref={inspectorRef}
            tabIndex={-1}
          >
            <SceneListening
              key={`${scene.variantId}:${scene.version}`}
              scene={scene}
              selectedLineId={selected.id}
              onSelectLine={selectLine}
            />
            <section className="cafe-line-help">
              <h3>Comprendre cette réplique</h3>
              <p>{selected.french}</p>
              <button
                type="button"
                aria-expanded={help}
                onClick={() => setHelp((value) => !value)}
              >
                {help
                  ? "Masquer l’aide de prononciation"
                  : "Afficher l’aide de prononciation"}
              </button>
              {help && (
                <div className="cafe-pronunciation">
                  <Markdown rehypePlugins={[rehypeUkrainianLanguage]}>
                    {selected.help}
                  </Markdown>
                </div>
              )}
              <p className="cafe-small">
                Repères français approximatifs ; la voix reste une synthèse.
              </p>
              <h3>Garder une expression</h3>
              {selected.referenceIds.map((id) => {
                const reference = library?.references.find(
                  (entry) => entry.id === id,
                );
                if (!reference) return null;
                return (
                  <div className="cafe-reference" key={id}>
                    <p>
                      <strong lang="uk">{reference.label}</strong>
                      <span>{reference.french}</span>
                    </p>
                    <div className="cafe-actions">
                      <button
                        type="button"
                        disabled={
                          !!busyReference ||
                          library!.savedReferenceIds.includes(id)
                        }
                        onClick={() => void referenceAction(id, "save")}
                      >
                        {library!.savedReferenceIds.includes(id)
                          ? "Enregistrée"
                          : "Enregistrer l’expression"}
                      </button>
                      <button
                        type="button"
                        disabled={
                          !!busyReference || activeReferences.includes(id)
                        }
                        onClick={() => void referenceAction(id, "review")}
                      >
                        {activeReferences.includes(id)
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
