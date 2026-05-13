"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { JobState, JobStatus, ListingState } from "./types";
import { fmtTime, shortId, shortUrl, statusColor } from "./helpers";
import { exportJobToExcel } from "./exportExcel";

export function TasksView({
  jobs,
  selected,
  onSelect,
  current,
  onCancel,
  onDelete,
  onNewTask,
}: {
  jobs: JobState[];
  selected: string | null;
  onSelect: (id: string) => void;
  current: JobState | null;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  onNewTask: () => void;
}) {
  return (
    <div className="grid h-full gap-4 lg:grid-cols-[320px_1fr]">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
          <h2 className="text-sm font-semibold tracking-tight">Tasks</h2>
          <span className="text-xs text-zinc-500">{jobs.length}</span>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
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
          <JobDetail job={current} onCancel={() => onCancel(current.id)} onDelete={() => onDelete(current.id)} />
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
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-zinc-400">#{shortId(job.id)}</span>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusColor(
            job.status
          )}`}
        >
          {job.status}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
        <span>
          {job.urls.length} URL{job.urls.length === 1 ? "" : "s"}
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
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusColor(
                  job.status
                )}`}
              >
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

      <div className="space-y-3">
        {job.urls.map((url) => (
          <ListingPanel key={url} url={url} listing={job.listings[url]} />
        ))}
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
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-sm text-zinc-200 hover:text-orange-400"
          >
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
                    <th className="py-1.5 text-right font-medium">ADR</th>
                    <th className="py-1.5 text-right font-medium">Samples</th>
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
