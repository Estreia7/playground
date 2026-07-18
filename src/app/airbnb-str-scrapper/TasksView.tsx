"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { JobState } from "./types";
import { buildSummary, fmtTime, MONTH_LABELS, shortId, statusColor } from "./helpers";
import { exportJobToExcel } from "./exportExcel";

export function TasksView({
  jobs,
  selected,
  onSelect,
  current,
  onCancel,
  onDelete,
  onNewTask,
  onToggleExclusion,
}: {
  jobs: JobState[];
  selected: string | null;
  onSelect: (id: string) => void;
  current: JobState | null;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  onNewTask: () => void;
  onToggleExclusion: (jobId: string, url: string, monthIndex: number) => void;
}) {
  return (
    <div className="grid h-full gap-4 lg:grid-cols-[320px_1fr]">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
          <h2 className="text-sm font-semibold tracking-tight">Tasks</h2>
          <span className="text-xs text-zinc-500">{jobs.length}</span>
        </div>
        <div className="thin-scroll max-h-[70vh] overflow-y-auto">
          <AnimatePresence initial={false}>
            {jobs.length === 0 && (
              <div className="px-4 py-10 text-center">
                <p className="text-xs text-zinc-500">No tasks yet</p>
                <button
                  onClick={onNewTask}
                  className="mt-3 rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:border-orange-600/60 hover:text-orange-400"
                >
                  Create one →
                </button>
              </div>
            )}
            {jobs.map((j) => (
              <JobRow
                key={j.id}
                job={j}
                selected={selected === j.id}
                onSelect={() => onSelect(j.id)}
                onCancel={() => onCancel(j.id)}
                onDelete={() => onDelete(j.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>

      <div>
        {!current && (
          <div className="rounded-xl border border-dashed border-zinc-800 p-12 text-center">
            <p className="text-sm text-zinc-500">
              {jobs.length === 0
                ? "Submit a new task to see live progress here."
                : "Pick a task on the left to see its 12-month ADR table."}
            </p>
          </div>
        )}
        {current && (
          <JobDetail
            job={current}
            onCancel={() => onCancel(current.id)}
            onDelete={() => onDelete(current.id)}
            onToggleExclusion={onToggleExclusion}
          />
        )}
      </div>
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
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-100">
            {job.name || `Task #${shortId(job.id)}`}
          </p>
          {job.location && (
            <p className="mt-0.5 truncate text-[11px] text-zinc-500">{job.location}</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusColor(
            job.status
          )}`}
        >
          {job.status}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-500">
        <span>
          {job.urls.length} URL{job.urls.length === 1 ? "" : "s"} · #{shortId(job.id)}
        </span>
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
  onToggleExclusion,
}: {
  job: JobState;
  onCancel: () => void;
  onDelete: () => void;
  onToggleExclusion: (jobId: string, url: string, monthIndex: number) => void;
}) {
  const active = job.status === "queued" || job.status === "running";
  const totalMonths = job.urls.length * 12;
  const done = Object.values(job.listings).reduce((acc, l) => acc + l.monthsDone, 0);
  const pct = totalMonths === 0 ? 0 : Math.round((done / totalMonths) * 100);
  const anyDone = Object.values(job.listings).some((l) => l.months.length > 0);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold tracking-tight text-zinc-100">
                {job.name || `Task #${shortId(job.id)}`}
              </h3>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusColor(
                  job.status
                )}`}
              >
                {job.status}
              </span>
            </div>
            {job.location && (
              <p className="mt-0.5 text-sm text-zinc-400">{job.location}</p>
            )}
            <p className="mt-1 text-xs text-zinc-500">
              #{shortId(job.id)} · {job.urls.length} URL{job.urls.length === 1 ? "" : "s"} · submitted {fmtTime(job.createdAt)}
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
            <span>
              {done} / {totalMonths} months
            </span>
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

      <SummaryTable job={job} onToggleExclusion={onToggleExclusion} />
    </div>
  );
}

function SummaryTable({
  job,
  onToggleExclusion,
}: {
  job: JobState;
  onToggleExclusion: (jobId: string, url: string, monthIndex: number) => void;
}) {
  const { rows, monthAverages, overallAvg, avgReviewsScore, recentYes, recentNo } =
    buildSummary(job);
  const fmt = (v: number | null) => (v !== null ? v.toFixed(0) : "—");
  // Prices can only be hidden once the job has finished scraping.
  const jobDone = job.status !== "queued" && job.status !== "running";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <h4 className="text-sm font-semibold tracking-tight text-zinc-100">
          ADR by month · {rows.length} listing{rows.length === 1 ? "" : "s"}
        </h4>
        <span className="text-[11px] text-zinc-500">
          {jobDone ? "hover a price → click the eye to exclude it" : "values are nightly ADR"}
        </span>
      </div>
      <div className="thin-scroll overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              <th className="sticky left-0 z-10 bg-zinc-900/95 px-3 py-2 text-left font-medium">
                Listing
              </th>
              <th className="px-2 py-2 text-right font-medium">Reviews</th>
              <th className="px-2 py-2 text-right font-medium">Score</th>
              <th className="px-2 py-2 text-center font-medium">
                Recent on market
                <span className="mt-0.5 block text-[10px] font-normal text-zinc-600">
                  {recentYes} yes · {recentNo} no
                </span>
              </th>
              {MONTH_LABELS.map((m) => (
                <th key={m} className="px-2 py-2 text-right font-medium">
                  {m}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-semibold text-zinc-300">Avg</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.url} className="group border-b border-zinc-900 hover:bg-zinc-900/50">
                <td className="sticky left-0 z-10 max-w-[220px] bg-zinc-900/95 px-3 py-2">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-zinc-200 hover:text-orange-400"
                    title={r.title}
                  >
                    {r.title}
                  </a>
                </td>
                <td className="px-2 py-2 text-right text-zinc-400">
                  {r.reviewsCount ?? "—"}
                </td>
                <td className="px-2 py-2 text-right text-zinc-400">
                  {r.reviewsScore !== null ? r.reviewsScore.toFixed(2) : "—"}
                </td>
                <td className="px-2 py-2 text-center">
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      r.recent
                        ? "bg-emerald-600/20 text-emerald-400"
                        : "bg-zinc-700/40 text-zinc-400"
                    }`}
                  >
                    {r.recent ? "Yes" : "No"}
                  </span>
                </td>
                {r.adrByMonth.map((v, i) => (
                  <AdrCell
                    key={i}
                    value={v}
                    excluded={r.excludedByMonth[i]}
                    canToggle={jobDone && v !== null}
                    onToggle={() => onToggleExclusion(job.id, r.url, i)}
                  />
                ))}
                <td className="px-2 py-2 text-right font-mono font-semibold text-orange-300">
                  {fmt(r.avgAdr)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-700 bg-zinc-900/70">
              <td className="sticky left-0 z-10 bg-zinc-900 px-3 py-2 font-semibold text-zinc-300">
                Average / month
              </td>
              <td className="px-2 py-2" />
              <td
                className="px-2 py-2 text-right font-semibold text-zinc-200"
                title="Average review score across listings"
              >
                {avgReviewsScore !== null ? avgReviewsScore.toFixed(2) : "—"}
              </td>
              <td className="px-2 py-2" />
              {monthAverages.map((v, i) => (
                <td key={i} className="px-2 py-2 text-right font-mono font-semibold text-zinc-200">
                  {fmt(v)}
                </td>
              ))}
              <td className="px-2 py-2 text-right font-mono font-bold text-orange-300">
                {fmt(overallAvg)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {rows.every((r) => r.adrByMonth.every((v) => v === null)) && (
        <p className="px-4 py-3 text-xs text-zinc-500">
          No ADR data yet — values appear as each listing&apos;s months complete.
        </p>
      )}
    </div>
  );
}

function AdrCell({
  value,
  excluded,
  canToggle,
  onToggle,
}: {
  value: number | null;
  excluded: boolean;
  canToggle: boolean;
  onToggle: () => void;
}) {
  const text = value !== null ? value.toFixed(0) : "—";
  const empty = value === null;

  return (
    <td
      className={`group/cell relative px-2 py-2 text-right font-mono ${
        excluded
          ? "text-zinc-600 line-through"
          : empty
          ? "text-zinc-700"
          : "text-zinc-200"
      }`}
    >
      <span className="inline-flex items-center justify-end gap-1">
        {canToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={excluded ? "Include this price" : "Exclude this price"}
            title={excluded ? "Include in averages" : "Exclude from averages"}
            className={`shrink-0 text-zinc-500 hover:text-orange-400 ${
              excluded ? "opacity-100" : "opacity-0 group-hover/cell:opacity-100"
            } transition-opacity`}
          >
            <EyeIcon off={excluded} />
          </button>
        )}
        <span>{text}</span>
      </span>
    </td>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  if (off) {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

