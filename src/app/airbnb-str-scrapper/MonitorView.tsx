"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { JobState } from "./types";
import { API_BASE, fmtTime, shortId, shortUrl, statusColor } from "./helpers";

type Metrics = {
  windowDays: number;
  totalAttempts: number;
  byOutcome: Record<string, number>;
  successRate: number | null;
  shrinkRate: number | null;
  priceFoundRate: number | null;
  cache: { hits: number; total: number; rate: number | null };
  jobDurationMs: { count: number; avg: number | null; p50: number | null; p95: number | null };
};

type Attempt = {
  id: number;
  jobId: string;
  url: string;
  month: string;
  sampleStart: string;
  sampleEnd: string;
  sampleNights: number;
  outcome: string;
  totalPrice: number | null;
  durationMs: number;
  ts: number;
};

type EventRow = {
  seq: number;
  type: string;
  payload: Record<string, unknown>;
  ts: number;
};

export function MonitorView({
  jobs,
  selected,
  onSelect,
  current,
}: {
  jobs: JobState[];
  selected: string | null;
  onSelect: (id: string) => void;
  current: JobState | null;
}) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [windowDays, setWindowDays] = useState(7);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadMetrics = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/metrics?windowDays=${windowDays}`);
      if (!res.ok) return;
      setMetrics(await res.json());
    } catch {
      // ignore — next tick will retry
    }
  }, [windowDays]);

  useEffect(() => {
    loadMetrics();
    const t = setInterval(loadMetrics, 10_000);
    return () => clearInterval(t);
  }, [loadMetrics]);

  useEffect(() => {
    if (!selected) {
      setEvents([]);
      setAttempts([]);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/jobs/${selected}/events`);
        if (!res.ok) return;
        const data = (await res.json()) as { events: EventRow[]; attempts: Attempt[] };
        if (cancelled) return;
        setEvents(data.events);
        setAttempts(data.attempts);
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected, current?.status, current?.listings]); // refetch when the SSE stream advances this job

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Monitor</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Live metrics + per-job event log. Auto-refreshes every 10s.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-500">Window:</span>
          {[1, 7, 30].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setWindowDays(d)}
              className={`rounded-md border px-2.5 py-1 ${
                windowDays === d
                  ? "border-orange-600/60 bg-orange-600/10 text-orange-300"
                  : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Price-found rate"
          value={pct(metrics?.priceFoundRate)}
          hint={`${metrics?.byOutcome?.success ?? 0} + ${metrics?.byOutcome?.["success-shrunk"] ?? 0} shrunk / ${metrics?.totalAttempts ?? 0} attempts`}
          tone={toneForRate(metrics?.priceFoundRate, 0.6, 0.85)}
        />
        <StatCard
          label="Shrink rate"
          value={pct(metrics?.shrinkRate)}
          hint={`min-stay fallbacks that succeeded`}
          tone={toneForRate(metrics?.shrinkRate, 0.4, 0.2, true)}
        />
        <StatCard
          label="Cache hit rate"
          value={pct(metrics?.cache?.rate)}
          hint={`${metrics?.cache?.hits ?? 0} cached / ${metrics?.cache?.total ?? 0} listings`}
          tone="muted"
        />
        <StatCard
          label="Avg job duration"
          value={metrics?.jobDurationMs?.avg ? fmtMs(metrics.jobDurationMs.avg) : "—"}
          hint={
            metrics?.jobDurationMs?.p95
              ? `p50 ${fmtMs(metrics.jobDurationMs.p50!)} · p95 ${fmtMs(metrics.jobDurationMs.p95)} · n=${metrics.jobDurationMs.count}`
              : "no completed jobs in window"
          }
          tone="muted"
        />
      </div>

      <OutcomeBreakdown metrics={metrics} />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
            <h3 className="text-sm font-semibold">Jobs</h3>
            <span className="text-xs text-zinc-500">{jobs.length}</span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {jobs.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-zinc-500">No jobs yet</p>
            )}
            {jobs.map((j) => (
              <button
                key={j.id}
                type="button"
                onClick={() => onSelect(j.id)}
                className={`block w-full border-b border-zinc-800/60 px-4 py-2.5 text-left transition-colors hover:bg-zinc-900/70 ${
                  selected === j.id ? "bg-zinc-900" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate text-sm font-medium text-zinc-200">
                    {j.name || `Task #${shortId(j.id)}`}
                  </span>
                  <span
                    className={`shrink-0 rounded-full border px-1.5 py-0 text-[9px] uppercase tracking-wide ${statusColor(
                      j.status
                    )}`}
                  >
                    {j.status}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-500">{fmtTime(j.createdAt)}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {!current && (
            <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center">
              <p className="text-sm text-zinc-500">Select a job on the left to see its event log.</p>
            </div>
          )}
          {current && (
            <>
              <JobSummary job={current} attempts={attempts} />
              <EventTimeline events={events} loading={loadingDetail} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone = "muted",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn" | "bad" | "muted";
}) {
  const colorMap: Record<string, string> = {
    good: "text-emerald-400",
    warn: "text-amber-400",
    bad: "text-red-400",
    muted: "text-zinc-200",
  };
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${colorMap[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}

function OutcomeBreakdown({ metrics }: { metrics: Metrics | null }) {
  if (!metrics) return null;
  const items: { key: string; label: string; tone: string }[] = [
    { key: "success", label: "success", tone: "bg-emerald-600/30 text-emerald-300" },
    { key: "success-shrunk", label: "success (shrunk)", tone: "bg-sky-600/30 text-sky-300" },
    { key: "dates-unavailable", label: "dates unavailable", tone: "bg-zinc-700 text-zinc-300" },
    { key: "no-price-found", label: "no-price-found", tone: "bg-red-700/40 text-red-300" },
    { key: "error", label: "error", tone: "bg-red-700/40 text-red-300" },
  ];
  const total = items.reduce((acc, it) => acc + (metrics.byOutcome[it.key] || 0), 0);
  if (total === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-xs text-zinc-500">
        No scrape attempts in this window yet.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wide text-zinc-500">Outcome breakdown</p>
        <span className="text-[11px] text-zinc-500">{total} attempts</span>
      </div>
      <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        {items.map((it) => {
          const n = metrics.byOutcome[it.key] || 0;
          if (n === 0) return null;
          const w = (n / total) * 100;
          return <div key={it.key} className={it.tone} style={{ width: `${w}%` }} title={`${it.label}: ${n}`} />;
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {items.map((it) => {
          const n = metrics.byOutcome[it.key] || 0;
          if (n === 0) return null;
          return (
            <span key={it.key} className="text-zinc-400">
              <span className={`mr-1 inline-block h-2 w-2 rounded-sm ${it.tone.split(" ")[0]}`} />
              {it.label}: <span className="text-zinc-200">{n}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function JobSummary({ job, attempts }: { job: JobState; attempts: Attempt[] }) {
  const durations: Record<string, { first: number; last: number; finished: boolean }> = {};
  for (const url of job.urls) {
    durations[url] = { first: 0, last: 0, finished: false };
  }
  const errors = attempts.filter((a) => a.outcome === "no-price-found" || a.outcome === "error");

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{job.name || `Task #${shortId(job.id)}`}</p>
          {job.location && <p className="text-xs text-zinc-400">{job.location}</p>}
          <p className="mt-1 text-[11px] text-zinc-500">
            #{shortId(job.id)} ·{" "}
            {job.urls.length} URL{job.urls.length === 1 ? "" : "s"} ·{" "}
            status <span className="text-zinc-200">{job.status}</span>
          </p>
        </div>
        <div className="text-right text-[11px] text-zinc-500">
          <p>
            Attempts: <span className="text-zinc-200">{attempts.length}</span>
          </p>
          <p className="text-red-300">
            Errors: <span className="font-semibold">{errors.length}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function EventTimeline({ events, loading }: { events: EventRow[]; loading: boolean }) {
  if (loading && events.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-xs text-zinc-500">
        Loading events…
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-xs text-zinc-500">
        No events recorded for this job yet.
      </div>
    );
  }

  // Compute per-event delta from the previous event so per-month
  // timings are visible at a glance.
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40">
      <div className="border-b border-zinc-800 px-4 py-2.5">
        <p className="text-[11px] uppercase tracking-wide text-zinc-500">
          Event timeline — {events.length} event{events.length === 1 ? "" : "s"}
        </p>
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-zinc-900/95 backdrop-blur">
            <tr className="border-b border-zinc-800 text-left text-zinc-500">
              <th className="py-1.5 pl-4">Δ</th>
              <th className="py-1.5">Time</th>
              <th className="py-1.5">Event</th>
              <th className="py-1.5">Details</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {events.map((e, i) => {
                const delta = i === 0 ? 0 : e.ts - events[i - 1].ts;
                const time = new Date(e.ts * 1000).toLocaleTimeString();
                const details = summariseEvent(e);
                return (
                  <motion.tr
                    key={e.seq}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-b border-zinc-900"
                  >
                    <td className="py-1.5 pl-4 font-mono text-zinc-600">
                      {i === 0 ? "—" : `+${delta}s`}
                    </td>
                    <td className="py-1.5 font-mono text-zinc-400">{time}</td>
                    <td className="py-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${eventTone(e.type)}`}>
                        {e.type}
                      </span>
                    </td>
                    <td className="py-1.5 text-zinc-300">{details}</td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function summariseEvent(e: EventRow): string {
  const p = e.payload;
  const bits: string[] = [];
  if (p.url) bits.push(shortUrl(p.url as string));
  if (p.month) bits.push(p.month as string);
  if (p.status) bits.push(`status=${p.status}`);
  if (typeof p.adr === "number") bits.push(`adr=${p.adr}`);
  if (p.error) bits.push(`err: ${String(p.error).slice(0, 60)}`);
  return bits.join(" · ") || "—";
}

function eventTone(type: string): string {
  switch (type) {
    case "progress":
      return "bg-orange-600/20 text-orange-300";
    case "listing-done":
      return "bg-emerald-600/20 text-emerald-300";
    case "listing-started":
      return "bg-sky-600/20 text-sky-300";
    case "job-status":
      return "bg-zinc-700/40 text-zinc-300";
    case "job-created":
      return "bg-zinc-700/40 text-zinc-300";
    case "error":
      return "bg-red-700/40 text-red-300";
    default:
      return "bg-zinc-700/40 text-zinc-300";
  }
}

function pct(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${Math.round(v * 1000) / 10}%`;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function toneForRate(
  v: number | null | undefined,
  goodAbove: number,
  warnBelow: number,
  inverted = false
): "good" | "warn" | "bad" | "muted" {
  if (v === null || v === undefined) return "muted";
  if (inverted) {
    if (v <= warnBelow) return "good";
    if (v <= goodAbove) return "warn";
    return "bad";
  }
  if (v >= goodAbove) return "good";
  if (v >= warnBelow) return "warn";
  return "bad";
}
