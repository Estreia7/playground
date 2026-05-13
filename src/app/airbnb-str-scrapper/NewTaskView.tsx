"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AIRBNB_URL_RE, MAX_URLS } from "./helpers";

type Row = { id: number; value: string };

let rowIdSeed = 0;
function nextId() {
  rowIdSeed += 1;
  return rowIdSeed;
}

export function NewTaskView({
  onSubmit,
  onSubmitted,
}: {
  onSubmit: (input: { urls: string[]; name: string; location: string }) => Promise<string>;
  onSubmitted: (jobId: string) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [rows, setRows] = useState<Row[]>([{ id: nextId(), value: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [topError, setTopError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const filledCount = rows.filter((r) => r.value.trim().length > 0).length;
  const canAdd = rows.length < MAX_URLS;

  function setValue(id: number, value: string) {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, value } : row)));
    setErrors((e) => {
      if (!(id in e)) return e;
      const { [id]: _gone, ...rest } = e;
      return rest;
    });
    setTopError(null);
  }

  function addRow() {
    if (!canAdd) return;
    setRows((r) => [...r, { id: nextId(), value: "" }]);
  }

  function removeRow(id: number) {
    setRows((r) => (r.length === 1 ? r : r.filter((row) => row.id !== id)));
    setErrors((e) => {
      if (!(id in e)) return e;
      const { [id]: _gone, ...rest } = e;
      return rest;
    });
  }

  function clearAll() {
    setName("");
    setLocation("");
    setRows([{ id: nextId(), value: "" }]);
    setErrors({});
    setTopError(null);
    setNameError(null);
  }

  async function submit() {
    setTopError(null);
    setNameError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("Task name is required");
      return;
    }

    const rowErrors: Record<number, string> = {};
    const urls: string[] = [];

    for (const row of rows) {
      const trimmed = row.value.trim();
      if (!trimmed) continue;
      if (!AIRBNB_URL_RE.test(trimmed)) {
        rowErrors[row.id] = "Not an Airbnb listing URL";
        continue;
      }
      if (urls.includes(trimmed)) {
        rowErrors[row.id] = "Duplicate of another row";
        continue;
      }
      urls.push(trimmed);
    }

    if (urls.length === 0) {
      setTopError("Add at least one Airbnb URL");
      setErrors(rowErrors);
      return;
    }
    if (Object.keys(rowErrors).length > 0) {
      setErrors(rowErrors);
      setTopError("Fix the highlighted rows before starting");
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const jobId = await onSubmit({
        urls,
        name: trimmedName,
        location: location.trim(),
      });
      clearAll();
      await onSubmitted(jobId);
    } catch (err) {
      setTopError(String((err as Error).message || err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">New task</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Name the task, optionally tag it with a location, then add 1–{MAX_URLS} Airbnb URLs.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="task-name" className="mb-1 block text-xs font-medium text-zinc-400">
            Task name <span className="text-red-400">*</span>
          </label>
          <input
            id="task-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError(null);
            }}
            placeholder="e.g. Algarve villas — May market check"
            maxLength={120}
            className={`w-full rounded-lg border bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-orange-600/60 ${
              nameError ? "border-red-600/50" : "border-zinc-800"
            }`}
          />
          {nameError && <p className="mt-1 text-xs text-red-400">{nameError}</p>}
        </div>
        <div>
          <label htmlFor="task-location" className="mb-1 block text-xs font-medium text-zinc-400">
            Location <span className="text-zinc-600">(optional)</span>
          </label>
          <input
            id="task-location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Quarteira, Portugal"
            maxLength={120}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-orange-600/60"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-400">URLs</label>
        <div className="space-y-2">
        <AnimatePresence initial={false}>
          {rows.map((row, idx) => {
            const err = errors[row.id];
            return (
              <motion.div
                key={row.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
              >
                <div className="flex items-center gap-2">
                  <span className="w-6 select-none text-right font-mono text-xs text-zinc-600">
                    {idx + 1}
                  </span>
                  <input
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    value={row.value}
                    onChange={(e) => setValue(row.id, e.target.value)}
                    placeholder="https://airbnb.com/rooms/12345"
                    className={`flex-1 rounded-lg border bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-orange-600/60 ${
                      err ? "border-red-600/50" : "border-zinc-800"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    disabled={rows.length === 1}
                    aria-label="Remove URL"
                    className="rounded-lg border border-zinc-800 px-2.5 py-2 text-zinc-500 transition-colors hover:border-red-600/40 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-zinc-800 disabled:hover:text-zinc-500"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                {err && <p className="ml-8 mt-1 text-xs text-red-400">{err}</p>}
              </motion.div>
            );
          })}
        </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={addRow}
          disabled={!canAdd}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-orange-600/60 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-zinc-700 disabled:hover:text-zinc-400"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add URL
          <span className="ml-1 text-zinc-600">{rows.length} / {MAX_URLS}</span>
        </button>

        <div className="text-xs text-zinc-500">
          {filledCount > 0 ? `${filledCount} URL${filledCount === 1 ? "" : "s"} ready` : "—"}
        </div>
      </div>

      {topError && (
        <div className="rounded-lg border border-red-600/40 bg-red-600/10 px-3 py-2 text-xs text-red-300">
          {topError}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={submitting || filledCount === 0}
          className="inline-flex items-center justify-center rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Start task"}
        </button>
        <button
          type="button"
          onClick={clearAll}
          disabled={submitting}
          className="rounded-lg border border-zinc-800 px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
