"use client";

/* Language state as an external store.

   useSyncExternalStore over a module-level value means every component on
   the page reads the same language without a context provider — which
   keeps the repo's "one hook per project, no context" convention — and
   `getServerSnapshot` returning "pt" means the server and the first client
   render always agree, so there is never a hydration warning. The real
   preference is applied after hydration, which is the documented path. */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { dictionaries, isLang, type Dict, type Lang } from "./i18n";

const KEY = "lfp:lang:v1";
const DEFAULT: Lang = "pt";

let current: Lang | null = null;
const listeners = new Set<() => void>();

function detect(): Lang {
  // localStorage can throw (Safari private mode, blocked storage) — never
  // let a preference lookup take the page down.
  try {
    const saved = localStorage.getItem(KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* fall through */
  }
  try {
    if (!navigator.language.toLowerCase().startsWith("pt")) return "en";
  } catch {
    /* fall through */
  }
  return DEFAULT;
}

function getSnapshot(): Lang {
  if (current === null) current = detect();
  return current;
}

function getServerSnapshot(): Lang {
  return DEFAULT;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function setLang(next: Lang) {
  if (current === next) return;
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* preference simply won't persist */
  }
  listeners.forEach((cb) => cb());
}

export function useLfpLang(): {
  lang: Lang;
  t: Dict;
  setLang: (l: Lang) => void;
} {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // The root layout hardcodes lang="en"; keep the document honest for
  // assistive tech. Idempotent, so many hook instances are harmless.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const set = useCallback((l: Lang) => setLang(l), []);

  return { lang, t: dictionaries[lang], setLang: set };
}
