"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { computeVulnerability } from "./helpers";
import type { FunnelHost, VulnerabilityResult } from "./types";
import { TargetRing, scoreColor } from "./TargetRing";

type Ranked = { host: FunnelHost; vuln: VulnerabilityResult };

function ComponentBar({ c }: { c: VulnerabilityResult["components"][number] }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-44 shrink-0 truncate text-[var(--mist)]" title={c.label}>
        {c.label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--ink-deep)]">
        {c.value !== null && (
          <motion.div
            className="h-full rounded-full"
            style={{ background: scoreColor(Math.round(c.value * 100)) }}
            initial={{ width: 0 }}
            animate={{ width: `${c.value * 100}%` }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          />
        )}
      </div>
      <span className="ha-mono w-24 shrink-0 text-right text-[var(--mist)]">
        {c.value === null ? "n/a" : c.detail}
      </span>
    </div>
  );
}

export function FunnelView({
  funnel,
  onOpenHost,
}: {
  funnel: FunnelHost[] | null;
  onOpenHost: (jobId: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const ranked = useMemo<Ranked[]>(() => {
    if (!funnel) return [];
    return funnel
      .filter((h) => h.status === "done" || h.listingsTotal > 0)
      .map((host) => ({ host, vuln: computeVulnerability(host, funnel) }))
      .sort((a, b) => (b.vuln.score ?? -1) - (a.vuln.score ?? -1));
  }, [funnel]);

  if (!funnel) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="ha-skeleton h-24 w-full" />
        ))}
      </div>
    );
  }

  if (ranked.length === 0) {
    return (
      <div className="ha-panel p-8 text-center">
        <h3 className="ha-display text-lg font-semibold">The funnel is empty</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--mist)]">
          Analyze a few hosts and they will be ranked here by how approachable they are: small
          portfolios, weak ratings in valuable areas, missing insurance, unlicensed listings and
          company-NIF pressure.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="ha-display text-xl font-bold">Acquisition funnel</h2>
          <p className="mt-1 text-sm text-[var(--mist)]">
            {ranked.length} host{ranked.length === 1 ? "" : "s"} ranked by approach score. Higher
            means more vulnerable to a direct offer.
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {ranked.map(({ host, vuln }, i) => {
            const isOpen = expanded === host.jobId;
            return (
              <motion.li
                key={host.jobId}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="ha-panel overflow-hidden"
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : host.jobId)}
                  className="ha-focus flex w-full items-center gap-4 p-4 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="ha-mono w-8 shrink-0 text-lg font-semibold text-[var(--mist)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <TargetRing score={vuln.score} size={64} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold">
                      {host.hostName || host.name}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--mist)]">
                      <span className="ha-mono">{host.listingsTotal} listings</span>
                      {host.concelhos.length > 0 && (
                        <span className="truncate">{host.concelhos.join(" · ")}</span>
                      )}
                      {host.avgScore != null && (
                        <span className="ha-mono">score {host.avgScore.toFixed(2)}</span>
                      )}
                      {host.avgAdr != null && (
                        <span className="ha-mono">ADR €{host.avgAdr.toFixed(0)}</span>
                      )}
                    </div>
                  </div>
                  <div className="hidden shrink-0 items-center gap-1.5 md:flex">
                    {(host.insurance.none > 0 || host.insurance.expired > 0) && (
                      <span className="rounded-full border border-[var(--coral)]/40 bg-[var(--coral-dim)] px-2 py-0.5 text-[10px] font-medium text-[var(--coral)]">
                        insurance
                      </span>
                    )}
                    {host.unlicensed > 0 && (
                      <span className="rounded-full border border-[var(--coral)]/40 bg-[var(--coral-dim)] px-2 py-0.5 text-[10px] font-medium text-[var(--coral)]">
                        unlicensed
                      </span>
                    )}
                    {host.companyListings >= 2 && (
                      <span className="rounded-full border border-[var(--amber)]/40 bg-[var(--amber-dim)] px-2 py-0.5 text-[10px] font-medium text-[var(--amber)]">
                        VAT risk
                      </span>
                    )}
                  </div>
                  <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    className="shrink-0 text-[var(--mist)]"
                    aria-hidden
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="m3 6 5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-[var(--tide)] p-4">
                        <div className="flex flex-col gap-2">
                          {vuln.components.map((c) => (
                            <ComponentBar key={c.key} c={c} />
                          ))}
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                          <div className="text-xs text-[var(--mist)]">
                            {host.owners.length > 0 && (
                              <>
                                Owners:{" "}
                                {host.owners
                                  .slice(0, 3)
                                  .map((o) => o.name)
                                  .filter(Boolean)
                                  .join(", ")}
                                {host.owners.length > 3 && ` +${host.owners.length - 3}`}
                              </>
                            )}
                          </div>
                          <button
                            onClick={() => onOpenHost(host.jobId)}
                            className="ha-focus ha-press rounded-[10px] border border-[var(--verdi)]/50 bg-[var(--verdi-dim)] px-4 py-1.5 text-sm font-semibold text-[var(--verdi)] hover:bg-[var(--verdi)]/25"
                          >
                            Open dossier
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
