import type { Candle } from "../../../fx/types.ts";
import { T, O, H, L, C } from "../../../fx/types.ts";
import { timeframe, type TimeframeId } from "../../../fx/timeframes.ts";

/* Roll small bars up into big ones.

   The live feed costs one API credit per call, so we buy 1-minute bars and
   build every other timeframe from them here rather than paying seven times
   over. Buckets are floored in UTC. Empty buckets are skipped instead of being
   filled forward: the FX market closes at the weekend, and inventing flat bars
   across a two-day gap would hand the similarity engine patterns that never
   happened.

   The Sunday-evening stub is the one hand-placed rule. The week opens at
   17:00 New York, which is 21:00 or 22:00 UTC, so a UTC-floored daily bucket
   turns those two or three hours into their own "day". That stub is merged
   forward into Monday, which is where a trader would read it. */

export interface AggregateOptions {
  /** Drop the final bar when it is still forming. The scan only ever studies
      closed bars, but the chart wants to draw the live one. */
  includePartial?: boolean;
  /** `now` in unix seconds, for deciding whether the last bucket has closed.
      Injectable so tests are not clock-dependent. */
  now?: number;
}

export function aggregate(
  source: Candle[],
  sourceTf: TimeframeId,
  targetTf: TimeframeId,
  options: AggregateOptions = {},
): Candle[] {
  const srcSize = timeframe(sourceTf).seconds;
  const dstSize = timeframe(targetTf).seconds;
  if (dstSize < srcSize) {
    throw new Error(`Cannot aggregate ${sourceTf} up to the shorter ${targetTf}`);
  }
  if (dstSize % srcSize !== 0) {
    throw new Error(`${targetTf} is not a whole multiple of ${sourceTf}`);
  }
  if (source.length === 0) return [];

  const now = options.now ?? Math.floor(Date.now() / 1000);
  const out: Candle[] = [];
  let bucketStart = -1;
  let bar: Candle | null = null;

  for (const candle of source) {
    const start = Math.floor(candle[T] / dstSize) * dstSize;
    if (start !== bucketStart) {
      if (bar) out.push(bar);
      bucketStart = start;
      bar = [start, candle[O], candle[H], candle[L], candle[C]];
      continue;
    }
    // Same bucket: extend it.
    const b = bar as Candle;
    if (candle[H] > b[H]) b[H] = candle[H];
    if (candle[L] < b[L]) b[L] = candle[L];
    b[C] = candle[C];
  }
  if (bar) out.push(bar);

  const merged = mergeWeekOpenStub(out, targetTf);

  if (!options.includePartial && merged.length > 0) {
    const last = merged[merged.length - 1];
    if (last[T] + dstSize > now) merged.pop();
  }
  return merged;
}

/* Fold the Sunday stub forward.

   Only the daily bar is affected: a UTC-floored day boundary splits the week's
   opening hours (17:00 New York on Sunday) into a bar of their own. The 4h
   grid divides the day evenly, so its Sunday buckets are ordinary bars and are
   left alone. The stub keeps its open and its extremes, but takes Monday's
   timestamp and close. A stub with nothing after it is the live bar and stays. */
function mergeWeekOpenStub(bars: Candle[], tf: TimeframeId): Candle[] {
  if (tf !== "1d") return bars;
  const out: Candle[] = [];
  for (const bar of bars) {
    const prev = out[out.length - 1];
    const prevIsSundayStub = prev !== undefined && new Date(prev[T] * 1000).getUTCDay() === 0;
    if (prevIsSundayStub) {
      out[out.length - 1] = [
        bar[T],
        prev[O],
        Math.max(prev[H], bar[H]),
        Math.min(prev[L], bar[L]),
        bar[C],
      ];
      continue;
    }
    out.push(bar);
  }
  return out;
}

/** Merge new bars into an existing ascending series, replacing any bar with
    the same timestamp (the last bar of a live feed keeps changing until it
    closes) and keeping at most `maxBars`. */
export function mergeCandles(existing: Candle[], incoming: Candle[], maxBars: number): Candle[] {
  if (incoming.length === 0) return existing.slice(-maxBars);
  const byTime = new Map<number, Candle>();
  for (const c of existing) byTime.set(c[T], c);
  for (const c of incoming) byTime.set(c[T], c);
  const merged = [...byTime.values()].sort((a, b) => a[T] - b[T]);
  return merged.length > maxBars ? merged.slice(merged.length - maxBars) : merged;
}

/** Largest gap, in bars, between consecutive candles — a quick health check
    the Data tab surfaces so a half-downloaded backfill is visible. */
export function largestGapBars(candles: Candle[], tf: TimeframeId): number {
  const size = timeframe(tf).seconds;
  let worst = 0;
  for (let i = 1; i < candles.length; i++) {
    const gap = (candles[i][T] - candles[i - 1][T]) / size - 1;
    if (gap > worst) worst = gap;
  }
  return Math.round(worst);
}

export { T, O, H, L, C };
