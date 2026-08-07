"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { segmentAdr, shortRoomUrl } from "./helpers";
import type { HostJobState } from "./types";

function SegmentTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ key: string; listings: number; avgAdr: number | null; avgScore: number | null }>;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="ha-panel-raised p-4">
      <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--mist)]">
        {title}
      </h4>
      <table className="mt-2 w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>Segment</th>
            <th>Listings</th>
            <th>Average ADR</th>
            <th>Average score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const hot = r.avgAdr != null && r.avgScore != null && r.avgScore < 4.5;
            return (
              <tr key={r.key} className="border-t border-[var(--tide)]/50 first:border-t-0">
                <td className="py-1.5 pr-2 font-medium">{r.key}</td>
                <td className="ha-mono py-1.5 pr-2 text-right text-[var(--mist)]">{r.listings}</td>
                <td className="ha-mono py-1.5 pr-2 text-right">
                  {r.avgAdr != null ? `€${r.avgAdr.toFixed(0)}` : "-"}
                </td>
                <td className="ha-mono py-1.5 text-right">
                  {r.avgScore != null ? (
                    <span className={hot ? "text-[var(--amber)]" : undefined}>
                      {r.avgScore.toFixed(2)}
                      {hot && <span className="ml-1 text-[10px]">weak ops</span>}
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AdrSection({
  job,
  onRunAdr,
}: {
  job: HostJobState;
  onRunAdr: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adrJobs = Object.values(job.adrJobs);
  const hasAdr = adrJobs.length > 0;

  const progress = useMemo(() => {
    if (!hasAdr) return null;
    let done = 0;
    let total = 0;
    let running = false;
    for (const a of adrJobs) {
      if (a.status === "running" || a.status === "queued") running = true;
      const urls = a.urls.length ? a.urls : Object.keys(a.listings);
      total += urls.length * 12;
      for (const l of Object.values(a.listings)) done += Math.min(l.monthsDone, 12);
    }
    return { done, total, running };
  }, [adrJobs, hasAdr]);

  const byArea = useMemo(
    () =>
      segmentAdr(job, (_l, lic) =>
        lic?.rnt.status === "found" ? lic.rnt.address?.concelho || null : null
      ),
    [job]
  );
  const byType = useMemo(
    () =>
      segmentAdr(job, (_l, lic) =>
        lic?.rnt.status === "found" ? lic.rnt.modalidade || null : null
      ),
    [job]
  );
  const byRooms = useMemo(
    () =>
      segmentAdr(job, (_l, lic) => {
        const q = lic?.rnt.status === "found" ? lic.rnt.capacity?.quartos : null;
        return q != null ? `${q} bedroom${q === 1 ? "" : "s"}` : null;
      }),
    [job]
  );

  async function handleRun() {
    setBusy(true);
    setError(null);
    try {
      await onRunAdr();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the ADR analysis.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ha-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="ha-display text-sm font-semibold">ADR analysis</h3>
          <p className="mt-0.5 text-xs text-[var(--mist)]">
            12-month nightly rates for every listing, segmented by area, property type and bedrooms.
          </p>
        </div>
        {!hasAdr && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleRun}
            disabled={busy || job.listingOrder.length === 0}
            className="ha-focus rounded-[10px] border border-[var(--verdi)]/50 bg-[var(--verdi-dim)] px-4 py-2 text-sm font-semibold text-[var(--verdi)] transition-colors hover:bg-[var(--verdi)]/25 disabled:opacity-50"
          >
            {busy ? "Queueing…" : "Run ADR analysis"}
          </motion.button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-[var(--coral)]">
          {error}
        </p>
      )}

      {hasAdr && progress && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-[var(--mist)]">
            <span>
              {progress.running ? "Scraping months…" : "Complete"}
            </span>
            <span className="ha-mono">
              {progress.done}/{progress.total} months
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--ink-deep)]">
            <motion.div
              className="h-full rounded-full bg-[var(--verdi)]"
              initial={false}
              animate={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      )}

      {hasAdr && (byArea.length > 0 || byType.length > 0 || byRooms.length > 0) && (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <SegmentTable title="By area" rows={byArea} />
          <SegmentTable title="By property type" rows={byType} />
          <SegmentTable title="By bedrooms" rows={byRooms} />
        </div>
      )}

      {hasAdr && adrJobs.some((a) => a.status === "running") && (
        <p className="mt-3 text-[11px] text-[var(--mist)]">
          Live from job{adrJobs.length > 1 ? "s" : ""}{" "}
          {adrJobs.map((a) => a.name || shortRoomUrl(a.id)).join(", ")} — results fill in as months
          complete.
        </p>
      )}
    </section>
  );
}
