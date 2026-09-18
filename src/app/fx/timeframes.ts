/* Timeframe registry — the one place that knows how long a bar is.
   Everything else (aggregation, similarity horizons, the TradingView widget,
   candle-store caps) derives from this table, so adding a timeframe is a
   single entry rather than a hunt through switch statements. */

export type TimeframeId = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";

export interface Timeframe {
  id: TimeframeId;
  label: string;
  /** Bar duration in seconds. */
  seconds: number;
  /** `interval` value for the TradingView Advanced Chart widget. */
  tvInterval: string;
  /** `timeframe` value for dukascopy-node. */
  dukascopy: "m1" | "m5" | "m15" | "m30" | "h1" | "h4" | "d1";
  /** How many bars we keep on disk. Roughly: 1m 14d, 5m 6mo, 15m 2y, 30m 3y,
      1h 5y, 4h 10y, 1d 20y — sized so the similarity search has thousands of
      analogs without the JSON growing past a few tens of MB. */
  maxBars: number;
  /** Default forward horizon (bars) for the similarity outcome study. */
  horizon: number;
  /** Years of history the Backfill button requests by default. */
  backfillYears: number;
}

export const TIMEFRAMES: Timeframe[] = [
  { id: "1m", label: "1m", seconds: 60, tvInterval: "1", dukascopy: "m1", maxBars: 20_000, horizon: 30, backfillYears: 0.08 },
  { id: "5m", label: "5m", seconds: 300, tvInterval: "5", dukascopy: "m5", maxBars: 52_000, horizon: 24, backfillYears: 0.5 },
  { id: "15m", label: "15m", seconds: 900, tvInterval: "15", dukascopy: "m15", maxBars: 50_000, horizon: 16, backfillYears: 2 },
  { id: "30m", label: "30m", seconds: 1800, tvInterval: "30", dukascopy: "m30", maxBars: 38_000, horizon: 16, backfillYears: 3 },
  { id: "1h", label: "1h", seconds: 3600, tvInterval: "60", dukascopy: "h1", maxBars: 32_000, horizon: 12, backfillYears: 5 },
  { id: "4h", label: "4h", seconds: 14_400, tvInterval: "240", dukascopy: "h4", maxBars: 16_000, horizon: 12, backfillYears: 10 },
  { id: "1d", label: "D", seconds: 86_400, tvInterval: "D", dukascopy: "d1", maxBars: 6_000, horizon: 10, backfillYears: 20 },
];

const BY_ID = new Map(TIMEFRAMES.map((t) => [t.id, t]));

export function timeframe(id: TimeframeId): Timeframe {
  const tf = BY_ID.get(id);
  if (!tf) throw new Error(`Unknown timeframe: ${id}`);
  return tf;
}

export function isTimeframeId(value: unknown): value is TimeframeId {
  return typeof value === "string" && BY_ID.has(value as TimeframeId);
}

export const DEFAULT_TIMEFRAME: TimeframeId = "15m";

/** The two timeframes above `id`, used for higher-timeframe confluence.
    The daily has nothing above it, so it confirms against itself only. */
export function higherTimeframes(id: TimeframeId): TimeframeId[] {
  const index = TIMEFRAMES.findIndex((t) => t.id === id);
  return TIMEFRAMES.slice(index + 1, index + 3).map((t) => t.id);
}

/** Floor a unix-second timestamp to the start of its bar. UTC throughout:
    the daily bar therefore opens at 00:00 UTC, which is not where TradingView
    puts it (17:00 New York). Documented in the UI so the difference never
    reads as a bug. */
export function barStart(unixSec: number, tf: TimeframeId): number {
  const size = timeframe(tf).seconds;
  return Math.floor(unixSec / size) * size;
}
