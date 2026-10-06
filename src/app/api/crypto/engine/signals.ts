import { rsi, sma, ema } from "../../fx/engine/indicators.ts";

/* Market signals for the overview table.

   Every label on that page comes from one of three rules, all on plain price
   history, so a reader can check any of them on their own chart:

   - Micro signal: RSI(14) on daily closes. Short-term stretch.
   - Macro signal: RSI(14) on weekly closes. The same reading on the slower
     clock, which is what decides whether a cycle is hot or cold.
   - BMS: the Bull Market Support Band, the space between the 20-week SMA
     and the 21-week EMA. Above it is a bull trend, below it a bear one.

   The greed levels are the average micro and macro RSI across the market,
   and the zone shares are how many coins sit in each RSI zone. */

export type Zone = "buy" | "buy-warning" | "neutral" | "sell-warning" | "sell";

export const ZONES: Zone[] = ["sell", "sell-warning", "buy-warning", "buy"];

/** RSI zone. Oversold reads as a buy, overbought as a sell; the warning
    bands either side of neutral are where a move is getting stretched. */
export function zoneOf(value: number): Zone {
  if (value <= 30) return "buy";
  if (value <= 40) return "buy-warning";
  if (value < 60) return "neutral";
  if (value < 70) return "sell-warning";
  return "sell";
}

export type BmsState = "strong-bull" | "mild-bull" | "in-band" | "mild-bear" | "strong-bear";

export interface Bms {
  state: BmsState;
  /** Distance from the nearest edge of the band, as a fraction (0.12 = 12%). */
  distance: number;
  /** The band edge that matters: support under a bull, resistance over a bear. */
  level: number;
  sma20w: number;
  ema21w: number;
}

/** How far outside the band counts as a strong trend rather than a mild one. */
export const BMS_STRONG = 0.25;

export function bmsOf(price: number, sma20w: number, ema21w: number): Bms {
  const upper = Math.max(sma20w, ema21w);
  const lower = Math.min(sma20w, ema21w);
  if (price > upper) {
    const distance = price / upper - 1;
    return { state: distance > BMS_STRONG ? "strong-bull" : "mild-bull", distance, level: upper, sma20w, ema21w };
  }
  if (price < lower) {
    const distance = price / lower - 1;
    return { state: -distance > BMS_STRONG ? "strong-bear" : "mild-bear", distance, level: lower, sma20w, ema21w };
  }
  return { state: "in-band", distance: 0, level: (upper + lower) / 2, sma20w, ema21w };
}

/** A daily bar: open time (unix seconds, UTC midnight) and close. */
export type DailyClose = [t: number, close: number];

const WEEK = 7 * 86400;
// 1970-01-01 was a Thursday; weeks here start on Monday like exchange weekly
// candles, and the Monday before it is three days earlier, so shift by three
// days before flooring.
const MONDAY_OFFSET = 3 * 86400;

/** Weekly closes from daily closes: the last close of each Monday-based UTC
    week. The current week is included as it stands, the way a live weekly
    candle is drawn. */
export function weeklyCloses(daily: DailyClose[]): number[] {
  const out: number[] = [];
  let week = Number.NaN;
  for (const [t, c] of daily) {
    const w = Math.floor((t + MONDAY_OFFSET) / WEEK);
    if (w === week) out[out.length - 1] = c;
    else {
      out.push(c);
      week = w;
    }
  }
  return out;
}

function last(values: number[]): number | null {
  const v = values[values.length - 1];
  return Number.isFinite(v) ? v : null;
}

export interface CoinSignals {
  micro: number | null;
  macro: number | null;
  bms: Bms | null;
}

/** Signals as of the last bar in `daily`. Anything without enough history
    comes back null rather than a number computed on a short warm-up. */
export function signalsOf(daily: DailyClose[]): CoinSignals {
  if (daily.length < 2) return { micro: null, macro: null, bms: null };
  const closes = daily.map((d) => d[1]);
  const weekly = weeklyCloses(daily);
  const micro = last(rsi(closes, 14));
  const macro = weekly.length > 20 ? last(rsi(weekly, 14)) : null;
  const s = last(sma(weekly, 20));
  const e = last(ema(weekly, 21));
  const bms = s !== null && e !== null ? bmsOf(closes[closes.length - 1], s, e) : null;
  return { micro, macro, bms };
}

export interface ZoneShare {
  zone: Zone;
  share: number;
}

/** Share of coins in each non-neutral zone, plus the average reading. */
export function marketSummary(values: (number | null)[]): { level: number | null; zones: ZoneShare[]; counted: number } {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x));
  if (!v.length) return { level: null, zones: ZONES.map((zone) => ({ zone, share: 0 })), counted: 0 };
  const level = v.reduce((a, b) => a + b, 0) / v.length;
  const zones = ZONES.map((zone) => ({ zone, share: v.filter((x) => zoneOf(x) === zone).length / v.length }));
  return { level, zones, counted: v.length };
}
