"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { SceneRoleId } from "@/lib/scene-types";
import { envelopeAt, loadVoiceEnvelope } from "@/lib/voice-envelope";
import {
  CafeBackLayer,
  CafeCastLayer,
  CafeFrontLayer,
  CafeGlowLayer,
  CafeLightLayer,
  characterRigs,
  mouthPath,
  teethPath,
} from "./cafe-scene-art";
import "./cafe-scene.css";

export function SoundWave() {
  return (
    <span className="cafe-wave" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

type Bubble = {
  key: string;
  speakerId: SceneRoleId;
  name: string;
  text: string;
  playing: boolean;
};

/** Syllable-like motion used until a clip's loudness curve is decoded. */
function fallbackLevel(time: number) {
  const syllables = Math.abs(Math.sin(time * 11.5)) * 0.7;
  const phrase = 0.55 + 0.45 * Math.sin(time * 2.3);
  return Math.max(0, syllables * phrase + 0.15 * Math.sin(time * 31));
}

function useLipSync(stageRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    let audio: HTMLAudioElement | null = null;
    let speaker: SceneRoleId | null = null;
    let envelope: Float32Array | null = null;
    let level = 0;
    let frame = 0;

    function pose(id: SceneRoleId, open: number, now: number) {
      const rig = characterRigs[id];
      const root = stage!.querySelector(`[data-rig="${id}"]`);
      if (!root) return;
      root
        .querySelector('[data-rig-part="mouth"]')
        ?.setAttribute("d", mouthPath(rig.mouth, open));
      root
        .querySelector('[data-rig-part="teeth"]')
        ?.setAttribute("d", teethPath(rig.mouth, open));
      const still = calm.matches || open === 0;
      const angle = still ? 0 : open * 2.6 * Math.sin(now / 150);
      const lift = still ? 0 : -open * 3;
      for (const head of root.querySelectorAll('[data-rig-part="head"]'))
        head.setAttribute(
          "transform",
          `rotate(${angle.toFixed(2)} ${rig.neck.x} ${rig.neck.y}) translate(0 ${lift.toFixed(2)})`,
        );
      root
        .querySelector('[data-rig-part="brows"]')
        ?.setAttribute("transform", `translate(0 ${(-open * 4).toFixed(2)})`);
    }

    function tick(now: number) {
      const speaking = !!audio && !audio.paused && !audio.ended;
      let target = 0;
      if (speaking)
        target = envelope
          ? envelopeAt(envelope, audio!.currentTime)
          : fallbackLevel(audio!.currentTime);
      level += (target - level) * (target > level ? 0.6 : 0.3);
      if (!speaking && level < 0.02) level = 0;
      if (speaker) pose(speaker, Math.min(1, level), now);
      if (speaking || level > 0) {
        frame = requestAnimationFrame(tick);
      } else {
        frame = 0;
        delete stage!.dataset.talking;
      }
    }

    function start(event: Event) {
      const target = event.target;
      if (!(target instanceof HTMLAudioElement)) return;
      const holder = target.closest<HTMLElement>("[data-scene-speaker]");
      const id = holder?.dataset.sceneSpeaker as SceneRoleId | undefined;
      if (!id || !(id in characterRigs)) return;
      if (speaker && speaker !== id) pose(speaker, 0, 0);
      audio = target;
      speaker = id;
      envelope = null;
      level = 0;
      stage!.dataset.talking = id;
      const source = target.currentSrc;
      if (source)
        void loadVoiceEnvelope(source).then((value) => {
          if (audio === target && target.currentSrc === source)
            envelope = value;
        });
      if (!frame) frame = requestAnimationFrame(tick);
    }

    document.addEventListener("playing", start, true);
    return () => {
      document.removeEventListener("playing", start, true);
      cancelAnimationFrame(frame);
    };
  }, [stageRef]);
}

function useParallax(stageRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    function move(event: PointerEvent) {
      if (event.pointerType !== "mouse" || calm.matches) return;
      const box = stage!.getBoundingClientRect();
      const x = ((event.clientX - box.left) / box.width) * 2 - 1;
      const y = ((event.clientY - box.top) / box.height) * 2 - 1;
      stage!.style.setProperty("--cafe-px", x.toFixed(3));
      stage!.style.setProperty("--cafe-py", y.toFixed(3));
    }
    function leave() {
      stage!.style.setProperty("--cafe-px", "0");
      stage!.style.setProperty("--cafe-py", "0");
    }
    const visibility = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) delete stage.dataset.offscreen;
      else stage.dataset.offscreen = "";
    });
    visibility.observe(stage);
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerleave", leave);
    return () => {
      visibility.disconnect();
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerleave", leave);
    };
  }, [stageRef]);
}

/**
 * The illustrated café: stacked SVG layers for depth, ambient motion and
 * characters whose mouths follow the scene audio that is playing.
 */
export function CafeScene({
  ambience,
  focus,
  bubble,
}: {
  ambience: "day" | "golden";
  focus: SceneRoleId | null;
  bubble: Bubble | null;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  useLipSync(stageRef);
  useParallax(stageRef);
  const head = bubble ? characterRigs[bubble.speakerId].head : null;
  return (
    <div
      ref={stageRef}
      className="cafe-stage"
      data-ambience={ambience}
      data-focus={focus ?? "none"}
    >
      <div className="cafe-camera">
        <CafeBackLayer />
        <CafeLightLayer />
        <CafeGlowLayer />
        <CafeCastLayer />
        <div className="cafe-layer cafe-layer-speech">
          {bubble && head && (
            <p
              key={bubble.key}
              className={`cafe-bubble cafe-bubble-${bubble.speakerId}`}
              style={{ "--x": head.x, "--top": head.top } as CSSProperties}
              aria-hidden="true"
            >
              <span className="cafe-bubble-name">
                {bubble.name}
                {bubble.playing && <SoundWave />}
              </span>
              <span lang="uk">{bubble.text}</span>
            </p>
          )}
        </div>
        <CafeFrontLayer />
      </div>
      <div className="cafe-atmosphere" aria-hidden="true" />
    </div>
  );
}
