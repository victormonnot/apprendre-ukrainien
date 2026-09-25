"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RESOURCE_POSITION_MAX_SECONDS,
  type LearningResource,
} from "@/lib/resource-types";
import "./resource-player.css";

type Props = {
  resource: LearningResource;
  initialPosition: number | null;
  onPositionChange: (seconds: number) => void;
  onOpen: () => void;
};
type MediaProps = {
  initialPosition: number | null;
  onPositionChange: (seconds: number) => void;
  onRetry: () => void;
};
type YouTubePlayer = {
  cueVideoById: (options: { videoId: string; startSeconds: number }) => void;
  pauseVideo: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
};
type YouTubeEvent = { target: YouTubePlayer; data: number };
type YouTubeApi = {
  Player: new (
    element: HTMLIFrameElement,
    options: {
      events: {
        onReady: (event: { target: YouTubePlayer }) => void;
        onStateChange: (event: YouTubeEvent) => void;
        onError: (event: YouTubeEvent) => void;
      };
    },
  ) => YouTubePlayer;
};
type YouTubeWindow = Window & {
  YT?: YouTubeApi;
  onYouTubeIframeAPIReady?: () => void;
};

let youtubeRequest: Promise<YouTubeApi> | null = null;

function loadYouTubeApi(): Promise<YouTubeApi> {
  const host = window as YouTubeWindow;
  if (host.YT?.Player) return Promise.resolve(host.YT);
  if (youtubeRequest) return youtubeRequest;
  const pending = new Promise<YouTubeApi>((resolve, reject) => {
    const script = document.createElement("script");
    const previous = host.onYouTubeIframeAPIReady;
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      if (host.onYouTubeIframeAPIReady === ready) {
        if (previous) host.onYouTubeIframeAPIReady = previous;
        else delete host.onYouTubeIframeAPIReady;
      }
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      script.remove();
      reject(
        new Error(
          "Le lecteur YouTube n’a pas pu être chargé. Réessaie ou utilise le lien vers la source.",
        ),
      );
    };
    const ready = () => {
      if (settled || !host.YT?.Player) return;
      settled = true;
      cleanup();
      resolve(host.YT);
      previous?.();
    };
    const timeout = window.setTimeout(fail, 15_000);
    host.onYouTubeIframeAPIReady = ready;
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onload = ready;
    script.onerror = fail;
    document.head.append(script);
  });
  youtubeRequest = pending.catch((error: unknown) => {
    youtubeRequest = null;
    throw error;
  });
  return youtubeRequest;
}

function position(value: number, duration?: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const end =
    typeof duration === "number" && Number.isFinite(duration) && duration > 0
      ? Math.min(duration, RESOURCE_POSITION_MAX_SECONDS)
      : RESOURCE_POSITION_MAX_SECONDS;
  return Math.floor(Math.min(value, end));
}

export function ResourcePlayer(props: Props) {
  return (
    <ResourcePlayerSession
      key={`${props.resource.id}:${JSON.stringify(props.resource.media)}`}
      {...props}
    />
  );
}

function ResourcePlayerSession({
  resource,
  initialPosition,
  onPositionChange,
  onOpen,
}: Props) {
  const [activation, setActivation] = useState<{
    attempt: number;
    position: number | null;
  } | null>(null);
  const current = useRef(initialPosition);
  const callbacks = useRef({ onPositionChange, onOpen });
  useEffect(() => {
    callbacks.current = { onPositionChange, onOpen };
  }, [onPositionChange, onOpen]);
  const report = useCallback((seconds: number) => {
    const value = position(seconds);
    if (value === null) return;
    current.current = value;
    callbacks.current.onPositionChange(value);
  }, []);

  if (!resource.media)
    return (
      <p className="resource-player-guide">
        Ce guide se consulte sur le site de son auteur.
      </p>
    );

  const media = resource.media;
  const retry = () =>
    setActivation((value) => ({
      attempt: (value?.attempt ?? 0) + 1,
      position: current.current,
    }));
  return (
    <section
      className="resource-player"
      aria-label={`Lecteur · ${resource.title}`}
      data-resource-player={resource.id}
    >
      {activation ? (
        <>
          {media.kind === "audio" ? (
            <PodcastPlayer
              key={activation.attempt}
              url={media.url}
              title={resource.title}
              initialPosition={activation.position}
              onPositionChange={report}
              onRetry={retry}
            />
          ) : (
            <YouTubeResourcePlayer
              key={activation.attempt}
              videoId={media.videoId}
              title={resource.title}
              initialPosition={activation.position}
              onPositionChange={report}
              onRetry={retry}
            />
          )}
          <button
            type="button"
            className="resource-player-close"
            onClick={() => setActivation(null)}
          >
            Fermer le lecteur
          </button>
        </>
      ) : (
        <div className="resource-player-placeholder">
          <span className="resource-player-symbol" aria-hidden="true">
            {media.kind === "audio" ? "♫" : "▶"}
          </span>
          <p>
            {media.kind === "audio"
              ? "L’audio se charge directement depuis l’hébergeur du podcast."
              : "Le lecteur se charge depuis YouTube à ta demande."}{" "}
            La lecture démarrera avec son bouton de lecture.
          </p>
          <button
            type="button"
            className="resource-player-load"
            onClick={() => {
              current.current = initialPosition;
              setActivation({ attempt: 0, position: initialPosition });
              callbacks.current.onOpen();
            }}
          >
            Charger le lecteur
          </button>
        </div>
      )}
    </section>
  );
}

function MediaError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="resource-player-error" role="alert">
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        Réessayer le lecteur
      </button>
    </div>
  );
}

function PodcastPlayer({
  url,
  title,
  initialPosition,
  onPositionChange,
  onRetry,
}: MediaProps & { url: string; title: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const restored = useRef(false);
  const alive = useRef(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const report = useCallback(() => {
    const element = audio.current;
    if (!alive.current || !element || element.readyState === 0) return;
    const value = position(element.currentTime, element.duration);
    if (value !== null) onPositionChange(value);
  }, [onPositionChange]);

  useEffect(() => {
    alive.current = true;
    const element = audio.current;
    // Strict Mode can run cleanup and setup again on the same DOM element.
    if (element && element.getAttribute("src") !== url) {
      element.src = url;
      element.load();
    }
    timeout.current = setTimeout(() => {
      if (alive.current && element?.readyState === 0)
        setError(
          "L’hébergeur du podcast ne répond pas. Réessaie ou utilise le lien vers la source.",
        );
    }, 20_000);
    const onHidden = () => {
      if (document.hidden) element?.pause();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      alive.current = false;
      if (timeout.current !== null) clearTimeout(timeout.current);
      timeout.current = null;
      document.removeEventListener("visibilitychange", onHidden);
      if (element) {
        element.pause();
        element.removeAttribute("src");
        element.load();
      }
    };
  }, [url]);

  return (
    <div className="resource-podcast-player">
      <audio
        ref={audio}
        src={url}
        controls
        preload="metadata"
        aria-label={`Écouter · ${title}`}
        onLoadedMetadata={() => {
          if (!alive.current || !audio.current) return;
          if (timeout.current !== null) clearTimeout(timeout.current);
          timeout.current = null;
          setReady(true);
          setError(null);
          if (!restored.current) {
            restored.current = true;
            const target = position(
              initialPosition ?? 0,
              audio.current.duration,
            );
            if (target !== null && target > 0) {
              try {
                audio.current.currentTime = target;
              } catch {
                setNotice(
                  "Le repère n’a pas pu être atteint. Tu peux te déplacer dans le lecteur ou utiliser ton repère écrit.",
                );
              }
            }
          }
          report();
        }}
        onTimeUpdate={report}
        onSeeked={report}
        onPause={report}
        onEnded={report}
        onPlay={() => {
          if (document.hidden) audio.current?.pause();
        }}
        onError={() => {
          if (timeout.current !== null) clearTimeout(timeout.current);
          timeout.current = null;
          if (alive.current)
            setError(
              "L’audio n’a pas pu être chargé depuis son hébergeur. Réessaie ou ouvre la page de l’épisode avec le lien vers la source.",
            );
        }}
      />
      {!ready && !error && (
        <p className="resource-player-status" role="status">
          Chargement du podcast…
        </p>
      )}
      {notice && (
        <p className="resource-player-status" role="status">
          {notice}
        </p>
      )}
      {error && <MediaError message={error} onRetry={onRetry} />}
    </div>
  );
}

function YouTubeResourcePlayer({
  videoId,
  title,
  initialPosition,
  onPositionChange,
  onRetry,
}: MediaProps & { videoId: string; title: string }) {
  const container = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let player: YouTubePlayer | null = null;
    let frame: HTMLIFrameElement | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let played = false;
    let failed = false;
    const clearPoll = () => {
      if (interval !== null) clearInterval(interval);
      interval = null;
    };
    const clearReadyTimeout = () => {
      if (timeout !== null) clearTimeout(timeout);
      timeout = null;
    };
    const report = () => {
      if (cancelled || failed || !player || !played) return;
      try {
        const value = position(player.getCurrentTime(), player.getDuration());
        if (value !== null) onPositionChange(value);
      } catch {
        /* The iframe may already be unloading. */
      }
    };
    const fail = (message: string) => {
      if (cancelled || failed) return;
      failed = true;
      clearPoll();
      clearReadyTimeout();
      try {
        player?.destroy();
      } catch {
        /* The unavailable player may not accept commands. */
      }
      player = null;
      frame?.remove();
      setError(message);
    };
    const onHidden = () => {
      if (!document.hidden) return;
      report();
      clearPoll();
      try {
        player?.pauseVideo();
      } catch {
        /* A not-ready iframe cannot play. */
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    void loadYouTubeApi()
      .then((api) => {
        if (cancelled || !container.current) return;
        if (!/^[A-Za-z0-9_-]{11}$/u.test(videoId))
          throw new Error(
            "Cette vidéo n’est pas disponible dans le lecteur. Utilise le lien vers la source.",
          );
        const start = position(initialPosition ?? 0) ?? 0;
        const url = new URL(
          `https://www.youtube-nocookie.com/embed/${videoId}`,
        );
        url.search = new URLSearchParams({
          enablejsapi: "1",
          origin: window.location.origin,
          autoplay: "0",
          playsinline: "1",
          rel: "0",
          start: String(start),
        }).toString();
        frame = document.createElement("iframe");
        frame.src = url.toString();
        frame.title = title;
        frame.allow = "encrypted-media; picture-in-picture; fullscreen";
        frame.allowFullscreen = true;
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        container.current.append(frame);
        timeout = setTimeout(
          () =>
            fail(
              "YouTube ne répond pas. Réessaie ou ouvre la vidéo avec le lien vers la source.",
            ),
          20_000,
        );
        player = new api.Player(frame, {
          events: {
            onReady: (event) => {
              if (cancelled || failed) return;
              player = event.target;
              clearReadyTimeout();
              // cueVideoById restores the start point without seekTo's implicit playback.
              try {
                player.cueVideoById({ videoId, startSeconds: start });
                player.pauseVideo();
                setReady(true);
              } catch {
                fail(
                  "Le lecteur YouTube n’est pas prêt. Réessaie ou utilise le lien vers la source.",
                );
              }
            },
            onStateChange: (event) => {
              if (cancelled || failed) return;
              clearPoll();
              if (event.data === 1) {
                if (document.hidden) {
                  event.target.pauseVideo();
                  return;
                }
                played = true;
                report();
                interval = setInterval(report, 500);
              } else if ([0, 2, 3].includes(event.data)) report();
            },
            onError: (event) =>
              fail(
                [101, 150].includes(event.data)
                  ? "Cette vidéo ne peut pas être lue dans l’application. Ouvre-la avec le lien vers la source ; tes notes et ton repère restent disponibles ici."
                  : event.data === 153
                    ? "YouTube n’a pas reconnu ce lecteur. Ouvre la vidéo avec le lien vers la source ; tes notes et ton repère restent disponibles ici."
                    : "Cette vidéo est momentanément indisponible. Réessaie ou utilise le lien vers la source.",
              ),
          },
        });
      })
      .catch((failure: unknown) =>
        fail(
          failure instanceof Error
            ? failure.message
            : "Le lecteur YouTube est indisponible. Utilise le lien vers la source.",
        ),
      );
    return () => {
      cancelled = true;
      clearPoll();
      clearReadyTimeout();
      document.removeEventListener("visibilitychange", onHidden);
      try {
        player?.destroy();
      } catch {
        /* A partially created player may not be ready. */
      }
      frame?.remove();
    };
  }, [initialPosition, onPositionChange, title, videoId]);

  return (
    <div className="resource-youtube-player">
      <div className="resource-video-frame" ref={container} hidden={!!error} />
      {!ready && !error && (
        <p className="resource-player-status" role="status">
          Chargement du lecteur YouTube…
        </p>
      )}
      {error && <MediaError message={error} onRetry={onRetry} />}
    </div>
  );
}
