"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JobState, JobStatus, ListingMeta, ListingState, MonthResult } from "./types";
import { API_BASE, emptyJob } from "./helpers";

type JobsMap = Record<string, JobState>;

export function useScrapperState() {
  const [jobs, setJobs] = useState<JobsMap>({});
  const [order, setOrder] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const lastSeqRef = useRef<number>(0);
  // The REST snapshot and the SSE stream used to race on mount: the stream
  // applied live events while the (slower) snapshot fetch was in flight, then
  // the snapshot's wholesale setJobs() clobbered them — which is why a finished
  // task could sit at a stale "error" until a manual refresh. The stream is now
  // opened only once the snapshot has been applied, and resumes from the
  // snapshot's event seq so nothing in between is missed and nothing already
  // reflected is replayed back over current state.
  const snapshotSeqRef = useRef<number | null>(null);
  const [streamReady, setStreamReady] = useState(false);

  const applyEvent = useCallback((type: string, payload: Record<string, unknown>) => {
    const jobId = payload.jobId as string;
    if (!jobId) return;

    setJobs((prev) => {
      const job = prev[jobId];
      if (!job && type !== "job-created" && type !== "deleted") return prev;

      if (type === "deleted") {
        const { [jobId]: _gone, ...rest } = prev;
        return rest;
      }

      if (type === "job-created") {
        if (prev[jobId]) return prev;
        const created = emptyJob({
          id: jobId,
          status: "queued",
          createdAt: (payload.createdAt as number) || Math.floor(Date.now() / 1000),
          urls: (payload.urls as string[]) || [],
          name: (payload.name as string) || "",
          location: (payload.location as string) || "",
        });
        return { ...prev, [jobId]: created };
      }

      if (type === "job-status") {
        return { ...prev, [jobId]: { ...job, status: payload.status as JobStatus } };
      }

      if (type === "listing-started") {
        const url = payload.url as string;
        const ls = job.listings[url] || { url, status: "queued", monthsDone: 0, months: [] };
        return {
          ...prev,
          [jobId]: { ...job, listings: { ...job.listings, [url]: { ...ls, status: "running" } } },
        };
      }

      if (type === "listing-meta") {
        const url = payload.url as string;
        const meta = payload.meta as ListingMeta | undefined;
        const ls = job.listings[url] || { url, status: "running", monthsDone: 0, months: [] };
        return {
          ...prev,
          [jobId]: {
            ...job,
            listings: { ...job.listings, [url]: { ...ls, meta: meta ?? ls.meta } },
          },
        };
      }

      if (type === "progress") {
        const url = payload.url as string;
        const ls = job.listings[url] || { url, status: "running", monthsDone: 0, months: [] };
        const monthsDone =
          payload.status === "done" || payload.status === "error" ? ls.monthsDone + 1 : ls.monthsDone;
        return {
          ...prev,
          [jobId]: {
            ...job,
            listings: {
              ...job.listings,
              [url]: { ...ls, status: "running", currentMonth: payload.month as string, monthsDone },
            },
          },
        };
      }

      if (type === "listing-done") {
        const url = payload.url as string;
        const months = (payload.months as MonthResult[]) || [];
        const status = (payload.status as ListingState["status"]) || "done";
        const meta = payload.meta as ListingMeta | undefined;
        const ls = job.listings[url] || { url, status, monthsDone: months.length, months };
        return {
          ...prev,
          [jobId]: {
            ...job,
            listings: {
              ...job.listings,
              [url]: {
                ...ls,
                status,
                months,
                monthsDone: months.length,
                meta: meta ?? ls.meta,
                error: payload.error as string | undefined,
              },
            },
          },
        };
      }

      return prev;
    });

    if (type === "job-created") {
      setOrder((prev) => (prev.includes(jobId) ? prev : [jobId, ...prev]));
    }
    if (type === "deleted") {
      setOrder((prev) => prev.filter((id) => id !== jobId));
      setSelected((cur) => (cur === jobId ? null : cur));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/jobs?limit=30`);
        if (!res.ok) return;
        const { jobs: list } = (await res.json()) as {
          jobs: Array<{
            id: string;
            status: JobStatus;
            createdAt: number;
            startedAt?: number;
            finishedAt?: number;
            urls: string[];
            name?: string;
            location?: string;
          }>;
        };
        if (cancelled) return;

        // Highest event seq any snapshot reflects — the stream resumes here.
        let maxSeq = 0;

        const detailed = await Promise.all(
          list.map(async (j) => {
            try {
              const r = await fetch(`${API_BASE}/jobs/${j.id}`);
              if (!r.ok) return j;
              const data = (await r.json()) as {
                job: typeof j;
                listings: Array<{
                  url: string;
                  status: ListingState["status"];
                  meta?: ListingMeta;
                  result: MonthResult[];
                }>;
                excluded?: string[];
                overrides?: Record<string, number>;
                seq?: number;
              };
              if (typeof data.seq === "number") {
                maxSeq = Math.max(maxSeq, data.seq);
              }
              return {
                meta: data.job,
                listings: data.listings,
                excluded: data.excluded,
                overrides: data.overrides,
              };
            } catch {
              return j;
            }
          })
        );

        const next: JobsMap = {};
        const ord: string[] = [];
        for (const entry of detailed) {
          if ("meta" in (entry as object)) {
            const e = entry as {
              meta: typeof list[number];
              listings: Array<{
                url: string;
                status: ListingState["status"];
                meta?: ListingMeta;
                result: MonthResult[];
              }>;
              excluded?: string[];
              overrides?: Record<string, number>;
            };
            const base = emptyJob(e.meta);
            for (const l of e.listings) {
              base.listings[l.url] = {
                url: l.url,
                status: l.status,
                monthsDone: l.result.length,
                months: l.result,
                meta: l.meta,
              };
            }
            base.excluded = new Set(e.excluded ?? []);
            base.overrides = e.overrides ?? {};
            next[e.meta.id] = base;
            ord.push(e.meta.id);
          } else {
            const j = entry as typeof list[number];
            next[j.id] = emptyJob(j);
            ord.push(j.id);
          }
        }
        setJobs(next);
        setOrder(ord);

        // The snapshot is authoritative up to maxSeq; the stream picks up there.
        snapshotSeqRef.current = maxSeq;
        lastSeqRef.current = Math.max(lastSeqRef.current, maxSeq);
        setStreamReady(true);
      } catch (err) {
        console.warn("initial load failed", err);
        // Never strand the UI on a failed snapshot — connect the stream anyway
        // so live events still drive the view.
        snapshotSeqRef.current = 0;
        setStreamReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Wait for the snapshot so the stream can resume from its seq instead of
    // replaying the entire event log over already-current state.
    if (!streamReady) return;
    const since = snapshotSeqRef.current ?? 0;
    const es = new EventSource(`${API_BASE}/jobs/stream?since=${since}`);
    const handlers = [
      "job-created",
      "job-status",
      "listing-started",
      "listing-meta",
      "progress",
      "listing-done",
      "deleted",
    ];

    function onMessage(type: string) {
      return (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          applyEvent(type, payload);
          if (e.lastEventId) {
            const n = parseInt(e.lastEventId, 10);
            if (Number.isFinite(n) && n > lastSeqRef.current) lastSeqRef.current = n;
          }
        } catch (err) {
          console.warn("bad sse payload", err);
        }
      };
    }

    for (const t of handlers) es.addEventListener(t, onMessage(t));
    es.onerror = () => {
      // EventSource auto-reconnects on transient drops.
    };

    return () => es.close();
  }, [applyEvent, streamReady]);

  const visibleJobs = useMemo(() => order.map((id) => jobs[id]).filter(Boolean), [order, jobs]);
  const activeCount = useMemo(
    () => visibleJobs.filter((j) => j.status === "queued" || j.status === "running").length,
    [visibleJobs]
  );

  const submitJob = useCallback(async (input: { urls: string[]; name: string; location: string }) => {
    const res = await fetch(`${API_BASE}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || body.error || `HTTP ${res.status}`);
    }
    const { jobId } = (await res.json()) as { jobId: string };
    return jobId;
  }, []);

  const cancelJob = useCallback(async (id: string) => {
    await fetch(`${API_BASE}/jobs/${id}/cancel`, { method: "POST" });
  }, []);

  const deleteJob = useCallback(async (id: string) => {
    await fetch(`${API_BASE}/jobs/${id}`, { method: "DELETE" });
  }, []);

  // Hide/show a single ADR cell. Optimistic: flip the local Set immediately,
  // persist to the backend, and roll back if the request fails.
  const toggleExclusion = useCallback(
    async (jobId: string, url: string, monthIndex: number) => {
      const key = `${url}|${monthIndex}`;
      let willExclude = true;
      setJobs((prev) => {
        const job = prev[jobId];
        if (!job) return prev;
        const next = new Set(job.excluded);
        if (next.has(key)) {
          next.delete(key);
          willExclude = false;
        } else {
          next.add(key);
          willExclude = true;
        }
        return { ...prev, [jobId]: { ...job, excluded: next } };
      });

      try {
        const res = await fetch(`${API_BASE}/jobs/${jobId}/exclusions`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, monthIndex, excluded: willExclude }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        console.warn("toggleExclusion failed, rolling back", err);
        setJobs((prev) => {
          const job = prev[jobId];
          if (!job) return prev;
          const next = new Set(job.excluded);
          if (willExclude) next.delete(key);
          else next.add(key);
          return { ...prev, [jobId]: { ...job, excluded: next } };
        });
      }
    },
    []
  );

  // Set (value) or clear (null) a manual ADR override for one cell. Optimistic,
  // same as toggleExclusion: apply locally, persist, roll back on failure.
  const setOverride = useCallback(
    async (jobId: string, url: string, monthIndex: number, value: number | null) => {
      const key = `${url}|${monthIndex}`;
      let previous: number | undefined;

      setJobs((prev) => {
        const job = prev[jobId];
        if (!job) return prev;
        previous = job.overrides[key];
        const next = { ...job.overrides };
        if (value === null) delete next[key];
        else next[key] = value;
        return { ...prev, [jobId]: { ...job, overrides: next } };
      });

      try {
        const res = await fetch(`${API_BASE}/jobs/${jobId}/overrides`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, monthIndex, value }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        console.warn("setOverride failed, rolling back", err);
        setJobs((prev) => {
          const job = prev[jobId];
          if (!job) return prev;
          const next = { ...job.overrides };
          if (previous === undefined) delete next[key];
          else next[key] = previous;
          return { ...prev, [jobId]: { ...job, overrides: next } };
        });
      }
    },
    []
  );

  const currentJob = selected ? jobs[selected] : null;

  return {
    jobs,
    visibleJobs,
    activeCount,
    selected,
    setSelected,
    currentJob,
    submitJob,
    cancelJob,
    deleteJob,
    toggleExclusion,
    setOverride,
  };
}
