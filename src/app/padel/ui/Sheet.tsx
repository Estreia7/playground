"use client";

import { useEffect, useId, useRef } from "react";
import { usePadel } from "./PadelProvider";

/* A bottom sheet: rises from the thumb's end of the screen, closes on Escape
   or a tap on the dimmed page behind it, and holds the page still while open.
   Clicks inside stop here, so a sheet opened from a tappable row does not also
   toggle that row. Focus moves into the sheet when it opens (unless something
   inside already took it) and goes back to where it was when it closes. */

export function Sheet({
  title,
  onClose,
  children,
  tall = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Scrolls within 94% of the screen instead of sizing to its content. */
  tall?: boolean;
}) {
  const { t } = usePadel();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // Read while rendering, before an autoFocus inside the sheet moves focus.
  const opener = useRef(typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null));

  useEffect(() => {
    const back = opener.current;
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
    return () => back?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" aria-label={t("score.close")} onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div
        ref={panel}
        tabIndex={-1}
        className={`pd-sheet relative outline-none w-full max-w-xl rounded-t-3xl border-t border-zinc-800 bg-zinc-950 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 ${
          tall ? "max-h-[94dvh] overflow-y-auto" : ""
        }`}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-zinc-700" aria-hidden />
        <h2 id={titleId} className="mb-1 text-xl font-bold tracking-tight">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
