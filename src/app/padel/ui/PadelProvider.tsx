"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Club } from "../core/types.ts";
import type { Action } from "../core/actions.ts";
import { translate, type Key, type Lang } from "./i18n.ts";

/* One copy of the club for every padel screen. It is fetched once, refreshed
   every few seconds while the page is on screen (so the phone at court 2 sees
   the score typed at court 1), and replaced by the server's answer after each
   change. */

type ActResult = { ok: true; id?: string } | { ok: false; error: string };

interface PadelCtx {
  club: Club | null;
  loadError: boolean;
  reload: () => void;
  act: (action: Action) => Promise<ActResult>;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: Key, vars?: Record<string, string | number>) => string;
  nameOf: (id: string) => string;
}

const Ctx = createContext<PadelCtx | null>(null);

const LANG_KEY = "padel.lang";
const REFRESH_MS = 8000;

export function PadelProvider({ children }: { children: React.ReactNode }) {
  const [club, setClub] = useState<Club | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [lang, setLangState] = useState<Lang>("pt");
  // Bumped by every save; a read that started before a save is stale.
  const generation = useRef(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "pt" || saved === "en") setLangState(saved);
    } catch {
      // private mode — stay on the default
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      // not remembered, still switched
    }
  }, []);

  const reload = useCallback(async () => {
    const started = generation.current;
    try {
      const res = await fetch("/api/padel", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { club: Club };
      if (generation.current === started) setClub(json.club);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    reload();
    const tick = () => {
      if (document.visibilityState === "visible") reload();
    };
    const id = window.setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [reload]);

  const act = useCallback(async (action: Action): Promise<ActResult> => {
    generation.current++;
    try {
      const res = await fetch("/api/padel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const json = (await res.json()) as { club?: Club; id?: string; error?: string };
      if (!res.ok || !json.club) return { ok: false, error: json.error ?? "server" };
      generation.current++;
      setClub(json.club);
      return { ok: true, id: json.id };
    } catch {
      return { ok: false, error: "network" };
    }
  }, []);

  const names = useMemo(() => new Map((club?.players ?? []).map((p) => [p.id, p.name])), [club]);

  const value = useMemo<PadelCtx>(
    () => ({
      club,
      loadError,
      reload,
      act,
      lang,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
      nameOf: (id) => names.get(id) ?? "?",
    }),
    [club, loadError, reload, act, lang, setLang, names],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePadel(): PadelCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePadel outside PadelProvider");
  return v;
}

/** Turns an error code from the server into a sentence. */
export function errorText(t: PadelCtx["t"], code: string): string {
  const key = ("err." + code) as Key;
  const s = t(key);
  return s === key ? t("err.server") : s;
}
