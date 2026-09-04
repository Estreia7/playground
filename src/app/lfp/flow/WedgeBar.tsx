"use client";

/* A stacked horizontal bar of the same streams MoneyFlow draws. Where the
   flow tells the story, this gives the proportions at a glance — and it is
   the piece that survives at any width, so it also anchors the mobile view.
   Hover state is shared with the flow through activeStreamId. */

import { motion, useReducedMotion } from "framer-motion";
import type { FlowStream } from "../types";

export function WedgeBar({
  streams,
  baseline,
  activeStreamId = null,
  onStreamHover,
  formatAmount,
}: {
  streams: FlowStream[];
  baseline: number;
  activeStreamId?: string | null;
  onStreamHover?: (id: string | null) => void;
  formatAmount: (n: number) => string;
}) {
  const reduced = useReducedMotion() ?? false;
  const visible = streams.filter((s) => s.amount > 0);
  if (baseline <= 0 || visible.length === 0) return null;

  return (
    <div>
      <div
        className="flex h-9 w-full overflow-hidden rounded-lg border border-[var(--lfp-line)]"
        role="img"
        aria-label={visible
          .map((s) => `${s.label} ${Math.round((s.amount / baseline) * 100)}%`)
          .join(", ")}
      >
        {visible.map((s) => {
          const share = s.amount / baseline;
          const dimmed = activeStreamId !== null && activeStreamId !== s.id;
          return (
            <motion.div
              key={s.id}
              onPointerEnter={() => onStreamHover?.(s.id)}
              onPointerLeave={() => onStreamHover?.(null)}
              initial={false}
              animate={{ flexGrow: share, opacity: dimmed ? 0.3 : 1 }}
              transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 18 }}
              style={{ background: `var(--lfp-tone-${s.tone})`, flexBasis: 0 }}
              className="relative min-w-[3px]"
              title={`${s.label}: ${formatAmount(s.amount)}`}
            >
              {share > 0.14 && (
                <span className="lfp-num absolute inset-0 flex items-center justify-center text-xs font-semibold text-[var(--lfp-cal-tile)]">
                  {Math.round(share * 100)}%
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {visible.map((s) => (
          <li
            key={s.id}
            onPointerEnter={() => onStreamHover?.(s.id)}
            onPointerLeave={() => onStreamHover?.(null)}
            className="flex items-center gap-1.5 text-xs"
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: `var(--lfp-tone-${s.tone})` }}
            />
            <span className="text-[var(--lfp-mist)]">{s.label}</span>
            <span className="lfp-num font-semibold">{formatAmount(s.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
