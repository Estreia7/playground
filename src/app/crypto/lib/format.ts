import type { BmsState, Zone } from "./types.ts";

/** Price with precision that suits its size: $86,172 · $1.5082 · $0.000012. */
export function price(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 5 : 8;
  const max = abs >= 1000 ? 2 : digits;
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: Math.min(2, max), maximumFractionDigits: max });
}

/** Compact dollars: $1.73T · $331.5B · $839.5M. */
export function compactUsd(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return "$" + compact(v);
}

export function compact(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + "K";
  return sign + abs.toFixed(abs < 10 ? 2 : 0);
}

/** Signed percent from a percent value (2.5 → "+2.5%"). */
export function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return (v > 0 ? "+" : "") + v.toFixed(digits) + "%";
}

/** Signed percent from a fraction (0.123 → "+12.3%"). */
export function pctOf(fraction: number, digits = 1): string {
  return pct(fraction * 100, digits);
}

export function multiple(v: number): string {
  if (v >= 100) return Math.round(v).toLocaleString("en-US") + "×";
  if (v >= 10) return v.toFixed(1) + "×";
  return v.toFixed(2) + "×";
}

export function date(t: number, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return new Date(t * 1000).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}

export function days(n: number): string {
  if (n >= 365) {
    const y = n / 365.25;
    return `${n.toLocaleString("en-US")} days · ${y.toFixed(1)} yr`;
  }
  return `${n} days`;
}

export function changeClass(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return "muted";
  return v > 0 ? "up" : "down";
}

export const ZONE_LABEL: Record<Zone, string> = {
  buy: "Buy",
  "buy-warning": "Buy Warning",
  neutral: "Neutral",
  "sell-warning": "Sell Warning",
  sell: "Sell",
};

export const ZONE_COLOR: Record<Zone, string> = {
  buy: "var(--z-buy)",
  "buy-warning": "var(--z-buy-warning)",
  neutral: "var(--z-neutral)",
  "sell-warning": "var(--z-sell-warning)",
  sell: "var(--z-sell)",
};

export const BMS_LABEL: Record<BmsState, string> = {
  "strong-bull": "Strong bull",
  "mild-bull": "Mild bull",
  "in-band": "In band",
  "mild-bear": "Mild bear",
  "strong-bear": "Strong bear",
};

export const BMS_COLOR: Record<BmsState, { bg: string; fg: string }> = {
  "strong-bull": { bg: "rgba(34,171,148,0.22)", fg: "#6fdcc8" },
  "mild-bull": { bg: "rgba(240,178,58,0.16)", fg: "#f3c66d" },
  "in-band": { bg: "rgba(107,115,128,0.22)", fg: "#b5bcc6" },
  "mild-bear": { bg: "rgba(242,120,60,0.18)", fg: "#f7a072" },
  "strong-bear": { bg: "rgba(242,54,69,0.2)", fg: "#ff8b95" },
};
