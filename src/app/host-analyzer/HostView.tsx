"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { API_BASE, computeVulnerability, insuranceOf, operatingArea, statusTone } from "./helpers";
import type { FunnelHost, HostJobState, Snapshot, TrackedHost } from "./types";
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

// Inline editable company NIF for a host — feeds the insights Host-NIF table.
function HostNifField({
  hostId,
  value,
  onSave,
}: {
  hostId: string;
  value: string | null;
  onSave: (hostId: string, nif: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  async function commit() {
    const nif = draft.trim();
    setEditing(false);
    if (nif === (value ?? "")) return;
    if (nif && !/^\d{9}$/.test(nif)) {
      setDraft(value ?? "");
      return;
    }
    await onSave(hostId, nif || null);
  }

  if (editing) {
    return (
      <input
        autoFocus
        className="ha-input w-28 px-2 py-0.5 text-xs"
        placeholder="Host NIF"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 9))}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
        onBlur={commit}
        aria-label="Host company NIF"
      />
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      className="ha-focus ha-press rounded-full border border-[var(--tide)] px-2 py-0.5 text-[11px] hover:border-[var(--verdi)]/40 hover:text-[var(--verdi)]"
      title="Manually record this host's company NIF"
    >
      {value ? <span className="ha-mono">NIF {value}</span> : "+ host NIF"}
    </button>
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
  trackedHosts,
  onRunAdr,
  onCancel,
  onDelete,
  onRetry,
  onRefreshRegistry,
  onSetAl,
  onSetHostNif,
}: {
  job: HostJobState;
  funnel: FunnelHost[] | null;
  snapshots: Snapshot[] | undefined;
  trackedHosts: TrackedHost[] | null;
  onRunAdr: () => Promise<unknown>;
  onCancel: () => void;
  onDelete: () => void;
  onRetry: () => void;
  onRefreshRegistry: () => Promise<string | null>;
  onSetAl: (listingUrl: string, alNumber: string | null) => Promise<void>;
  onSetHostNif: (hostId: string, nif: string | null) => Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [registryBusy, setRegistryBusy] = useState(false);

  // Stats and map cover ACTIVE listings; removed ones stay in the table only.
  const listings = job.listingOrder
    .map((u) => job.listings[u])
    .filter(Boolean)
    .filter((l) => !l.removed);
  const licensed = listings.filter((l) => l.alNumber).length;
  const scores = listings.map((l) => l.reviewsScore).filter((v): v is number => v != null);
  const reviews = listings.map((l) => l.reviewsCount).filter((v): v is number => v != null);
  const avgScore = scores.length
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
    : null;
  const totalReviews = reviews.length ? reviews.reduce((a, b) => a + b, 0) : null;
  // No-AL listings are usually exempt — only insurance problems count as risk.
  const flagged = listings.filter((l) => {
    const s = insuranceOf(l, job.licenses);
    return s === "none" || s === "expired";
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

  // Registry refresh feedback: the busy flag clears as soon as refreshed
  // license data starts arriving over SSE (licenses object identity changes).
  useEffect(() => {
    setRegistryBusy(false);
  }, [job.licenses]);

  async function handleRefreshRegistry() {
    setRegistryBusy(true);
    try {
      const id = await onRefreshRegistry();
      if (id === null) return; // already running — keep spinner, SSE will clear it
    } catch {
      setRegistryBusy(false);
    }
    setTimeout(() => setRegistryBusy(false), 15000);
  }

  const tracked = trackedHosts?.find((t) => t.hostId === job.host?.hostId) ?? null;
  const hasAl = listings.some((l) => l.alNumber);

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
        <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-start md:justify-between">
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
              {concelhos.length > 0 && (
                <span className="max-w-full truncate sm:max-w-[280px]">{concelhos.join(" · ")}</span>
              )}
              {job.truncated && (
                <span className="text-[var(--amber)]">listing cap reached, subset analyzed</span>
              )}
              {job.host?.hostId && (
                <HostNifField
                  hostId={job.host.hostId}
                  value={tracked?.manualNif ?? null}
                  onSave={onSetHostNif}
                />
              )}
            </div>
            <div className="mt-3">
              <PhaseStepper job={job} />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <TargetRing score={vuln?.score ?? null} label="approach" size={96} />
            <div className="flex flex-1 flex-wrap gap-2 md:flex-1 md:flex-col md:flex-nowrap">
              {(job.status === "interrupted" ||
                job.status === "error" ||
                job.status === "cancelled") && (
                <button
                  onClick={onRetry}
                  className="ha-focus ha-press flex-1 whitespace-nowrap rounded-[10px] border border-[var(--amber)]/50 bg-[var(--amber-dim)] px-4 py-2 text-sm font-semibold text-[var(--amber)] transition-colors hover:bg-[var(--amber)]/25 md:flex-none"
                >
                  Resume analysis
                </button>
              )}
              <a
                href={`${API_BASE}/host-jobs/${job.id}/pdf`}
                className="ha-focus ha-press flex-1 whitespace-nowrap rounded-[10px] bg-[var(--verdi)] px-4 py-2 text-center text-sm font-semibold text-[var(--ink-deep)] transition-colors hover:bg-[#5adcc4] md:flex-none"
              >
                Download PDF
              </a>
              {job.status === "done" && hasAl && (
                <button
                  onClick={handleRefreshRegistry}
                  disabled={registryBusy}
                  className="ha-focus ha-press flex-1 whitespace-nowrap rounded-[10px] border border-[var(--tide)] px-4 py-2 text-sm text-[var(--foam)] transition-colors hover:border-[var(--verdi)]/40 disabled:opacity-50 md:flex-none"
                  title="Re-scrape the RNT registry (emails, insurance) without re-running the whole host"
                >
                  {registryBusy ? "Refreshing…" : "Refresh registry"}
                </button>
              )}
              {active ? (
                <button
                  onClick={onCancel}
                  className="ha-focus ha-press flex-1 whitespace-nowrap rounded-[10px] border border-[var(--tide)] px-4 py-2 text-sm text-[var(--mist)] hover:border-[var(--coral)]/50 hover:text-[var(--coral)] md:flex-none"
                >
                  Cancel job
                </button>
              ) : confirmDelete ? (
                <button
                  onClick={onDelete}
                  className="ha-focus ha-press flex-1 whitespace-nowrap rounded-[10px] border border-[var(--coral)]/60 bg-[var(--coral-dim)] px-4 py-2 text-sm font-semibold text-[var(--coral)] md:flex-none"
                >
                  Confirm delete
                </button>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  onBlur={() => setConfirmDelete(false)}
                  className="ha-focus ha-press flex-1 whitespace-nowrap rounded-[10px] border border-[var(--tide)] px-4 py-2 text-sm text-[var(--mist)] hover:border-[var(--coral)]/50 hover:text-[var(--coral)] md:flex-none"
                >
                  Delete dossier
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3 border-t border-[var(--tide)] pt-4 sm:gap-x-8">
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
          <Stat label="No AL (exempt)">{listings.length - licensed}</Stat>
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

      {job.listingEvents && job.listingEvents.length > 0 && (
        <div className="ha-panel p-4">
          <h3 className="ha-display text-sm font-semibold">Portfolio changes</h3>
          <ul className="mt-2 flex flex-col gap-1 text-xs">
            {job.listingEvents.slice(0, 10).map((e, i) => (
              <li key={`${e.listingUrl}-${e.ts}-${i}`} className="flex items-center gap-2">
                <span
                  className={
                    e.event === "added" ? "text-[var(--verdi)]" : "text-[var(--coral)]"
                  }
                >
                  {e.event === "added" ? "+ added" : "− removed"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[var(--foam)]">
                  {e.title || e.listingUrl}
                </span>
                <span className="ha-mono shrink-0 text-[var(--mist)]">
                  {new Date(e.ts * 1000).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ListingsTable job={job} onSetAl={onSetAl} />

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
