"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { API_BASE, computeVulnerability, insuranceOf, operatingArea, statusTone } from "./helpers";
import type { FunnelHost, HostJobState, Snapshot } from "./types";
import type { MapPoint } from "./MapInner";
import { ListingsTable } from "./ListingsTable";
import { AnalysisSection } from "./AnalysisSection";
import { AdrSection } from "./AdrSection";
import { MapPanel } from "./MapPanel";
import { TargetRing } from "./TargetRing";
import { Sparkline } from "./TrendChart";
import { DeltaBadge } from "./InsightsView";

const PHASES: Array<{ key: string; label: string }> = [
  { key: "profile", label: "Profile" },
  { key: "listings", label: "Listings" },
  { key: "licenses", label: "Registry" },
];

function PhaseStepper({ job }: { job: HostJobState }) {
  if (job.status !== "running" && job.status !== "queued") return null;
  const activeIdx = PHASES.findIndex((p) => p.key === job.phase);
  return (
    <ol className="flex items-center gap-1" aria-label="Analysis phases">
      {PHASES.map((p, i) => {
        const state = i < activeIdx ? "done" : i === activeIdx ? "active" : "todo";
        return (
          <li key={p.key} className="flex items-center gap-1">
            {i > 0 && <span className="h-px w-4 bg-[var(--tide)]" aria-hidden />}
            <span
              className={`relative rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                state === "active"
                  ? "border-[var(--verdi)]/50 bg-[var(--verdi-dim)] text-[var(--verdi)]"
                  : state === "done"
                    ? "border-[var(--tide)] text-[var(--foam)]"
                    : "border-[var(--tide)] text-[var(--mist)]"
              }`}
            >
              {state === "active" && (
                <motion.span
                  layoutId={`phase-glow-${job.id}`}
                  className="absolute inset-0 rounded-full ring-1 ring-[var(--verdi)]/40"
                  aria-hidden
                />
              )}
              {p.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Stat({ label, children, tone }: { label: string; children: React.ReactNode; tone?: string }) {
  return (
    <div className="min-w-[92px]">
      <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--mist)]">{label}</div>
      <div className={`ha-mono mt-0.5 text-xl font-semibold ${tone || ""}`}>{children}</div>
    </div>
  );
}

export function HostView({
  job,
  funnel,
  snapshots,
  onRunAdr,
  onCancel,
  onDelete,
  onRetry,
}: {
  job: HostJobState;
  funnel: FunnelHost[] | null;
  snapshots: Snapshot[] | undefined;
  onRunAdr: () => Promise<unknown>;
  onCancel: () => void;
  onDelete: () => void;
  onRetry: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const listings = job.listingOrder.map((u) => job.listings[u]).filter(Boolean);
  const licensed = listings.filter((l) => l.alNumber).length;
  const scores = listings.map((l) => l.reviewsScore).filter((v): v is number => v != null);
  const reviews = listings.map((l) => l.reviewsCount).filter((v): v is number => v != null);
  const avgScore = scores.length
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
    : null;
  const totalReviews = reviews.length ? reviews.reduce((a, b) => a + b, 0) : null;
  const flagged = listings.filter((l) => {
    const s = insuranceOf(l, job.licenses);
    return s === "none" || s === "expired" || s === "unlicensed";
  }).length;

  const mapData = useMemo(() => {
    const points: MapPoint[] = [];
    for (const l of listings) {
      const lic = l.alNumber ? job.licenses[l.alNumber] : undefined;
      if (!lic || lic.lat == null || lic.lng == null) continue;
      const ins = insuranceOf(l, job.licenses);
      points.push({
        lat: lic.lat,
        lng: lic.lng,
        label: l.title || l.url,
        sub:
          lic.rnt.status === "found"
            ? [lic.rnt.modalidade, lic.rnt.address?.concelho].filter(Boolean).join(" · ")
            : undefined,
        tone: ins === "valid" ? "ok" : ins === "expired" ? "warn" : ins === "none" ? "alert" : "muted",
        pulse: ins === "none" || ins === "expired",
      });
    }
    const area = operatingArea(points);
    return { points, area };
  }, [listings, job.licenses]);

  const vuln = useMemo(() => {
    if (!funnel) return null;
    const mine = funnel.find((f) => f.jobId === job.id);
    if (!mine) return null;
    return computeVulnerability(mine, funnel);
  }, [funnel, job.id]);

  const concelhos = useMemo(() => {
    const set = new Set<string>();
    for (const lic of Object.values(job.licenses)) {
      if (lic.rnt.status === "found" && lic.rnt.address?.concelho) set.add(lic.rnt.address.concelho);
    }
    return Array.from(set);
  }, [job.licenses]);

  const active = job.status === "running" || job.status === "queued";

  // Tracker evolution: latest declared count vs the previous snapshot.
  const trend = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return null;
    const latest = snapshots[snapshots.length - 1];
    const previous = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
    return {
      points: snapshots.map((s) => ({ ts: s.ts, value: s.listingsCount })),
      delta: previous ? latest.listingsCount - previous.listingsCount : null,
      lastTs: latest.ts,
    };
  }, [snapshots]);

  return (
    <motion.div
      key={job.id}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-4"
    >
      {/* Header */}
      <div className="ha-panel p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="ha-display truncate text-xl font-bold md:text-2xl">
                {job.host?.hostName || job.name}
              </h2>
              <span
                className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-wide ${statusTone(job.status)}`}
              >
                {job.status}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--mist)]">
              <a
                href={job.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="ha-focus hover:text-[var(--verdi)]"
              >
                Airbnb profile ↗
              </a>
              {concelhos.length > 0 && <span>{concelhos.join(" · ")}</span>}
              {job.truncated && (
                <span className="text-[var(--amber)]">listing cap reached, subset analyzed</span>
              )}
            </div>
            <div className="mt-3">
              <PhaseStepper job={job} />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <TargetRing score={vuln?.score ?? null} label="approach" size={96} />
            <div className="flex flex-col gap-2">
              {(job.status === "interrupted" ||
                job.status === "error" ||
                job.status === "cancelled") && (
                <button
                  onClick={onRetry}
                  className="ha-focus ha-press rounded-[10px] border border-[var(--amber)]/50 bg-[var(--amber-dim)] px-4 py-2 text-sm font-semibold text-[var(--amber)] transition-colors hover:bg-[var(--amber)]/25"
                >
                  Resume analysis
                </button>
              )}
              <a
                href={`${API_BASE}/host-jobs/${job.id}/pdf`}
                className="ha-focus ha-press rounded-[10px] bg-[var(--verdi)] px-4 py-2 text-center text-sm font-semibold text-[var(--ink-deep)] transition-colors hover:bg-[#5adcc4]"
              >
                Download PDF
              </a>
              {active ? (
                <button
                  onClick={onCancel}
                  className="ha-focus ha-press rounded-[10px] border border-[var(--tide)] px-4 py-2 text-sm text-[var(--mist)] hover:border-[var(--coral)]/50 hover:text-[var(--coral)]"
                >
                  Cancel job
                </button>
              ) : confirmDelete ? (
                <button
                  onClick={onDelete}
                  className="ha-focus ha-press rounded-[10px] border border-[var(--coral)]/60 bg-[var(--coral-dim)] px-4 py-2 text-sm font-semibold text-[var(--coral)]"
                >
                  Confirm delete
                </button>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  onBlur={() => setConfirmDelete(false)}
                  className="ha-focus ha-press rounded-[10px] border border-[var(--tide)] px-4 py-2 text-sm text-[var(--mist)] hover:border-[var(--coral)]/50 hover:text-[var(--coral)]"
                >
                  Delete dossier
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-[var(--tide)] pt-4">
          <Stat label="Listings">
            <span className="inline-flex items-center gap-2">
              {listings.length || (active ? "…" : 0)}
              {trend && trend.delta != null && <DeltaBadge delta={trend.delta} />}
              {trend && trend.points.length > 1 && (
                <span
                  title={`Declared count over time · last checked ${new Date(trend.lastTs * 1000).toLocaleDateString()}`}
                >
                  <Sparkline
                    points={trend.points}
                    width={88}
                    height={26}
                    stroke={trend.delta != null && trend.delta < 0 ? "var(--coral)" : "var(--verdi)"}
                  />
                </span>
              )}
            </span>
          </Stat>
          <Stat label="Licensed">{licensed}</Stat>
          <Stat label="Unlicensed" tone={listings.length - licensed > 0 ? "text-[var(--coral)]" : ""}>
            {listings.length - licensed}
          </Stat>
          <Stat label="Reviews">{totalReviews ?? "-"}</Stat>
          <Stat label="Avg score" tone={avgScore !== null && avgScore < 4.5 ? "text-[var(--amber)]" : ""}>
            {avgScore ?? "-"}
          </Stat>
          <Stat label="Risk flags" tone={flagged > 0 ? "text-[var(--coral)]" : ""}>
            {flagged}
          </Stat>
          {mapData.area && <Stat label="Radius">{mapData.area.radiusKm} km</Stat>}
        </div>
      </div>

      <ListingsTable job={job} />

      <MapPanel
        points={mapData.points}
        centroid={mapData.area?.centroid ?? null}
        radiusKm={mapData.area?.radiusKm ?? null}
        caption={
          mapData.area && concelhos.length > 0
            ? `Operates within ~${mapData.area.radiusKm} km around ${concelhos[0]}`
            : null
        }
      />

      <AnalysisSection job={job} />

      <AdrSection job={job} onRunAdr={onRunAdr} />
    </motion.div>
  );
}
