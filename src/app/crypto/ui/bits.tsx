"use client";

import { useId } from "react";
import type { MarketRow, Zone } from "../lib/types.ts";
import { BMS_COLOR, BMS_LABEL, ZONE_COLOR, ZONE_LABEL, pctOf, price } from "../lib/format.ts";

/* Small shared pieces for the crypto pages. */

/** Semicircle gauge, 0–100. Fear on the left, greed on the right. */
export function Gauge({ value, label, size = 120 }: { value: number | null; label: string; size?: number }) {
  const id = useId();
  const r = 42;
  const cx = 50;
  const cy = 50;
  const v = value === null ? null : Math.max(0, Math.min(100, value));
  const angle = v === null ? -90 : -90 + (v / 100) * 180;
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <figure style={{ margin: 0, display: "grid", justifyItems: "center", gap: 6 }}>
      <svg
        width={size}
        height={size * 0.62}
        viewBox="0 0 100 62"
        role="img"
        aria-label={`${label}: ${v === null ? "no reading" : Math.round(v) + " of 100"}`}
      >
        <defs>
          <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#f23645" />
            <stop offset="0.5" stopColor="#f0b23a" />
            <stop offset="1" stopColor="#22ab94" />
          </linearGradient>
        </defs>
        <path d={arc} fill="none" stroke="#1f242c" strokeWidth="10" strokeLinecap="round" />
        <path d={arc} fill="none" stroke={`url(#${id})`} strokeWidth="10" strokeLinecap="round" opacity="0.9" />
        {v !== null && (
          <g
            style={{
              transform: `rotate(${angle}deg)`,
              transformOrigin: "50px 50px",
              transition: "transform 900ms cubic-bezier(.2,.8,.2,1)",
            }}
          >
            <line x1={cx} y1={cy} x2={cx} y2={cy - r + 4} stroke="#e8ebef" strokeWidth="2.4" strokeLinecap="round" />
          </g>
        )}
        <circle cx={cx} cy={cy} r="4" fill="#e8ebef" />
      </svg>
      <figcaption
        className="display"
        style={{
          marginTop: -4,
          padding: "2px 12px",
          borderRadius: 999,
          background: "var(--cx-raised)",
          border: "1px solid var(--cx-rule)",
          fontSize: 18,
          fontWeight: 600,
          minWidth: 52,
          textAlign: "center",
        }}
      >
        {v === null ? "—" : Math.round(v)}
      </figcaption>
    </figure>
  );
}

/** A signal cell: the zone name and where the RSI sits on 0–100. */
export function SignalCell({ value, zone }: { value: number | null; zone: Zone | null }) {
  if (value === null || !zone) return <span className="faint">—</span>;
  return (
    <div style={{ display: "grid", gap: 4, justifyItems: "start", minWidth: 88 }} title={`RSI ${value.toFixed(1)}`}>
      <span style={{ fontSize: 12, color: zone === "neutral" ? "var(--cx-muted)" : ZONE_COLOR[zone] }}>{ZONE_LABEL[zone]}</span>
      <span
        aria-hidden="true"
        style={{ position: "relative", width: 84, height: 5, borderRadius: 3, background: "var(--cx-raised)", overflow: "hidden" }}
      >
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${Math.max(4, Math.min(100, value))}%`,
            borderRadius: 3,
            background: ZONE_COLOR[zone],
          }}
        />
      </span>
    </div>
  );
}

export function BmsCell({ bms }: { bms: MarketRow["bms"] }) {
  if (!bms) return <span className="faint">—</span>;
  const c = BMS_COLOR[bms.state];
  const support = bms.state.endsWith("bull");
  return (
    <div style={{ display: "grid", gap: 3, justifyItems: "start" }}>
      <span className="cx-chip" style={{ background: c.bg, color: c.fg }}>
        {BMS_LABEL[bms.state]}
        {bms.state !== "in-band" && " " + pctOf(bms.distance)}
      </span>
      <span
        className="mono"
        style={{ fontSize: 12, color: "var(--cx-muted)" }}
        title={support ? "Bull Market Support Band — support below" : bms.state === "in-band" ? "Middle of the band" : "Bull Market Support Band — resistance above"}
      >
        {support ? "↓ " : bms.state === "in-band" ? "≈ " : "↑ "}
        {price(bms.level)}
      </span>
    </div>
  );
}

/** Last-day price line. Colour follows the day's direction, not the row. */
export function Sparkline({ values, width = 84, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <span className="faint">—</span>;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - lo) / span) * (height - 4)).toFixed(1)}`)
    .join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={up ? "var(--cx-up)" : "var(--cx-down)"} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function CoinIcon({ src, symbol, size = 20 }: { src: string; symbol: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote logos from CoinGecko's CDN, tiny and cached by the browser
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      style={{ borderRadius: "50%", flex: "none", background: "var(--cx-raised)" }}
      title={symbol}
    />
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="cx-panel" role="alert" style={{ padding: 16, color: "#ff9aa2", fontSize: 13 }}>
      {message}
    </div>
  );
}
