"use client";

import { useEffect, useRef, useState } from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { usePadel } from "./PadelProvider";
import { pickPhrases } from "./creatingPhrases.ts";

/* The wait while a tournament is drawn up.

   The draw itself takes a few milliseconds, so this is not hiding anything. It
   is a small ceremony: a beat to let the group see who is playing, with a
   joke about them, before the fixtures appear. The real request starts the
   moment the screen opens and runs behind it, so if the server is slow the
   screen waits for it, and if it fails the screen closes straight away with
   the error instead of playing out its timer.

   Three ways out, so the ceremony never becomes a tax on repeat use: the
   timer runs out, the "skip" button, or Escape. */

/** The shortest the screen stays up. Also drives the progress bar. */
export const MIN_WAIT_MS = 5400;
const LINE_MS = 1800;
const SKIP_AFTER_MS = 1400;
/** More lines than the wait needs, so a slow server never runs out. */
const LINES_PREPARED = 10;

/* The orb changes character with every line, so the animation and the joke
   turn over together. The set skips the calmest states: this is meant to look
   busy. */
const ORB_STATES: OrbState[] = ["weaving", "connecting", "shaping", "solving", "searching", "working"];

interface Props {
  /** Player names as typed. They are what the jokes are about. */
  names: string[];
  /** One quiet line above the orb, e.g. "Americano · 8 players". */
  subtitle: string;
  /** True once the tournament exists on the server. */
  ready: boolean;
  onDone: () => void;
}

export function CreatingOverlay({ names, subtitle, ready, onDone }: Props) {
  const { t, lang } = usePadel();
  // Drawn once, on open. Recomputing on every render would reshuffle the jokes
  // under the reader's eyes.
  const [lines] = useState(() => pickPhrases(lang, names, LINES_PREPARED));
  const [index, setIndex] = useState(0);
  const [waited, setWaited] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const finished = useRef(false);

  useEffect(() => {
    const rotate = window.setInterval(() => setIndex((i) => (i + 1) % lines.length), LINE_MS);
    const wait = window.setTimeout(() => setWaited(true), MIN_WAIT_MS);
    const allowSkip = window.setTimeout(() => setCanSkip(true), SKIP_AFTER_MS);
    return () => {
      window.clearInterval(rotate);
      window.clearTimeout(wait);
      window.clearTimeout(allowSkip);
    };
  }, [lines.length]);

  // Leave once the tournament exists and the ceremony is over.
  useEffect(() => {
    if (finished.current) return;
    if (ready && (waited || skipped)) {
      finished.current = true;
      onDone();
    }
  }, [ready, waited, skipped, onDone]);

  // Nothing behind the screen should scroll or take a stray tap.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSkipped(true);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const state = ORB_STATES[index % ORB_STATES.length];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("creating.aria")}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-8 text-center"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 0%, #12283a 0%, #0b1823 55%, #070f16 100%)",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <p className="mb-8 text-sm font-medium text-zinc-400">{subtitle}</p>

      <div className="relative mb-8 flex h-28 w-28 items-center justify-center">
        <svg viewBox="0 0 112 112" className="pd-orbit absolute inset-0 h-full w-full" aria-hidden="true">
          <circle
            cx="56"
            cy="56"
            r="53"
            fill="none"
            stroke="#cbed09"
            strokeOpacity="0.35"
            strokeWidth="1.5"
            strokeDasharray="2 9"
            strokeLinecap="round"
          />
        </svg>
        {/* The library ships two fixed sizes rather than a scale, so the wrapper
            does the enlarging. Dots on a dark ground stay clean at 1.5x. */}
        <div style={{ transform: "scale(1.5)" }}>
          <ThinkingOrb state={state} size={64} theme="dark" aria-label={t("creating.aria")} />
        </div>
      </div>

      {/* One line at a time. The key restarts the entrance on each new joke. */}
      <div className="flex min-h-[7.5rem] max-w-xs items-start justify-center" role="status" aria-live="polite">
        <p key={index} className="pd-phrase text-balance text-[1.35rem] font-semibold leading-snug text-zinc-50">
          <Highlighted text={lines[index]} names={names} />
        </p>
      </div>

      <div className="mt-6 h-1 w-44 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
        <div
          className="pd-fill h-full rounded-full bg-lime-300"
          style={{ ["--pd-fill-ms" as string]: MIN_WAIT_MS + "ms" }}
        />
      </div>

      <button
        type="button"
        onClick={() => setSkipped(true)}
        className={`mt-8 min-h-11 rounded-xl px-5 text-sm font-semibold text-zinc-400 transition-opacity duration-300 active:bg-white/5 ${
          canSkip ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        tabIndex={canSkip ? 0 : -1}
      >
        {t("creating.skip")}
      </button>
    </div>
  );
}

/** Sets every player's name in lime, so the eye finds who the joke is about. */
function Highlighted({ text, names }: { text: string; names: string[] }) {
  const cleaned = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
    // Longest first, so "Ana Maria" is matched whole rather than as "Ana".
    .sort((a, b) => b.length - a.length);
  if (cleaned.length === 0) return <>{text}</>;

  const escaped = cleaned.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp("(" + escaped.join("|") + ")", "g"));

  return (
    <>
      {parts.map((part, i) =>
        cleaned.includes(part) ? (
          <span key={i} className="text-lime-300">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
