"use client";

// Area supply at the top of Insights: how many AL properties sit in each
// Algarve quick-filter area, and how that stock was built up year by year
// (RNT license opening dates). Hand-rolled SVG like TrendChart — one hue
// (verdi) for every magnitude, text in text tokens, crosshair shared between
// the cumulative chart and the yearly-openings bars underneath.

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import CountUp from "react-countup";
import type { SupplyArea } from "./types";

const EASE = [0.16, 1, 0.3, 1] as const;
const DEFAULT_AREA = "albufeira";

// Callback-ref width tracker: re-observes whenever the measured element is
// swapped (empty state <-> chart), which a mount-only effect would miss.
function useWidth<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width, el] as const;
}

// Round up to 1 / 2 / 5 × 10^k so gridlines land on readable values.
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

// Bar with 4px rounded top, flat on the baseline.
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

const fmt = (n: number) => n.toLocaleString("en-GB");

// --- Chart -------------------------------------------------------------------

function SupplyChart({ area }: { area: SupplyArea }) {
  const [wrapRef, width, wrapEl] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const reduce = useReducedMotion();
  const years = area.years;
  const n = years.length;

  const H = 190;
  const BH = 56;
  const padL = 34;
  const padR = 6;
  const padT = 10;
  const plotW = Math.max(0, width - padL - padR);
  const step = n ? plotW / n : 0;
  const cx = (i: number) => padL + step * (i + 0.5);

  const yMax = niceMax(years[n - 1]?.total ?? 0);
  const y = (v: number) => padT + (1 - v / yMax) * (H - padT - 1);
  const bMax = niceMax(Math.max(1, ...years.map((d) => d.opened)));
  const barW = Math.max(2, Math.min(18, step - 2));

  const line = years.map((d, i) => `${cx(i).toFixed(1)},${y(d.total).toFixed(1)}`).join(" ");
  const areaPts = n ? `${cx(0)},${H} ${line} ${cx(n - 1)},${H}` : "";

  // Year labels: thin out so they never collide (~44px each), keep the last.
  const every = Math.max(1, Math.ceil(n / Math.max(1, plotW / 44)));
  const showLabel = (i: number) => i === n - 1 || (i % every === 0 && n - 1 - i >= every * 0.6);

  function indexAt(clientX: number) {
    if (!wrapEl || !n) return null;
    const x = clientX - wrapEl.getBoundingClientRect().left - padL;
    return Math.min(n - 1, Math.max(0, Math.floor(x / (step || 1))));
  }

  function onKey(e: React.KeyboardEvent) {
    if (!n) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const d = e.key === "ArrowLeft" ? -1 : 1;
      setHover((h) => Math.min(n - 1, Math.max(0, (h ?? n - 1) + d)));
    } else if (e.key === "Escape") setHover(null);
  }

  if (!n) {
    return (
      <div
        ref={wrapRef}
        className="flex h-40 items-center justify-center text-xs text-[var(--mist)]"
      >
        No dated licenses in this area yet.
      </div>
    );
  }

  const active = hover ?? n - 1;
  const hd = years[active];
  const tipLeft = Math.min(Math.max(cx(active), 70), Math.max(70, width - 70));
  const first = years[0];
  const last = years[n - 1];
  const clipId = `ha-supply-clip-${area.key}`;
  const gradId = `ha-supply-grad-${area.key}`;

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      role="img"
      aria-label={`${area.label}: ${fmt(last.total)} dated properties, growing from ${first.total} in ${first.year} to ${fmt(last.total)} in ${last.year}. Use arrow keys to step through years.`}
      onKeyDown={onKey}
      onPointerMove={(e) => setHover(indexAt(e.clientX))}
      onPointerLeave={() => setHover(null)}
      onBlur={() => setHover(null)}
      className="ha-focus relative select-none rounded-[8px] outline-none"
    >
      {width > 0 && (
        <>
          <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-[var(--mist)]">
            Properties on the market
          </div>
          <svg width={width} height={H} className="block overflow-visible" aria-hidden>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--verdi)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--verdi)" stopOpacity="0" />
              </linearGradient>
              <clipPath id={clipId}>
                <motion.rect
                  key={area.key}
                  x={0}
                  y={0}
                  height={H + 10}
                  initial={{ width: reduce ? "100%" : "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: reduce ? 0 : 0.9, ease: EASE }}
                />
              </clipPath>
            </defs>
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line
                  x1={padL}
                  x2={width - padR}
                  y1={y(yMax * f)}
                  y2={y(yMax * f)}
                  stroke="var(--tide)"
                  strokeWidth="1"
                  strokeDasharray={f === 0 ? undefined : "2 4"}
                />
                <text
                  x={padL - 8}
                  y={y(yMax * f) + 3}
                  textAnchor="end"
                  className="ha-mono"
                  fontSize="10"
                  fill="var(--mist)"
                >
                  {fmt(Math.round(yMax * f))}
                </text>
              </g>
            ))}
            <g clipPath={`url(#${clipId})`}>
              <polygon points={areaPts} fill={`url(#${gradId})`} />
              <polyline
                points={line}
                fill="none"
                stroke="var(--verdi)"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
            <line
              x1={cx(active)}
              x2={cx(active)}
              y1={padT}
              y2={H}
              stroke={hover != null ? "var(--mist)" : "transparent"}
              strokeOpacity="0.5"
              strokeWidth="1"
            />
            <circle
              cx={cx(active)}
              cy={y(hd.total)}
              r="4.5"
              fill="var(--verdi)"
              stroke="var(--harbor)"
              strokeWidth="2"
            />
          </svg>

          <div className="mb-1 mt-4 text-[10px] uppercase tracking-[0.12em] text-[var(--mist)]">
            New licenses per year
          </div>
          <svg width={width} height={BH + 18} className="block" aria-hidden>
            <line x1={padL} x2={width - padR} y1={BH} y2={BH} stroke="var(--tide)" strokeWidth="1" />
            <text x={padL - 8} y={10} textAnchor="end" className="ha-mono" fontSize="10" fill="var(--mist)">
              {bMax}
            </text>
            {years.map((d, i) => {
              const h = (d.opened / bMax) * (BH - 4);
              return (
                <g key={d.year}>
                  {d.opened > 0 && (
                    <motion.path
                      key={`${area.key}-${d.year}`}
                      d={barPath(cx(i) - barW / 2, BH - h, barW, h)}
                      fill="var(--verdi)"
                      initial={{ opacity: reduce ? 1 : 0 }}
                      animate={{ opacity: hover == null || hover === i ? 0.75 : 0.3 }}
                      transition={{ duration: 0.25, delay: reduce || hover != null ? 0 : 0.3 + i * 0.02 }}
                    />
                  )}
                  {showLabel(i) && (
                    <text
                      x={cx(i)}
                      y={BH + 14}
                      textAnchor="middle"
                      className="ha-mono"
                      fontSize="10"
                      fill={i === active && hover != null ? "var(--foam)" : "var(--mist)"}
                    >
                      {d.year}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {hover != null && (
            <div
              className="pointer-events-none absolute top-6 -translate-x-1/2 rounded-[8px] border border-[var(--tide)] bg-[var(--ink-deep)] px-2.5 py-1.5 text-[11px] shadow-lg"
              style={{ left: tipLeft }}
            >
              <div className="ha-mono text-[var(--mist)]">{hd.year}</div>
              <div className="ha-mono font-semibold text-[var(--foam)]">{fmt(hd.total)} properties</div>
              <div className="ha-mono text-[var(--mist)]">
                {hd.opened > 0 ? `+${hd.opened} opened` : "none opened"}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- Side breakdowns ---------------------------------------------------------

function ShareBars({
  title,
  rows,
  total,
}: {
  title: string;
  rows: Array<{ key: string; label: string; count: number }>;
  total: number;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div>
      <h4 className="mb-2 text-[10px] uppercase tracking-[0.12em] text-[var(--mist)]">{title}</h4>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.key} className="grid grid-cols-[minmax(0,96px)_1fr_auto] items-center gap-2 text-xs">
            <span className="truncate text-[var(--foam)]" title={r.label}>
              {r.label}
            </span>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--ink-deep)]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(r.count / max) * 100}%` }}
                transition={{ duration: 0.7, ease: EASE }}
                className="h-full rounded-full bg-[var(--verdi)]/70"
              />
            </div>
            <span className="ha-mono w-[64px] text-right text-[var(--foam)]">
              {r.count}
              <span className="ml-1 text-[var(--mist)]">
                {total ? `${Math.round((r.count / total) * 100)}%` : ""}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="min-w-[96px]">
      <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--mist)]">{label}</div>
      <div className={`ha-mono mt-0.5 text-lg font-semibold ${accent ? "text-[var(--verdi)]" : "text-[var(--foam)]"}`}>
        {value}
      </div>
    </div>
  );
}

// --- Panel -------------------------------------------------------------------

export function SupplyPanel({ areas }: { areas: SupplyArea[] }) {
  const [areaKey, setAreaKey] = useState(DEFAULT_AREA);
  const [showTable, setShowTable] = useState(false);
  const area = useMemo(
    () => areas.find((a) => a.key === areaKey) ?? areas[0],
    [areas, areaKey]
  );
  if (!area) return null;

  const mixTotal = area.bedroomMix.reduce((a, b) => a + b.count, 0);

  return (
    <section className="ha-panel overflow-hidden" aria-labelledby="ha-supply-title">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--mist)]">Supply</div>
          <h3 id="ha-supply-title" className="ha-display text-lg font-semibold leading-tight">
            {area.label}
            <span className="ml-2 align-middle text-xs font-normal text-[var(--mist)]">{area.scope}</span>
          </h3>
        </div>
        <div role="group" aria-label="Area" className="flex flex-wrap gap-1.5">
          {areas.map((a) => (
            <button
              key={a.key}
              onClick={() => setAreaKey(a.key)}
              aria-pressed={a.key === area.key}
              className={`ha-focus ha-press rounded-full border px-3 py-1.5 text-xs transition-colors ${
                a.key === area.key
                  ? "border-[var(--verdi)]/50 bg-[var(--verdi-dim)] text-[var(--verdi)]"
                  : "border-[var(--tide)] text-[var(--mist)] hover:border-[var(--verdi)]/30 hover:text-[var(--foam)]"
              }`}
            >
              {a.label}
              <span className="ha-mono ml-1.5 opacity-70">{a.properties}</span>
            </button>
          ))}
        </div>
      </div>

      {area.properties === 0 ? (
        <p className="px-4 py-8 text-sm text-[var(--mist)]">
          No registry-matched properties in {area.label} yet — analyze a host with listings there.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3 px-4 pb-2 pt-4">
            <div className="mr-2">
              <div className="ha-mono text-4xl font-semibold leading-none text-[var(--foam)]">
                <CountUp key={area.key} end={area.properties} duration={0.8} separator="," />
              </div>
              <div className="mt-1 text-xs text-[var(--mist)]">properties</div>
            </div>
            <Stat label="Hosts" value={fmt(area.hosts)} />
            <Stat label="Bedrooms" value={fmt(area.bedrooms)} />
            <Stat label="Guest capacity" value={fmt(area.guests)} />
            <Stat label="Apt / Villa" value={`${fmt(area.apartments)} / ${fmt(area.villas)}`} />
            <Stat label="New · last 12 mo" value={`+${fmt(area.newLast12m)}`} accent={area.newLast12m > 0} />
          </div>

          <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0">
              <SupplyChart area={area} />
            </div>
            <div className="flex flex-col gap-6">
              <ShareBars
                title="Bedroom mix"
                total={mixTotal}
                rows={area.bedroomMix.map((m) => ({ key: m.label, label: m.label, count: m.count }))}
              />
              <ShareBars
                title="Largest hosts here"
                total={area.properties}
                rows={area.topHosts.map((h) => ({ key: h.hostId, label: h.name, count: h.properties }))}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--tide)] px-4 py-2.5">
            <p className="text-[11px] text-[var(--mist)]">
              Unique AL licenses on analyzed hosts’ active listings, dated by RNT opening date
              {area.undated > 0 && ` · ${area.undated} undated not plotted`}.
            </p>
            <button
              onClick={() => setShowTable((v) => !v)}
              aria-expanded={showTable}
              className="ha-focus ha-press rounded-full border border-[var(--tide)] px-2.5 py-1 text-[11px] text-[var(--mist)] hover:text-[var(--foam)]"
            >
              {showTable ? "Hide table" : "Show table"}
            </button>
          </div>

          {showTable && (
            <div className="ha-scroll max-h-[280px] overflow-auto border-t border-[var(--tide)]">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0">
                  <tr className="bg-[var(--ink-deep)]">
                    {["Year", "Opened", "Total"].map((h) => (
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
                  {[...area.years].reverse().map((d) => (
                    <tr key={d.year} className="border-b border-[var(--tide)]/60">
                      <td className="ha-mono px-4 py-1.5">{d.year}</td>
                      <td className="ha-mono px-4 py-1.5 text-[var(--mist)]">+{d.opened}</td>
                      <td className="ha-mono px-4 py-1.5">{fmt(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
