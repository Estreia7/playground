"use client";

import { useEffect, useRef, useState } from "react";
import type { ConsultantStats } from "../core/analytics.ts";
import { percent } from "./format.ts";

/* Small pieces shared by Análises and the consultant page: the KPI tile
   that counts up, the split bar, and a few ways of writing figures. */

export function dealSplit(s: ConsultantStats): string {
  const parts = [`${s.fullDeals} plenos`, `${s.sharedExternal + s.sharedTeam} partilhas`];
  if (s.bank) parts.push(`${s.bank} bancário${s.bank > 1 ? "s" : ""}`);
  return parts.join(" · ");
}

/** Counts a figure up from where it was, so a new consultant reads as a change. */
export function useCountUp(target: number | undefined, ms = 700): number | undefined {
  const [shown, setShown] = useState(target == null ? undefined : 0);
  const from = useRef(0);
  useEffect(() => {
    if (target == null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const v = origin + (target - origin) * (1 - Math.pow(1 - t, 3));
      from.current = v;
      setShown(v);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return shown;
}

export function Kpi({
  label,
  value,
  count,
  format,
  hero = false,
  tone,
  children,
}: {
  label: string;
  value: string;
  count?: number;
  format?: (n: number) => string;
  hero?: boolean;
  tone?: "up" | "down";
  children?: React.ReactNode;
}) {
  const tweened = useCountUp(count);
  if (tweened != null && format && tweened !== count) value = format(tweened);
  return (
    <div className={`rs-card rs-kpi ${hero ? "hero" : ""}`}>
      <span className="label">{label}</span>
      <span className="value num" style={tone ? { color: tone === "up" ? "#2f7a57" : "var(--amber)" } : undefined}>
        {value}
      </span>
      {children}
    </div>
  );
}

/** One horizontal bar split by parts, with a legend of counts underneath.
 *  `apart` is counted on its own line, outside the bar and the percentages. */
export function Mix({ parts, apart }: { parts: { label: string; value: number; color: string }[]; apart?: { label: string; value: number } }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const extra = apart && apart.value > 0 && (
    <p className="rs-mix-apart">
      <span>{apart.label}</span>
      <span className="num font-semibold">{apart.value}</span>
    </p>
  );
  if (!total) return extra || <p className="rs-empty m-0">Sem negócios.</p>;
  return (
    <div>
      <div className="flex h-3.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(", ")}>
        {parts
          .filter((p) => p.value)
          .map((p) => (
            <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
          ))}
      </div>
      <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 flex-none rounded-sm" style={{ background: p.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{p.label}</span>
            <span className="num font-semibold">{p.value}</span>
            <span className="num w-12 text-right" style={{ color: "var(--muted)" }}>
              {percent((p.value / total) * 100, 0)}
            </span>
          </li>
        ))}
      </ul>
      {extra}
    </div>
  );
}

export function signed(g: number): string {
  return (g >= 0 ? "+" : "") + percent(g * 100, 1);
}

export function tenure(joined: string): string {
  const months = Math.max(0, Math.round((Date.now() - new Date(joined).getTime()) / (30.44 * 86400000)));
  if (months < 12) return `${months} ${months === 1 ? "mês" : "meses"}`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return `${y} ${y === 1 ? "ano" : "anos"}${m ? ` e ${m} ${m === 1 ? "mês" : "meses"}` : ""}`;
}
