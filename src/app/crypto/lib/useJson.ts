"use client";

import { useEffect, useRef, useState } from "react";

/** Fetch JSON from one of our routes, optionally re-polling. Keeps the last
    good data on screen while a refresh is in flight or fails. */
export function useJson<T>(url: string | null, pollMs = 0): { data: T | null; error: string | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const current = useRef(url);

  useEffect(() => {
    current.current = url;
    if (!url) return;
    let cancelled = false;
    setLoading(true);
    setData(null);
    setError(null);

    const load = async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (cancelled || current.current !== url) return;
        if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
        setData(body as T);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const timer = pollMs > 0 ? setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, pollMs) : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [url, pollMs]);

  return { data, error, loading };
}
