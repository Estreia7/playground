"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import CountUp from "react-countup";
import type { InsightsHost, InsightsPayload, TrackedHost } from "./types";
import { Sparkline, TrendChart } from "./TrendChart";
import { AlUsageModal } from "./AlUsageModal";
import { exportInsightsToExcel } from "./exportInsights";

const EASE = [0.16, 1, 0.3, 1] as const;

function fmtAgo(ts: number | null): string {
  if (!ts) return "never";
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) {
    return <span className="ha-mono text-[11px] text-[var(--mist)]">±0</span>;
  }
  const cls =
    delta > 0
      ? "text-[var(--verdi)] border-[var(--verdi)]/35 bg-[var(--verdi-dim)]"
      : delta < 0
        ? "text-[var(--coral)] border-[var(--coral)]/40 bg-[var(--coral-dim)]"
        : "text-[var(--mist)] border-[var(--tide)]";
  const label = delta > 0 ? `+${delta}` : `${delta}`;
  return (
    <span className={`ha-mono inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {delta === 0 ? "±0" : label}
    </span>
  );
}

function Kpi({
  label,
  value,
  suffix,
  decimals = 0,
  tone,
}: {
  label: string;
  value: number | null;
  suffix?: string;
  decimals?: number;
  tone?: "warn";
}) {
  return (
    <div className="ha-panel flex-1 basis-36 p-4">
      <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--mist)]">{label}</div>
      <div
        className={`ha-mono mt-1 text-2xl font-semibold ${
          tone === "warn" && value ? "text-[var(--amber)]" : "text-[var(--foam)]"
        }`}
      >
        {value != null ? (
          <>
            <CountUp end={value} decimals={decimals} duration={0.9} />
            {suffix}
          </>
        ) : (
          "—"
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ha-panel overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="ha-display text-sm font-semibold">{title}</h3>
        {hint && <span className="text-xs text-[var(--mist)]">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

// --- Portfolio evolution -----------------------------------------------------

function EvolutionCard({
  host,
  tracked,
  onToggle,
}: {
  host: InsightsHost;
  tracked: TrackedHost | undefined;
  onToggle: (hostId: string, enabled: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const delta = host.deltaSinceLast;
  const stroke = delta != null && delta < 0 ? "var(--coral)" : "var(--verdi)";
  const points = host.snapshots.map((s) => ({ ts: s.ts, value: s.listingsCount }));
  const latest = points[points.length - 1];

  return (
    <div className="rounded-[12px] border border-[var(--tide)] bg-[var(--harbor)]">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="ha-focus flex w-full items-center gap-3 p-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">
            {host.hostName || host.name}
          </div>
          <div className="mt-0.5 text-xs text-[var(--mist)]">
            <span className="ha-mono">{latest ? latest.value : host.listingsTotal}</span> listings ·
            checked {fmtAgo(tracked?.lastCheckedAt ?? tracked?.latest?.ts ?? null)}
          </div>
        </div>
        <Sparkline points={points} stroke={stroke} />
        <DeltaBadge delta={delta} />
      </button>
      {open && (
        <div className="border-t border-[var(--tide)] p-3">
          <TrendChart points={points} stroke={stroke} />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-[var(--mist)]">
              {host.delta30d != null && (
                <>
                  30-day change: <DeltaBadge delta={host.delta30d} />
                </>
              )}
            </span>
            {tracked && (
              <button
                onClick={() => onToggle(tracked.hostId, !tracked.enabled)}
                className={`ha-focus ha-press rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  tracked.enabled
                    ? "border-[var(--verdi)]/50 bg-[var(--verdi-dim)] text-[var(--verdi)]"
                    : "border-[var(--tide)] text-[var(--mist)]"
                }`}
              >
                {tracked.enabled ? "Tracking on" : "Tracking off"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Anomalies ---------------------------------------------------------------

function AnomalyCard({
  tone,
  title,
  count,
  children,
}: {
  tone: "coral" | "amber";
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const color = tone === "coral" ? "var(--coral)" : "var(--amber)";
  const dim = tone === "coral" ? "var(--coral-dim)" : "var(--amber-dim)";
  if (count === 0) return null;
  return (
    <div className="rounded-[12px] border p-3" style={{ borderColor: `${color}40`, background: `${dim}` }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="ha-focus flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-sm font-semibold" style={{ color }}>
          {title}
        </span>
        <span className="ha-mono rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: `${color}55`, color }}>
          {count}
        </span>
      </button>
      {open && <div className="mt-2 flex flex-col gap-2 text-xs">{children}</div>}
    </div>
  );
}

// --- Concelho bars -----------------------------------------------------------

function ConcelhoBars({ concelhos }: { concelhos: InsightsPayload["concelhos"] }) {
  const top = concelhos.slice(0, 12);
  const max = top[0]?.listings || 1;
  return (
    <div className="flex flex-col gap-2 p-4 pt-1">
      {top.map((c) => (
        <div key={c.name} className="grid grid-cols-[80px_1fr_auto] items-center gap-2 text-xs sm:grid-cols-[110px_1fr_auto]">
          <span className="truncate text-[var(--mist)]" title={c.name}>
            {c.name}
          </span>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--ink-deep)]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(c.listings / max) * 100}%` }}
              transition={{ duration: 0.7, ease: EASE }}
              className="h-full rounded-full bg-[var(--verdi)]/70"
            />
          </div>
          <span className="ha-mono text-[var(--foam)]">
            {c.listings}
            <span className="ml-1 text-[var(--mist)]">· {c.hosts}h</span>
          </span>
        </div>
      ))}
      {concelhos.length === 0 && (
        <p className="pb-3 text-sm text-[var(--mist)]">No registry data yet.</p>
      )}
    </div>
  );
}

// --- Main view ---------------------------------------------------------------

export function InsightsView({
  insights,
  trackedHosts,
  onToggleTracking,
  onRunNow,
}: {
  insights: InsightsPayload | null;
  trackedHosts: TrackedHost[] | null;
  onToggleTracking: (hostId: string, enabled: boolean) => void;
  onRunNow: () => Promise<number>;
}) {
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailFilter, setEmailFilter] = useState<"all" | "personal" | "company">("all");
  const [modalAls, setModalAls] = useState<string[] | null>(null);

  const trackedById = useMemo(() => {
    const m = new Map<string, TrackedHost>();
    for (const t of trackedHosts || []) m.set(t.hostId, t);
    return m;
  }, [trackedHosts]);

  const evolutionHosts = useMemo(() => {
    if (!insights) return [];
    return [...insights.hosts]
      .filter((h) => h.snapshots.length > 0)
      .sort((a, b) => Math.abs(b.deltaSinceLast ?? 0) - Math.abs(a.deltaSinceLast ?? 0));
  }, [insights]);

  const crossHostOwners = useMemo(
    () => (insights ? insights.owners.filter((o) => o.hosts.length > 1 || o.isCompany) : []),
    [insights]
  );

  async function handleRunNow() {
    setBusy(true);
    setRunMsg(null);
    try {
      const n = await onRunNow();
      setRunMsg(n > 0 ? `${n} check(s) queued` : "Nothing due — all hosts fresh");
    } catch {
      setRunMsg("Could not reach the tracker");
    } finally {
      setBusy(false);
    }
  }

  if (!insights) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="ha-skeleton h-28 rounded-[14px]" />
        ))}
      </div>
    );
  }

  const { kpis, anomalies } = insights;
  const anomalyTotal =
    anomalies.duplicateAl.length +
    anomalies.alNotFound.length +
    anomalies.countGaps.length +
    anomalies.geocodeIssues.length;

  const emails = insights.emails.filter((e) => emailFilter === "all" || e.kind === emailFilter);
  const personalCount = insights.emails.filter((e) => e.kind === "personal").length;
  const companyCount = insights.emails.filter((e) => e.kind === "company").length;

  return (
    <div className="flex flex-col gap-4">
      {/* KPI row */}
      <div className="flex flex-wrap items-stretch gap-3">
        <Kpi label="Hosts analyzed" value={kpis.hosts} />
        <Kpi label="Listings" value={kpis.listings} />
        <Kpi
          label="Licensed"
          value={kpis.licensedPct != null ? Math.round(kpis.licensedPct * 100) : null}
          suffix="%"
        />
        <Kpi label="Uninsured" value={kpis.uninsured} tone="warn" />
        <Kpi label="Tracked hosts" value={kpis.trackedHosts} />
        <Kpi label="Avg ADR" value={kpis.avgAdr} suffix=" €" />
        <div className="ha-panel flex flex-1 basis-36 items-center justify-center p-4">
          <button
            onClick={() => exportInsightsToExcel(insights)}
            className="ha-focus ha-press rounded-[10px] border border-[var(--verdi)]/50 bg-[var(--verdi-dim)] px-4 py-2 text-sm font-semibold text-[var(--verdi)] hover:bg-[var(--verdi)]/25"
          >
            Download .xlsx
          </button>
        </div>
      </div>

      {/* Portfolio evolution */}
      <Section
        title="Portfolio evolution"
        hint="Declared listing count over time, checked every 2 days"
      >
        <div className="flex items-center justify-between px-4 pb-2">
          <span className="text-xs text-[var(--mist)]">{runMsg}</span>
          <button
            onClick={handleRunNow}
            disabled={busy}
            className="ha-focus ha-press rounded-[10px] bg-[var(--verdi)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-deep)] transition-colors hover:bg-[#5adcc4] disabled:opacity-50"
          >
            {busy ? "Queuing…" : "Check all now"}
          </button>
        </div>
        <div className="flex flex-col gap-2 p-4 pt-0">
          {evolutionHosts.map((h) => (
            <EvolutionCard
              key={h.hostId}
              host={h}
              tracked={trackedById.get(h.hostId)}
              onToggle={onToggleTracking}
            />
          ))}
          {evolutionHosts.length === 0 && (
            <p className="text-sm text-[var(--mist)]">
              No snapshots yet. Run a host analysis (or “Check all now”) to start the series.
            </p>
          )}
        </div>
      </Section>

      {/* Anomalies */}
      <Section
        title="Anomalies"
        hint={anomalyTotal > 0 ? `${anomalyTotal} signal(s)` : "Nothing unusual"}
      >
        <div className="grid gap-3 p-4 pt-1 md:grid-cols-2">
          <AnomalyCard
            tone="coral"
            title="Same AL license on several listings"
            count={anomalies.duplicateAl.length}
          >
            {anomalies.duplicateAl.map((d) => (
              <div key={d.alNumber} className="rounded-[8px] bg-[var(--ink)]/40 p-2">
                <div className="ha-mono font-semibold text-[var(--foam)]">
                  <button
                    onClick={() => setModalAls([d.alNumber])}
                    className="ha-focus underline decoration-[var(--tide)] decoration-dotted underline-offset-2 hover:text-[var(--verdi)]"
                  >
                    {d.alNumber}/AL
                  </button>{" "}
                  · {d.listings.length} listings
                  {d.crossHost && (
                    <span className="ml-2 rounded-full border border-[var(--coral)]/50 px-1.5 py-0.5 text-[10px] text-[var(--coral)]">
                      across hosts
                    </span>
                  )}
                </div>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {d.listings.map((l) => (
                    <li key={l.url} className="truncate">
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="ha-focus text-[var(--foam)] hover:text-[var(--verdi)]"
                      >
                        {l.title || l.url}
                      </a>
                      <span className="text-[var(--mist)]"> — {l.hostName}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </AnomalyCard>

          <AnomalyCard
            tone="coral"
            title="AL number not in the RNT registry"
            count={anomalies.alNotFound.length}
          >
            {anomalies.alNotFound.map((d) => (
              <div key={d.alNumber} className="rounded-[8px] bg-[var(--ink)]/40 p-2">
                <span className="ha-mono font-semibold text-[var(--foam)]">{d.alNumber}/AL</span>
                <span className="text-[var(--mist)]">
                  {" "}
                  — shown on {d.listings.length} listing(s) but no registry record exists
                </span>
              </div>
            ))}
          </AnomalyCard>

          <AnomalyCard
            tone="amber"
            title="Declared vs scraped count gap"
            count={anomalies.countGaps.length}
          >
            {anomalies.countGaps.map((g) => (
              <div key={g.hostId} className="rounded-[8px] bg-[var(--ink)]/40 p-2">
                <span className="font-semibold text-[var(--foam)]">{g.hostName}</span>
                <span className="ha-mono text-[var(--mist)]">
                  {" "}
                  declares {g.declared}, scraped {g.scraped}
                </span>
              </div>
            ))}
          </AnomalyCard>

          <AnomalyCard
            tone="amber"
            title="Geocode issues"
            count={anomalies.geocodeIssues.length}
          >
            {anomalies.geocodeIssues.map((g) => (
              <div key={g.alNumber} className="rounded-[8px] bg-[var(--ink)]/40 p-2">
                <span className="ha-mono font-semibold text-[var(--foam)]">{g.alNumber}/AL</span>
                <span className="text-[var(--mist)]"> — {g.status}</span>
              </div>
            ))}
          </AnomalyCard>
        </div>
      </Section>

      {/* Owners across hosts */}
      <Section
        title="Owners across hosts"
        hint="Same NIF operating under multiple profiles"
      >
        {crossHostOwners.length > 0 ? (
          <div className="ha-scroll overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-y border-[var(--tide)] bg-[var(--ink-deep)]/40">
                  {["Owner", "NIF", "Listings", "Appears under"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--mist)]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {crossHostOwners.map((o) => (
                  <tr key={o.nif} className="border-b border-[var(--tide)]/60">
                    <td className="px-4 py-2">
                      {o.name || "—"}
                      {o.isCompany && (
                        <span className="ml-2 rounded-full border border-[var(--amber)]/40 bg-[var(--amber-dim)] px-1.5 py-0.5 text-[10px] text-[var(--amber)]">
                          company
                        </span>
                      )}
                    </td>
                    <td className="ha-mono px-4 py-2 text-[var(--mist)]">{o.nif}</td>
                    <td className="ha-mono px-4 py-2">{o.listings}</td>
                    <td className="px-4 py-2 text-[var(--mist)]">
                      {o.hosts.join(", ")}
                      {o.hosts.length > 1 && (
                        <span className="ml-2 rounded-full border border-[var(--coral)]/40 bg-[var(--coral-dim)] px-1.5 py-0.5 text-[10px] text-[var(--coral)]">
                          {o.hosts.length} profiles
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 pb-4 text-sm text-[var(--mist)]">
            No owner appears under more than one host profile yet.
          </p>
        )}
      </Section>

      {/* Host NIF table */}
      {insights.hostNifs.length > 0 && (
        <Section title="Host NIFs" hint="Manually identified — properties under each host's NIF">
          <div className="ha-scroll overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-y border-[var(--tide)] bg-[var(--ink-deep)]/40">
                  {["Host", "NIF", "Owner", "Under NIF", "Portfolio"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--mist)]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {insights.hostNifs.map((h) => (
                  <tr key={h.hostId} className="border-b border-[var(--tide)]/60">
                    <td className="px-4 py-2">{h.hostName || h.hostId}</td>
                    <td className="ha-mono px-4 py-2 text-[var(--mist)]">{h.manualNif}</td>
                    <td className="px-4 py-2 text-[var(--mist)]">{h.ownerName || "—"}</td>
                    <td className="ha-mono px-4 py-2 font-semibold">{h.propertiesUnderNif}</td>
                    <td className="ha-mono px-4 py-2 text-[var(--mist)]">
                      {h.portfolioListings ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Emails database */}
      <Section
        title="Emails"
        hint={`${personalCount} personal · ${companyCount} company`}
      >
        <div className="flex gap-1.5 px-4 pb-2">
          {(["all", "personal", "company"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setEmailFilter(k)}
              aria-pressed={emailFilter === k}
              className={`ha-focus ha-press rounded-full border px-3 py-1.5 text-[11px] capitalize transition-colors sm:px-2.5 sm:py-1 ${
                emailFilter === k
                  ? "border-[var(--verdi)]/50 bg-[var(--verdi-dim)] text-[var(--verdi)]"
                  : "border-[var(--tide)] text-[var(--mist)] hover:border-[var(--verdi)]/30"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        {emails.length > 0 ? (
          <div className="ha-scroll overflow-x-auto sm:max-h-[420px] sm:overflow-auto">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead className="sm:sticky sm:top-0">
                <tr className="border-y border-[var(--tide)] bg-[var(--ink-deep)]">
                  {["Email", "Owner", "NIF", "Hosts", "Listings"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--mist)]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {emails.map((e) => (
                  <tr key={e.email} className="border-b border-[var(--tide)]/60">
                    <td className="px-4 py-2">
                      <a
                        href={`mailto:${e.email}`}
                        className="ha-mono ha-focus hover:text-[var(--verdi)]"
                      >
                        {e.email}
                      </a>
                      {e.kind === "company" && (
                        <span className="ml-2 rounded-full border border-[var(--amber)]/40 bg-[var(--amber-dim)] px-1.5 py-0.5 text-[10px] text-[var(--amber)]">
                          company
                        </span>
                      )}
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-2 text-[var(--mist)]">
                      {e.names.join(", ") || "—"}
                    </td>
                    <td className="ha-mono px-4 py-2 text-[var(--mist)]">{e.nifs.join(", ")}</td>
                    <td className="max-w-[160px] truncate px-4 py-2 text-[var(--mist)]">
                      {e.hosts.join(", ")}
                    </td>
                    <td className="ha-mono px-4 py-2">{e.listings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 pb-4 text-sm text-[var(--mist)]">No emails in this group.</p>
        )}
      </Section>

      {/* Concelho breakdown */}
      <Section title="Listings by concelho" hint="From the RNT registry">
        <ConcelhoBars concelhos={insights.concelhos} />
      </Section>

      <AnimatePresence>
        {modalAls && <AlUsageModal als={modalAls} onClose={() => setModalAls(null)} />}
      </AnimatePresence>
    </div>
  );
}
