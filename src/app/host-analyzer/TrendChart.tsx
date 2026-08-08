"use client";

// Hand-rolled SVG trend visuals for the tracker's host_snapshots series —
// consistent with TargetRing (no chart library). Single-series only: identity
// comes from the surrounding card, so no legend; values wear text tokens and
// the stroke encodes direction (verdi gain / coral loss per the theme rule).

import { useMemo, useRef, useState } from "react";

export type TrendPoint = { ts: number; value: number };

function scale(points: TrendPoint[], w: number, h: number, pad: number) {
  const xs = points.map((p) => p.ts);
  const ys = points.map((p) => p.value);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const xr = x1 - x0 || 1;
  // Flat series still needs a visible mid-line, so give y a minimum span.
  const yr = Math.max(y1 - y0, 1);
  return {
    x: (t: number) => pad + ((t - x0) / xr) * (w - pad * 2),
    y: (v: number) => h - pad - ((v - y0) / yr) * (h - pad * 2),
    min: y0,
    max: y1,
  };
}

export function Sparkline({
  points,
  width = 120,
  height = 36,
  stroke = "var(--verdi)",
}: {
  points: TrendPoint[];
  width?: number;
  height?: number;
  stroke?: string;
}) {
  if (points.length < 2) return null;
  const s = scale(points, width, height, 4);
  const path = points.map((p) => `${s.x(p.ts).toFixed(1)},${s.y(p.value).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      className="shrink-0"
    >
      <polyline
        points={path}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={s.x(last.ts)} cy={s.y(last.value)} r="2.5" fill={stroke} />
    </svg>
  );
}

function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function TrendChart({
  points,
  height = 160,
  stroke = "var(--verdi)",
}: {
  points: TrendPoint[];
  height?: number;
  stroke?: string;
}) {
  const width = 640;
  const pad = 10;
  const ref = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const s = useMemo(() => scale(points, width, height, pad), [points, height]);

  if (points.length < 2) {
    return (
      <div className="flex h-24 items-center justify-center text-xs text-[var(--mist)]">
        Not enough snapshots yet — the evolution line appears after the next check.
      </div>
    );
  }

  const line = points.map((p) => `${s.x(p.ts).toFixed(1)},${s.y(p.value).toFixed(1)}`).join(" ");
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;
  const first = points[0];
  const last = points[points.length - 1];
  const hovered = hover != null ? points[hover] : null;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const t =
      first.ts + ((e.clientX - rect.left) / rect.width) * (last.ts - first.ts || 1);
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(p.ts - t);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  }

  const gradId = useMemo(() => `ha-trend-${Math.abs(first.ts + last.value) % 100000}`, [first, last]);

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full"
        role="img"
        aria-label={`Listing count from ${fmtDate(first.ts)} (${first.value}) to ${fmtDate(last.ts)} (${last.value})`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#${gradId})`} />
        <polyline
          points={line}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {hovered && (
          <>
            <line
              x1={s.x(hovered.ts)}
              x2={s.x(hovered.ts)}
              y1={pad}
              y2={height - pad}
              stroke="var(--tide)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={s.x(hovered.ts)} cy={s.y(hovered.value)} r="4" fill={stroke} />
          </>
        )}
        {!hovered && (
          <circle cx={s.x(last.ts)} cy={s.y(last.value)} r="3.5" fill={stroke} />
        )}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between px-1 text-[10px] text-[var(--mist)]">
        <span className="ha-mono">max {s.max}</span>
        <span className="ha-mono">min {s.min}</span>
      </div>
      <div className="flex justify-between px-1 text-[10px] text-[var(--mist)]">
        <span className="ha-mono">{fmtDate(first.ts)}</span>
        <span className="ha-mono">{fmtDate(last.ts)}</span>
      </div>
      {hovered && (
        <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 rounded-[8px] border border-[var(--tide)] bg-[var(--ink-deep)] px-2 py-1 text-[11px]">
          <span className="ha-mono font-semibold">{hovered.value} listings</span>
          <span className="ml-1.5 text-[var(--mist)]">{fmtDate(hovered.ts)}</span>
        </div>
      )}
    </div>
  );
}
