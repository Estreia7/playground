"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePadel } from "../ui/PadelProvider";
import { tallyWinRate, type PairTally, type Result } from "../core/playerStats.ts";

/* Charts for the player statistics page, drawn by hand in SVG and HTML.

   The rules they follow, because each one fixes a way charts go wrong:

   - The form follows the question. Win, draw and loss are parts of one whole, so
     they are one stacked bar. Win rate against 50% is above-or-below-par, so it
     has a reference line. A partner's record is a ranking, so it is a row of
     bars, not a donut.
   - Marks are thin. Columns stop at 24px however wide their slot, data ends are
     rounded to 4px and the baseline end is square, lines are 2px, and touching
     marks are separated by a gap in the surface colour rather than a stroke.
   - Colour carries meaning, and only that: lime is a good result, red a bad one,
     grey a draw or nothing. Text never wears those colours — labels and values
     stay in neutral ink — so a light hue is never asked to be read as text.
   - Colour is never alone. A win and a loss also differ in height in the result
     strips, every value is reachable in a table view, and every mark can be
     focused with the keyboard.
   - Nothing hides content. Charts are drawn in full and animate only when the
     reader has not asked for reduced motion; the growth is a from-state applied
     by the animation, so if it never runs the chart is simply there. */

export const INK = {
  win: "#bef264",
  loss: "#f87171",
  draw: "#71717a",
  grid: "#27272a",
  /** The reference line is a step brighter than the grid so it reads as a line
      that means something rather than as part of the scale. */
  ref: "#52525b",
  axis: "#a1a1aa",
  /** The card colour, used for the 2px gaps and the rings around dots. */
  surface: "#111113",
} as const;

const RESULT_WORD: Record<Result, "stats.c.resultW" | "stats.c.resultD" | "stats.c.resultL"> = {
  W: "stats.c.resultW",
  D: "stats.c.resultD",
  L: "stats.c.resultL",
};

/* ── shared pieces ─────────────────────────────────────────── */

/** True once the element has scrolled into view, so growth plays when the reader
    can see it and not while the chart is still below the fold. A timer is the
    backstop: if the observer never fires the chart still ends up shown. */
function useReveal<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    const backstop = window.setTimeout(() => setSeen(true), 3500);
    return () => {
      observer.disconnect();
      window.clearTimeout(backstop);
    };
  }, []);

  return [ref, seen];
}

interface TipData {
  x: number;
  y: number;
  title: string;
  value: string;
  sub?: string;
}

/** One tooltip per chart. It follows the pointer, and on touch it stays until
    the next tap elsewhere, because a finger lifting is not a reason to hide it. */
function useTip() {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<TipData | null>(null);

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setTip(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);

  const showAtPointer = (e: React.PointerEvent, data: Omit<TipData, "x" | "y">) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setTip({ ...data, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const showAtElement = (el: Element, data: Omit<TipData, "x" | "y">) => {
    const r = box.current?.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    if (r) setTip({ ...data, x: b.left + b.width / 2 - r.left, y: b.top - r.top });
  };
  return { box, tip, setTip, showAtPointer, showAtElement };
}

function Tooltip({ tip, width }: { tip: TipData | null; width: number }) {
  if (!tip) return null;
  // Keep it inside the card: centred on the point unless that would push it off.
  const half = 74;
  const left = Math.min(Math.max(tip.x, half), Math.max(half, width - half));
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-20 w-max max-w-[148px] rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 shadow-lg"
      style={{ left, top: Math.max(tip.y, 34), transform: "translate(-50%, calc(-100% - 10px))" }}
    >
      {/* Values lead and names follow: the reader already has the mark and wants
          the number. */}
      <div className="text-sm font-bold leading-tight text-zinc-50">{tip.value}</div>
      <div className="text-xs leading-tight text-zinc-300">{tip.title}</div>
      {tip.sub && <div className="mt-0.5 text-xs leading-tight text-zinc-400">{tip.sub}</div>}
    </div>
  );
}

/** A chart's frame: title, one line saying how to read it, and the switch to its
    table twin. Every chart has one, because a picture alone is not accessible. */
export function ChartCard({
  title,
  note,
  table,
  children,
}: {
  title: string;
  note?: string;
  table?: { head: string[]; rows: string[][] };
  children: React.ReactNode;
}) {
  const { t } = usePadel();
  const [asTable, setAsTable] = useState(false);
  const [ref, seen] = useReveal<HTMLElement>();

  return (
    <section
      ref={ref}
      data-in={seen ? "true" : "false"}
      className="pd-chart mb-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-tight">{title}</h3>
          {note && <p className="mt-1 text-xs leading-snug text-zinc-400">{note}</p>}
        </div>
        {table && (
          <button
            type="button"
            aria-pressed={asTable}
            onClick={() => setAsTable((v) => !v)}
            className="min-h-9 shrink-0 rounded-lg border border-zinc-800 px-2.5 text-xs font-semibold text-zinc-300 active:bg-zinc-800"
          >
            {asTable ? t("stats.c.chart") : t("stats.c.table")}
          </button>
        )}
      </header>

      <div className="mt-3">
        {asTable && table ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-400">
                  {table.head.map((h, i) => (
                    <th key={i} className={`pb-2 font-semibold ${i > 0 ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {table.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, i) => (
                      <td key={i} className={`py-2 tabular-nums ${i > 0 ? "text-right text-zinc-200" : "font-semibold"}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/* ── wins, draws and losses ────────────────────────────────── */

/** The whole record as one bar. Parts of a whole, three of them, so a stacked
    bar; the count sits inside a segment only when the segment is wide enough to
    hold it, and the legend beneath carries every number regardless. */
export function ResultsBar({ won, drawn, lost }: { won: number; drawn: number; lost: number }) {
  const { t } = usePadel();
  const total = won + drawn + lost;
  if (total === 0) return null;

  const parts = [
    { key: "W", n: won, colour: INK.win, ink: "#09090b", label: t("stats.wins") },
    { key: "D", n: drawn, colour: INK.draw, ink: "#fafafa", label: t("stats.draws") },
    { key: "L", n: lost, colour: INK.loss, ink: "#09090b", label: t("stats.losses") },
  ].filter((p) => p.n > 0);

  return (
    <div>
      <div
        className="pd-reveal flex h-9 gap-0.5"
        role="img"
        aria-label={`${won} ${t("stats.wins")}, ${drawn} ${t("stats.draws")}, ${lost} ${t("stats.losses")}`}
      >
        {parts.map((p, i) => {
          const pct = (p.n / total) * 100;
          return (
            <div
              key={p.key}
              className={`flex items-center justify-center text-sm font-bold tabular-nums ${
                i === 0 ? "rounded-l-[4px]" : ""
              } ${i === parts.length - 1 ? "rounded-r-[4px]" : ""}`}
              style={{ width: `${pct}%`, background: p.colour, color: p.ink }}
            >
              {pct >= 11 ? p.n : ""}
            </div>
          );
        })}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2 text-zinc-300">
            <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: p.colour }} />
            <span>{p.label}</span>
            <span className="font-semibold tabular-nums text-zinc-100">{p.n}</span>
            <span className="tabular-nums text-zinc-400">{Math.round((p.n / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── a run of results ──────────────────────────────────────── */

/** Results as small marks, oldest on the left. A win and a loss are the same
    width but a draw is half the height, so the three differ in shape and not
    only in colour. */
export function ResultStrip({ results, max = 8, size = "sm" }: { results: Result[]; max?: number; size?: "sm" | "md" }) {
  const { t } = usePadel();
  const shown = results.slice(-max);
  if (shown.length === 0) return null;
  const tall = size === "md" ? "h-4" : "h-3";
  const short = size === "md" ? "h-2" : "h-1.5";
  const wide = size === "md" ? "w-3" : "w-2.5";

  return (
    <span
      role="img"
      aria-label={shown.map((r) => t(RESULT_WORD[r])).join(", ")}
      title={shown.map((r) => t(RESULT_WORD[r])).join(" · ")}
      className="inline-flex shrink-0 items-center gap-[3px]"
    >
      {shown.map((r, i) => (
        <span
          key={i}
          aria-hidden
          className={`${wide} rounded-[3px] ${r === "D" ? short : tall}`}
          style={{ background: r === "W" ? INK.win : r === "L" ? INK.loss : INK.draw }}
        />
      ))}
    </span>
  );
}

/* ── columns ───────────────────────────────────────────────── */

export interface Column {
  key: string;
  /** Under the column. */
  label: string;
  value: number;
  /** In the tooltip. */
  title: string;
  valueText: string;
  sub?: string;
}

const W = 360;

/** The next round number at or above `max`, for the end of an axis. The steps
    are close together on purpose: a value of 52 should give an axis of 60, not
    100, or the columns fill half the chart and the other half is air. */
export function niceStep(max: number): number {
  const steps = [10, 15, 20, 25, 30, 40, 50, 60, 75, 80, 100, 120, 150, 200, 250, 300, 400, 500, 600, 750, 1000];
  return steps.find((s) => s >= max) ?? Math.ceil(max / 100) * 100;
}

/** A column with a rounded top and a square foot, or the mirror of it when the
    value is below the baseline. Never shorter than a pixel, so a zero is seen. */
function columnPath(x: number, w: number, yBase: number, yVal: number, r = 4): string {
  const up = yVal <= yBase;
  const top = up ? yVal : yBase;
  const bottom = up ? yBase : yVal;
  const h = Math.max(1, bottom - top);
  const rr = Math.min(r, h, w / 2);
  if (up) {
    const t = bottom - h;
    return `M${x} ${bottom}V${t + rr}Q${x} ${t} ${x + rr} ${t}H${x + w - rr}Q${x + w} ${t} ${x + w} ${t + rr}V${bottom}Z`;
  }
  const b = top + h;
  return `M${x} ${top}V${b - rr}Q${x} ${b} ${x + rr} ${b}H${x + w - rr}Q${x + w} ${b} ${x + w} ${b - rr}V${top}Z`;
}

/** Columns from a baseline, one per tournament.

    `baseline` is where the columns start: zero. `reference` is a separate thing,
    the value that separates good from bad (50% for a win rate, zero again for a
    difference). Columns at or beyond it are lime, short of it red, and it is
    drawn as a line a step brighter than the grid. Keeping the two apart matters:
    a win rate that started its columns at 50% would show 30% as a hanging bar
    and hide how big the numbers really are. */
export function ColumnChart({
  items,
  domain,
  baseline,
  reference,
  format,
  ariaLabel,
}: {
  items: Column[];
  domain: [number, number];
  baseline: number;
  reference: number;
  format: (v: number) => string;
  ariaLabel: string;
}) {
  const { box, tip, setTip, showAtPointer, showAtElement } = useTip();
  const [d0, d1] = domain;
  const n = items.length;

  const H = 190;
  const L = 38;
  const R = 8;
  const T = 16;
  const B = 26;
  const pw = W - L - R;
  const ph = H - T - B;
  const y = (v: number) => T + ph * (1 - (v - d0) / (d1 - d0));
  const slot = pw / Math.max(1, n);
  const bw = Math.min(24, Math.max(8, slot * 0.62));
  const cx = (i: number) => L + slot * (i + 0.5);

  // The ends of the axis, the baseline and the reference, without repeats. With
  // only the two ends left, a midpoint keeps the scale readable.
  const ticks = [...new Set([d0, baseline, reference, d1])].sort((a, b) => a - b);
  if (ticks.length === 2) ticks.splice(1, 0, (d0 + d1) / 2);

  // A value on every column is chaos past a handful, so past seven only the
  // extremes and the latest are written out; the rest live in the tooltip.
  const labelled = useMemo(() => {
    if (n <= 7) return new Set(items.map((_, i) => i));
    const values = items.map((c) => c.value);
    return new Set([values.indexOf(Math.max(...values)), values.indexOf(Math.min(...values)), n - 1]);
  }, [items, n]);
  const everyOther = n > 7;

  return (
    <div ref={box} className="relative" onPointerLeave={(e) => e.pointerType === "mouse" && setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={ariaLabel}>
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={L}
              x2={W - R}
              y1={y(v)}
              y2={y(v)}
              stroke={v === reference || v === 0 ? INK.ref : INK.grid}
              strokeWidth="1"
            />
            <text x={L - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10.5" fill={INK.axis}>
              {format(v)}
            </text>
          </g>
        ))}

        {items.map((c, i) => {
          const good = c.value >= reference;
          const base = y(baseline);
          const up = c.value >= baseline;
          const top = y(c.value);
          return (
            <g key={c.key} className="pd-colg">
              <path
                d={columnPath(cx(i) - bw / 2, bw, base, top)}
                fill={good ? INK.win : INK.loss}
                className={`pd-colbar pd-gy ${up ? "" : "pd-gyd"}`}
                style={{ ["--i" as string]: i }}
              />
              {labelled.has(i) && (
                <text
                  x={cx(i)}
                  y={up ? top - 5 : top + 13}
                  textAnchor="middle"
                  fontSize="10.5"
                  fontWeight="700"
                  fill="#e4e4e7"
                  className="pd-fadein"
                  style={{ ["--i" as string]: i }}
                >
                  {format(c.value)}
                </text>
              )}
              {(!everyOther || i % 2 === n % 2 || i === n - 1) && (
                <text x={cx(i)} y={H - 8} textAnchor="middle" fontSize="10" fill={INK.axis}>
                  {c.label}
                </text>
              )}
              {/* The mark is the hit target, and a wider one than it paints. */}
              <rect
                x={L + slot * i}
                y={T - 6}
                width={slot}
                height={ph + 12}
                fill="transparent"
                className="pd-hit"
                tabIndex={0}
                role="img"
                aria-label={`${c.title}: ${c.valueText}${c.sub ? ", " + c.sub : ""}`}
                onPointerEnter={(e) => showAtPointer(e, { title: c.title, value: c.valueText, sub: c.sub })}
                onPointerMove={(e) => showAtPointer(e, { title: c.title, value: c.valueText, sub: c.sub })}
                onFocus={(e) => showAtElement(e.currentTarget, { title: c.title, value: c.valueText, sub: c.sub })}
                onBlur={() => setTip(null)}
              />
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} width={box.current?.clientWidth ?? 320} />
    </div>
  );
}



/* ── form over time ────────────────────────────────────────── */

/** Win rate over a sliding window of matches, one point per match.

    A tournament's worth of results says how a night went; a sliding window says
    whether the player is getting better or worse, which is the thing worth
    knowing before the next one. The window is short enough to react and long
    enough not to swing on a single match. */
export const FORM_WINDOW = 6;
export const FORM_MIN_MATCHES = FORM_WINDOW + 2;

export function formPoints(results: Result[], window = FORM_WINDOW): { match: number; rate: number; wins: number }[] {
  const out: { match: number; rate: number; wins: number }[] = [];
  for (let i = window - 1; i < results.length; i++) {
    const slice = results.slice(i - window + 1, i + 1);
    const wins = slice.filter((r) => r === "W").length;
    out.push({ match: i + 1, rate: (wins / window) * 100, wins });
  }
  return out;
}

export function FormChart({ results }: { results: Result[] }) {
  const { t } = usePadel();
  const { box, tip, setTip } = useTip();
  const points = useMemo(() => formPoints(results), [results]);
  const [active, setActive] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const H = 184;
  const L = 38;
  const R = 16;
  const T = 16;
  const B = 26;
  const pw = W - L - R;
  const ph = H - T - B;
  const m = points.length;
  const x = (k: number) => L + (m === 1 ? pw / 2 : (pw * k) / (m - 1));
  const y = (v: number) => T + ph * (1 - v / 100);

  const line = points.map((p, k) => `${k === 0 ? "M" : "L"}${x(k).toFixed(1)} ${y(p.rate).toFixed(1)}`).join("");
  const area = `${line}L${x(m - 1).toFixed(1)} ${y(0)}L${x(0).toFixed(1)} ${y(0)}Z`;
  const last = points[m - 1];

  const describe = (k: number) => ({
    title: t("stats.c.match", { n: points[k].match }),
    value: `${Math.round(points[k].rate)}%`,
    sub: t("stats.c.matchesOf", { won: points[k].wins, played: FORM_WINDOW }),
  });

  /** The nearest point to a pointer, found by x alone: a finger never lands on a
      2px line, and it does not have to. */
  const nearest = (clientX: number): number => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return m - 1;
    const px = ((clientX - r.left) / r.width) * W;
    return Math.min(m - 1, Math.max(0, Math.round(((px - L) / pw) * (m - 1))));
  };

  const show = (k: number, clientX: number, clientY: number) => {
    setActive(k);
    const r = box.current?.getBoundingClientRect();
    if (r) {
      // Anchor the tooltip to the point on the line, not to the pointer.
      const s = svg.current?.getBoundingClientRect();
      const px = s ? ((x(k) / W) * s.width) + s.left - r.left : clientX - r.left;
      const py = s ? ((y(points[k].rate) / H) * s.height) + s.top - r.top : clientY - r.top;
      setTip({ ...describe(k), x: px, y: py });
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setActive(null);
      setTip(null);
      return;
    }
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "Home" ? -m : e.key === "End" ? m : 0;
    if (!step) return;
    e.preventDefault();
    const k = Math.min(m - 1, Math.max(0, (active ?? m - 1) + step));
    const s = svg.current?.getBoundingClientRect();
    if (s) show(k, s.left + (x(k) / W) * s.width, s.top);
  };

  if (m < 2) return null;

  return (
    <div ref={box} className="relative">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full touch-pan-y rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-lime-300/70"
        role="img"
        aria-label={t("stats.c.ariaLine")}
        tabIndex={0}
        onKeyDown={onKey}
        onFocus={() => active === null && show(m - 1, 0, 0)}
        onBlur={() => {
          setActive(null);
          setTip(null);
        }}
        onPointerMove={(e) => show(nearest(e.clientX), e.clientX, e.clientY)}
        onPointerDown={(e) => show(nearest(e.clientX), e.clientX, e.clientY)}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") {
            setActive(null);
            setTip(null);
          }
        }}
      >
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 50 ? INK.ref : INK.grid} strokeWidth="1" />
            <text x={L - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10.5" fill={INK.axis}>
              {v}%
            </text>
          </g>
        ))}

        <path d={area} fill={INK.win} fillOpacity="0.1" className="pd-wash" />
        <path
          d={line}
          fill="none"
          stroke={INK.win}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          className="pd-draw"
        />

        {/* The reader is placed in time at both ends of the axis. */}
        <text x={L} y={H - 8} fontSize="10" fill={INK.axis}>
          {t("stats.c.match", { n: points[0].match })}
        </text>
        <text x={W - R} y={H - 8} textAnchor="end" fontSize="10" fill={INK.axis}>
          {t("stats.c.match", { n: last.match })}
        </text>

        {active !== null && (
          <line x1={x(active)} x2={x(active)} y1={T} y2={y(0)} stroke={INK.ref} strokeWidth="1" />
        )}

        {/* Marker with a 2px ring in the card colour, so it stays clear of the line. */}
        <circle
          cx={x(active ?? m - 1)}
          cy={y(points[active ?? m - 1].rate)}
          r="4.5"
          fill={INK.win}
          stroke={INK.surface}
          strokeWidth="2"
          className="pd-dotin"
        />
        {active === null && (
          <text
            x={x(m - 1) - 9}
            y={y(last.rate) + (last.rate > 82 ? 17 : -9)}
            textAnchor="end"
            fontSize="12"
            fontWeight="700"
            fill="#f4f4f5"
            className="pd-fadein"
          >
            {Math.round(last.rate)}%
          </text>
        )}
      </svg>
      <Tooltip tip={tip} width={box.current?.clientWidth ?? 320} />
    </div>
  );
}

/* ── rankings of partners and opponents ────────────────────── */

/** A row of bars for partners or opponents: name, how it has gone lately, and how
    often it ended well. Ordered by win rate, so the eye runs down from the best.

    The bar is a thin track with the win rate filled from the left and a hairline
    at 50%. A pairing with fewer than `minSample` matches is drawn faded: the
    number is real but it rests on too little to trust, and the note says so. */
export function RateBars({
  rows,
  limit = 6,
  minSample = 3,
  nameOf,
}: {
  rows: PairTally[];
  limit?: number;
  minSample?: number;
  nameOf: (id: string) => string;
}) {
  const { t } = usePadel();
  const [open, setOpen] = useState(false);
  const shown = open ? rows : rows.slice(0, limit);

  return (
    <>
      <ul className="divide-y divide-zinc-800/70">
        {shown.map((row, i) => {
          const rate = Math.round(tallyWinRate(row) * 100);
          const thin = row.played < minSample;
          return (
            <li
              key={row.playerId}
              className="py-2.5"
              title={thin ? t("stats.c.few") : undefined}
              aria-label={`${nameOf(row.playerId)}: ${rate}%, ${t("stats.c.matchesOf", { won: row.won, played: row.played })}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-base font-semibold">{nameOf(row.playerId)}</span>
                <ResultStrip results={row.results} />
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="relative h-2 flex-1 rounded-[4px] bg-zinc-800">
                  <div
                    className="pd-hbar absolute inset-y-0 left-0 rounded-r-[4px]"
                    style={{
                      width: `${Math.max(rate, rate > 0 ? 2 : 0)}%`,
                      background: rate >= 50 ? INK.win : INK.loss,
                      opacity: thin ? 0.4 : 1,
                      ["--i" as string]: i,
                    }}
                  />
                  {/* 50%: the line between a partner that is good for you and one that is not. */}
                  <span aria-hidden className="absolute -bottom-1 -top-1 left-1/2 w-px bg-zinc-500" />
                </div>
                <span className="w-[4.6rem] shrink-0 text-right tabular-nums">
                  <strong className="text-base text-zinc-50">{rate}%</strong>{" "}
                  <span className="text-xs text-zinc-400">
                    {row.won}/{row.played}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {rows.length > limit && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="mt-1 min-h-11 w-full rounded-xl text-sm font-semibold text-zinc-300 active:bg-zinc-800"
        >
          {open ? "−" : `+ ${rows.length - limit}`}
        </button>
      )}
    </>
  );
}
