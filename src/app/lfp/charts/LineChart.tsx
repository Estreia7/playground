"use client";

/* Hand-rolled SVG line chart — no chart library, per repo convention.
   Fixed viewBox scaled by CSS, quiet gridlines, tabular axis labels, an
   optional highlighted point with its value. With reduced motion the draw-in
   is skipped and the line is simply there. Callers render the same data as
   text alongside; this is role="img" with a summary, not the only copy. */

import { motion, useReducedMotion } from "framer-motion";
import type { FlowTone } from "../types";

export interface LineSeries {
  id: string;
  label: string;
  tone: FlowTone | "cobalt";
  points: Array<{ x: number; y: number }>;
  /** Dashed, for a reference line such as "what you paid in". */
  dashed?: boolean;
}

const W = 960;
const H = 320;
const PAD = { top: 20, right: 24, bottom: 40, left: 72 };

function toneVar(t: LineSeries["tone"]) {
  return t === "cobalt" ? "var(--lfp-cobalt)" : `var(--lfp-tone-${t})`;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (max <= min) return [min];
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export function LineChart({
  series,
  formatX,
  formatY,
  ariaLabel,
  highlightX,
  yMin,
  className,
}: {
  series: LineSeries[];
  formatX: (x: number) => string;
  formatY: (y: number) => string;
  ariaLabel: string;
  highlightX?: number;
  /** Force the y axis floor (usually 0 for money). */
  yMin?: number;
  className?: string;
}) {
  const reduced = useReducedMotion() ?? false;
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;

  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const yLo = yMin ?? Math.min(...ys);
  const yHi = Math.max(...ys);
  const yPad = (yHi - yLo) * 0.06 || 1;
  const y0 = yMin !== undefined ? yMin : yLo - yPad;
  const y1 = yHi + yPad;

  const sx = (x: number) => PAD.left + ((x - x0) / (x1 - x0 || 1)) * (W - PAD.left - PAD.right);
  const sy = (y: number) => H - PAD.bottom - ((y - y0) / (y1 - y0 || 1)) * (H - PAD.top - PAD.bottom);

  const yTicks = niceTicks(y0, y1, 5);
  const xTickCount = Math.min(6, all.length);
  const xTicks = Array.from({ length: xTickCount }, (_, i) =>
    Math.round(x0 + ((x1 - x0) * i) / Math.max(1, xTickCount - 1))
  );

  const path = (pts: LineSeries["points"]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" ");

  const primary = series[0];
  const hl =
    highlightX !== undefined
      ? primary.points.reduce((best, p) =>
          Math.abs(p.x - highlightX) < Math.abs(best.x - highlightX) ? p : best
        )
      : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`block w-full ${className ?? ""}`} role="img" aria-label={ariaLabel}>
      {/* gridlines + y labels */}
      <g className="lfp-num" fontSize={11} fill="var(--lfp-mist)">
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={sy(t)}
              y2={sy(t)}
              stroke="var(--lfp-line)"
              strokeWidth={1}
            />
            <text x={PAD.left - 8} y={sy(t) + 4} textAnchor="end">
              {formatY(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={sx(t)} y={H - PAD.bottom + 18} textAnchor="middle">
            {formatX(t)}
          </text>
        ))}
      </g>

      {/* series. A dashed reference line is a plain <path>: framer's
          pathLength draw-in writes its own stroke-dasharray, which would
          silently turn the dashes solid. */}
      {series.map((s, i) =>
        s.dashed ? (
          <path
            key={s.id}
            d={path(s.points)}
            fill="none"
            stroke={toneVar(s.tone)}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray="6 6"
          />
        ) : (
          <motion.path
            key={s.id}
            d={path(s.points)}
            fill="none"
            stroke={toneVar(s.tone)}
            strokeWidth={i === 0 ? 3 : 2}
            strokeLinejoin="round"
            strokeLinecap="round"
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={reduced ? { duration: 0 } : { duration: 0.9, ease: "easeOut" }}
          />
        )
      )}

      {/* highlight */}
      {hl && (
        <g className="lfp-num" aria-hidden="true">
          <line
            x1={sx(hl.x)}
            x2={sx(hl.x)}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke="var(--lfp-cobalt)"
            strokeWidth={1}
            strokeDasharray="3 5"
            opacity={0.5}
          />
          <circle cx={sx(hl.x)} cy={sy(hl.y)} r={5} fill={toneVar(primary.tone)} stroke="var(--lfp-cal-tile)" strokeWidth={2} />
          {(() => {
            const label = formatY(hl.y);
            const w = label.length * 7.2 + 14;
            const cx = Math.min(W - PAD.right - w / 2, Math.max(PAD.left + w / 2, sx(hl.x)));
            const cy = Math.max(PAD.top + 12, sy(hl.y) - 18);
            return (
              <>
                <rect x={cx - w / 2} y={cy - 11} width={w} height={22} rx={11} fill="var(--lfp-cal-tile)" stroke="var(--lfp-line)" />
                <text x={cx} y={cy + 4} textAnchor="middle" fontSize={12} fontWeight={600} fill={toneVar(primary.tone)}>
                  {label}
                </text>
              </>
            );
          })()}
        </g>
      )}
    </svg>
  );
}
