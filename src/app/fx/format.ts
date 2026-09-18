import { pair, type PairId } from "./pairs.ts";

/* Formatting helpers.

   Every number in this interface is a quantity someone might act on, so the
   rules are strict: prices carry their full precision, pips and money always
   carry an explicit sign, and nothing is rounded into ambiguity. */

export function price(value: number | null | undefined, pairId: PairId = "EURUSD"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(pair(pairId).digits);
}

/** Pips always carry a sign: "+4.2" and "-4.2" read differently at a glance,
    where "4.2" needs a colour to be understood. */
export function pips(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return sign + value.toFixed(decimals);
}

export function usd(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return sign + "$" + Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function money(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function pct(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return (value * 100).toFixed(decimals) + "%";
}

export function ratio(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(decimals);
}

/** UTC throughout. A trading tool that shows one timezone in the chart and
    another in the table is a tool that will eventually cost someone money. */
export function barTime(unixSec: number | null | undefined): string {
  if (!unixSec) return "—";
  const d = new Date(unixSec * 1000);
  return (
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }) +
    " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })
  );
}

export function dateOnly(unixSec: number | null | undefined): string {
  if (!unixSec) return "—";
  return new Date(unixSec * 1000).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "4 minutes ago" for freshness, which is the only thing relative time is
    good for here. */
export function ago(unixSec: number | null | undefined): string {
  if (!unixSec) return "never";
  const seconds = Math.floor(Date.now() / 1000) - unixSec;
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + (minutes === 1 ? " minute ago" : " minutes ago");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + (hours === 1 ? " hour ago" : " hours ago");
  const days = Math.floor(hours / 24);
  return days + (days === 1 ? " day ago" : " days ago");
}

export function duration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  if (minutes < 60) return Math.round(minutes) + "m";
  const hours = minutes / 60;
  if (hours < 24) return hours.toFixed(1) + "h";
  return (hours / 24).toFixed(1) + "d";
}

export function compact(value: number): string {
  return value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
}
