"use client";

// AL Registry — an RNAL export matched to Airbnb in two directions:
// AL → listing → host (free dossier match, free Bing, paid Google) and
// host → every listing → AL (the regular host dossiers, re-matched on finish).
// The coverage bar is the page's one signature: the registry's whole state in
// a single line, and also the status filter for the table below.

import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { fmtTime, rntPortalUrl } from "./helpers";
import { useRegistryState } from "./useRegistryState";
import type { RegistryRow, SearchProvider } from "./registryTypes";

const EASE = [0.16, 1, 0.3, 1] as const;
const PAGE = 150;

type Filter =
  | "all"
  | "found-dossier"
  | "found-bing"
  | "found-google"
  | "delisted"
  | "not_found"
  | "pending"
  | "no-dossier"
  | "mismatch";

const PROVIDER_LABEL: Record<string, string> = {
  serper: "Serper",
  serpapi: "SerpApi",
  scraperapi: "ScraperAPI",
  scrapedo: "scrape.do",
};

function matchesFilter(r: RegistryRow, f: Filter): boolean {
  switch (f) {
    case "all":
      return true;
    case "found-dossier":
      return r.status === "found" && r.foundVia === "host_dossier";
    case "found-bing":
      return r.status === "found" && r.foundVia === "bing";
    case "found-google":
      return r.status === "found" && r.foundVia === "google";
    case "pending":
      return r.status === "pending" || r.status === "error";
    case "no-dossier":
      return !!r.hostId && !r.dossierJobId;
    case "mismatch":
      return r.mismatch;
    default:
      return r.status === f;
  }
}

function ExternalIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="shrink-0">
      <path d="M3.5 1.5h5v5M8.5 1.5 2 8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExtLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`ha-focus inline-flex min-w-0 items-center gap-1 underline decoration-[var(--tide)] underline-offset-[3px] transition-colors hover:text-[var(--verdi)] hover:decoration-[var(--verdi)]/50 ${className}`}
    >
      <span className="truncate">{children}</span>
      <ExternalIcon />
    </a>
  );
}

// --- Coverage bar ---------------------------------------------------------------

type Segment = { key: Filter; label: string; count: number; fill: string; text: string };

function CoverageBar({
  segments,
  total,
  filter,
  onFilter,
}: {
  segments: Segment[];
  total: number;
  filter: Filter;
  onFilter: (f: Filter) => void;
}) {
  const reduce = useReducedMotion();
  const visible = segments.filter((s) => s.count > 0);
  return (
    <div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--ink-deep)] ring-1 ring-[var(--tide)]"
        role="img"
        aria-label={segments.map((s) => `${s.label}: ${s.count}`).join(", ")}
      >
        {visible.map((s, i) => (
          <motion.span
            key={s.key}
            className="h-full"
            style={{ background: s.fill, opacity: filter === "all" || filter === s.key ? 1 : 0.28 }}
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${(s.count / Math.max(total, 1)) * 100}%` }}
            transition={{ duration: 0.7, ease: EASE, delay: reduce ? 0 : i * 0.05 }}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-1 gap-y-1.5" role="group" aria-label="Filter by status">
        {segments.map((s) => {
          const on = filter === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onFilter(on ? "all" : s.key)}
              aria-pressed={on}
              disabled={s.count === 0 && !on}
              className={`ha-focus ha-press flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-default disabled:opacity-40 ${
                on
                  ? "border-[var(--foam)]/40 bg-[var(--harbor-raised)] text-[var(--foam)]"
                  : "border-transparent text-[var(--mist)] hover:border-[var(--tide)] hover:text-[var(--foam)]"
              }`}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.fill }} aria-hidden />
              {s.label}
              <span className="ha-mono" style={{ color: s.text }}>
                {s.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- Status chip ------------------------------------------------------------------

const VIA_LABEL: Record<string, string> = { host_dossier: "dossier", bing: "Bing", google: "Google" };

function StatusChip({ row }: { row: RegistryRow }) {
  const cfg =
    row.status === "found"
      ? { label: "On Airbnb", cls: "border-[var(--verdi)]/40 text-[var(--verdi)] bg-[var(--verdi-dim)]" }
      : row.status === "delisted"
        ? { label: "Delisted", cls: "border-[var(--amber)]/40 text-[var(--amber)] bg-[var(--amber-dim)]" }
        : row.status === "not_found"
          ? { label: "Not found", cls: "border-[var(--tide)] text-[var(--mist)]" }
          : row.status === "error"
            ? { label: "Check failed", cls: "border-[var(--coral)]/40 text-[var(--coral)] bg-[var(--coral-dim)]" }
            : { label: "Pending", cls: "border-dashed border-[var(--tide)] text-[var(--mist)]" };
  const via = row.foundVia && (row.status === "found" || row.status === "delisted") ? VIA_LABEL[row.foundVia] : null;
  const pendingNote =
    row.status === "pending" ? (row.bingTried ? "Bing missed · Google next" : "Waiting for Bing") : null;
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${cfg.cls}`}>
        {cfg.label}
      </span>
      {(via || pendingNote) && (
        <span className="text-[10px] text-[var(--mist)]">{via ? `via ${via}` : pendingNote}</span>
      )}
    </div>
  );
}

// --- Host / dossier cell ----------------------------------------------------------------

function DossierCell({ row, onOpen }: { row: RegistryRow; onOpen: (jobId: string) => void }) {
  if (row.dossierJobId) {
    return (
      <button
        type="button"
        onClick={() => onOpen(row.dossierJobId!)}
        className="ha-focus ha-press whitespace-nowrap rounded-full border border-[var(--tide)] px-2.5 py-1 text-[11px] text-[var(--foam)] transition-colors hover:border-[var(--verdi)]/50 hover:text-[var(--verdi)]"
      >
        Open dossier
      </button>
    );
  }
  if (row.hostJobActive) {
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap text-[11px] text-[var(--verdi)]">
        <span className="ha-sonar relative h-1.5 w-1.5 rounded-full bg-[var(--verdi)] text-[var(--verdi)]" aria-hidden />
        Analysing host
      </span>
    );
  }
  if (row.hostId) return <span className="whitespace-nowrap text-[11px] text-[var(--mist)]">Queued for analysis</span>;
  return <span className="text-[11px] text-[var(--mist)]/60">-</span>;
}

function HostLink({ row }: { row: RegistryRow }) {
  if (!row.hostUrl) {
    return row.status === "found" ? (
      <span className="text-[11px] text-[var(--mist)]">Host not read yet</span>
    ) : null;
  }
  return (
    <ExtLink href={row.hostUrl} className="max-w-[11rem] text-xs 2xl:max-w-[16rem]">
      {row.hostName || `Host ${row.hostId}`}
    </ExtLink>
  );
}

// --- Providers panel ----------------------------------------------------------------------

function providerState(p: SearchProvider): { label: string; tone: string; detail: string | null } {
  if (!p.configured) return { label: "No key", tone: "text-[var(--mist)]/70", detail: null };
  if (p.exhaustedUntil) {
    const forever = p.exhaustedUntil > Date.now() / 1000 + 365 * 86400;
    return {
      label: "Out of credits",
      tone: "text-[var(--coral)]",
      detail: forever ? "Add a new key to use it again" : `Resets ${new Date(p.exhaustedUntil * 1000).toLocaleDateString()}`,
    };
  }
  if (p.validationError) return { label: "Failed check", tone: "text-[var(--amber)]", detail: "Returns wrong results, skipped" };
  if (!p.validatedAt) return { label: "Not checked yet", tone: "text-[var(--mist)]", detail: "Checked on first use (1 search)" };
  return { label: "Ready", tone: "text-[var(--verdi)]", detail: null };
}

function ProvidersPanel({
  providers,
  pendingForGoogle,
  googleRunning,
  onSearch,
  onRefreshBalance,
}: {
  providers: SearchProvider[];
  pendingForGoogle: number;
  googleRunning: boolean;
  onSearch: (limit: number) => Promise<void>;
  onRefreshBalance: () => void;
}) {
  const [batch, setBatch] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = providers.find((p) => {
    const s = providerState(p).label;
    return s === "Ready" || s === "Not checked yet";
  });
  const n = Math.min(batch, pendingForGoogle);
  const disabledReason = googleRunning
    ? "A Google search is already running."
    : !next
      ? "Every provider is out of credits or has no key."
      : pendingForGoogle === 0
        ? "Nothing left for Google: the free steps cover every pending AL first."
        : null;

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await onSearch(n);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the search.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ha-panel flex flex-col p-4" aria-labelledby="ha-providers-h">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="ha-providers-h" className="ha-display text-sm font-semibold">
          Google search credits
        </h3>
        <button
          type="button"
          onClick={onRefreshBalance}
          className="ha-focus text-[11px] text-[var(--mist)] underline decoration-[var(--tide)] underline-offset-[3px] hover:text-[var(--foam)]"
        >
          Refresh balances
        </button>
      </div>
      <p className="mt-1 text-xs text-[var(--mist)]">
        Used top to bottom. When one runs dry mid-batch, the same AL moves on to the next.
      </p>

      <ul className="mt-3 divide-y divide-[var(--tide)] border-y border-[var(--tide)]">
        {providers.map((p) => {
          const st = providerState(p);
          return (
            <li key={p.name} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-sm">
                  {PROVIDER_LABEL[p.name] || p.name}
                  <span className="ml-2 text-[11px] text-[var(--mist)]">
                    {p.costPerQuery} {p.unit}
                    {p.costPerQuery === 1 ? "" : "s"}/search
                  </span>
                </div>
                <div className={`text-[11px] ${st.tone}`}>
                  {st.label}
                  {st.detail && <span className="text-[var(--mist)]"> · {st.detail}</span>}
                </div>
              </div>
              <div className="ha-mono shrink-0 text-right text-xs">
                <div>{p.remaining != null ? `${p.remaining.toLocaleString("en-GB")} left` : p.configured ? "balance n/a" : ""}</div>
                {p.spent > 0 && (
                  <div className="text-[10px] text-[var(--mist)]">
                    {p.spent.toLocaleString("en-GB")} spent · {p.calls} calls
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label htmlFor="ha-google-batch" className="text-xs text-[var(--mist)]">
          Batch
        </label>
        <select
          id="ha-google-batch"
          value={batch}
          onChange={(e) => setBatch(parseInt(e.target.value, 10))}
          className="ha-input ha-focus px-2 py-1 text-xs"
        >
          {[5, 10, 25, 50].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <motion.button
          type="button"
          onClick={go}
          disabled={!!disabledReason || busy || n === 0}
          whileTap={{ scale: 0.97 }}
          className="ha-focus flex-1 rounded-[10px] bg-[var(--verdi)] px-3 py-2 text-sm font-semibold text-[var(--ink-deep)] transition-colors hover:bg-[#5adcc4] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? "Starting…" : googleRunning ? "Searching…" : n > 0 ? `Search ${n} on Google` : "Search on Google"}
        </motion.button>
      </div>
      <p className="mt-2 text-[11px] text-[var(--mist)]" aria-live="polite">
        {disabledReason ||
          (next
            ? `${pendingForGoogle} pending after Bing · about ${n * next.costPerQuery} ${next.unit}${n * next.costPerQuery === 1 ? "" : "s"} on ${PROVIDER_LABEL[next.name] || next.name}`
            : null)}
      </p>
      {error && (
        <p className="mt-1 text-[11px] text-[var(--coral)]" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

// --- Main view ------------------------------------------------------------------------

const PHASE_LABEL: Record<string, string> = {
  dossiers: "Matching against host dossiers",
  hosts: "Reading hosts of found listings",
  bing: "Searching Bing",
  expand: "Queuing host dossiers",
  google: "Searching Google",
};

export function RegistryView({ onOpenDossier }: { onOpenDossier: (jobId: string) => void }) {
  const { data, providers, source, setSource, progress, loadError, refreshProviders, importFile, runFree, runGoogle, recheck } =
    useRegistryState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [importMsg, setImportMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const s = data?.summary;
  const active = data?.activeJobs ?? [];
  const freeRunning = active.some((j) => j.type === "al-registry");
  const googleRunning = active.some((j) => j.type === "al-google");

  const segments: Segment[] = useMemo(
    () => [
      { key: "found-dossier", label: "Found in dossiers", count: s?.byVia.host_dossier ?? 0, fill: "var(--verdi)", text: "var(--verdi)" },
      { key: "found-bing", label: "Found on Bing", count: s?.byVia.bing ?? 0, fill: "#2a9f8a", text: "var(--verdi)" },
      { key: "found-google", label: "Found on Google", count: s?.byVia.google ?? 0, fill: "#1f7466", text: "var(--verdi)" },
      { key: "delisted", label: "Delisted", count: s?.delisted ?? 0, fill: "var(--amber)", text: "var(--amber)" },
      { key: "not_found", label: "Not on Airbnb", count: s?.notFound ?? 0, fill: "#3b5a60", text: "var(--mist)" },
      { key: "pending", label: "Pending", count: (s?.pending ?? 0) + (s?.error ?? 0), fill: "repeating-linear-gradient(135deg, #1e3a40 0 4px, #11272c 4px 8px)", text: "var(--mist)" },
    ],
    [s]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        matchesFilter(r, filter) &&
        (!q ||
          r.alNumber.includes(q) ||
          (r.name || "").toLowerCase().includes(q) ||
          (r.localidade || "").toLowerCase().includes(q) ||
          (r.hostName || "").toLowerCase().includes(q) ||
          (r.listingTitle || "").toLowerCase().includes(q))
    );
  }, [rows, filter, query]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await importFile(file);
      setImportMsg({
        tone: "ok",
        text:
          `${res.imported} ALs imported` +
          (res.matchedFromDossiers ? `, ${res.matchedFromDossiers} already in dossiers` : "") +
          (res.jobId ? ". Free matching started." : "."),
      });
      setFilter("all");
    } catch (err) {
      setImportMsg({ tone: "error", text: err instanceof Error ? err.message : "Import failed." });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const providersPanel =
    providers && s ? (
      <ProvidersPanel
        providers={providers.providers}
        pendingForGoogle={s.pendingAfterBing}
        googleRunning={googleRunning}
        onSearch={async (limit) => {
          await runGoogle(limit);
        }}
        onRefreshBalance={() => refreshProviders(true)}
      />
    ) : null;

  const live =
    progress && progress.phase !== "done" && (freeRunning || googleRunning || progress.phase === "paused") ? progress : null;
  const paused = progress?.phase === "paused" || (progress?.phase === "done" && progress.pausedNoCredits);

  return (
    <div className="flex flex-col gap-5">
      {/* Intake */}
      <section className="ha-panel p-4 md:p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="ha-display text-lg font-semibold tracking-tight">AL Registry</h2>
            <p className="mt-1 max-w-[62ch] text-sm text-[var(--mist)]">
              Import an RNAL export to find each licence on Airbnb and its host. Host dossiers are
              checked first, then Bing, both free; Google only runs when you ask.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(data?.sources.length ?? 0) > 1 && (
              <>
                <label htmlFor="ha-registry-source" className="sr-only">
                  Imported file
                </label>
                <select
                  id="ha-registry-source"
                  value={source ?? ""}
                  onChange={(e) => setSource(e.target.value || null)}
                  className="ha-input ha-focus max-w-[16rem] px-2 py-2 text-xs"
                >
                  <option value="">All imports</option>
                  {data!.sources.map((src) => (
                    <option key={src.sourceFile ?? "none"} value={src.sourceFile ?? ""}>
                      {src.sourceFile} ({src.rows})
                    </option>
                  ))}
                </select>
              </>
            )}
            <button
              type="button"
              onClick={() => runFree().catch(() => {})}
              disabled={freeRunning}
              className="ha-focus ha-press rounded-[10px] border border-[var(--tide)] px-3 py-2 text-sm text-[var(--foam)] transition-colors hover:border-[var(--verdi)]/50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {freeRunning ? "Free matching running…" : "Run free matching"}
            </button>
            <input
              ref={fileRef}
              id="ha-registry-file"
              type="file"
              accept=".xlsx"
              className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <label
              htmlFor="ha-registry-file"
              aria-disabled={importing}
              className={`ha-press cursor-pointer rounded-[10px] bg-[var(--verdi)] px-4 py-2 text-sm font-semibold text-[var(--ink-deep)] transition-colors hover:bg-[#5adcc4] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--verdi)] ${
                importing ? "pointer-events-none opacity-50" : ""
              }`}
            >
              {importing ? "Importing…" : "Import RNAL export"}
            </label>
          </div>
        </div>
        <AnimatePresence>
          {importMsg && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              role={importMsg.tone === "error" ? "alert" : "status"}
              className={`mt-3 text-xs ${importMsg.tone === "error" ? "text-[var(--coral)]" : "text-[var(--verdi)]"}`}
            >
              {importMsg.text}
            </motion.p>
          )}
        </AnimatePresence>
      </section>

      {loadError && (
        <p role="alert" className="ha-panel border-[var(--coral)]/40 p-4 text-sm text-[var(--coral)]">
          Could not load the registry: {loadError}. The backend may be restarting; this view retries
          on the next update.
        </p>
      )}

      {!data && !loadError && (
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]" aria-busy>
          <div className="ha-panel ha-skeleton h-40" />
          <div className="ha-panel ha-skeleton h-40" />
        </div>
      )}

      {data && s && s.total === 0 && (
        <div className="ha-panel flex min-h-[280px] flex-col items-center justify-center p-8 text-center">
          <div className="ha-sonar relative h-3 w-3 rounded-full bg-[var(--verdi)] text-[var(--verdi)]" aria-hidden />
          <h3 className="ha-display mt-6 text-lg font-semibold">No licences imported yet</h3>
          <p className="mt-2 max-w-md text-sm text-[var(--mist)]">
            Export a list from the RNAL portal (Excel) and import it. Every AL is matched against your
            host dossiers before anything is searched.
          </p>
        </div>
      )}

      {data && s && s.total > 0 && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Desktop: credits ride along in a sticky sidebar. */}
          {providersPanel && (
            <div className="hidden lg:sticky lg:top-5 lg:col-start-2 lg:row-start-1 lg:block">{providersPanel}</div>
          )}
          <div className="flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-start-1">
            {/* Coverage */}
            <section className="ha-panel p-4 md:p-5" aria-labelledby="ha-coverage-h">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 id="ha-coverage-h" className="ha-display text-sm font-semibold">
                  <span className="ha-mono text-2xl font-semibold text-[var(--foam)]">{s.found}</span>
                  <span className="text-[var(--mist)]"> of {s.total} licences found on Airbnb</span>
                </h3>
                <p className="text-xs text-[var(--mist)]">
                  <span className="ha-mono text-[var(--foam)]">{s.hostsFound}</span> hosts ·{" "}
                  <span className="ha-mono text-[var(--foam)]">{s.hostsWithDossier}</span> with a dossier
                  {s.mismatches > 0 && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        onClick={() => setFilter(filter === "mismatch" ? "all" : "mismatch")}
                        className="ha-focus text-[var(--amber)] underline decoration-[var(--amber)]/40 underline-offset-[3px]"
                      >
                        {s.mismatches} room mismatch{s.mismatches === 1 ? "" : "es"}
                      </button>
                    </>
                  )}
                </p>
              </div>
              <div className="mt-4">
                <CoverageBar segments={segments} total={s.total} filter={filter} onFilter={setFilter} />
              </div>

              <AnimatePresence initial={false}>
                {(live || paused) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: EASE }}
                    className="overflow-hidden"
                  >
                    {paused ? (
                      <p role="status" className="mt-4 rounded-[10px] bg-[var(--amber-dim)] px-3 py-2 text-xs text-[var(--amber)]">
                        Every Google provider is out of credits. Nothing was lost: the remaining ALs stay
                        pending. Add a key or wait for a monthly reset, then search again.
                      </p>
                    ) : live ? (
                      <div role="status" className="mt-4">
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="flex items-center gap-2 text-[var(--foam)]">
                            <span className="ha-sonar relative h-1.5 w-1.5 rounded-full bg-[var(--verdi)] text-[var(--verdi)]" aria-hidden />
                            {PHASE_LABEL[live.phase] || "Working"}
                            {live.al && <span className="ha-mono text-[var(--mist)]">{live.al}/AL</span>}
                          </span>
                          {live.total != null && live.total > 0 && (
                            <span className="ha-mono text-[var(--mist)]">
                              {live.done ?? 0} / {live.total}
                            </span>
                          )}
                        </div>
                        {live.total != null && live.total > 0 && (
                          <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--ink-deep)]">
                            <motion.div
                              className="h-full bg-[var(--verdi)]"
                              animate={{ width: `${((live.done ?? 0) / live.total) * 100}%` }}
                              transition={{ duration: 0.4, ease: EASE }}
                            />
                          </div>
                        )}
                      </div>
                    ) : null}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

          {/* Narrow screens: credits right after coverage, before the long table. */}
          {providersPanel && <div className="lg:hidden">{providersPanel}</div>}

          {/* Table */}
          <section className="ha-panel overflow-hidden" aria-labelledby="ha-registry-table-h">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--tide)] p-3 md:px-4">
              <h3 id="ha-registry-table-h" className="ha-display text-sm font-semibold">
                Licences
                <span className="ha-mono ml-2 text-xs font-normal text-[var(--mist)]">
                  {filtered.length}
                  {filtered.length !== rows.length && ` of ${rows.length}`}
                </span>
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFilter(filter === "no-dossier" ? "all" : "no-dossier")}
                  aria-pressed={filter === "no-dossier"}
                  className={`ha-focus ha-press rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    filter === "no-dossier"
                      ? "border-[var(--foam)]/40 bg-[var(--harbor-raised)] text-[var(--foam)]"
                      : "border-[var(--tide)] text-[var(--mist)] hover:text-[var(--foam)]"
                  }`}
                >
                  Host without dossier
                </button>
                {filter !== "all" && (
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className="ha-focus text-xs text-[var(--mist)] underline decoration-[var(--tide)] underline-offset-[3px] hover:text-[var(--foam)]"
                  >
                    Clear filter
                  </button>
                )}
                <label htmlFor="ha-registry-q" className="sr-only">
                  Search licences
                </label>
                <input
                  id="ha-registry-q"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setShown(PAGE);
                  }}
                  placeholder="AL, name, place or host"
                  className="ha-input w-full px-3 py-1.5 text-sm sm:w-56"
                  spellCheck={false}
                />
              </div>
            </div>

            <div className="ha-scroll overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--tide)] text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--mist)]">
                    <th scope="col" className="px-3 py-2 md:px-4">Licence</th>
                    <th scope="col" className="px-3 py-2">Status</th>
                    <th scope="col" className="hidden px-3 py-2 md:table-cell">Airbnb listing</th>
                    <th scope="col" className="hidden px-3 py-2 lg:table-cell">Host</th>
                    <th scope="col" className="hidden px-3 py-2 md:table-cell">Dossier</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, shown).map((r) => (
                    <tr key={r.alNumber} className="border-b border-[var(--tide)]/60 align-top transition-colors hover:bg-[var(--harbor-raised)]/60">
                      <td className="px-3 py-2.5 md:px-4">
                        <a
                          href={rntPortalUrl(r.alNumber)}
                          target="_blank"
                          rel="noreferrer"
                          className="ha-mono ha-focus text-xs text-[var(--foam)] hover:text-[var(--verdi)]"
                          title="Open the RNAL record"
                        >
                          {r.alNumber}/AL
                        </a>
                        <div className="mt-0.5 max-w-[15rem] truncate text-sm 2xl:max-w-[22rem]">{r.name || "Unnamed"}</div>
                        <div className="text-[11px] text-[var(--mist)]">
                          {[r.localidade, r.utentes ? `${r.utentes} guests` : null, r.registeredAt]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                        {/* Narrow screens: listing + host inline */}
                        <div className="mt-1.5 flex flex-col gap-1 md:hidden">
                          {r.listingUrl && (
                            <ExtLink href={r.listingUrl} className="text-xs">
                              {r.listingTitle || `rooms/${r.roomId}`}
                            </ExtLink>
                          )}
                          <HostLink row={r} />
                          {r.dossierJobId && <DossierCell row={r} onOpen={onOpenDossier} />}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusChip row={r} />
                        {(r.status === "not_found" || r.status === "delisted" || r.status === "error") && (
                          <button
                            type="button"
                            onClick={() => recheck(r.alNumber).catch(() => {})}
                            className="ha-focus mt-1 block whitespace-nowrap text-[11px] text-[var(--mist)] underline decoration-[var(--tide)] underline-offset-[3px] hover:text-[var(--foam)]"
                            title="Clear this result so the pipeline searches it again (Google costs a search)"
                          >
                            Search again
                          </button>
                        )}
                        {r.checkedAt && (
                          <div className="mt-0.5 text-[10px] text-[var(--mist)]/70">{fmtTime(r.checkedAt)}</div>
                        )}
                        {r.mismatch && (
                          <div className="mt-1 text-[10px] text-[var(--amber)]">Dossier shows a different room</div>
                        )}
                      </td>
                      <td className="hidden px-3 py-2.5 md:table-cell">
                        {r.listingUrl ? (
                          <>
                            <ExtLink href={r.listingUrl} className="max-w-[13rem] text-xs 2xl:max-w-[19rem]">
                              {r.listingTitle || `rooms/${r.roomId}`}
                            </ExtLink>
                            <div className="ha-mono text-[10px] text-[var(--mist)]">rooms/{r.roomId}</div>
                          </>
                        ) : (
                          <span className="text-[11px] text-[var(--mist)]/60">-</span>
                        )}
                      </td>
                      <td className="hidden px-3 py-2.5 lg:table-cell">
                        <HostLink row={r} />
                      </td>
                      <td className="hidden px-3 py-2.5 md:table-cell">
                        <DossierCell row={r} onOpen={onOpenDossier} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filtered.length === 0 && (
              <p className="p-6 text-center text-sm text-[var(--mist)]">No licences match this filter.</p>
            )}
            {filtered.length > shown && (
              <div className="border-t border-[var(--tide)] p-3 text-center">
                <button
                  type="button"
                  onClick={() => setShown((n) => n + PAGE)}
                  className="ha-focus ha-press rounded-full border border-[var(--tide)] px-4 py-1.5 text-xs text-[var(--foam)] hover:border-[var(--verdi)]/50"
                >
                  Show {Math.min(PAGE, filtered.length - shown)} more
                </button>
              </div>
            )}
          </section>
          </div>
        </div>
      )}
    </div>
  );
}
