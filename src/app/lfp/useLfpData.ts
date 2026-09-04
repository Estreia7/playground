"use client";

import { useCallback, useEffect, useState } from "react";
import type { DatasetId, TaxData } from "./types";

export interface DatasetSummary {
  id: DatasetId;
  year: number;
  version: number;
  lastVerified: string;
  unverified: boolean;
  source: string;
}

export interface LfpDataMeta {
  datasets: DatasetSummary[];
  missing: DatasetId[];
  anyUnverified: boolean;
}

interface Payload {
  data: Partial<TaxData>;
  meta: LfpDataMeta;
}

// Module-scope cache: the tax data is the same for every visitor and changes
// only when an admin edits it, so one fetch serves every component on a page.
let cache: Payload | null = null;
let inflight: Promise<Payload> | null = null;

async function load(): Promise<Payload> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/lfp/data")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Payload>;
      })
      .then((p) => {
        cache = p;
        inflight = null;
        return p;
      })
      .catch((e) => {
        inflight = null;
        throw e;
      });
  }
  return inflight;
}

export function useLfpData() {
  const [data, setData] = useState<Partial<TaxData> | null>(cache?.data ?? null);
  const [meta, setMeta] = useState<LfpDataMeta | null>(cache?.meta ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let alive = true;
    if (cache) return;
    load()
      .then((p) => {
        if (!alive) return;
        setData(p.data);
        setMeta(p.meta);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setError(e.message);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    cache = null;
    setLoading(true);
    try {
      const p = await load();
      setData(p.data);
      setMeta(p.meta);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, meta, loading, error, refresh };
}
