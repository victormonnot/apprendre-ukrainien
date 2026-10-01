"use client";

import { PersonalGate } from "./auth-context";

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
  fixedVoiceId?: AudioVoiceId;
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
    props.fixedVoiceId,
    props.mode,
    props.repetitions,
    props.gapSeconds,
  ]);
  return (
    <PersonalGate compact>
      <AudioPlayerSession key={session} {...props} />
    </PersonalGate>
  );
}

function AudioPlayerSession({
  source,
  text,
  fixedVoiceId,
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
  const [catalogueRequested, setCatalogueRequested] = useState(!compact);
  const voiceMenuRef = useRef<HTMLDivElement>(null);
  const voiceButtonRef = useRef<HTMLButtonElement>(null);
  const speedButtonRef = useRef<HTMLButtonElement>(null);
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
  const [catalogue, setCatalogue] = useState<AudioCatalogue | null>(null);
  const [voiceId, setVoiceId] = useState<AudioVoiceId | null>(
    fixedVoiceId ?? null,
  );
  const voiceRef = useRef<AudioVoiceId | null>(fixedVoiceId ?? null);
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

  useEffect(() => {
    if (voiceMenuOpen) speedButtonRef.current?.focus({ preventScroll: true });
  }, [voiceMenuOpen]);

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

  useEffect(() => {
    if (fixedVoiceId) return;
    return subscribeAudioVoicePreference((selected) => {
      const next = selected ?? catalogue?.defaultVoiceId ?? null;
      if (next === voiceRef.current) return;
      stop();
      voiceRef.current = next;
      setVoiceId(next);
      clipRef.current = null;
      setError(null);
    });
  }, [catalogue, fixedVoiceId, stop]);

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
    if (!catalogueRequested) return;
    let cancelled = false;
    loadAudioCatalogue()
      .then((value) => {
        if (cancelled) return;
        setCatalogue(value);
        if (!voiceRef.current) {
          const choice = fixedVoiceId ?? preferredVoice(value);
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
  }, [catalogueRequested, fixedVoiceId]);

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
    setCatalogueRequested(true);
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
        const selected =
          fixedVoiceId ?? voiceRef.current ?? preferredVoice(available);
        if (!selected)
          throw new Error(
            "Aucune voix n’est disponible. Ouvre le choix de voix pour actualiser.",
          );
        voiceRef.current = selected;
        setVoiceId(selected);
        known = await prepareAudio(source, selected, abort.signal);
        if (!mounted.current || token !== operation.current) return;
        clipRef.current = known;
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
      if (
        !fixedVoiceId &&
        !available.voices.some((voice) => voice.id === voiceRef.current)
      ) {
        stop();
        const selected = preferredVoice(available);
        voiceRef.current = selected;
        setVoiceId(selected);
        clipRef.current = null;
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
  const action = active
    ? "Mettre en pause"
    : resumable
      ? "Reprendre"
      : phase === "loading"
        ? "Préparation de l’audio"
        : phase === "error"
          ? "Réessayer"
          : phase === "finished"
            ? "Réécouter"
            : "Écouter";
  const buttonLabel = active
    ? "Pause"
    : phase === "loading"
      ? "Chargement"
      : action;
  const status =
    phase === "loading"
      ? "Préparation de l’audio…"
      : phase === "gap"
        ? `À toi · ${remaining} s`
        : phase === "paused-gap" || phase === "paused"
          ? "En pause"
          : phase === "playing"
            ? mode === "shadow"
              ? "Répète avec la voix"
              : "Lecture en cours"
            : phase === "finished"
              ? "Écoute terminée"
              : "";

  const positionVoiceMenu = useCallback(() => {
    const button = voiceButtonRef.current;
    const menu = voiceMenuRef.current;
    if (!button || !menu) return;
    const rect = button.getBoundingClientRect();
    const bounds = menu.getBoundingClientRect();
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const width = bounds.width || Math.min(14 * rem, window.innerWidth - 16);
    const height = bounds.height || 10 * rem;
    menu.style.left = `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`;
    menu.style.top = `${Math.max(8, rect.bottom + height + 6 <= window.innerHeight ? rect.bottom + 6 : rect.top - height - 6)}px`;
  }, []);

  useEffect(() => {
    if (voiceMenuOpen) positionVoiceMenu();
  }, [voiceMenuOpen, catalogue, error, phase, positionVoiceMenu]);

  useEffect(() => {
    const dismiss = (event: Event) => {
      const menu = voiceMenuRef.current;
      if (event.target instanceof Node && menu?.contains(event.target)) return;
      if (menu?.matches(":popover-open")) menu.hidePopover();
    };
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, []);

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
      <div className="audio-player-controls">
        <button
          type="button"
          className="audio-primary"
          onClick={active ? pause : () => void start()}
          disabled={phase === "loading"}
          aria-label={`${action} « ${text} »`}
          title={action}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={phase === "loading" ? "audio-spinner" : undefined}
          >
            {phase === "loading" ? (
              <path d="M20 12a8 8 0 1 1-8-8" />
            ) : active ? (
              <>
                <path d="M9 5v14M15 5v14" strokeWidth="3" />
              </>
            ) : phase === "finished" || phase === "error" ? (
              <>
                <path d="M4 10a8 8 0 1 1 1 7M4 4v6h6" />
              </>
            ) : (
              <>
                <path d="m11 5-5 4H3v6h3l5 4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" />
              </>
            )}
          </svg>
          <span>{buttonLabel}</span>
        </button>
        <button
          ref={voiceButtonRef}
          type="button"
          className="audio-icon-button audio-voice-button"
          aria-label={fixedVoiceId ? "Vitesse" : "Vitesse et voix"}
          title={fixedVoiceId ? "Vitesse" : "Vitesse et voix"}
          popoverTarget={`${id}-voices`}
          aria-expanded={voiceMenuOpen}
          onClick={() => {
            setCatalogueRequested(true);
            positionVoiceMenu();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
      <div
        ref={voiceMenuRef}
        id={`${id}-voices`}
        className="audio-voice-menu"
        popover="auto"
        onToggle={(event) => {
          if (event.newState === "open") positionVoiceMenu();
          setVoiceMenuOpen(event.newState === "open");
        }}
      >
        <button
          ref={speedButtonRef}
          type="button"
          className="audio-speed"
          aria-label="Lecture ralentie"
          title={rate === 1 ? "Ralentir · 0,75×" : "Vitesse normale · 1×"}
          aria-pressed={rate === 0.75}
          onClick={() => {
            const next = rate === 1 ? 0.75 : 1;
            rateRef.current = next;
            setRate(next);
            if (audioRef.current) audioRef.current.playbackRate = next;
            onRateChange?.(next);
          }}
        >
          Vitesse · {rate === 1 ? "1×" : "0,75×"}
        </button>
        {!fixedVoiceId && (
          <>
            <label htmlFor={`${id}-voice`}>Voix</label>
            <select
              id={`${id}-voice`}
              value={voiceId ?? ""}
              onChange={(event) => {
                claim();
                saveAudioVoicePreference(event.target.value as AudioVoiceId);
                voiceMenuRef.current?.hidePopover();
                voiceButtonRef.current?.focus({ preventScroll: true });
              }}
              disabled={!catalogue?.voices.length}
            >
              {!voiceId && (
                <option value="">
                  {catalogue ? "Indisponible" : "Chargement…"}
                </option>
              )}
              {catalogue?.voices.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </>
        )}
        {phase !== "idle" && phase !== "finished" && (
          <button
            type="button"
            className="audio-stop"
            onClick={() => {
              stop();
              voiceMenuRef.current?.hidePopover();
              voiceButtonRef.current?.focus({ preventScroll: true });
            }}
          >
            Arrêter
          </button>
        )}
        <p>Voix de synthèse · OpenAI</p>
        {(error || catalogue?.voices.every((item) => !item.available)) && (
          <button
            type="button"
            className="audio-refresh"
            onClick={() => void refreshVoices()}
            aria-label="Actualiser les voix"
          >
            Actualiser
          </button>
        )}
      </div>
      <p
        className={`audio-status${mode === "listen" ? " audio-status-discreet" : ""}`}
        role="status"
      >
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
  );
}
