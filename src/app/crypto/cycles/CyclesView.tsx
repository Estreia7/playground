"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useJson } from "../lib/useJson.ts";
import type { CycleBear, CycleBull, CyclesPayload, MarketsPayload, PricePoint } from "../lib/types.ts";
import { date, days, multiple, pctOf, price } from "../lib/format.ts";
import { ErrorNote } from "../ui/bits.tsx";
import { linear, log, logTicks, nearest, shortPrice, useWidth, yearTicks } from "../ui/chartkit.ts";

/* Cycles: every bull (or bear) market a coin has had, drawn two ways.

   The timeline puts each cycle where it happened: the grey line is price on
   the left axis, and inside each shaded band the coloured line is that
   cycle's own move measured from its start on the right axis — so every
   cycle starts from the floor and you can see which one went furthest.

   The side-by-side chart lines them all up at day 0, which is the honest
   way to ask "where is this cycle compared with the last ones?". */

// Validated categorical order (dark surface): cycles keep their colour by
// position in time, and the cycle in progress is always violet.
const CYCLE_COLORS = ["#4f8ff2", "#13a283", "#c98220", "#e0557a", "#7aa62a"];
const CURRENT = "#9b8afb";
const FALLBACK_ASSETS = ["BTC", "ETH", "XRP", "BNB", "SOL", "DOGE", "ADA", "TRX", "LINK", "LTC", "BCH", "XLM", "AVAX", "DOT"];

type Mode = "bull" | "bear";

interface Cycle {
  key: string;
  start: PricePoint;
  end: PricePoint;
  /** Final move as a ratio of the start price (bull: ×; bear: fraction left). */
  ratio: number;
  days: number;
  current: boolean;
  path: [number, number][];
  color: string;
  label: string;
}

function cyclesOf(data: CyclesPayload, mode: Mode): Cycle[] {
  const source: (CycleBull | CycleBear)[] = mode === "bull" ? data.bulls : data.bears;
  let n = 0;
  return source.map((c) => {
    const isBull = mode === "bull";
    const start = isBull ? (c as CycleBull).low : (c as CycleBear).top;
    const current = c.current;
    const last = c.path[c.path.length - 1];
    const end: PricePoint = current ? data.price : isBull ? (c as CycleBull).top : (c as CycleBear).low;
    const ratio = current ? last[1] : isBull ? (c as CycleBull).multiple : 1 - (c as CycleBear).drawdown;
    const color = current ? CURRENT : CYCLE_COLORS[n] ?? "#6b7380";
    if (!current) n++;
    const y0 = new Date(start[0] * 1000).getUTCFullYear();
    const y1 = new Date(end[0] * 1000).getUTCFullYear();
    return {
      key: `${mode}-${start[0]}`,
      start,
      end,
      ratio,
      days: current ? last[0] : c.days,
      current,
      path: c.path,
      color,
      label: current ? `Current (${y0}–now)` : y0 === y1 ? String(y0) : `${y0}–${y1}`,
    };
  });
}

function moveText(mode: Mode, ratio: number): string {
  return mode === "bull" ? pctOf(ratio - 1, 0).replace(/\B(?=(\d{3})+(?!\d))/g, ",") : pctOf(ratio - 1, 0);
}

export default function CyclesView() {
  const params = useSearchParams();
  const router = useRouter();
  const asset = (params.get("asset") ?? "BTC").toUpperCase();
  const [mode, setMode] = useState<Mode>("bull");
  const { data, error, loading } = useJson<CyclesPayload>(`/api/crypto/cycles?asset=${asset}`);
  const { data: markets } = useJson<MarketsPayload>("/api/crypto/markets");

  const options = useMemo(() => {
    const fromMarkets = markets?.coins.filter((c) => c.binance).map((c) => ({ symbol: c.symbol, name: c.name })) ?? [];
    const list = fromMarkets.length ? fromMarkets : FALLBACK_ASSETS.map((s) => ({ symbol: s, name: s }));
    return list.some((o) => o.symbol === asset) ? list : [{ symbol: asset, name: asset }, ...list];
  }, [markets, asset]);

  const cycles = useMemo(() => (data ? cyclesOf(data, mode) : []), [data, mode]);

  return (
    <main className="cx-main">
      <div className="cx-page-head">
        <div>
          <h1>Bull &amp; bear cycles</h1>
          <p>
            Compare {data?.name ?? asset}&apos;s price with the size, duration and turning points of its previous bull and
            bear markets.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <label className="sr-only" htmlFor="asset">Asset</label>
          <select
            id="asset"
            className="cx-select"
            value={asset}
            onChange={(e) => router.replace(`/crypto/cycles?asset=${e.target.value}`, { scroll: false })}
            style={{ minWidth: 170 }}
          >
            {options.map((o) => (
              <option key={o.symbol} value={o.symbol}>
                {o.name === o.symbol ? o.symbol : `${o.name} (${o.symbol})`}
              </option>
            ))}
          </select>
          <div className="cx-seg" role="group" aria-label="Market type">
            <button type="button" className="bull" aria-pressed={mode === "bull"} onClick={() => setMode("bull")}>
              Bull
            </button>
            <button type="button" className="bear" aria-pressed={mode === "bear"} onClick={() => setMode("bear")}>
              Bear
            </button>
          </div>
        </div>
      </div>

      {error && <ErrorNote message={error} />}
      {loading && !data && !error && (
        <div style={{ display: "grid", gap: 14 }} aria-busy="true">
          <div className="cx-skeleton" style={{ height: 460 }} />
          <div className="cx-skeleton" style={{ height: 90 }} />
        </div>
      )}

      {data && (
        <>
          <PhaseLine data={data} />
          <section className="cx-panel" style={{ padding: "14px 0 6px", marginBottom: 14 }}>
            <div className="cx-panel-head" style={{ paddingTop: 0, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                  Price history with {mode === "bull" ? "bull-market expansions" : "bear-market drawdowns"}
                </h2>
                <p className="faint" style={{ margin: "2px 0 0", fontSize: 12 }}>
                  {mode === "bull" ? "Bull" : "Bear"}-market zones · drag across the chart to zoom · double-click to reset
                </p>
              </div>
            </div>
            <Timeline data={data} cycles={cycles} mode={mode} />
          </section>

          <Cards cycles={cycles} mode={mode} data={data} />

          <section className="cx-panel" style={{ padding: "14px 0 10px", marginBottom: 14 }}>
            <div className="cx-panel-head" style={{ paddingTop: 0 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Cycles side by side</h2>
                <p className="faint" style={{ margin: "2px 0 0", fontSize: 12 }}>
                  Each {mode} market from its {mode === "bull" ? "low" : "top"}, day 0 aligned
                </p>
              </div>
            </div>
            <Aligned cycles={cycles} mode={mode} />
          </section>

          <CycleTable cycles={cycles} mode={mode} />
          <Method data={data} />
        </>
      )}
    </main>
  );
}

function PhaseLine({ data }: { data: CyclesPayload }) {
  const lastBear = data.bears[data.bears.length - 1];
  const current = data.bulls.find((b) => b.current);
  let text: React.ReactNode;
  if (data.phase === "bear" && lastBear) {
    text = (
      <>
        <b style={{ color: "#ff8b95" }}>Bear market</b> since the {date(lastBear.top[0])} top at {price(lastBear.top[1])}:
        down {pctOf(-lastBear.drawdown, 0)} at the low so far ({date(lastBear.low[0])}).
      </>
    );
  } else if (current) {
    const provisional = lastBear && !lastBear.recovered;
    text = (
      <>
        <b style={{ color: "#7fe0cf" }}>Bull market</b> since the {date(current.low[0])} low at {price(current.low[1])},{" "}
        {multiple(data.price[1] / current.low[1])} so far.
        {provisional && (
          <span className="muted">
            {" "}
            Provisional until a new high above {price(lastBear.top[1])}; a close below {price(current.low[1])} would mean the
            bear market had not ended.
          </span>
        )}
      </>
    );
  } else {
    text = <>No completed cycle in this history yet.</>;
  }
  return (
    <p className="cx-panel" style={{ margin: "0 0 14px", padding: "12px 16px", fontSize: 13.5, lineHeight: 1.55 }}>
      {text}
    </p>
  );
}

/* ── Timeline ─────────────────────────────────────────────────────────── */

const PAD = { top: 18, right: 58, bottom: 40, left: 62 };

function Timeline({ data, cycles, mode }: { data: CyclesPayload; cycles: Cycle[]; mode: Mode }) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const width = useWidth(wrap);
  const height = width < 640 ? 320 : 440;
  const [domain, setDomain] = useState<[number, number] | null>(null);
  const [drag, setDrag] = useState<{ x0: number; x1: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const full: [number, number] = [data.series[0][0], data.series[data.series.length - 1][0]];
  const [t0, t1] = domain ?? full;
  const visible = data.series.filter((p) => p[0] >= t0 && p[0] <= t1);
  const pts = visible.length > 1 ? visible : data.series;

  const innerW = Math.max(10, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const x = linear(t0, t1, PAD.left, PAD.left + innerW);
  const pMin = Math.min(...pts.map((p) => p[1]));
  const pMax = Math.max(...pts.map((p) => p[1]));
  const yPrice = log(pMin / 1.15, pMax * 1.15, PAD.top + innerH, PAD.top);

  const inView = cycles.filter((c) => c.end[0] >= t0 && c.start[0] <= t1);
  const ratios = inView.flatMap((c) => c.path.map((p) => p[1]));
  const rMax = mode === "bull" ? Math.max(2, ...ratios) * 1.08 : 1.05;
  const rMin = mode === "bull" ? Math.min(1, ...ratios) * 0.95 : Math.max(0.01, Math.min(0.5, ...ratios) * 0.9);
  const yRatio = log(rMin, rMax, PAD.top + innerH, PAD.top);

  const pricePath = pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${yPrice(p[1]).toFixed(1)}`).join("");

  const toLocalX = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.max(PAD.left, Math.min(PAD.left + innerW, e.clientX - rect.left));
  };

  const hoverPoint = hover !== null ? pts[nearest(pts, x.invert(hover), (p) => p[0])] : null;
  const hoverCycle = hoverPoint ? cycles.find((c) => hoverPoint[0] >= c.start[0] && hoverPoint[0] <= c.end[0]) : null;

  // Both kinds of turning point are marked in either mode.
  const allTops = data.bears.map((b) => b.top);
  const allLows = [...new Map([...data.bulls.map((b) => b.low), ...data.bears.map((b) => b.low)].map((p) => [p[0], p])).values()];

  return (
    <div ref={wrap} style={{ position: "relative", padding: "6px 6px 0" }}>
      {domain && (
        <button type="button" className="cx-btn" onClick={() => setDomain(null)} style={{ position: "absolute", right: 70, top: 10, zIndex: 3, minHeight: 28, fontSize: 12 }}>
          Reset zoom
        </button>
      )}
      <svg
        width={width - 12}
        height={height}
        role="img"
        aria-label={`${data.name} price since ${date(full[0])} with ${cycles.length} ${mode} markets marked`}
        style={{ display: "block", touchAction: "pan-y", userSelect: "none", cursor: "crosshair" }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const px = toLocalX(e);
          setDrag({ x0: px, x1: px });
        }}
        onPointerMove={(e) => {
          const px = toLocalX(e);
          setHover(px);
          if (drag) setDrag({ ...drag, x1: px });
        }}
        onPointerUp={() => {
          if (drag && Math.abs(drag.x1 - drag.x0) > 8) {
            const a = x.invert(Math.min(drag.x0, drag.x1));
            const b = x.invert(Math.max(drag.x0, drag.x1));
            if (b - a > 20 * 86400) setDomain([a, b]);
          }
          setDrag(null);
        }}
        onPointerLeave={() => {
          setHover(null);
        }}
        onDoubleClick={() => setDomain(null)}
      >
        <defs>
          <clipPath id="cx-plot">
            <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} />
          </clipPath>
        </defs>

        {/* grid + left axis (price) */}
        {logTicks(pMin / 1.15, pMax * 1.15, height < 400 ? 5 : 8).map((v) => (
          <g key={"p" + v}>
            <line x1={PAD.left} x2={PAD.left + innerW} y1={yPrice(v)} y2={yPrice(v)} stroke="#1a1e25" />
            <text x={PAD.left - 8} y={yPrice(v) + 4} textAnchor="end" fontSize="11" fill="#8c939e" className="mono">
              {shortPrice(v)}
            </text>
          </g>
        ))}
        {/* right axis (cycle move) */}
        {logTicks(rMin, rMax, 6).map((v) => (
          <text key={"r" + v} x={PAD.left + innerW + 8} y={yRatio(v) + 4} fontSize="11" fill="#5b626d" className="mono">
            {mode === "bull" ? (v >= 1 ? v + "×" : v.toFixed(1) + "×") : pctOf(v - 1, 0)}
          </text>
        ))}
        <line x1={PAD.left + innerW} x2={PAD.left + innerW} y1={PAD.top} y2={PAD.top + innerH} stroke="#232830" />
        {/* time axis */}
        {yearTicks(t0, t1, width < 640 ? 5 : 10).map((t) => (
          <text key={"t" + t} x={x(t)} y={PAD.top + innerH + 22} textAnchor="middle" fontSize="11" fill="#8c939e">
            {t1 - t0 > 2 * 365 * 86400 ? new Date(t * 1000).getUTCFullYear() : date(t, { month: "short", year: "2-digit" })}
          </text>
        ))}

        <g clipPath="url(#cx-plot)">
          {/* cycle bands */}
          {inView.map((c) => (
            <rect
              key={c.key + "band"}
              x={x(c.start[0])}
              y={PAD.top}
              width={Math.max(1, x(c.end[0]) - x(c.start[0]))}
              height={innerH}
              fill={c.color}
              opacity={0.09}
            />
          ))}
          {/* price */}
          <path d={pricePath} fill="none" stroke="#9aa1ab" strokeWidth="1.3" opacity="0.85" />
          {/* each cycle's own move on the right axis */}
          {inView.map((c) => (
            <path
              key={c.key + "path"}
              d={c.path
                .map((p, i) => `${i ? "L" : "M"}${x(c.start[0] + p[0] * 86400).toFixed(1)},${yRatio(p[1]).toFixed(1)}`)
                .join("")}
              fill="none"
              stroke={c.color}
              strokeWidth={c.current ? 2.2 : 1.7}
              strokeLinejoin="round"
            />
          ))}
          {/* turning points */}
          {allTops.filter((p) => p[0] >= t0 && p[0] <= t1).map((p) => (
            <path key={"top" + p[0]} d={`M${x(p[0]) - 5},${yPrice(p[1]) - 11} h10 l-5,7 z`} fill="#f23645" />
          ))}
          {allLows.filter((p) => p[0] >= t0 && p[0] <= t1).map((p) => (
            <path key={"low" + p[0]} d={`M${x(p[0]) - 5},${yPrice(p[1]) + 11} h10 l-5,-7 z`} fill="#22ab94" />
          ))}
          {/* band labels */}
          {inView.map((c) => {
            const w = x(c.end[0]) - x(c.start[0]);
            if (w < 46) return null;
            const cx = x(c.start[0]) + w / 2;
            return (
              <g key={c.key + "label"} className="mono" textAnchor="middle">
                <text x={cx} y={PAD.top + innerH - 20} fontSize="11" fill={c.color} fontWeight="600">
                  {c.days}d
                </text>
                <text x={cx} y={PAD.top + innerH - 7} fontSize="11" fill={c.color}>
                  {moveText(mode, c.ratio)}
                </text>
              </g>
            );
          })}
          {/* drag selection */}
          {drag && Math.abs(drag.x1 - drag.x0) > 2 && (
            <rect
              x={Math.min(drag.x0, drag.x1)}
              y={PAD.top}
              width={Math.abs(drag.x1 - drag.x0)}
              height={innerH}
              fill="#9b8afb"
              opacity="0.14"
              stroke="#9b8afb"
              strokeOpacity="0.5"
            />
          )}
          {/* crosshair */}
          {hoverPoint && !drag && (
            <g pointerEvents="none">
              <line x1={x(hoverPoint[0])} x2={x(hoverPoint[0])} y1={PAD.top} y2={PAD.top + innerH} stroke="#5b626d" strokeDasharray="3 3" />
              <circle cx={x(hoverPoint[0])} cy={yPrice(hoverPoint[1])} r="4" fill="#e8ebef" stroke="#0a0c0f" strokeWidth="2" />
            </g>
          )}
        </g>
      </svg>
      {hoverPoint && !drag && (
        <div
          className="cx-chart-tip"
          style={{
            left: Math.min(x(hoverPoint[0]) + 14, width - 220),
            // Below the Reset zoom button, which sits in the top-right corner.
            top: 52,
          }}
        >
          <div className="muted">{date(hoverPoint[0])}</div>
          <div className="mono" style={{ fontSize: 13 }}>
            {price(hoverPoint[1])}
          </div>
          {hoverCycle && (
            <div style={{ color: hoverCycle.color, marginTop: 2 }}>
              {mode === "bull" ? "Bull" : "Bear"} {hoverCycle.label}:{" "}
              <span className="mono">{moveText(mode, hoverPoint[1] / hoverCycle.start[1])}</span> from the{" "}
              {mode === "bull" ? "low" : "top"}
            </div>
          )}
        </div>
      )}
      <div className="cx-legend" style={{ padding: "4px 12px 6px" }}>
        <span>
          <i style={{ background: "#9aa1ab" }} /> Price (left axis)
        </span>
        {cycles.map((c) => (
          <span key={c.key}>
            <i style={{ background: c.color }} /> {c.label}
          </span>
        ))}
        <span>
          <svg width="10" height="8" aria-hidden="true">
            <path d="M0,0 h10 l-5,7 z" fill="#f23645" />
          </svg>
          Cycle top
        </span>
        <span>
          <svg width="10" height="8" aria-hidden="true">
            <path d="M0,8 h10 l-5,-7 z" fill="#22ab94" />
          </svg>
          Cycle low
        </span>
      </div>
    </div>
  );
}

/* ── Side by side ─────────────────────────────────────────────────────── */

function Aligned({ cycles, mode }: { cycles: Cycle[]; mode: Mode }) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const width = useWidth(wrap);
  const height = width < 640 ? 280 : 360;
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  if (!cycles.length) {
    return (
      <p className="muted" style={{ padding: 16, fontSize: 13 }}>
        No {mode} markets in this history.
      </p>
    );
  }
  const pad = { top: 14, right: 20, bottom: 36, left: 56 };
  const innerW = Math.max(10, width - 12 - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const maxDay = Math.max(...cycles.map((c) => c.path[c.path.length - 1][0]));
  const vals = cycles.flatMap((c) => c.path.map((p) => p[1]));
  const vMin = Math.max(0.01, Math.min(...vals) * 0.92);
  const vMax = Math.max(...vals) * 1.08;
  const x = linear(0, maxDay, pad.left, pad.left + innerW);
  const y = log(vMin, vMax, pad.top + innerH, pad.top);

  const dayTicks: number[] = [];
  const stepDays = maxDay > 1500 ? 365 : maxDay > 600 ? 180 : maxDay > 200 ? 90 : 30;
  for (let d = 0; d <= maxDay; d += stepDays) dayTicks.push(d);

  const at = (c: Cycle, d: number): number | null => {
    const end = c.path[c.path.length - 1][0];
    if (d > end) return null;
    return c.path[nearest(c.path, d, (p) => p[0])][1];
  };

  return (
    <div ref={wrap} style={{ position: "relative", padding: "6px 6px 0" }}>
      <svg
        width={width - 12}
        height={height}
        role="img"
        aria-label={`${cycles.length} ${mode} markets aligned at day zero`}
        style={{ display: "block", touchAction: "pan-y" }}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = Math.max(pad.left, Math.min(pad.left + innerW, e.clientX - rect.left));
          setHoverDay(Math.round(x.invert(px)));
        }}
        onPointerLeave={() => setHoverDay(null)}
      >
        {logTicks(vMin, vMax, height < 300 ? 5 : 7).map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={pad.left + innerW} y1={y(v)} y2={y(v)} stroke={v === 1 ? "#39404b" : "#1a1e25"} />
            <text x={pad.left - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#8c939e" className="mono">
              {mode === "bull" ? (v >= 1 ? v + "×" : v.toFixed(1) + "×") : pctOf(v - 1, 0)}
            </text>
          </g>
        ))}
        {dayTicks.map((d) => (
          <text key={d} x={x(d)} y={pad.top + innerH + 22} textAnchor="middle" fontSize="11" fill="#8c939e" className="mono">
            {d === 0 ? "Day 0" : stepDays === 365 ? `Year ${d / 365}` : `${d}d`}
          </text>
        ))}
        {cycles.map((c) => (
          <path
            key={c.key}
            d={c.path.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("")}
            fill="none"
            stroke={c.color}
            strokeWidth={c.current ? 2.6 : 1.6}
            opacity={c.current ? 1 : 0.85}
            strokeLinejoin="round"
          />
        ))}
        {cycles
          .filter((c) => c.current)
          .map((c) => {
            const p = c.path[c.path.length - 1];
            return <circle key={c.key + "dot"} cx={x(p[0])} cy={y(p[1])} r="4.5" fill={c.color} stroke="#111419" strokeWidth="2" />;
          })}
        {hoverDay !== null && (
          <line x1={x(hoverDay)} x2={x(hoverDay)} y1={pad.top} y2={pad.top + innerH} stroke="#5b626d" strokeDasharray="3 3" />
        )}
      </svg>
      {hoverDay !== null && (
        <div className="cx-chart-tip" style={{ left: Math.min(x(hoverDay) + 14, width - 230), top: 20 }}>
          <div className="muted" style={{ marginBottom: 2 }}>
            Day {hoverDay}
          </div>
          {cycles.map((c) => {
            const v = at(c, hoverDay);
            return (
              <div key={c.key} style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
                <span style={{ color: c.color }}>{c.label}</span>
                <span className="mono">{v === null ? "ended" : moveText(mode, v)}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="cx-legend" style={{ padding: "4px 12px 6px" }}>
        {cycles.map((c) => (
          <span key={c.key}>
            <i style={{ background: c.color, height: c.current ? 4 : 3 }} /> {c.label} · {c.days}d · {moveText(mode, c.ratio)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Cards and table ──────────────────────────────────────────────────── */

function Cards({ cycles, mode, data }: { cycles: Cycle[]; mode: Mode; data: CyclesPayload }) {
  const done = cycles.filter((c) => !c.current);
  const current = cycles.find((c) => c.current);
  const biggest = done.length ? done.reduce((a, b) => (mode === "bull" ? (b.ratio > a.ratio ? b : a) : b.ratio < a.ratio ? b : a)) : null;
  const longest = done.length ? done.reduce((a, b) => (b.days > a.days ? b : a)) : null;
  const sortedR = done.map((c) => c.ratio).sort((a, b) => a - b);
  const sortedD = done.map((c) => c.days).sort((a, b) => a - b);
  const mid = (s: number[]) => (s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null);
  const medR = mid(sortedR);
  const medD = mid(sortedD);

  return (
    <div className="cx-cards">
      <div className="cx-card" style={{ borderLeft: `3px solid ${biggest?.color ?? "var(--cx-rule)"}` }}>
        <div className="label">{mode === "bull" ? "Largest move" : "Deepest fall"}</div>
        <div className="value mono">{biggest ? moveText(mode, biggest.ratio) : "—"}</div>
        <div className="note">{biggest ? `${biggest.label}, ${days(biggest.days)}` : "No completed cycle yet"}</div>
      </div>
      <div className="cx-card" style={{ borderLeft: `3px solid ${longest?.color ?? "var(--cx-rule)"}` }}>
        <div className="label">Longest duration</div>
        <div className="value mono">{longest ? `${longest.days.toLocaleString("en-US")} days` : "—"}</div>
        <div className="note">{longest ? `${longest.label}, ${moveText(mode, longest.ratio)}` : "No completed cycle yet"}</div>
      </div>
      <div className="cx-card" style={{ borderLeft: `3px solid ${current ? CURRENT : "var(--cx-rule)"}` }}>
        <div className="label">Current cycle</div>
        <div className="value mono" style={{ color: current ? CURRENT : undefined }}>
          {current ? moveText(mode, current.ratio) : "—"}
        </div>
        <div className="note">
          {current
            ? `Day ${current.days} since the ${date(current.start[0])} ${mode === "bull" ? "low" : "top"}${
                medD ? ` · median ${mode} lasted ${medD} days` : ""
              }`
            : mode === "bear"
              ? `No bear market in progress; ${data.name} is in a bull phase.`
              : `No bull market in progress; ${data.name} is in a bear phase.`}
        </div>
      </div>
      <div className="cx-card" style={{ borderLeft: "3px solid #c98220" }}>
        <div className="label">Historical median</div>
        <div className="value mono">{medR !== null ? moveText(mode, medR) : "—"}</div>
        <div className="note">{medD !== null ? `over ${medD} days, across ${done.length} completed ${mode} markets` : "Needs a completed cycle"}</div>
      </div>
    </div>
  );
}

function CycleTable({ cycles, mode }: { cycles: Cycle[]; mode: Mode }) {
  if (!cycles.length) return null;
  return (
    <section className="cx-panel" style={{ marginBottom: 14 }} aria-label={`${mode} markets`}>
      <div className="cx-table-wrap">
        <table className="cx-table">
          <thead>
            <tr>
              <th className="left">{mode === "bull" ? "Bull market" : "Bear market"}</th>
              <th>{mode === "bull" ? "From low" : "From top"}</th>
              <th>{mode === "bull" ? "To top" : "To low"}</th>
              <th>Days</th>
              <th>Move</th>
            </tr>
          </thead>
          <tbody>
            {cycles.map((c) => (
              <tr key={c.key} style={{ cursor: "default" }}>
                <td className="left">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <i style={{ width: 10, height: 10, borderRadius: 3, background: c.color, display: "inline-block" }} />
                    {c.label}
                  </span>
                </td>
                <td className="mono muted">
                  {date(c.start[0])} · {price(c.start[1])}
                </td>
                <td className="mono muted">{c.current ? "in progress" : `${date(c.end[0])} · ${price(c.end[1])}`}</td>
                <td className="mono">{c.days.toLocaleString("en-US")}</td>
                <td className="mono" style={{ color: c.color }}>
                  {mode === "bull" ? multiple(c.ratio) + " · " : ""}
                  {moveText(mode, c.ratio)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Method({ data }: { data: CyclesPayload }) {
  return (
    <section className="cx-panel cx-note" style={{ padding: "14px 18px" }}>
      <h2 className="cx-eyebrow" style={{ marginBottom: 8 }}>
        How cycles are found
      </h2>
      <p style={{ margin: "0 0 6px" }}>
        A <b>bear market</b> starts at an all-time high that is followed by a fall of at least{" "}
        {Math.round(data.rules.minDrawdown * 100)}% and is not taken back within {data.rules.minDays} days. It ends at the
        lowest close before price recovers. A <b>bull market</b> runs from one bear market&apos;s low to the next top. Sharp
        mid-cycle drops that recover within a year (such as April–July 2021) are not counted as cycles.
      </p>
      <p style={{ margin: 0 }}>
        Daily closes from Binance since {date(data.from)}
        {data.symbol === "BTC" ? ", with Bitcoin's 2010–2017 prices from blockchain.com" : ""}. Coins listed on Binance
        after their first top only show the cycles since then.
      </p>
    </section>
  );
}
