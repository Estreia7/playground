import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findAnalogs,
  featuresAt,
  statsFor,
  DEFAULT_SIMILARITY_PARAMS,
} from "../src/app/api/fx/engine/similarity.ts";
import { rsi, macd, atr } from "../src/app/api/fx/engine/indicators.ts";
import type { Candle, AnalogStats } from "../src/app/fx/types.ts";

/* The similarity engine is the core claim of this tool: "when the market
   looked like this before, here is what happened next". These tests pin the
   properties that make that claim honest — no peeking at the future, no
   counting one afternoon twenty times, and no pretending a 52% win rate is an
   edge when the market rose 52% of the time anyway. */

const MIN15 = 900;
const START = 1_704_153_600;
const PIP = 0.0001;

/** A deterministic pseudo-random walk with a repeating shape, so analogs exist
    without the test depending on Math.random. */
function syntheticSeries(length: number): Candle[] {
  const closes: number[] = [];
  let price = 1.1;
  for (let i = 0; i < length; i++) {
    // Two overlapping cycles plus a slow drift: enough structure for windows
    // to genuinely resemble one another, without being exactly periodic.
    price += Math.sin(i / 7) * 0.00035 + Math.sin(i / 23) * 0.0002 + 0.0000015;
    closes.push(price);
  }
  return closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1];
    return [
      START + i * MIN15,
      open,
      Math.max(open, close) + 0.00012,
      Math.min(open, close) - 0.00012,
      close,
    ] as Candle;
  });
}

function inputFor(candles: Candle[], index: number, overrides = {}) {
  const closes = candles.map((c) => c[4]);
  return {
    candles,
    rsi: rsi(closes, 14),
    macd: macd(closes),
    atr: atr(candles, 14),
    index,
    pipSize: PIP,
    params: { ...DEFAULT_SIMILARITY_PARAMS, ...overrides },
  };
}

test("a window compared with itself has zero distance", () => {
  const candles = syntheticSeries(300);
  const closes = candles.map((c) => c[4]);
  const common = {
    candles,
    rsi: rsi(closes, 14),
    macd: macd(closes),
    atr: atr(candles, 14),
    pipSize: PIP,
    window: 24,
  };

  const a = featuresAt({ ...common, index: 200 });
  const b = featuresAt({ ...common, index: 200 });
  assert.ok(a && b);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  assert.equal(sum, 0);
});

test("features are null while the indicators are still warming up", () => {
  const candles = syntheticSeries(300);
  const closes = candles.map((c) => c[4]);
  const result = featuresAt({
    candles,
    rsi: rsi(closes, 14),
    macd: macd(closes),
    atr: atr(candles, 14),
    index: 20, // MACD needs ~34 bars before it produces a histogram
    pipSize: PIP,
    window: 24,
  });
  assert.equal(result, null);
});

test("price level does not affect the match: the same shape 10 big figures away still matches", () => {
  const base = syntheticSeries(400);
  // Shift the whole series up by 0.10 and confirm the feature vector is
  // unchanged, because the shape is mean-centred.
  const shifted: Candle[] = base.map((c) => [c[0], c[1] + 0.1, c[2] + 0.1, c[3] + 0.1, c[4] + 0.1]);

  const featuresOf = (candles: Candle[]) => {
    const closes = candles.map((c) => c[4]);
    return featuresAt({
      candles,
      rsi: rsi(closes, 14),
      macd: macd(closes),
      atr: atr(candles, 14),
      index: 300,
      pipSize: PIP,
      window: 24,
    });
  };

  const a = featuresOf(base);
  const b = featuresOf(shifted);
  assert.ok(a && b);
  for (let i = 0; i < a.length; i++) {
    assert.ok(Math.abs(a[i] - b[i]) < 1e-9, "feature " + i + " drifted with price level");
  }
});

test("no analog is allowed to overlap the present or to have an unfinished future", () => {
  const candles = syntheticSeries(600);
  const index = 500;
  const params = { ...DEFAULT_SIMILARITY_PARAMS, topK: 40 };
  const { analogs } = findAnalogs(inputFor(candles, index, params));

  assert.ok(analogs.length > 0, "fixture produced no analogs at all");

  const latestAllowed = candles[index - params.window - params.horizon][0];
  for (const analog of analogs) {
    assert.ok(
      analog.barTime <= latestAllowed,
      "an analog reached into the present or had an unfinished forward window",
    );
  }
});

test("overlapping matches are suppressed so one afternoon counts once", () => {
  const candles = syntheticSeries(600);
  const params = { ...DEFAULT_SIMILARITY_PARAMS, minSeparation: 12, topK: 40 };
  const { analogs } = findAnalogs(inputFor(candles, 500, params));

  const times = analogs.map((a) => a.barTime).sort((x, y) => x - y);
  for (let i = 1; i < times.length; i++) {
    const barsApart = (times[i] - times[i - 1]) / MIN15;
    assert.ok(
      barsApart >= params.minSeparation,
      "two analogs sat " + barsApart + " bars apart, closer than the minimum separation",
    );
  }
});

test("topK caps how many analogs come back", () => {
  const candles = syntheticSeries(900);
  const { analogs } = findAnalogs(
    inputFor(candles, 800, { topK: 5, minSeparation: 4, maxDistance: 10 }),
  );
  assert.ok(analogs.length <= 5);
});

test("a tight distance threshold returns fewer analogs than a loose one", () => {
  const candles = syntheticSeries(600);
  const loose = findAnalogs(inputFor(candles, 500, { maxDistance: 10, minSeparation: 4 }));
  const tight = findAnalogs(inputFor(candles, 500, { maxDistance: 0.05, minSeparation: 4 }));
  assert.ok(
    tight.analogs.length < loose.analogs.length,
    "the threshold had no effect on the result",
  );
});

test("stats report the sample, the baseline and the spread of outcomes", () => {
  const candles = syntheticSeries(700);
  const { analogs, stats } = findAnalogs(inputFor(candles, 600, { minSeparation: 6 }));

  assert.ok(stats, "no stats returned");
  assert.equal(stats.count, analogs.length);
  assert.ok(stats.winRate >= 0 && stats.winRate <= 1);
  assert.ok(stats.baselineWinRate > 0 && stats.baselineWinRate < 1);
  assert.ok(stats.bestPips >= stats.worstPips);
  assert.ok(stats.avgMfePips >= 0, "favourable excursion should not be negative for a long");
  assert.ok(stats.avgMaePips <= 0, "adverse excursion should not be positive for a long");

  const bucketTotal = stats.histogram.reduce((sum, b) => sum + b.count, 0);
  assert.equal(bucketTotal, analogs.length, "every analog belongs to exactly one bucket");
});

test("an empty history yields no analogs rather than throwing", () => {
  const candles = syntheticSeries(30); // far too short for a 24-bar window plus warm-up
  const { analogs, stats } = findAnalogs(inputFor(candles, 29));
  assert.deepEqual(analogs, []);
  assert.equal(stats, null);
});

test("statsFor mirrors a long study onto a short setup", () => {
  const long: AnalogStats = {
    count: 20,
    winRate: 0.7,
    avgPips: 8,
    medianPips: 6,
    bestPips: 30,
    worstPips: -12,
    avgMfePips: 14,
    avgMaePips: -5,
    baselineWinRate: 0.52,
    histogram: [
      { from: -12, to: 0, count: 6 },
      { from: 0, to: 30, count: 14 },
    ],
  };

  const short = statsFor(long, "short");
  assert.ok(Math.abs(short.winRate - 0.3) < 1e-12, "a 70% long win rate is a 30% short win rate");
  assert.equal(short.avgPips, -8);
  assert.equal(short.bestPips, 12, "the long's worst case is the short's best");
  assert.equal(short.worstPips, -30);
  assert.equal(short.avgMfePips, 5, "excursions swap sides");
  assert.equal(short.avgMaePips, -14);
  assert.deepEqual(
    short.histogram.map((b) => b.count),
    [14, 6],
    "buckets reverse with the sign flip",
  );
  // The long study is untouched.
  assert.equal(long.winRate, 0.7);
});

test("statsFor leaves a long study alone", () => {
  const stats: AnalogStats = {
    count: 3,
    winRate: 0.6,
    avgPips: 2,
    medianPips: 2,
    bestPips: 5,
    worstPips: -1,
    avgMfePips: 4,
    avgMaePips: -2,
    baselineWinRate: 0.5,
    histogram: [],
  };
  assert.deepEqual(statsFor(stats, "long"), stats);
});
