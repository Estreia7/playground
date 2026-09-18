import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregate,
  mergeCandles,
  largestGapBars,
} from "../src/app/api/fx/engine/aggregate.ts";
import type { Candle } from "../src/app/fx/types.ts";

/* Aggregation is how one 1-minute API call feeds all seven timeframes, so a
   mistake here silently corrupts every chart and every signal above 1m. */

const MIN = 60;
/** 2024-01-02 00:00:00 UTC — a Tuesday, so no week-open stub in the way. */
const TUESDAY = 1_704_153_600;

function minuteBars(startUnix: number, count: number, priceAt: (i: number) => number): Candle[] {
  return Array.from({ length: count }, (_, i) => {
    const p = priceAt(i);
    return [startUnix + i * MIN, p, p + 0.0005, p - 0.0005, p + 0.0002] as Candle;
  });
}

test("aggregate rolls five 1m bars into one 5m bar with the right ohlc", () => {
  const source = minuteBars(TUESDAY, 5, (i) => 1.1 + i * 0.001);
  const out = aggregate(source, "1m", "5m", { now: TUESDAY + 600 });

  assert.equal(out.length, 1);
  const bar = out[0];
  assert.equal(bar[0], TUESDAY, "bucket starts on the 5m boundary");
  assert.equal(bar[1], source[0][1], "open comes from the first bar");
  assert.equal(bar[4], source[4][4], "close comes from the last bar");
  assert.equal(bar[2], Math.max(...source.map((c) => c[2])), "high is the max");
  assert.equal(bar[3], Math.min(...source.map((c) => c[3])), "low is the min");
});

test("aggregate drops the still-forming bar unless asked for it", () => {
  // 7 minutes: one complete 5m bucket and two minutes of the next.
  const source = minuteBars(TUESDAY, 7, (i) => 1.1 + i * 0.001);
  const now = TUESDAY + 7 * MIN;

  const closed = aggregate(source, "1m", "5m", { now });
  assert.equal(closed.length, 1, "the partial bucket is not a closed bar");

  const withPartial = aggregate(source, "1m", "5m", { now, includePartial: true });
  assert.equal(withPartial.length, 2, "the live bar is available when requested");
});

test("aggregate skips empty buckets instead of inventing flat bars", () => {
  // Two minutes, then a two-hour hole, then two more minutes.
  const source: Candle[] = [
    ...minuteBars(TUESDAY, 2, () => 1.1),
    ...minuteBars(TUESDAY + 120 * MIN, 2, () => 1.2),
  ];
  const out = aggregate(source, "1m", "5m", { now: TUESDAY + 200 * MIN });

  assert.equal(out.length, 2, "only the buckets that had trade exist");
  assert.equal(out[0][0], TUESDAY);
  assert.equal(out[1][0], TUESDAY + 120 * MIN);
});

test("aggregate refuses to build a shorter bar from a longer one", () => {
  const source = minuteBars(TUESDAY, 10, () => 1.1);
  assert.throws(() => aggregate(source, "1h", "5m", { now: TUESDAY }), /Cannot aggregate/);
});

test("the Sunday stub is folded into Monday on the daily, keeping its open", () => {
  // Sunday 2024-01-07 22:00 UTC (week open) through Monday.
  const sundayOpen = Date.UTC(2024, 0, 7, 22, 0, 0) / 1000;
  const mondayOpen = Date.UTC(2024, 0, 8, 0, 0, 0) / 1000;

  const source: Candle[] = [
    // Two hours of Sunday evening, opening at 1.0900.
    ...Array.from({ length: 120 }, (_, i) => [sundayOpen + i * MIN, 1.09, 1.095, 1.089, 1.094] as Candle),
    // A full Monday, closing at 1.1000.
    ...Array.from({ length: 1440 }, (_, i) => [mondayOpen + i * MIN, 1.094, 1.101, 1.0885, 1.1] as Candle),
  ];

  const out = aggregate(source, "1m", "1d", { now: mondayOpen + 2000 * MIN });

  assert.equal(out.length, 1, "Sunday evening is part of Monday, not a day of its own");
  assert.equal(out[0][0], mondayOpen, "the merged bar carries Monday's timestamp");
  assert.equal(out[0][1], 1.09, "it keeps the open from Sunday evening");
  assert.equal(out[0][4], 1.1, "and Monday's close");
  assert.equal(out[0][3], 1.0885, "extremes span both parts");
});

test("mergeCandles replaces same-timestamp bars and honours the cap", () => {
  const existing: Candle[] = [
    [100, 1, 1, 1, 1],
    [200, 2, 2, 2, 2],
  ];
  // The live bar at 200 has moved on, and 300 is new.
  const incoming: Candle[] = [
    [200, 2, 9, 2, 5],
    [300, 3, 3, 3, 3],
  ];

  const merged = mergeCandles(existing, incoming, 10);
  assert.equal(merged.length, 3);
  assert.equal(merged[1][2], 9, "the updated bar wins");
  assert.deepEqual(merged.map((c) => c[0]), [100, 200, 300], "output stays ascending");

  const capped = mergeCandles(existing, incoming, 2);
  assert.deepEqual(capped.map((c) => c[0]), [200, 300], "the oldest bars fall off the front");
});

test("largestGapBars reports missing bars in bar units", () => {
  const candles: Candle[] = [
    [TUESDAY, 1, 1, 1, 1],
    [TUESDAY + MIN, 1, 1, 1, 1],
    // Four minutes missing.
    [TUESDAY + 6 * MIN, 1, 1, 1, 1],
  ];
  assert.equal(largestGapBars(candles, "1m"), 4);
});
