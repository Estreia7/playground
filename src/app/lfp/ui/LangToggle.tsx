"use client";

import { motion, useReducedMotion } from "framer-motion";
import { LANGS, type Lang } from "../i18n";
import { useLfpLang } from "../useLfpLang";

const NAMES: Record<Lang, string> = { pt: "PT", en: "EN" };

export function LangToggle() {
  const { lang, setLang, t } = useLfpLang();
  const reduced = useReducedMotion() ?? false;

  return (
    <div
      role="group"
      aria-label={t.chrome.nav.langLabel}
      className="relative flex rounded-lg border border-[var(--lfp-line)] p-0.5"
    >
      {LANGS.map((l) => {
        const on = l === lang;
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={on}
            onClick={() => setLang(l)}
            className={`lfp-num lfp-focus relative z-10 min-h-11 min-w-11 rounded-md px-2 text-xs font-semibold transition-colors ${
              on ? "text-[var(--lfp-cal-tile)]" : "text-[var(--lfp-mist)] hover:text-[var(--lfp-cobalt)]"
            }`}
          >
            {/* Shared-layout pill: the same idiom the other playground
                projects use for their tab indicators. */}
            {on && (
              <motion.span
                layoutId="lfp-lang-pill"
                aria-hidden="true"
                className="absolute inset-0 -z-10 rounded-md bg-[var(--lfp-cobalt)]"
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            {NAMES[l]}
          </button>
        );
      })}
    </div>
  );
}
