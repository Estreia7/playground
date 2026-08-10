"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  INSURANCE_LABEL,
  NIF_KIND_LABEL,
  adrPerListing,
  insuranceOf,
  licenseAgeYears,
  mediaUrl,
  nifKind,
  shortRoomUrl,
} from "./helpers";
import type { HostJobState, HostListing, License } from "./types";
import { Lightbox } from "./Lightbox";
import { AlUsageModal } from "./AlUsageModal";

type SortKey = "title" | "area" | "reviews" | "score" | "adr";
type RiskFilter = "unlicensed" | "uninsured" | "lowRated" | "errors" | "removed";

const PAGE_SIZE = 50;

const RISK_FILTERS: Array<{ key: RiskFilter; label: string }> = [
  { key: "unlicensed", label: "No AL" },
  { key: "uninsured", label: "Uninsured" },
  { key: "lowRated", label: "Low-rated" },
  { key: "errors", label: "Errors" },
  { key: "removed", label: "Removed" },
];

function WarnIcon({ className }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path
        d="M8 2 1.8 13h12.4L8 2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8 6.4v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11.4" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function InsuranceBadge({ status }: { status: string }) {
  // "unlicensed" is deliberately neutral: no AL usually means legally exempt.
  const cfg =
    status === "valid"
      ? { cls: "text-[var(--verdi)] border-[var(--verdi)]/35 bg-[var(--verdi-dim)]", warn: false }
      : status === "expired"
        ? { cls: "text-[var(--amber)] border-[var(--amber)]/40 bg-[var(--amber-dim)]", warn: true }
        : status === "none"
          ? { cls: "text-[var(--coral)] border-[var(--coral)]/40 bg-[var(--coral-dim)]", warn: true }
          : { cls: "text-[var(--mist)] border-[var(--tide)] bg-transparent", warn: false };
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${cfg.cls}`}
    >
      {cfg.warn && <WarnIcon />}
      {INSURANCE_LABEL[status] ?? status}
    </span>
  );
}

function areaOf(l: HostListing, lic: License | undefined): string {
  if (lic?.rnt.status === "found" && lic.rnt.address?.concelho) return lic.rnt.address.concelho;
  return l.locationText || "-";
}

function SortHeader({
  label,
  col,
  sort,
  onSort,
  className,
}: {
  label: string;
  col: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === col;
  return (
    <th
      className={`px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--mist)] ${className || ""}`}
      aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
    >
      <button
        onClick={() => onSort(col)}
        className={`ha-focus inline-flex items-center gap-1 hover:text-[var(--foam)] ${active ? "text-[var(--verdi)]" : ""}`}
      >
        {label}
        <span aria-hidden className="text-[9px]">
          {active ? (sort.dir === 1 ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
}

export function ListingsTable({
  job,
  onSetAl,
}: {
  job: HostJobState;
  onSetAl?: (listingUrl: string, alNumber: string | null) => Promise<void>;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "score", dir: 1 });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ photos: string[]; title: string } | null>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Set<RiskFilter>>(new Set());
  const [page, setPage] = useState(0);
  const [modalAls, setModalAls] = useState<string[] | null>(null);

  const adrByUrl = useMemo(() => adrPerListing(job), [job]);
  const hasAdr = Object.keys(adrByUrl).length > 0;

  const removedCount = useMemo(
    () => job.listingOrder.filter((u) => job.listings[u]?.removed).length,
    [job]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const showRemoved = filters.has("removed");
    const list = job.listingOrder
      .map((u) => job.listings[u])
      .filter(Boolean)
      // Removed listings stay in the dossier but hide unless asked for.
      .filter((l) => (showRemoved ? true : !l.removed))
      .filter((l) => {
        if (q) {
          const hay = `${l.title || ""} ${l.alNumber || ""} ${l.locationText || ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (filters.size === 0) return true;
        const ins = insuranceOf(l, job.licenses);
        // Chips compose as OR: a row shows when it matches any active filter.
        if (filters.has("removed") && l.removed) return true;
        if (filters.has("unlicensed") && !l.alNumber && l.status === "done") return true;
        if (filters.has("uninsured") && (ins === "none" || ins === "expired")) return true;
        if (filters.has("lowRated") && l.reviewsScore != null && l.reviewsScore < 4.5) return true;
        if (filters.has("errors") && (l.status === "error" || l.error)) return true;
        return false;
      });
    const val = (l: HostListing): string | number => {
      const lic = l.alNumber ? job.licenses[l.alNumber] : undefined;
      switch (sort.key) {
        case "title":
          return (l.title || "").toLowerCase();
        case "area":
          return areaOf(l, lic).toLowerCase();
        case "reviews":
          return l.reviewsCount ?? -1;
        case "score":
          return l.reviewsScore ?? 99;
        case "adr":
          return adrByUrl[l.url] ?? -1;
      }
    };
    return [...list].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va < vb) return -sort.dir;
      if (va > vb) return sort.dir;
      return 0;
    });
  }, [job, sort, adrByUrl, query, filters]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function onSort(k: SortKey) {
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === 1 ? -1 : 1 } : { key: k, dir: 1 }));
    setPage(0);
  }

  function toggleFilter(k: RiskFilter) {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
    setPage(0);
  }

  return (
    <div className="ha-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <h3 className="ha-display text-sm font-semibold">Listings</h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1" role="group" aria-label="Risk filters">
            {RISK_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => toggleFilter(f.key)}
                aria-pressed={filters.has(f.key)}
                className={`ha-focus ha-press rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  filters.has(f.key)
                    ? "border-[var(--coral)]/50 bg-[var(--coral-dim)] text-[var(--coral)]"
                    : "border-[var(--tide)] text-[var(--mist)] hover:border-[var(--coral)]/30"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <input
            className="ha-input w-44 px-3 py-1.5 text-xs"
            placeholder="Search title / AL / area…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            aria-label="Search listings"
            spellCheck={false}
          />
        </div>
      </div>
      <div className="ha-scroll overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-y border-[var(--tide)] bg-[var(--ink-deep)]/40">
              <th className="w-14 px-3 py-2" aria-label="Photo" />
              <SortHeader label="Listing" col="title" sort={sort} onSort={onSort} />
              <SortHeader label="Area" col="area" sort={sort} onSort={onSort} />
              <SortHeader label="Reviews" col="reviews" sort={sort} onSort={onSort} />
              <SortHeader label="Score" col="score" sort={sort} onSort={onSort} />
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--mist)]">
                AL
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--mist)]">
                Type
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--mist)]">
                Owner
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--mist)]">
                Insurance
              </th>
              {hasAdr && <SortHeader label="Avg ADR" col="adr" sort={sort} onSort={onSort} />}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((l) => {
              const lic = l.alNumber ? job.licenses[l.alNumber] : undefined;
              const rnt = lic?.rnt.status === "found" ? lic.rnt : null;
              const ins = insuranceOf(l, job.licenses);
              const owner = rnt?.owners?.[0];
              const isOpen = expanded === l.url;
              const flagged = !l.removed && (ins === "none" || ins === "expired");
              const adr = adrByUrl[l.url];
              return (
                <FragmentRow
                  key={l.url}
                  colSpan={hasAdr ? 10 : 9}
                  open={isOpen}
                  onToggle={() => setExpanded(isOpen ? null : l.url)}
                  flagged={flagged}
                  main={
                    <>
                      <td className="px-3 py-2">
                        {l.photos.length > 0 ? (
                          <button
                            className="ha-focus ha-press block overflow-hidden rounded-[8px]"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLightbox({ photos: l.photos, title: l.title || shortRoomUrl(l.url) });
                            }}
                            aria-label={`View ${l.photos.length} photos of ${l.title || "listing"}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={mediaUrl(l.photos[0])}
                              alt=""
                              className="h-9 w-12 object-cover transition-transform duration-300 hover:scale-110"
                              loading="lazy"
                            />
                          </button>
                        ) : l.status === "running" || l.status === "queued" ? (
                          <div className="ha-skeleton h-9 w-12" aria-hidden />
                        ) : (
                          <div className="h-9 w-12 rounded-[8px] border border-dashed border-[var(--tide)]" aria-hidden />
                        )}
                      </td>
                      <td className="max-w-[220px] px-3 py-2">
                        <div
                          className={`truncate font-medium ${l.removed ? "text-[var(--mist)] line-through" : ""}`}
                        >
                          {l.title || shortRoomUrl(l.url)}
                        </div>
                        {l.removed && (
                          <span className="mr-2 rounded-full border border-[var(--tide)] px-1.5 py-0.5 text-[10px] text-[var(--mist)]">
                            removed{" "}
                            {l.removedAt ? new Date(l.removedAt * 1000).toLocaleDateString() : ""}
                          </span>
                        )}
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="ha-mono ha-focus text-[11px] text-[var(--mist)] hover:text-[var(--verdi)]"
                        >
                          {shortRoomUrl(l.url)}
                        </a>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-[var(--mist)]">
                        {areaOf(l, lic)}
                      </td>
                      <td className="ha-mono px-3 py-2">{l.reviewsCount ?? "-"}</td>
                      <td className="ha-mono px-3 py-2">
                        {l.reviewsScore != null ? (
                          <span
                            className={
                              l.reviewsScore < 4.5 ? "text-[var(--amber)]" : "text-[var(--foam)]"
                            }
                          >
                            {l.reviewsScore.toFixed(2)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="ha-mono whitespace-nowrap px-3 py-2">
                        {l.alNumber ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalAls([l.alNumber as string]);
                            }}
                            className="ha-focus ha-press inline-flex items-center gap-1.5 underline decoration-[var(--tide)] decoration-dotted underline-offset-2 hover:text-[var(--verdi)]"
                            title="See every listing using this AL"
                          >
                            {l.alNumber}/AL
                            {l.alSource === "manual" && (
                              <span className="rounded-full border border-[var(--verdi)]/40 px-1 py-0.5 text-[9px] uppercase text-[var(--verdi)]">
                                manual
                              </span>
                            )}
                          </button>
                        ) : l.status === "done" ? (
                          <SetAlCell
                            onSave={
                              onSetAl ? (al) => onSetAl(l.url, al) : undefined
                            }
                          />
                        ) : (
                          "…"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-[var(--mist)]">
                        {rnt?.modalidade || "-"}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2 text-[var(--mist)]">
                        {owner?.name || "-"}
                      </td>
                      <td className="px-3 py-2">
                        <InsuranceBadge status={ins} />
                      </td>
                      {hasAdr && (
                        <td className="ha-mono whitespace-nowrap px-3 py-2">
                          {adr != null ? `€${adr.toFixed(0)}` : "-"}
                        </td>
                      )}
                    </>
                  }
                  detail={
                    <ListingDetail listing={l} license={lic} onOpenPhotos={(i) =>
                      setLightbox({ photos: l.photos, title: l.title || shortRoomUrl(l.url) })
                    } />
                  }
                />
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-[var(--mist)]">
            No listings match the current search or filters.
          </div>
        )}
      </div>
      {rows.length > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-[var(--tide)] px-4 py-2.5">
          <span className="ha-mono text-xs text-[var(--mist)]">
            {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, rows.length)} of{" "}
            {rows.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="ha-focus ha-press rounded-[10px] border border-[var(--tide)] px-3 py-1 text-xs text-[var(--foam)] transition-colors hover:border-[var(--verdi)]/40 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              className="ha-focus ha-press rounded-[10px] border border-[var(--tide)] px-3 py-1 text-xs text-[var(--foam)] transition-colors hover:border-[var(--verdi)]/40 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
      <AnimatePresence>
        {lightbox && (
          <Lightbox
            photos={lightbox.photos}
            title={lightbox.title}
            startIndex={0}
            onClose={() => setLightbox(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {modalAls && <AlUsageModal als={modalAls} onClose={() => setModalAls(null)} />}
      </AnimatePresence>
    </div>
  );
}

// Neutral "no AL" cell (no-AL usually means legally exempt) with a manual
// override: typing a number stores it and kicks off the registry scrape.
function SetAlCell({ onSave }: { onSave?: (al: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const al = value.trim();
    if (!/^\d{1,10}$/.test(al) || !onSave) {
      setEditing(false);
      setValue("");
      return;
    }
    setBusy(true);
    try {
      await onSave(al);
    } finally {
      setBusy(false);
      setEditing(false);
      setValue("");
    }
  }

  if (editing) {
    return (
      <span onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1">
        <input
          autoFocus
          className="ha-input w-24 px-2 py-1 text-xs"
          placeholder="AL number"
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setEditing(false);
              setValue("");
            }
          }}
          onBlur={save}
          aria-label="Manual AL number"
        />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-[var(--mist)]">
      exempt
      {onSave && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className="ha-focus ha-press rounded-full border border-[var(--tide)] px-1.5 py-0.5 text-[10px] hover:border-[var(--verdi)]/40 hover:text-[var(--verdi)]"
          title="Manually set the AL number — the registry scrape runs right after"
        >
          set AL
        </button>
      )}
    </span>
  );
}

function FragmentRow({
  main,
  detail,
  open,
  onToggle,
  flagged,
  colSpan,
}: {
  main: React.ReactNode;
  detail: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  flagged: boolean;
  colSpan: number;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer border-b border-[var(--tide)]/60 transition-colors hover:bg-[var(--harbor-raised)]/60 ${
          flagged ? "bg-[var(--coral-dim)]/30" : ""
        } ${open ? "bg-[var(--harbor-raised)]" : ""}`}
      >
        {main}
      </tr>
      <tr aria-hidden={!open}>
        <td colSpan={colSpan} className="p-0">
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden border-b border-[var(--tide)] bg-[var(--ink-deep)]/50"
              >
                {detail}
              </motion.div>
            )}
          </AnimatePresence>
        </td>
      </tr>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--mist)]">{label}</div>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}

function ListingDetail({
  listing,
  license,
  onOpenPhotos,
}: {
  listing: HostListing;
  license: License | undefined;
  onOpenPhotos: (index: number) => void;
}) {
  const rnt = license?.rnt.status === "found" ? license.rnt : null;
  const age = licenseAgeYears(rnt?.registeredAt);
  const owner = rnt?.owners?.[0];
  const kind = nifKind(owner?.nif ?? null);

  return (
    <div className="grid gap-5 p-4 md:grid-cols-[1fr_1fr_1fr]">
      <div className="flex flex-col gap-3">
        <Field label="Address">
          {rnt?.address?.full ? (
            <>
              {rnt.address.full}
              <div className="text-xs text-[var(--mist)]">
                {[rnt.address.freguesia, rnt.address.concelho, rnt.address.distrito]
                  .filter(Boolean)
                  .join(", ")}
              </div>
            </>
          ) : listing.alNumber ? (
            "Registry record pending or not found"
          ) : (
            "No AL license found in the listing description"
          )}
        </Field>
        <Field label="Registration">
          {rnt ? (
            <span className="ha-mono text-sm">
              {rnt.registeredAt || "-"}
              {age !== null && (
                <span
                  className={`ml-2 rounded-full border px-1.5 py-0.5 text-[10px] ${
                    age < 1
                      ? "border-[var(--amber)]/40 text-[var(--amber)]"
                      : "border-[var(--tide)] text-[var(--mist)]"
                  }`}
                >
                  {age < 1 ? "new to market" : `${age.toFixed(1)} yrs`}
                </span>
              )}
            </span>
          ) : (
            "-"
          )}
        </Field>
        <Field label="Capacity">
          {rnt?.capacity ? (
            <span className="ha-mono text-sm">
              {rnt.capacity.utentes ?? "-"} guests · {rnt.capacity.quartos ?? "-"} rooms ·{" "}
              {rnt.capacity.camas ?? "-"} beds
            </span>
          ) : (
            "-"
          )}
        </Field>
      </div>

      <div className="flex flex-col gap-3">
        <Field label="Owner">
          {owner ? (
            <>
              <div className="font-medium">{owner.name}</div>
              <div className="ha-mono text-xs text-[var(--mist)]">
                NIF {owner.nif} · {NIF_KIND_LABEL[kind]}
                {owner.quality ? ` · ${owner.quality}` : ""}
              </div>
              {owner.email && (
                <a
                  href={`mailto:${owner.email}`}
                  className="ha-focus text-xs text-[var(--verdi)] hover:underline"
                >
                  {owner.email}
                </a>
              )}
              {owner.phone && <div className="ha-mono text-xs">{owner.phone}</div>}
            </>
          ) : (
            "-"
          )}
        </Field>
        <Field label="Insurance">
          {!rnt ? (
            <span className="text-[var(--mist)]">
              {listing.alNumber || listing.status !== "done"
                ? "Registry record pending"
                : "No AL license, nothing on record"}
            </span>
          ) : rnt.insurance && rnt.insurance.status !== "none" ? (
            <>
              <div>{rnt.insurance.company || "Company unknown"}</div>
              <div className="ha-mono text-xs text-[var(--mist)]">
                {rnt.insurance.policy ? `Policy ${rnt.insurance.policy} · ` : ""}
                valid until {rnt.insurance.validUntil || "unknown"}
              </div>
              {rnt.insurance.status === "expired" && (
                <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--amber)]">
                  <WarnIcon /> Expired policy
                </div>
              )}
            </>
          ) : (
            <span className="inline-flex items-center gap-1 font-medium text-[var(--coral)]">
              <WarnIcon /> No liability insurance on record
            </span>
          )}
        </Field>
        {listing.error && (
          <Field label="Scrape error">
            <span className="text-xs text-[var(--coral)]">{listing.error}</span>
          </Field>
        )}
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--mist)]">Photos</div>
        {listing.photos.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {listing.photos.map((p, i) => (
              <button
                key={p}
                onClick={() => onOpenPhotos(i)}
                className="ha-focus ha-press overflow-hidden rounded-[8px]"
                aria-label={`Open photo ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mediaUrl(p)}
                  alt=""
                  className="h-14 w-20 object-cover transition-transform duration-300 hover:scale-110"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-1 text-sm text-[var(--mist)]">No photos saved</div>
        )}
      </div>
    </div>
  );
}
