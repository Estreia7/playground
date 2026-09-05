"use client";

/* Horizontal bar list — HTML rows, not SVG.

   A ranked list of twenty countries is a list first and a chart second.
   Rendered as real DOM rows the labels stay 13px at any viewport, the rows
   wrap gracefully at 375px, and a screen reader gets one readable item per
   entry instead of a single opaque image. An earlier SVG version scaled its
   text down to ~4px on a phone, which defeated the page.

   The highlighted row (Portugal, in the comparisons) is drawn in cobalt and
   bold so it can be found in a list of twenty without reading every label.
   On a phone the label and value take the full width and the bar drops to a
   second row underneath — three columns at 375px left the bar no room at
   all. From `sm` up it is a single row: label, bar, value.

   Bars animate their width; with reduced motion they don't. */

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

  return (
    <figure className={className}>
      <figcaption className="sr-only">{ariaLabel}</figcaption>
      <ol className="space-y-1">
        {bars.map((b, i) => {
          const pctW = top > 0 ? (Math.max(0, b.value) / top) * 100 : 0;
          return (
            <li
              key={b.id}
              className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-md px-2 py-1.5 text-sm sm:grid-cols-[minmax(6rem,16rem)_minmax(0,1fr)_auto] sm:items-center sm:gap-y-0 sm:py-1 ${
                b.highlight ? "bg-[var(--lfp-cobalt-faint)]" : ""
              }`}
            >
              <span
                className={`order-1 truncate ${b.highlight ? "font-semibold text-[var(--lfp-cobalt-deep)]" : "text-[var(--lfp-mist)]"}`}
              >
                {b.label}
              </span>
              <span className="order-3 col-span-2 h-3 overflow-hidden rounded-sm sm:order-2 sm:col-span-1" aria-hidden="true">
                <motion.span
                  className="block h-full rounded-sm"
                  style={{ background: fill(b) }}
                  initial={reduced ? false : { width: 0 }}
                  animate={{ width: `${pctW}%` }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 120, damping: 20, delay: i * 0.02 }
                  }
                />
              </span>
              <span
                className={`lfp-num order-2 whitespace-nowrap text-right sm:order-3 ${b.highlight ? "font-semibold" : ""}`}
              >
                {formatValue(b.value)}
                {b.note && (
                  <span className="ml-1.5 text-[0.6875rem] text-[var(--lfp-mist)]">{b.note}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
