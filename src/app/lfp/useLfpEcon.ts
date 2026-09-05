"use client";

import { useEffect, useState } from "react";
import type { EconData, EconId } from "./types";

export interface EconSummary {
  id: EconId;
  year: number;
  retrievedAt: string;
  datasetCode: string;
  source: string;
}

interface Payload {
  data: Partial<EconData>;
  meta: { datasets: EconSummary[]; missing: EconId[] };
}

// Same shape as useLfpData: one fetch per page load shared by every
// component, since the data only changes when the sync script runs.
let cache: Payload | null = null;
let inflight: Promise<Payload> | null = null;

function load(): Promise<Payload> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/lfp/econ")
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

export function useLfpEcon() {
  const [data, setData] = useState<Partial<EconData> | null>(cache?.data ?? null);
  const [meta, setMeta] = useState<Payload["meta"] | null>(cache?.meta ?? null);
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

  return { data, meta, loading, error };
}
