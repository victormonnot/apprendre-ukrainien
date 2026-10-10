"use client";

import { PersonalGate } from "./auth-context";

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
import type { SceneDefinition, SceneRoleId } from "@/lib/scene-types";
import { rehypeUkrainianLanguage } from "@/lib/markdown";
import "./cafe-workspace.css";

function CafeIllustration({ speaker }: { speaker: SceneRoleId }) {
  return (
    <svg
      className="cafe-illustration"
      viewBox="0 0 1200 420"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="cafe-art-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6ecdf" />
          <stop offset="1" stopColor="#ecdac3" />
        </linearGradient>
        <pattern
          id="cafe-art-stripes"
          width="36"
          height="36"
          patternUnits="userSpaceOnUse"
        >
          <rect width="18" height="36" fill="#efe1cd" />
        </pattern>
        <linearGradient id="cafe-art-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b5d5dc" />
          <stop offset="1" stopColor="#e9f1e4" />
        </linearGradient>
        <radialGradient id="cafe-art-glow">
          <stop offset="0" stopColor="#ffd98a" stopOpacity=".6" />
          <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="1200" height="420" fill="url(#cafe-art-wall)" />
      <rect width="1200" height="290" fill="url(#cafe-art-stripes)" />
      <path d="M0 290H1200V420H0Z" fill="#dcc3a3" />
      {Array.from({ length: 10 }, (_, index) => (
        <rect
          key={index}
          x={20 + index * 120}
          y="314"
          width="96"
          height="130"
          rx="6"
          fill="none"
          stroke="#ceb18d"
          strokeWidth="3"
        />
      ))}
      <path d="M0 284H1200V296H0Z" fill="#c4a37f" />
      <ellipse cx="600" cy="130" rx="340" ry="240" fill="url(#cafe-art-glow)" />

      <rect x="60" y="56" width="62" height="78" rx="4" fill="#7a5a42" />
      <rect x="66" y="62" width="50" height="66" fill="#f3dca9" />
      <path d="M91 122V96" stroke="#5b7f4f" strokeWidth="2.5" />
      {Array.from({ length: 8 }, (_, index) => (
        <ellipse
          key={index}
          cx="91"
          cy="82"
          rx="3.5"
          ry="7"
          fill="#e9b33f"
          transform={`rotate(${index * 45} 91 90)`}
        />
      ))}
      <circle cx="91" cy="90" r="5" fill="#6b4a2e" />

      <path
        d="M300 30L342 10L384 30"
        stroke="#8b6a4f"
        strokeWidth="3"
        fill="none"
      />
      <circle cx="342" cy="10" r="4" fill="#7a5a42" />
      <rect x="280" y="30" width="124" height="76" rx="9" fill="#7a5a42" />
      <rect x="287" y="37" width="110" height="62" rx="5" fill="#2f4a47" />
      <text
        x="342"
        y="77"
        textAnchor="middle"
        fill="#fff4dc"
        fontFamily="Georgia, serif"
        fontSize="26"
      >
        Кава
      </text>
      <path
        d="M308 89H376"
        stroke="#fff4dc"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="1 9"
        opacity=".7"
      />

      <path
        d="M170 168H392"
        stroke="#8d6a4c"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path d="M196 172V186M370 172V186" stroke="#7a5a42" strokeWidth="5" />
      {(
        [
          [200, "#b4573c"],
          [286, "#fff6e4"],
          [326, "#3c6c5f"],
        ] as const
      ).map(([x, color]) => (
        <g key={x} fill={color} stroke={color}>
          <rect x={x} y="140" width="26" height="24" rx="5" stroke="none" />
          <path
            d={`M${x + 26} 146Q${x + 36} 146 ${x + 36} 153Q${x + 36} 160 ${x + 26} 160`}
            strokeWidth="4"
            fill="none"
          />
        </g>
      ))}
      <rect
        x="240"
        y="128"
        width="36"
        height="36"
        rx="6"
        fill="#d4e4e6"
        opacity=".9"
      />
      <rect x="244" y="142" width="28" height="19" rx="4" fill="#6f4e37" />
      <rect x="238" y="122" width="40" height="8" rx="3" fill="#8d6a4c" />

      <path d="M0 262H372V420H0Z" fill="#8d6a4c" />
      {[20, 140, 260].map((x) => (
        <rect
          key={x}
          x={x}
          y="290"
          width="100"
          height="140"
          rx="8"
          fill="#94714f"
        />
      ))}
      <rect x="-10" y="252" width="392" height="16" rx="6" fill="#5d4331" />
      <path
        d="M164 252H228"
        stroke="#8d6a4c"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <rect x="182" y="230" width="28" height="18" rx="3" fill="#e9b872" />
      <path d="M182 236H210" stroke="#fff6e4" strokeWidth="3" />
      <path
        d="M170 250Q170 206 196 206Q222 206 222 250Z"
        fill="#e6f1f2"
        opacity=".55"
        stroke="#c9d7da"
        strokeWidth="2"
      />
      <rect x="264" y="196" width="104" height="56" rx="8" fill="#c7ccd1" />
      <rect x="264" y="188" width="104" height="14" rx="5" fill="#9aa3ab" />
      <rect x="288" y="212" width="56" height="12" rx="3" fill="#7f8891" />
      <rect x="310" y="224" width="12" height="8" fill="#6c757d" />
      <path d="M303 238H329V244Q316 254 303 244Z" fill="#fff6e4" />
      <circle
        cx="356"
        cy="210"
        r="6"
        fill="#fff"
        stroke="#7f8891"
        strokeWidth="2"
      />

      <path d="M600 0V78" stroke="#3a3330" strokeWidth="3" />
      <path d="M566 112Q568 78 600 76Q632 78 634 112Z" fill="#2f4a47" />
      <path
        d="M560 112H640"
        stroke="#24403d"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <ellipse cx="600" cy="117" rx="14" ry="7" fill="#ffe7a8" />

      <path
        d="M840 296V124Q840 48 960 48Q1080 48 1080 124V296Z"
        fill="url(#cafe-art-sky)"
      />
      <circle cx="1030" cy="104" r="20" fill="#f8d98b" />
      <path d="M840 242Q900 206 960 228T1080 214V296H840Z" fill="#a7c3b9" />
      <path
        d="M846 296V250H868V238H886V296ZM1004 296V256H1034V296ZM1046 296V246H1064V236H1080V296Z"
        fill="#93aea7"
      />
      <rect x="894" y="240" width="36" height="56" fill="#f3eee4" />
      <rect x="902" y="218" width="20" height="24" fill="#f3eee4" />
      <path
        d="M912 190Q899 204 899 211Q899 219 912 219Q925 219 925 211Q925 204 912 190Z"
        fill="#e3b54b"
      />
      <path d="M912 176V192M907 181H917" stroke="#d4a23a" strokeWidth="2.5" />
      <path d="M907 296V280Q912 272 917 280V296Z" fill="#cdbfab" />
      <path
        d="M840 296V124Q840 48 960 48Q1080 48 1080 124V296Z"
        fill="none"
        stroke="#7a5a42"
        strokeWidth="12"
      />
      <path d="M960 52V296M844 172H1076" stroke="#7a5a42" strokeWidth="8" />
      <rect x="820" y="290" width="280" height="16" rx="5" fill="#8d6a4c" />
      <path d="M1018 290L1024 262H1056L1062 290Z" fill="#b4573c" />
      <path
        d="M1040 262Q1027 238 1009 236Q1019 256 1040 262ZM1040 262Q1053 236 1071 232Q1063 254 1040 262ZM1040 262Q1039 236 1047 220Q1053 244 1040 262Z"
        fill="#5f8752"
      />

      <path d="M1118 420L1110 344H1150L1142 420Z" fill="#8d6a4c" />
      <path
        d="M1130 346Q1104 300 1074 296Q1094 330 1130 346ZM1130 346Q1136 296 1164 270Q1160 318 1130 346ZM1130 346Q1114 290 1126 250Q1146 296 1130 346Z"
        fill="#4f7a49"
      />

      <g className="cafe-figure" data-active={speaker === "anna"}>
        <path
          d="M410 214Q404 156 456 152Q508 156 502 214L510 292Q484 304 470 286H440Q426 304 400 292Z"
          fill="#4a3229"
        />
        <path
          d="M383 420V338Q383 268 455 264Q527 268 527 338V420Z"
          fill="#b4573c"
        />
        <path d="M443 236H467V272H443Z" fill="#d99f7c" />
        <path d="M432 266Q455 292 478 266Z" fill="#d99f7c" />
        <ellipse cx="455" cy="212" rx="37" ry="45" fill="#e8b593" />
        <circle cx="419" cy="226" r="3.5" fill="#f2c14e" />
        <path
          d="M417 214Q414 162 458 160Q496 162 494 206Q468 200 452 178Q440 202 417 214Z"
          fill="#4a3229"
        />
        <circle cx="440" cy="214" r="3.4" fill="#3a2a22" />
        <circle cx="470" cy="214" r="3.4" fill="#3a2a22" />
        <circle cx="431" cy="230" r="7" fill="#e58c74" opacity=".35" />
        <circle cx="479" cy="230" r="7" fill="#e58c74" opacity=".35" />
        <path
          d="M446 236Q455 244 464 236"
          stroke="#8a4b3f"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
      </g>

      <g className="cafe-figure" data-active={speaker === "maxime"}>
        <path
          d="M673 420V338Q673 268 745 264Q817 268 817 338V420Z"
          fill="#3c6c5f"
        />
        <path d="M733 236H757V272H733Z" fill="#cf9572" />
        <path
          d="M722 266L745 286L768 266L760 261L745 274L730 261Z"
          fill="#f4efe6"
        />
        <ellipse cx="708" cy="217" rx="6" ry="9" fill="#d29270" />
        <ellipse cx="782" cy="217" rx="6" ry="9" fill="#d29270" />
        <ellipse cx="745" cy="212" rx="37" ry="45" fill="#dca07c" />
        <path
          d="M708 206Q702 160 746 158Q790 158 784 204Q778 186 762 182Q740 194 718 184Q712 194 708 206Z"
          fill="#3f322a"
        />
        <path
          d="M723 198Q731 194 739 198M752 198Q760 194 768 198"
          stroke="#3f322a"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="731" cy="215" r="3.2" fill="#2e2723" />
        <circle cx="760" cy="215" r="3.2" fill="#2e2723" />
        <g stroke="#2e2723" strokeWidth="2.6" fill="none">
          <circle cx="731" cy="214" r="11" />
          <circle cx="760" cy="214" r="11" />
          <path d="M742 213Q745.5 209 749 213" />
        </g>
        <path
          d="M736 238Q745 245 755 238"
          stroke="#7d4a3c"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
      </g>

      <path d="M588 346H612V420H588Z" fill="#5a4332" />
      <ellipse cx="600" cy="337" rx="172" ry="21" fill="#6f523b" />
      <ellipse cx="600" cy="330" rx="172" ry="20" fill="#a47b55" />

      <path d="M590 318Q586 304 594 296H606Q614 304 610 318Z" fill="#3c6c5f" />
      <path d="M600 296V266" stroke="#5b7f4f" strokeWidth="3" />
      <path d="M600 286Q612 276 618 282Q610 290 600 288Z" fill="#6f9460" />
      {Array.from({ length: 8 }, (_, index) => (
        <ellipse
          key={index}
          cx="600"
          cy="250"
          rx="4.5"
          ry="8"
          fill="#f2c14e"
          transform={`rotate(${index * 45} 600 260)`}
        />
      ))}
      <circle cx="600" cy="260" r="6" fill="#6b4a2e" />

      <ellipse cx="562" cy="334" rx="24" ry="5" fill="#efe3d0" />
      <path
        d="M546 308H578V320Q578 334 562 334Q546 334 546 320Z"
        fill="#fff8ec"
      />
      <ellipse cx="562" cy="308" rx="16" ry="4" fill="#7a5235" />
      <ellipse cx="638" cy="334" rx="24" ry="5" fill="#efe3d0" />
      <path
        d="M622 308H654V320Q654 334 638 334Q622 334 622 320Z"
        fill="#fff8ec"
      />
      <ellipse cx="638" cy="308" rx="16" ry="4" fill="#7a5235" />
      <g className="cafe-steam">
        <path d="M556 298Q548 288 556 278Q564 268 556 258" />
        <path d="M570 296Q563 288 570 280" />
        <path d="M632 298Q624 288 632 278Q640 268 632 258" />
        <path d="M646 296Q639 288 646 280" />
      </g>

      <g className="cafe-figure" data-active={speaker === "anna"}>
        <path
          d="M512 296Q516 330 538 328"
          stroke="#9f4a31"
          strokeWidth="20"
          strokeLinecap="round"
          fill="none"
        />
        <ellipse cx="544" cy="327" rx="11" ry="8" fill="#e8b593" />
      </g>
      <g className="cafe-figure" data-active={speaker === "maxime"}>
        <path
          d="M688 296Q684 330 662 328"
          stroke="#335d52"
          strokeWidth="20"
          strokeLinecap="round"
          fill="none"
        />
        <ellipse cx="656" cy="327" rx="11" ry="8" fill="#dca07c" />
      </g>
    </svg>
  );
}

function SoundWave() {
  return (
    <span className="cafe-wave" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

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
        <div className="cafe-stage">
          <CafeIllustration speaker={selected.speakerId} />
          {mode === "observe" && (
            <p
              key={`${scene.variantId}:${selected.id}`}
              className={`cafe-bubble cafe-bubble-${selected.speakerId}`}
              aria-hidden="true"
            >
              <span className="cafe-bubble-name">
                {selectedSpeaker.name}
                {playing && <SoundWave />}
              </span>
              <span lang="uk">{selected.ukrainian}</span>
            </p>
          )}
        </div>
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
