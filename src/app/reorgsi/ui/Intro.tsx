"use client";

import { useEffect, useState } from "react";
import { PropertyOrb } from "./PropertyOrb.tsx";

/* Five seconds on the way in. It plays once per sign-in and can be skipped
   with the button or Escape (the mechanics of the padel draw screen). */

const DURATION_MS = 5000;
const FADE_MS = 380;
const SKIP_AFTER_MS = 1200;

const PHRASES = [
  "A cruzar angariações com compradores…",
  "A apurar as comissões de cada negócio…",
  "A validar CPCV e escrituras…",
  "A fechar a faturação do mês…",
  "A preparar o backlog da equipa…",
];

export function Intro({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const [size, setSize] = useState(360);

  useEffect(() => {
    setSize(Math.round(Math.min(420, window.innerWidth * 0.86, window.innerHeight * 0.52)));
  }, []);

  useEffect(() => {
    const step = DURATION_MS / PHRASES.length;
    const rotate = window.setInterval(() => setIndex((i) => Math.min(i + 1, PHRASES.length - 1)), step);
    const end = window.setTimeout(() => setLeaving(true), DURATION_MS);
    const skip = window.setTimeout(() => setCanSkip(true), SKIP_AFTER_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLeaving(true);
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearInterval(rotate);
      window.clearTimeout(end);
      window.clearTimeout(skip);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(onDone, FADE_MS);
    return () => window.clearTimeout(t);
  }, [leaving, onDone]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="A abrir o ReorgSI"
      className="rs-intro fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center"
      data-leaving={leaving}
    >
      <PropertyOrb size={size} durationMs={DURATION_MS} />

      <div className="mt-4 flex min-h-16 max-w-md items-start justify-center" role="status" aria-live="polite">
        <p key={index} className="rs-phrase m-0 text-balance text-xl font-semibold leading-snug text-white sm:text-2xl">
          {PHRASES[index]}
        </p>
      </div>

      <div className="mt-5 h-1 w-52 overflow-hidden rounded-full" style={{ background: "rgba(212,236,221,0.14)" }} aria-hidden="true">
        <div className="rs-intro-fill h-full rounded-full" style={{ background: "#d4ecdd", animationDuration: DURATION_MS + "ms" }} />
      </div>

      <button
        type="button"
        onClick={() => setLeaving(true)}
        tabIndex={canSkip ? 0 : -1}
        className="mt-8 min-h-11 rounded-xl px-5 text-sm font-semibold transition-opacity duration-300"
        style={{ color: "#8fb0aa", opacity: canSkip ? 1 : 0, pointerEvents: canSkip ? "auto" : "none" }}
      >
        Saltar
      </button>
    </div>
  );
}
