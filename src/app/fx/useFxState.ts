"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Candle, Setup } from "./types.ts";
import type { PairId } from "./pairs.ts";
import type { TimeframeId } from "./timeframes.ts";
import type { TimeframeStatus } from "../api/fx/storage.ts";

/* Client state: one poll, one source of truth.

   /api/fx/state answers with price, setups, alert counts, account summary and
   data health together, so a fifteen-second refresh costs one request rather
   than seven. Candles are fetched separately because they are much larger and
   only change when the timeframe does.

   Polling stops when the tab is hidden. Left open overnight, a fifteen-second
   timer would make several thousand pointless requests before anyone looked at
   the screen again. */

export interface FxState {
  pair: PairId;
  tf: TimeframeId;
  price: number | null;
  lastBar: number | null;
  setups: Setup[];
  allSetups: Setup[];
  alerts: { unseen: number; total: number };
  scheduler: {
    running: boolean;
    marketOpen: boolean;
    hasApiKey: boolean;
    lastSuccessAt: string | null;
    lastError: string | null;
    ticks: number;
  };
  budget: {
    dayCount: number;
    dayCeiling: number;
    minuteCount: number;
    minuteCeiling: number;
    canSpend: boolean;
  };
  data: TimeframeStatus[];
  account: {
    balance: number;
    equity: number;
    openPnl: number;
    freeMargin: number;
    openPositions: number;
    pendingOrders: number;
  };
}

const POLL_MS = 15_000;

export function useFxState(pair: PairId, tf: TimeframeId) {
  const [state, setState] = useState<FxState | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // The timeframe at the moment a request was sent. A slow response for the
  // old timeframe must not overwrite data for the new one.
  const requestTf = useRef(tf);
  requestTf.current = tf;

  const loadState = useCallback(async () => {
    try {
      const response = await fetch(
        "/api/fx/state?pair=" + pair + "&tf=" + tf,
        { cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load the market state.");
      if (requestTf.current !== tf) return;
      setState(body as FxState);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the server.");
    }
  }, [pair, tf]);

  const loadCandles = useCallback(async () => {
    try {
      const response = await fetch(
        "/api/fx/candles?pair=" + pair + "&tf=" + tf + "&limit=1500",
        { cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load candles.");
      if (requestTf.current !== tf) return;
      setCandles(body.candles as Candle[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the server.");
    }
  }, [pair, tf]);

  const refresh = useCallback(async () => {
    await Promise.all([loadState(), loadCandles()]);
  }, [loadState, loadCandles]);

  // Initial load, and a full reload whenever the pair or timeframe changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      await Promise.all([loadState(), loadCandles()]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadState, loadCandles]);

  // Poll while the tab is visible.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => void refresh(), POLL_MS);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        // Catch up immediately on return, then resume the timer.
        void refresh();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  return { state, candles, error, loading, refresh };
}

/** Sign-in status, checked once. The gate is enforced on the server; this only
    decides whether the UI offers the controls or the password prompt. */
export function useSession() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState(true);

  const check = useCallback(async () => {
    try {
      const response = await fetch("/api/fx/session", { cache: "no-store" });
      const body = await response.json();
      setSignedIn(Boolean(body.signedIn));
      setConfigured(Boolean(body.configured));
    } catch {
      setSignedIn(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const signIn = useCallback(
    async (password: string): Promise<string | null> => {
      const response = await fetch("/api/fx/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await response.json();
      if (!response.ok) return body.error ?? "Could not sign in.";
      setSignedIn(true);
      return null;
    },
    [],
  );

  const signOut = useCallback(async () => {
    await fetch("/api/fx/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setSignedIn(false);
  }, []);

  return { signedIn, configured, signIn, signOut, check };
}
