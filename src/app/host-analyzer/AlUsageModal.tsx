"use client";

// Drill-down for an AL number: the RNT record plus every listing (across all
// dossiers) displaying it. The consult surface for the duplicate-AL flag.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { API_BASE, INSURANCE_LABEL } from "./helpers";
import type { AlUsage } from "./types";

export function AlUsageModal({ als, onClose }: { als: string[]; onClose: () => void }) {
  const [usages, setUsages] = useState<AlUsage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(
          als.map(async (al) => {
            const res = await fetch(`${API_BASE}/al-usage?al=${encodeURIComponent(al)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return (await res.json()) as AlUsage;
          })
        );
        if (!cancelled) setUsages(results);
      } catch {
        if (!cancelled) setError("Could not load AL usage.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [als]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="AL license usage"
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        className="ha-scroll max-h-[80dvh] w-full max-w-xl overflow-y-auto rounded-[14px] border border-[var(--tide)] bg-[var(--harbor)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="ha-display text-base font-semibold">AL license usage</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ha-focus ha-press rounded-full border border-[var(--tide)] px-2.5 py-1 text-xs text-[var(--mist)] hover:text-[var(--foam)]"
          >
            Esc
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-[var(--coral)]">{error}</p>}
        {!usages && !error && (
          <div className="mt-4 flex flex-col gap-2">
            {als.map((al) => (
              <div key={al} className="ha-skeleton h-16 rounded-[10px]" />
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-4">
          {usages?.map((u) => {
            const hostCount = new Set(u.listings.map((l) => l.hostId || l.jobId)).size;
            const crossHost = hostCount > 1;
            return (
              <div key={u.al} className="rounded-[12px] border border-[var(--tide)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="ha-mono text-sm font-semibold">{u.al}/AL</span>
                  {u.listings.length > 1 && (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        crossHost
                          ? "border-[var(--coral)]/50 bg-[var(--coral-dim)] text-[var(--coral)]"
                          : "border-[var(--amber)]/40 bg-[var(--amber-dim)] text-[var(--amber)]"
                      }`}
                    >
                      {crossHost
                        ? `shared across ${hostCount} hosts`
                        : `on ${u.listings.length} listings`}
                    </span>
                  )}
                </div>

                {u.license ? (
                  <div className="mt-2 text-xs text-[var(--mist)]">
                    <div className="text-sm text-[var(--foam)]">{u.license.name || "—"}</div>
                    <div className="mt-0.5">
                      {[u.license.concelho, u.license.registeredAt].filter(Boolean).join(" · ")}
                      {" · "}
                      {INSURANCE_LABEL[u.license.insuranceStatus] ?? u.license.insuranceStatus}
                    </div>
                    {u.license.owner && (
                      <div className="mt-0.5">
                        {u.license.owner.name}
                        {u.license.owner.nif && (
                          <span className="ha-mono"> · NIF {u.license.owner.nif}</span>
                        )}
                        {u.license.owner.email && (
                          <span className="ha-mono"> · {u.license.owner.email}</span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-[var(--coral)]">
                    No RNT registry record found for this number.
                  </p>
                )}

                <ul className="mt-3 flex flex-col gap-1.5 border-t border-[var(--tide)] pt-2.5">
                  {u.listings.map((l) => (
                    <li key={`${l.jobId}-${l.listingUrl}`} className="flex items-center gap-2 text-xs">
                      <a
                        href={l.listingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={`ha-focus min-w-0 flex-1 truncate hover:text-[var(--verdi)] ${
                          l.removed ? "text-[var(--mist)] line-through" : "text-[var(--foam)]"
                        }`}
                      >
                        {l.title || l.listingUrl}
                      </a>
                      <span className="shrink-0 text-[var(--mist)]">{l.hostName || "—"}</span>
                    </li>
                  ))}
                  {u.listings.length === 0 && (
                    <li className="text-xs text-[var(--mist)]">Not seen on any scraped listing.</li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
