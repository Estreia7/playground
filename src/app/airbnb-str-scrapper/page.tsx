"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { JobState, JobStatus, ListingState, MonthResult } from "./types";
import { exportJobToExcel } from "./exportExcel";

const API_BASE = "/api/airbnb";
const AIRBNB_URL_RE = /^https?:\/\/(www\.)?airbnb\.[a-z.]+\/rooms\/\d+/i;

type JobsMap = Record<string, JobState>;

function emptyJob(j: {
  id: string;
  status: JobStatus;
  createdAt: number;
  urls: string[];
}): JobState {
  const listings: Record<string, ListingState> = {};
  for (const u of j.urls) {
    listings[u] = { url: u, status: "queued", monthsDone: 0, months: [] };
  }
  return { ...j, listings };
}

function statusColor(s: JobStatus | ListingState["status"]): string {
  switch (s) {
    case "running":
    case "fetching" as never:
      return "bg-orange-600/20 text-orange-400 border-orange-600/30";
    case "done":
      return "bg-emerald-600/20 text-emerald-400 border-emerald-600/30";
    case "cached":
      return "bg-sky-600/20 text-sky-400 border-sky-600/30";
    case "error":
      return "bg-red-600/20 text-red-400 border-red-600/30";
    case "cancelled":
      return "bg-zinc-600/20 text-zinc-400 border-zinc-600/30";
    case "interrupted":
      return "bg-amber-600/20 text-amber-400 border-amber-600/30";
    default:
      return "bg-zinc-800 text-zinc-400 border-zinc-700";
  }
}

function shortId(id: string) {
  return id.slice(0, 6);
}

function fmtTime(unixSec: number) {
  const ms = unixSec * 1000;
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString();
}

function shortUrl(u: string) {
  const m = u.match(/\/rooms\/(\d+)/);
  return m ? `rooms/${m[1]}` : u;
}

export default function ScrapperPage() {
  const [jobs, setJobs] = useState<JobsMap>({});
  const [order, setOrder] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [urlsInput, setUrlsInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const lastSeqRef = useRef<number>(0);

  const upsertJob = useCallback((j: JobState) => {
    setJobs((prev) => {
      const existing = prev[j.id];
      return { ...prev, [j.id]: existing ? { ...existing, ...j, listings: { ...existing.listings, ...j.listings } } : j };
    });
    setOrder((prev) => (prev.includes(j.id) ? prev : [j.id, ...prev]));
  }, []);

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
        const monthsDone = payload.status === "done" || payload.status === "error" ? ls.monthsDone + 1 : ls.monthsDone;
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
              [url]: { ...ls, status, months, monthsDone: months.length, error: payload.error as string | undefined },
            },
          },
        };
      }

      return prev;
    });

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
        const { jobs: list } = (await res.json()) as { jobs: Array<{ id: string; status: JobStatus; createdAt: number; startedAt?: number; finishedAt?: number; urls: string[] }> };
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
            const e = entry as { meta: typeof list[number]; listings: Array<{ url: string; status: ListingState["status"]; result: MonthResult[] }> };
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
        if (!selected && ord.length) setSelected(ord[0]);
      } catch (err) {
        console.warn("initial load failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/jobs/stream`);
    const handlers = ["job-created", "job-status", "listing-started", "progress", "listing-done", "deleted"];

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
      // EventSource auto-reconnects; nothing to do.
    };

    return () => es.close();
  }, [applyEvent]);

  const visibleJobs = useMemo(
    () => order.map((id) => jobs[id]).filter(Boolean),
    [order, jobs]
  );

  useEffect(() => {
    if (!selected && visibleJobs.length) setSelected(visibleJobs[0].id);
  }, [selected, visibleJobs]);

  async function handleSubmit() {
    setFormError(null);
    const urls = urlsInput
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (urls.length === 0) return setFormError("Paste at least one Airbnb URL");
    if (urls.length > 15) return setFormError("Max 15 URLs per job");
    const bad = urls.find((u) => !AIRBNB_URL_RE.test(u));
    if (bad) return setFormError(`Not an Airbnb listing URL: ${bad}`);

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFormError(body.message || body.error || `HTTP ${res.status}`);
        return;
      }
      const { jobId } = (await res.json()) as { jobId: string };
      setUrlsInput("");
      setSelected(jobId);
    } catch (err) {
      setFormError(String((err as Error).message || err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(id: string) {
    if (!confirm("Cancel this job?")) return;
    await fetch(`${API_BASE}/jobs/${id}/cancel`, { method: "POST" });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this job from history? Cached listing results stay.")) return;
    await fetch(`${API_BASE}/jobs/${id}`, { method: "DELETE" });
  }

  const current = selected ? jobs[selected] : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">← Playground</Link>
            <span className="text-zinc-700">/</span>
            <h1 className="font-semibold tracking-tight">Airbnb STR Scrapper</h1>
            <span className="rounded-full bg-amber-600/20 px-2 py-0.5 text-xs text-amber-400">draft</span>
          </div>
          <a
            href="https://github.com/"
            className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
          >
            README
          </a>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <h2 className="mb-2 text-sm font-semibold tracking-tight">New job</h2>
            <textarea
              value={urlsInput}
              onChange={(e) => setUrlsInput(e.target.value)}
              placeholder={"Paste 1–15 Airbnb URLs, one per line\nhttps://airbnb.com/rooms/12345"}
              rows={6}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-orange-600/60"
            />
            {formError && (
              <p className="mt-2 text-xs text-red-400">{formError}</p>
            )}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="mt-3 w-full rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Start job"}
            </button>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
              <h2 className="text-sm font-semibold tracking-tight">Jobs</h2>
              <span className="text-xs text-zinc-500">{visibleJobs.length}</span>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              <AnimatePresence initial={false}>
                {visibleJobs.length === 0 && (
                  <p className="px-4 py-6 text-center text-xs text-zinc-500">No jobs yet</p>
                )}
                {visibleJobs.map((j) => (
                  <JobRow
                    key={j.id}
                    job={j}
                    selected={selected === j.id}
                    onSelect={() => setSelected(j.id)}
                    onCancel={() => handleCancel(j.id)}
                    onDelete={() => handleDelete(j.id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        </aside>

        <section>
          {!current && (
            <div className="rounded-xl border border-dashed border-zinc-800 p-12 text-center">
              <p className="text-sm text-zinc-500">Submit a job or select one from the list to see details.</p>
            </div>
          )}
          {current && (
            <JobDetail
              job={current}
              onCancel={() => handleCancel(current.id)}
              onDelete={() => handleDelete(current.id)}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function JobRow({
  job,
  selected,
  onSelect,
  onCancel,
  onDelete,
}: {
  job: JobState;
  selected: boolean;
  onSelect: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const active = job.status === "queued" || job.status === "running";
  const totalMonths = job.urls.length * 12;
  const done = Object.values(job.listings).reduce((acc, l) => acc + l.monthsDone, 0);
  const pct = totalMonths === 0 ? 0 : Math.round((done / totalMonths) * 100);

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      onClick={onSelect}
      className={`block w-full border-b border-zinc-800/60 px-4 py-3 text-left transition-colors hover:bg-zinc-900/70 ${
        selected ? "bg-zinc-900" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-zinc-400">#{shortId(job.id)}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusColor(job.status)}`}>
          {job.status}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
        <span>{job.urls.length} URL{job.urls.length === 1 ? "" : "s"}</span>
        <span>{fmtTime(job.createdAt)}</span>
      </div>
      {active && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full bg-orange-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="mt-2 flex gap-2">
        {active && (
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            className="cursor-pointer rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-red-600/50 hover:text-red-400"
          >
            cancel
          </span>
        )}
        {!active && (
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="cursor-pointer rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-500 hover:border-red-600/50 hover:text-red-400"
          >
            delete
          </span>
        )}
      </div>
    </motion.button>
  );
}

function JobDetail({
  job,
  onCancel,
  onDelete,
}: {
  job: JobState;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const active = job.status === "queued" || job.status === "running";
  const totalMonths = job.urls.length * 12;
  const done = Object.values(job.listings).reduce((acc, l) => acc + l.monthsDone, 0);
  const pct = totalMonths === 0 ? 0 : Math.round((done / totalMonths) * 100);
  const anyDone = Object.values(job.listings).some((l) => l.months.length > 0);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-zinc-300">#{shortId(job.id)}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusColor(job.status)}`}>
                {job.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {job.urls.length} URL{job.urls.length === 1 ? "" : "s"} · submitted {fmtTime(job.createdAt)}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => exportJobToExcel(job)}
              disabled={!anyDone}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:border-orange-600/60 disabled:opacity-40"
            >
              Download .xlsx
            </button>
            {active ? (
              <button
                onClick={onCancel}
                className="rounded-lg border border-red-600/50 bg-red-600/10 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-600/20"
              >
                Cancel
              </button>
            ) : (
              <button
                onClick={onDelete}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:border-red-600/50 hover:text-red-400"
              >
                Delete
              </button>
            )}
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-zinc-500">
            <span>Overall progress</span>
            <span>{done} / {totalMonths} months</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <motion.div
              className="h-full bg-orange-600"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {job.urls.map((url) => {
          const ls = job.listings[url];
          return <ListingPanel key={url} url={url} listing={ls} />;
        })}
      </div>
    </div>
  );
}

function ListingPanel({ url, listing }: { url: string; listing: ListingState | undefined }) {
  const ls = listing || { url, status: "queued" as const, monthsDone: 0, months: [] };
  const pct = Math.round((ls.monthsDone / 12) * 100);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div className="min-w-0">
          <a href={url} target="_blank" rel="noreferrer" className="block truncate text-sm text-zinc-200 hover:text-orange-400">
            {shortUrl(url)}
          </a>
          <p className="truncate text-xs text-zinc-500">{url}</p>
        </div>
        <div className="flex items-center gap-2">
          {ls.status === "running" && ls.currentMonth && (
            <span className="text-[10px] text-zinc-500">{ls.currentMonth}</span>
          )}
          <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${statusColor(ls.status)}`}>
            {ls.status}
          </span>
        </div>
      </div>

      {(ls.status === "running" || ls.status === "queued") && (
        <div className="px-4 pt-3">
          <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full bg-orange-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-[10px] text-zinc-500">{ls.monthsDone} / 12 months</p>
        </div>
      )}

      <AnimatePresence>
        {ls.months.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-zinc-500">
                    <th className="py-1.5 font-medium">Month</th>
                    <th className="py-1.5 font-medium text-right">ADR</th>
                    <th className="py-1.5 font-medium text-right">Samples</th>
                    <th className="py-1.5 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {ls.months.map((m) => (
                    <tr key={m.month} className="border-b border-zinc-900">
                      <td className="py-1.5 font-mono text-zinc-300">{m.month}</td>
                      <td className="py-1.5 text-right text-zinc-200">{m.adr !== null ? m.adr.toFixed(2) : "—"}</td>
                      <td className="py-1.5 text-right text-zinc-500">{m.samples}</td>
                      <td className="py-1.5 text-zinc-500">{m.notes || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ls.error && <p className="mt-2 text-xs text-red-400">{ls.error}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
