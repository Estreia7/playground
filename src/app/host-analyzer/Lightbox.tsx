"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { mediaUrl } from "./helpers";

export function Lightbox({
  photos,
  title,
  startIndex,
  onClose,
}: {
  photos: string[];
  title: string;
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);

  const prev = useCallback(
    () => setIndex((i) => (i - 1 + photos.length) % photos.length),
    [photos.length]
  );
  const next = useCallback(() => setIndex((i) => (i + 1) % photos.length), [photos.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prev, next]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(7,20,23,0.88)] p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Photos of ${title}`}
    >
      <motion.div
        className="relative max-h-[85dvh] w-full max-w-3xl"
        initial={{ scale: 0.86, y: 24 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 12, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ha-panel overflow-hidden">
          <div className="relative aspect-[3/2] w-full bg-[var(--ink-deep)]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.img
                key={photos[index]}
                src={mediaUrl(photos[index])}
                alt={`${title}, photo ${index + 1} of ${photos.length}`}
                className="absolute inset-0 h-full w-full object-cover"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              />
            </AnimatePresence>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="truncate text-sm font-medium">{title}</span>
            <span className="ha-mono text-xs text-[var(--mist)]">
              {index + 1} / {photos.length}
            </span>
          </div>
        </div>

        {photos.length > 1 && (
          <>
            <button
              onClick={prev}
              aria-label="Previous photo"
              className="ha-focus ha-press absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-[var(--tide)] bg-[var(--harbor)] p-2.5 text-[var(--foam)] hover:border-[var(--verdi)]/50"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={next}
              aria-label="Next photo"
              className="ha-focus ha-press absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-[var(--tide)] bg-[var(--harbor)] p-2.5 text-[var(--foam)] hover:border-[var(--verdi)]/50"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}
        <button
          onClick={onClose}
          aria-label="Close photos"
          className="ha-focus ha-press absolute right-1 top-1 rounded-full border border-[var(--tide)] bg-[var(--harbor)] p-2 text-[var(--foam)] hover:border-[var(--coral)]/60 sm:-right-2 sm:-top-2"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </motion.div>
    </motion.div>
  );
}
