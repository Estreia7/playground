"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JobState, JobStatus, ListingState, MonthResult } from "./types";
import { API_BASE, emptyJob } from "./helpers";

type JobsMap = Record<string, JobState>;

export function useScrapperState() {
  const [jobs, setJobs] = useState<JobsMap>({});
  const [order, setOrder] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const lastSeqRef = useRef<number>(0);

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
          }>;
        };
        if (cancelled) return;

        const detailed = await Promise.all(
          list.map(async (j) => {
            try {
              const r = await fetch(`${API_BASE}/jobs/${j.id}`);
              if (!r.ok) return j;
              const data = (await r.json()) as {
                job: typeof j;
                listings: Array<{ url: string; status: ListingState["status"]; result: MonthResult[] }>;
              };
              return { meta: data.job, listings: data.listings };
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
              listings: Array<{ url: string; status: ListingState["status"]; result: MonthResult[] }>;
            };
            const base = emptyJob(e.meta);
            for (const l of e.listings) {
              base.listings[l.url] = {
                url: l.url,
                status: l.status,
                monthsDone: l.result.length,
                months: l.result,
              };
            }
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
      } catch (err) {
        console.warn("initial load failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/jobs/stream`);
    const handlers = [
      "job-created",
      "job-status",
      "listing-started",
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
  }, [applyEvent]);

  const visibleJobs = useMemo(() => order.map((id) => jobs[id]).filter(Boolean), [order, jobs]);
  const activeCount = useMemo(
    () => visibleJobs.filter((j) => j.status === "queued" || j.status === "running").length,
    [visibleJobs]
  );

  const submitJob = useCallback(async (urls: string[]) => {
    const res = await fetch(`${API_BASE}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
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
  };
}
