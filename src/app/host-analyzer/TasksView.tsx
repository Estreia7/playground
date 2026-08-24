"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PROFILE_URL_RE, fmtTime, statusTone } from "./helpers";
import type { HostJobState } from "./types";

type StatusFilter = "all" | "running" | "done" | "error";
type TaskSort = "newest" | "name" | "listings";

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "running", label: "Active" },
  { key: "done", label: "Done" },
  { key: "error", label: "Issues" },
];

function matchesStatus(job: HostJobState, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "running") return job.status === "running" || job.status === "queued";
  if (filter === "error")
    return job.status === "error" || job.status === "interrupted" || job.status === "cancelled";
  return job.status === filter;
}

function listingCountOf(job: HostJobState): number {
  return job.host?.listingsCount ?? job.listingOrder.length;
}

export function NewTargetForm({
  onSubmit,
}: {
  onSubmit: (input: { profileUrl: string; name: string }) => Promise<string>;
}) {
  const [profileUrl, setProfileUrl] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!PROFILE_URL_RE.test(profileUrl.trim())) {
      setError("Paste an Airbnb host profile URL, like airbnb.com/users/profile/123…");
      return;
    }
    if (!name.trim()) {
      setError("Give this dossier a name so you can find it later.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ profileUrl: profileUrl.trim(), name: name.trim() });
      setProfileUrl("");
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the job.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="ha-panel p-4">
      <h2 className="ha-display text-sm font-semibold">New target</h2>
      <div className="mt-3 flex flex-col gap-2">
        <label className="text-xs text-[var(--mist)]" htmlFor="ha-profile-url">
          Host profile URL
        </label>
        <input
          id="ha-profile-url"
          className="ha-input px-3 py-2 text-sm"
          placeholder="https://www.airbnb.com/users/profile/…"
          value={profileUrl}
          onChange={(e) => setProfileUrl(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <label className="mt-1 text-xs text-[var(--mist)]" htmlFor="ha-job-name">
          Dossier name
        </label>
        <input
          id="ha-job-name"
          className="ha-input px-3 py-2 text-sm"
          placeholder="e.g. Albufeira multi-host"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
        />
      </div>
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 text-xs text-[var(--coral)]"
            role="alert"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      <motion.button
        type="submit"
        disabled={busy}
        whileTap={{ scale: 0.97 }}
        className="ha-focus mt-4 w-full rounded-[10px] bg-[var(--verdi)] px-4 py-2.5 text-sm font-semibold text-[var(--ink-deep)] transition-colors hover:bg-[#5adcc4] disabled:opacity-50"
      >
        {busy ? "Locking on…" : "Analyze host"}
      </motion.button>
    </form>
  );
}

function jobProgress(job: HostJobState): string | null {
  if (job.status !== "running") return null;
  if (job.phase === "profile")
    return job.profileFound ? `Discovering listings (${job.profileFound})` : "Reading profile";
  if (job.phase === "listings") {
    const total = job.listingOrder.length;
    const done = job.listingOrder.filter((u) => {
      const s = job.listings[u]?.status;
      return s === "done" || s === "error";
    }).length;
    return total ? `Listings ${done}/${total}` : "Listings";
  }
  if (job.phase === "licenses") {
    const withAl = job.listingOrder.filter((u) => job.listings[u]?.alNumber).length;
    const got = Object.keys(job.licenses).length;
    return withAl ? `Registry ${got}/${withAl}` : "Registry";
  }
  return "Queued";
}

export function TasksList({
  jobs,
  selected,
  onSelect,
}: {
  jobs: HostJobState[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<TaskSort>("newest");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = jobs.filter((job) => {
      if (!matchesStatus(job, statusFilter)) return false;
      if (!q) return true;
      return (
        job.name.toLowerCase().includes(q) ||
        (job.host?.hostName || "").toLowerCase().includes(q)
      );
    });
    if (sort === "name") {
      return [...filtered].sort((a, b) =>
        (a.host?.hostName || a.name).localeCompare(b.host?.hostName || b.name)
      );
    }
    if (sort === "listings") {
      return [...filtered].sort((a, b) => listingCountOf(b) - listingCountOf(a));
    }
    return filtered; // backend order is newest first
  }, [jobs, query, statusFilter, sort]);

  if (jobs.length === 0) {
    return (
      <div className="ha-panel p-4 text-sm text-[var(--mist)]">
        No dossiers yet. Paste a host profile URL above to build the first one.
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-col gap-2">
        <input
          className="ha-input px-3 py-2 text-sm"
          placeholder="Search dossiers…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search dossiers"
          spellCheck={false}
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1" role="group" aria-label="Filter by status">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                aria-pressed={statusFilter === f.key}
                className={`ha-focus ha-press rounded-full border px-3 py-1.5 text-[11px] transition-colors sm:px-2.5 sm:py-1 ${
                  statusFilter === f.key
                    ? "border-[var(--verdi)]/50 bg-[var(--verdi-dim)] text-[var(--verdi)]"
                    : "border-[var(--tide)] text-[var(--mist)] hover:border-[var(--verdi)]/30"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select
            className="ha-input px-2 py-1 text-[11px]"
            value={sort}
            onChange={(e) => setSort(e.target.value as TaskSort)}
            aria-label="Sort dossiers"
          >
            <option value="newest">Newest</option>
            <option value="name">Name</option>
            <option value="listings">Listings</option>
          </select>
        </div>
      </div>
      <div className="ha-scroll max-h-[55vh] min-h-0 flex-1 overflow-y-auto pr-1 lg:max-h-none">
        {visible.length === 0 && (
          <div className="ha-panel p-4 text-sm text-[var(--mist)]">
            No dossiers match this search.
          </div>
        )}
        <ul className="flex flex-col gap-2" aria-label="Host dossiers">
        <AnimatePresence initial={false}>
          {visible.map((job) => {
          const active = selected === job.id;
          const progress = jobProgress(job);
          return (
            <motion.li
              key={job.id}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <button
                onClick={() => onSelect(job.id)}
                aria-current={active ? "true" : undefined}
                className={`ha-focus ha-press w-full rounded-[12px] border p-3 text-left transition-colors ${
                  active
                    ? "border-[var(--verdi)]/50 bg-[var(--harbor-raised)]"
                    : "border-[var(--tide)] bg-[var(--harbor)] hover:border-[var(--verdi)]/30"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">
                    {job.host?.hostName || job.name}
                  </span>
                  <span
                    className={`relative shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusTone(job.status)}`}
                  >
                    {job.status === "running" && (
                      <span className="ha-sonar absolute -left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[var(--verdi)] text-[var(--verdi)]" />
                    )}
                    <span className={job.status === "running" ? "pl-1.5" : undefined}>
                      {job.status}
                    </span>
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-[var(--mist)]">
                  <span className="truncate">
                    {progress ||
                      `${job.listingOrder.length || job.host?.listingsCount || "…"} listings`}
                  </span>
                  <span className="ha-mono shrink-0">{fmtTime(job.createdAt)}</span>
                </div>
              </button>
            </motion.li>
          );
        })}
        </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}
