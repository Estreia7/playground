"use client";

/* Hand-rolled horizontal bar chart. One row per item: label, bar, value.
   The highlighted row (Portugal, in the country comparisons) is drawn in
   cobalt and bold so it can be found in a list of twenty without reading
   every label. Bars animate their width; with reduced motion they don't. */

import { motion, useReducedMotion } from "framer-motion";
import type { FlowTone } from "../types";

export interface Bar {
  id: string;
  label: string;
  value: number;
  /** Small text after the value, e.g. the data year. */
  note?: string;
  tone?: FlowTone | "cobalt" | "mist";
  highlight?: boolean;
}

const W = 960;
const ROW = 30;
const LABEL_W = 190;
const VALUE_W = 150;
const PAD_Y = 6;

function fill(b: Bar) {
  if (b.highlight) return "var(--lfp-cobalt)";
  if (!b.tone || b.tone === "mist") return "var(--lfp-line-strong)";
  if (b.tone === "cobalt") return "var(--lfp-cobalt)";
  return `var(--lfp-tone-${b.tone})`;
}

export function BarChart({
  bars,
  formatValue,
  ariaLabel,
  max,
  className,
}: {
  bars: Bar[];
  formatValue: (v: number) => string;
  ariaLabel: string;
  /** Scale ceiling; defaults to the largest bar. */
  max?: number;
  className?: string;
}) {
  const reduced = useReducedMotion() ?? false;
  if (bars.length === 0) return null;

  const top = max ?? Math.max(...bars.map((b) => b.value));
  const barW = W - LABEL_W - VALUE_W - 16;
  const H = bars.length * ROW + PAD_Y * 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`block w-full ${className ?? ""}`} role="img" aria-label={ariaLabel}>
      {bars.map((b, i) => {
        const y = PAD_Y + i * ROW;
        const w = top > 0 ? (Math.max(0, b.value) / top) * barW : 0;
        const bold = b.highlight ? 600 : 400;
        return (
          <g key={b.id}>
            {b.highlight && (
              <rect x={0} y={y} width={W} height={ROW} fill="var(--lfp-cobalt-faint)" rx={6} />
            )}
            <text
              x={LABEL_W - 10}
              y={y + ROW / 2 + 4}
              textAnchor="end"
              fontSize={13}
              fontWeight={bold}
              fill={b.highlight ? "var(--lfp-cobalt-deep)" : "var(--lfp-mist)"}
            >
              {b.label}
            </text>
            <motion.rect
              x={LABEL_W}
              y={y + 7}
              height={ROW - 14}
              rx={4}
              fill={fill(b)}
              initial={reduced ? false : { width: 0 }}
              animate={{ width: w }}
              transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 20, delay: i * 0.02 }}
            />
            <text
              className="lfp-num"
              x={LABEL_W + barW + 12}
              y={y + ROW / 2 + 4}
              fontSize={13}
              fontWeight={bold}
              fill={b.highlight ? "var(--lfp-cobalt-deep)" : "var(--lfp-cobalt-deep)"}
            >
              {formatValue(b.value)}
              {b.note && (
                <tspan fontSize={10} fill="var(--lfp-mist)" dx={6}>
                  {b.note}
                </tspan>
              )}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
