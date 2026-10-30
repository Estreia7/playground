"use client";

import { useEffect, useRef, useState } from "react";
import { money0 } from "./format.ts";

/* A bar chart drawn at its container's real width, so labels stay at their
   size on any screen. Series are grouped side by side, or stacked when
   `stacked` is set. A series marked `hatched` is drawn striped: used for
   figures that are estimates. Hover or keyboard focus on a month shows its
   values. */

export interface Series {
  name: string;
  color: string;
  values: (number | null)[];
  hatched?: boolean;
}

export function Bars({
  labels,
  series,
  stacked = false,
  height = 220,
  detail,
  ariaLabel,
}: {
  labels: string[];
  series: Series[];
  stacked?: boolean;
  height?: number;
  /** Extra lines in the tooltip for column i. */
  detail?: (i: number) => React.ReactNode;
  ariaLabel: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = height;
  const pad = { l: 44, r: 6, t: 10, b: 24 };
  const n = labels.length;
  const totals = labels.map((_, i) =>
    stacked ? series.reduce((s, x) => s + (x.values[i] ?? 0), 0) : Math.max(0, ...series.map((x) => x.values[i] ?? 0)),
  );
  const rawMax = Math.max(1, ...totals);
  const step = niceStep(rawMax);
  const max = Math.ceil(rawMax / step) * step;
  const gw = (W - pad.l - pad.r) / Math.max(1, n);
  const groups = stacked ? 1 : series.length;
  const bw = Math.max(4, Math.min(26, (gw * 0.62) / groups));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const id = useRef("h" + Math.random().toString(36).slice(2, 8)).current;

  return (
    <div className="relative" ref={box}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label={ariaLabel}>
        <defs>
          {series
            .filter((s) => s.hatched)
            .map((s, k) => (
              <pattern key={k} id={`${id}-${k}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                <rect width="6" height="6" fill={s.color} fillOpacity="0.35" />
                <rect width="3" height="6" fill={s.color} />
              </pattern>
            ))}
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e6efec" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="#8aa0a4">
              {short(t)}
            </text>
          </g>
        ))}
        {labels.map((label, i) => {
          const gx = pad.l + gw * i;
          const cx = gx + gw / 2;
          let acc = 0;
          let hatchIndex = -1;
          return (
            <g
              key={label + i}
              tabIndex={0}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${label}: ${series.map((s) => `${s.name} ${money0(s.values[i] ?? 0)}`).join(", ")}`}
              style={{ outline: "none" }}
            >
              <rect x={gx} y={pad.t} width={gw} height={H - pad.t - pad.b} fill={hover === i ? "#f1f7f5" : "transparent"} />
              {series.map((s, k) => {
                if (s.hatched) hatchIndex++;
                const v = s.values[i];
                if (v == null || v <= 0) return null;
                const fill = s.hatched ? `url(#${id}-${hatchIndex})` : s.color;
                if (stacked) {
                  const top = y(acc + v);
                  const h = y(acc) - top;
                  acc += v;
                  return <rect key={k} x={cx - bw / 2} y={top} width={bw} height={Math.max(0, h)} fill={fill} rx={2} />;
                }
                const x0 = cx - (bw * groups) / 2 - (groups - 1) + k * (bw + 2);
                return <rect key={k} x={x0} y={y(v)} width={bw} height={y(0) - y(v)} fill={fill} rx={3} />;
              })}
              <text x={cx} y={H - 7} textAnchor="middle" fontSize="11" fill="#5b7176">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-lg px-3 py-2 text-[12.5px] shadow-lg"
          style={{
            left: `clamp(0px, ${pad.l + gw * hover + gw / 2 - 95}px, ${W - 190}px)`,
            width: 190,
            background: "var(--ink)",
            color: "#fff",
          }}
        >
          <div className="mb-0.5 font-semibold capitalize">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.name} className="flex justify-between gap-3">
              <span style={{ color: "#9fc0b9" }}>{s.name}</span>
              <span>{money0(s.values[hover] ?? 0)}</span>
            </div>
          ))}
          {detail?.(hover)}
        </div>
      )}
    </div>
  );
}

function niceStep(max: number): number {
  const raw = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / pow;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * pow;
}

function short(v: number): string {
  if (v === 0) return "0";
  if (v >= 1000) return `${Number((v / 1000).toFixed(1)).toString().replace(".", ",")}k`;
  return String(Math.round(v));
}

export function Legend({ items }: { items: { color: string; label: string; hatched?: boolean }[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-3 text-[12.5px]" style={{ color: "var(--muted)" }}>
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{
              background: it.hatched ? `repeating-linear-gradient(-45deg, ${it.color} 0 2px, transparent 2px 4px)` : it.color,
              border: it.hatched ? `1px solid ${it.color}` : undefined,
            }}
            aria-hidden="true"
          />
          {it.label}
        </span>
      ))}
    </span>
  );
}
