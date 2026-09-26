"use client";

import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { loadAudioCatalogue, prepareAudio } from "@/lib/audio-client";
import {
  readAudioVoicePreference,
  saveAudioVoicePreference,
  subscribeAudioVoicePreference,
} from "@/lib/audio-preference";
import type {
  AudioCatalogue,
  AudioClip,
  AudioSource,
  AudioVoiceId,
} from "@/lib/audio-types";
import "./audio-player.css";

export type AudioMode = "listen" | "repeat" | "shadow";
export type AudioPhase =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "gap"
  | "paused-gap"
  | "finished"
  | "error";
export type AudioPlayerController = {
  play: () => void;
  pause: () => void;
  stop: () => void;
};
type Props = {
  source: AudioSource;
  text: string;
  compact?: boolean;
  mode?: AudioMode;
  repetitions?: number;
  gapSeconds?: number;
  controllerRef?: Ref<AudioPlayerController>;
  initialRate?: number;
  onRateChange?: (rate: number) => void;
  onPhaseChange?: (phase: AudioPhase) => void;
  onComplete?: () => void;
  onInterrupt?: () => void;
};

let activePlayer: { id: string; pause: () => void } | null = null;
function preferredVoice(catalogue: AudioCatalogue): AudioVoiceId | null {
  const stored = readAudioVoicePreference();
  return (
    catalogue.voices.find((voice) => voice.id === stored)?.id ??
    catalogue.defaultVoiceId ??
    catalogue.voices.find((voice) => voice.available)?.id ??
    null
  );
}

export function AudioPlayer(props: Props) {
  // Changing the excerpt or exercise settings ends the previous listening session.
  const session = JSON.stringify([
    props.source,
    props.mode,
    props.repetitions,
    props.gapSeconds,
  ]);
  return <AudioPlayerSession key={session} {...props} />;
}

function AudioPlayerSession({
  source,
  text,
  compact = false,
  mode = "listen",
  repetitions = 3,
  gapSeconds = 4,
  controllerRef,
  initialRate = 1,
  onRateChange,
  onPhaseChange,
  onComplete,
  onInterrupt,
}: Props) {
  const id = useId();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [expanded, setExpanded] = useState(!compact);
  const [catalogue, setCatalogue] = useState<AudioCatalogue | null>(null);
  const [voiceId, setVoiceId] = useState<AudioVoiceId | null>(null);
  const voiceRef = useRef<AudioVoiceId | null>(null);
  const [clip, setClip] = useState<AudioClip | null>(null);
  const clipRef = useRef<AudioClip | null>(null);
  const [phase, setPhase] = useState<AudioPhase>("idle");
  const phaseRef = useRef<AudioPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState(initialRate === 0.75 ? 0.75 : 1);
  const rateRef = useRef(rate);
  const callbacks = useRef({ onComplete, onInterrupt });
  const [cycle, setCycle] = useState(1);
  const cycleRef = useRef(1);
  const [remaining, setRemaining] = useState(gapSeconds);
  const gapRemaining = useRef(gapSeconds * 1_000);
  const gapDeadline = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const operation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const total = mode === "repeat" ? Math.max(1, Math.min(10, repetitions)) : 1;

  useEffect(() => {
    callbacks.current = { onComplete, onInterrupt };
  });

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [onPhaseChange, phase]);

  const transition = useCallback((next: AudioPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const pause = useCallback(() => {
    if (phaseRef.current === "gap") {
      operation.current += 1;
      gapRemaining.current = Math.max(
        0,
        gapDeadline.current - performance.now(),
      );
      clearTimer();
      transition("paused-gap");
    } else if (phaseRef.current === "playing") {
      operation.current += 1;
      audioRef.current?.pause();
      transition("paused");
    } else if (phaseRef.current === "loading") {
      operation.current += 1;
      controller.current?.abort();
      audioRef.current?.pause();
      transition("idle");
    }
  }, [clearTimer, transition]);

  const interrupt = useCallback(() => {
    pause();
    callbacks.current.onInterrupt?.();
  }, [pause]);

  const claim = useCallback(() => {
    if (activePlayer && activePlayer.id !== id) activePlayer.pause();
    activePlayer = { id, pause: interrupt };
  }, [id, interrupt]);

  const stop = useCallback(() => {
    operation.current += 1;
    controller.current?.abort();
    clearTimer();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    cycleRef.current = 1;
    setCycle(1);
    gapRemaining.current = gapSeconds * 1_000;
    setRemaining(gapSeconds);
    transition("idle");
    if (activePlayer?.id === id) activePlayer = null;
    callbacks.current.onInterrupt?.();
  }, [clearTimer, gapSeconds, id, transition]);

  useEffect(
    () =>
      subscribeAudioVoicePreference((selected) => {
        const next = selected ?? catalogue?.defaultVoiceId ?? null;
        if (next === voiceRef.current) return;
        stop();
        voiceRef.current = next;
        setVoiceId(next);
        clipRef.current = null;
        setClip(null);
        setError(null);
      }),
    [catalogue, stop],
  );

  useEffect(() => {
    mounted.current = true;
    const audio = audioRef.current;
    const onHidden = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      mounted.current = false;
      operation.current += 1;
      controller.current?.abort();
      clearTimer();
      audio?.pause();
      if (audio) {
        audio.removeAttribute("src");
        audio.load();
      }
      if (activePlayer?.id === id) activePlayer = null;
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [clearTimer, id, pause]);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    loadAudioCatalogue()
      .then((value) => {
        if (cancelled) return;
        setCatalogue(value);
        if (!voiceRef.current) {
          const choice = preferredVoice(value);
          voiceRef.current = choice;
          setVoiceId(choice);
        }
      })
      .catch((failure: unknown) => {
        if (!cancelled)
          setError(
            failure instanceof Error
              ? failure.message
              : "Les voix sont indisponibles.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [expanded]);

  const playFile = async (token: number, restart: boolean) => {
    const audio = audioRef.current;
    if (!audio || !mounted.current || token !== operation.current) return;
    if (document.hidden) {
      transition("paused");
      return;
    }
    if (restart) audio.currentTime = 0;
    audio.playbackRate = rateRef.current;
    audio.preservesPitch = true;
    transition("playing");
    try {
      await audio.play();
      if (!mounted.current || token !== operation.current) return;
      transition("playing");
    } catch (failure) {
      if (!mounted.current || token !== operation.current) return;
      transition("error");
      setError(
        failure instanceof DOMException && failure.name === "NotAllowedError"
          ? "Le navigateur a bloqué la lecture. Clique sur Réessayer pour écouter le fichier déjà prêt."
          : "La lecture a échoué. Tu peux réessayer avec le même fichier.",
      );
    }
  };

  const beginGap = () => {
    clearTimer();
    const token = operation.current;
    gapDeadline.current = performance.now() + gapRemaining.current;
    setRemaining(Math.ceil(gapRemaining.current / 1_000));
    transition("gap");
    timer.current = setInterval(() => {
      const left = Math.max(0, gapDeadline.current - performance.now());
      setRemaining(Math.ceil(left / 1_000));
      if (left > 0) return;
      clearTimer();
      if (!mounted.current || token !== operation.current) return;
      cycleRef.current += 1;
      setCycle(cycleRef.current);
      void playFile(token, true);
    }, 100);
  };

  const start = async () => {
    setExpanded(true);
    setError(null);
    claim();
    if (phaseRef.current === "paused-gap") {
      beginGap();
      return;
    }
    const previous = phaseRef.current;
    const token = ++operation.current;
    transition("loading");
    const abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    try {
      let known = clipRef.current;
      if (!known) {
        const available = catalogue ?? (await loadAudioCatalogue());
        if (!mounted.current || token !== operation.current) return;
        setCatalogue(available);
        const selected = voiceRef.current ?? preferredVoice(available);
        if (!selected)
          throw new Error(
            "Aucune voix n’est disponible. Consulte les indications ci-dessous puis actualise les voix.",
          );
        voiceRef.current = selected;
        setVoiceId(selected);
        known = await prepareAudio(source, selected, abort.signal);
        if (!mounted.current || token !== operation.current) return;
        clipRef.current = known;
        setClip(known);
        if (audioRef.current) {
          audioRef.current.src = known.url;
          audioRef.current.load();
        }
      } else if (audioRef.current?.error) {
        audioRef.current.load();
      }
      if (previous !== "paused") {
        cycleRef.current = 1;
        setCycle(1);
      }
      await playFile(token, previous !== "paused");
    } catch (failure) {
      if (!mounted.current || token !== operation.current) return;
      transition("error");
      setError(
        failure instanceof Error
          ? failure.message
          : "L’audio n’est pas disponible. Réessaie.",
      );
    }
  };

  const ended = () => {
    if (phaseRef.current !== "playing") return;
    if (mode === "repeat" && cycleRef.current < total) {
      gapRemaining.current = gapSeconds * 1_000;
      beginGap();
    } else {
      transition("finished");
      if (activePlayer?.id === id) activePlayer = null;
      callbacks.current.onComplete?.();
    }
  };

  useImperativeHandle(controllerRef, () => ({
    play: () => void start(),
    pause,
    stop,
  }));

  const refreshVoices = async () => {
    setError(null);
    try {
      const available = await loadAudioCatalogue(true);
      if (!mounted.current) return;
      setCatalogue(available);
      if (!available.voices.some((voice) => voice.id === voiceRef.current)) {
        stop();
        const selected = preferredVoice(available);
        voiceRef.current = selected;
        setVoiceId(selected);
        clipRef.current = null;
        setClip(null);
      }
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Les voix sont indisponibles.",
        );
    }
  };

  const active = phase === "playing" || phase === "gap";
  const resumable = phase === "paused" || phase === "paused-gap";
  const voice = catalogue?.voices.find((item) => item.id === voiceId);
  const status =
    phase === "loading"
      ? "Préparation de l’audio…"
      : phase === "gap"
        ? `À toi de répéter · ${remaining} s avant la prochaine écoute`
        : phase === "paused-gap"
          ? "Pause · reprends quand tu es prêt à répéter."
          : phase === "playing"
            ? mode === "shadow"
              ? "Répète en même temps que la voix."
              : "Écoute la voix."
            : phase === "paused"
              ? "Lecture en pause."
              : phase === "finished"
                ? mode === "repeat"
                  ? "Série terminée. Tu peux refaire ces écoutes quand tu veux."
                  : "Écoute terminée."
                : "";

  return (
    <div
      className={`audio-player${compact ? " audio-player-compact" : ""}`}
      data-audio-player
      data-audio-text={text}
      data-audio-phase={phase}
    >
      <audio
        ref={audioRef}
        preload="none"
        onEnded={ended}
        onError={() => {
          if (
            !mounted.current ||
            !clipRef.current ||
            phaseRef.current === "idle"
          )
            return;
          clearTimer();
          transition("error");
          setError(
            "Le fichier audio n’a pas pu être lu. Réessaie pour le charger à nouveau.",
          );
        }}
      />
      {compact && !expanded ? (
        <button
          type="button"
          className="audio-listen-compact"
          onClick={() => void start()}
          aria-label={`Écouter « ${text} »`}
        >
          <span aria-hidden="true">▶</span> Écouter
        </button>
      ) : (
        <div className="audio-player-controls">
          <div className="audio-player-topline">
            <p className="audio-provenance">
              Voix de synthèse
              {clip
                ? ` · ${clip.voiceLabel} (${clip.provider === "macos" ? "macOS" : "OpenAI"})`
                : voice
                  ? ` · ${voice.label} (${voice.provider === "macos" ? "macOS" : "OpenAI"})`
                  : ""}
            </p>
            {compact && (
              <button
                type="button"
                className="audio-collapse"
                onClick={() => {
                  stop();
                  setExpanded(false);
                }}
                aria-label={`Fermer le lecteur de « ${text} »`}
              >
                Fermer
              </button>
            )}
          </div>
          <div className="audio-main-controls">
            <button
              type="button"
              className="audio-primary"
              onClick={active ? pause : () => void start()}
              disabled={phase === "loading"}
              aria-label={`${active ? "Mettre en pause" : resumable ? "Reprendre" : phase === "error" ? "Réessayer" : phase === "finished" ? "Réécouter" : "Écouter"} « ${text} »`}
            >
              {active
                ? "Pause"
                : resumable
                  ? "Reprendre"
                  : phase === "loading"
                    ? "Préparation…"
                    : phase === "error"
                      ? "Réessayer"
                      : phase === "finished"
                        ? "Réécouter"
                        : "Écouter"}
            </button>
            {phase !== "idle" && phase !== "finished" && (
              <button type="button" onClick={stop}>
                Arrêter
              </button>
            )}
            <fieldset className="audio-speed">
              <legend>Vitesse</legend>
              {[1, 0.75].map((speed) => (
                <button
                  key={speed}
                  type="button"
                  aria-pressed={rate === speed}
                  onClick={() => {
                    rateRef.current = speed;
                    setRate(speed);
                    if (audioRef.current) audioRef.current.playbackRate = speed;
                    onRateChange?.(speed);
                  }}
                >
                  {speed === 1 ? "Normale · 1×" : "Ralentir · 0,75×"}
                </button>
              ))}
            </fieldset>
          </div>
          <div className="audio-voice-controls">
            <label htmlFor={`${id}-voice`}>Voix</label>
            <select
              id={`${id}-voice`}
              value={voiceId ?? ""}
              onChange={(event) => {
                claim();
                const selected = event.target.value as AudioVoiceId;
                saveAudioVoicePreference(selected);
              }}
              disabled={!catalogue?.voices.length}
            >
              {!voiceId && (
                <option value="">
                  {catalogue
                    ? "Aucune voix disponible"
                    : "Chargement des voix…"}
                </option>
              )}
              {catalogue?.voices.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.label}
                  {item.available ? "" : " — création indisponible"}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="audio-refresh"
              onClick={() => void refreshVoices()}
            >
              Actualiser les voix
            </button>
          </div>
          {voice && (
            <p className="audio-voice-description">{voice.description}</p>
          )}
          {catalogue?.voices.some((item) => !item.available) && (
            <details className="audio-availability">
              <summary>Disponibilité des voix</summary>
              <p>
                Les sons déjà créés restent lisibles. Choisis une voix pour
                essayer son audio.
              </p>
              <ul>
                {catalogue.voices.map((item) => (
                  <li key={item.id}>
                    <strong>{item.label}</strong> : {item.description}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="audio-status" role="status">
            {status}
            {mode === "repeat" && phase !== "idle"
              ? ` · Écoute ${cycle}/${total}`
              : ""}
          </p>
          {error && (
            <p className="audio-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
