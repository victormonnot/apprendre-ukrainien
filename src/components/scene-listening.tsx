"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { SceneDefinition } from "@/lib/scene-types";
import {
  AudioPlayer,
  type AudioPhase,
  type AudioPlayerController,
} from "./audio-player";
import "./scene-listening.css";

type Props = {
  scene: SceneDefinition;
  selectedLineId: string;
  onSelectLine: (lineId: string) => void;
  onActivity?: (active: boolean) => void;
};

export function SceneListening({
  scene,
  selectedLineId,
  onSelectLine,
  onActivity,
}: Props) {
  const id = useId();
  const player = useRef<AudioPlayerController | null>(null);
  const queue = useRef(false);
  const pendingLine = useRef<string | null>(null);
  const previousLine = useRef(selectedLineId);
  const activity = useRef(onActivity);
  const [following, setFollowing] = useState(false);
  const [mode, setMode] = useState<"conversation" | "repeat">("conversation");
  const [rate, setRate] = useState(1);
  const [repetitions, setRepetitions] = useState(3);
  const [gapSeconds, setGapSeconds] = useState(4);
  const [message, setMessage] = useState("");
  const line = scene.lines.find((item) => item.id === selectedLineId);
  const index = scene.lines.findIndex((item) => item.id === selectedLineId);
  const speaker = scene.characters.find((item) => item.id === line?.speakerId);

  useEffect(() => {
    activity.current = onActivity;
  }, [onActivity]);

  const cancelQueue = useCallback(() => {
    queue.current = false;
    pendingLine.current = null;
    setFollowing(false);
    setMessage("");
  }, []);

  useEffect(() => {
    if (previousLine.current === selectedLineId) return;
    previousLine.current = selectedLineId;
    if (queue.current && pendingLine.current === selectedLineId) {
      pendingLine.current = null;
      player.current?.play();
    } else {
      cancelQueue();
    }
  }, [cancelQueue, selectedLineId]);

  useEffect(
    () => () => {
      queue.current = false;
      pendingLine.current = null;
      activity.current?.(false);
    },
    [],
  );

  const onPhaseChange = useCallback(
    (phase: AudioPhase) => {
      activity.current?.(
        phase === "playing" || phase === "loading" || phase === "gap",
      );
      if (phase === "error") cancelQueue();
    },
    [cancelQueue],
  );

  const onComplete = () => {
    if (!queue.current) return;
    const next = scene.lines[index + 1];
    if (!next) {
      cancelQueue();
      setMessage(
        "Conversation terminée. Reviens sur une réplique pour la travailler.",
      );
      return;
    }
    pendingLine.current = next.id;
    onSelectLine(next.id);
  };

  if (!line) return null;

  return (
    <section
      className="scene-listening"
      aria-labelledby={`${id}-title`}
      data-scene-listening
      data-scene-following={following ? "true" : "false"}
    >
      <h3 id={`${id}-title`}>Écouter la scène</h3>
      <p className="scene-listening-note">
        Une même voix de synthèse lit les deux personnages. Les noms indiquent
        qui parle ; la voix ne cherche pas à imiter Anna ou Maxime.
      </p>
      <div
        className="scene-listening-modes"
        aria-label="Mode d’écoute de la scène"
      >
        {(
          [
            ["conversation", "Conversation"],
            ["repeat", "Répéter cette réplique"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => {
              player.current?.stop();
              cancelQueue();
              setMode(value);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="scene-listening-current">
        Réplique {index + 1}/{scene.lines.length} · {speaker?.name}
        <span lang="uk">{line.ukrainian}</span>
      </p>
      {mode === "conversation" ? (
        <div className="scene-conversation-controls">
          <button
            type="button"
            className="scene-listening-start"
            disabled={following}
            onClick={() => {
              player.current?.stop();
              queue.current = true;
              setFollowing(true);
              setMessage("");
              player.current?.play();
            }}
          >
            Écouter la conversation
          </button>
          <p>
            {following
              ? "Les répliques s’enchaînent jusqu’à la fin. Tu peux mettre en pause avec le lecteur."
              : "Lance la conversation à partir de cette réplique, ou écoute seulement celle-ci avec le lecteur."}
          </p>
        </div>
      ) : (
        <div className="scene-repeat-settings">
          <label htmlFor={`${id}-repetitions`}>Nombre d’écoutes</label>
          <select
            id={`${id}-repetitions`}
            value={repetitions}
            onChange={(event) => {
              cancelQueue();
              setRepetitions(Number(event.target.value));
            }}
          >
            {[3, 5].map((value) => (
              <option value={value} key={value}>
                {value} écoutes
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-gap`}>Silence pour répéter</label>
          <select
            id={`${id}-gap`}
            value={gapSeconds}
            onChange={(event) => {
              cancelQueue();
              setGapSeconds(Number(event.target.value));
            }}
          >
            {[2, 4, 6].map((value) => (
              <option value={value} key={value}>
                {value} secondes
              </option>
            ))}
          </select>
        </div>
      )}
      <AudioPlayer
        source={{
          kind: "scene",
          sceneId: scene.id,
          variantId: scene.variantId,
          version: scene.version,
          lineId: line.id,
        }}
        text={line.ukrainian}
        controllerRef={player}
        mode={mode === "repeat" ? "repeat" : "listen"}
        repetitions={repetitions}
        gapSeconds={gapSeconds}
        initialRate={rate}
        onRateChange={setRate}
        onPhaseChange={onPhaseChange}
        onComplete={onComplete}
        onInterrupt={cancelQueue}
      />
      {message && <p role="status">{message}</p>}
    </section>
  );
}
