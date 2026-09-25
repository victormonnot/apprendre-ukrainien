"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loadAudioCatalogue } from "@/lib/audio-client";
import type { AudioCatalogue } from "@/lib/audio-types";
import { AudioPlayer, type AudioMode } from "./audio-player";
import "./audio-studio.css";

const modes: { id: AudioMode; label: string; description: string }[] = [
  {
    id: "listen",
    label: "Écouter",
    description:
      "Écoute l’extrait, puis réécoute-le à ton rythme. Tu peux ralentir la même voix sans changer de phrase.",
  },
  {
    id: "repeat",
    label: "Répéter après",
    description:
      "Écoute la phrase, puis répète pendant le silence. La série s’arrête après le nombre d’écoutes choisi.",
  },
  {
    id: "shadow",
    label: "Shadowing",
    description:
      "Répète en même temps que la voix. Commence lentement avec un extrait court que tu comprends déjà.",
  },
];

export function AudioStudio() {
  const searchParams = useSearchParams();
  const requestedElement = searchParams.get("element");
  return (
    <AudioStudioSession
      key={requestedElement ?? "studio"}
      requestedElement={requestedElement}
    />
  );
}

function AudioStudioSession({
  requestedElement,
}: {
  requestedElement: string | null;
}) {
  const practiceHeading = useRef<HTMLHeadingElement>(null);
  const [catalogue, setCatalogue] = useState<AudioCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [segmentId, setSegmentId] = useState<string | null>(null);
  const [mode, setMode] = useState<AudioMode>("listen");
  const [gap, setGap] = useState(4);
  const [repetitions, setRepetitions] = useState(3);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadAudioCatalogue(retry > 0)
      .then((value) => {
        if (cancelled) return;
        setCatalogue(value);
        setError(null);
        setLoading(false);
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setLoading(false);
        setError(
          failure instanceof Error
            ? failure.message
            : "Le studio est indisponible.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);

  const requestedGroup = catalogue?.groups.find((item) =>
    item.segments.some(
      (segment) =>
        segment.id === requestedElement ||
        (segment.source.kind === "reference" &&
          segment.source.elementId === requestedElement),
    ),
  );
  const group =
    catalogue?.groups.find((item) => item.id === groupId) ??
    requestedGroup ??
    catalogue?.groups[0];
  const selected =
    group?.segments.find((segment) => segment.id === segmentId) ??
    group?.segments.find(
      (segment) =>
        segment.id === requestedElement ||
        (segment.source.kind === "reference" &&
          segment.source.elementId === requestedElement),
    ) ??
    group?.segments[0];
  const index = selected
    ? (group?.segments.findIndex((item) => item.id === selected.id) ?? 0)
    : 0;
  const activeMode = modes.find((item) => item.id === mode)!;

  return (
    <div className="audio-studio">
      <p className="studio-note">
        Les extraits utilisent des voix de synthèse. Ce studio sert à écouter et
        à t’entraîner librement : aucune voix n’est enregistrée, aucune
        prononciation n’est notée et l’écoute ne valide pas une leçon.
      </p>
      {loading && <p role="status">Ouverture du studio…</p>}
      {error && (
        <div className="studio-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setRetry((value) => value + 1);
            }}
          >
            Réessayer
          </button>
        </div>
      )}
      {catalogue && group && selected && (
        <>
          <section
            className="studio-collection"
            aria-labelledby="studio-collection-title"
          >
            <h2 id="studio-collection-title">Choisir un extrait</h2>
            <div className="studio-groups" aria-label="Groupes d’extraits">
              {catalogue.groups.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={item.id === group.id}
                  onClick={() => {
                    setGroupId(item.id);
                    setSegmentId(null);
                  }}
                >
                  {item.title}
                  <span>{item.segments.length} extraits</span>
                </button>
              ))}
            </div>
            <p className="studio-description">{group.description}</p>
            <ol className="studio-segments" aria-label={group.title}>
              {group.segments.map((segment, position) => (
                <li key={segment.id}>
                  <button
                    type="button"
                    aria-current={
                      segment.id === selected.id ? "true" : undefined
                    }
                    onClick={() => {
                      setSegmentId(segment.id);
                      if (window.matchMedia("(max-width: 600px)").matches)
                        requestAnimationFrame(() =>
                          practiceHeading.current?.focus(),
                        );
                    }}
                  >
                    <span className="studio-segment-index" aria-hidden="true">
                      {String(position + 1).padStart(2, "0")}
                    </span>
                    <span>
                      <span lang="uk" className="studio-segment-uk">
                        {segment.text}
                      </span>
                      <span className="studio-segment-french">
                        {segment.french}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
          <section
            className="studio-practice"
            aria-labelledby="studio-practice-title"
          >
            <div className="studio-practice-heading">
              <h2
                id="studio-practice-title"
                ref={practiceHeading}
                tabIndex={-1}
              >
                Mon écoute
              </h2>
              <span>
                Extrait {index + 1} / {group.segments.length}
              </span>
            </div>
            <p className="studio-current-text" lang="uk">
              {selected.text}
            </p>
            <p className="studio-current-french">{selected.french}</p>
            <Link className="studio-source" href={selected.sourceHref}>
              Revoir dans le cours
            </Link>
            <div className="studio-modes" aria-label="Manière de s’entraîner">
              {modes.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={mode === item.id}
                  onClick={() => setMode(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="studio-mode-description">{activeMode.description}</p>
            {mode === "repeat" && (
              <div className="studio-repeat-settings">
                <label>
                  Silence pour répéter
                  <select
                    value={gap}
                    onChange={(event) => setGap(Number(event.target.value))}
                  >
                    {[2, 4, 6].map((value) => (
                      <option key={value} value={value}>
                        {value} secondes
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Nombre d’écoutes
                  <select
                    value={repetitions}
                    onChange={(event) =>
                      setRepetitions(Number(event.target.value))
                    }
                  >
                    {[1, 3, 5].map((value) => (
                      <option key={value} value={value}>
                        {value} {value === 1 ? "écoute" : "écoutes"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <AudioPlayer
              source={selected.source}
              text={selected.text}
              mode={mode}
              gapSeconds={gap}
              repetitions={repetitions}
            />
            <div className="studio-navigation">
              <button
                type="button"
                disabled={index <= 0}
                onClick={() => setSegmentId(group.segments[index - 1]!.id)}
              >
                ← Extrait précédent
              </button>
              <button
                type="button"
                disabled={index >= group.segments.length - 1}
                onClick={() => setSegmentId(group.segments[index + 1]!.id)}
              >
                Extrait suivant →
              </button>
            </div>
            <p className="studio-footnote">
              Tu choisis le prochain extrait ; il ne démarre pas
              automatiquement.
            </p>
          </section>
        </>
      )}
      {catalogue && !selected && <p>Aucun extrait n’est encore disponible.</p>}
    </div>
  );
}
