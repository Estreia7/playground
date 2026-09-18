import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAt } from "../src/app/api/fx/engine/candles.ts";
import { evaluateRules, DEFAULT_RULE_PARAMS } from "../src/app/api/fx/engine/rules.ts";
import { rsi, macd, atr, swingPoints } from "../src/app/api/fx/engine/indicators.ts";
import type { Candle } from "../src/app/fx/types.ts";

/* Pattern detectors are the easiest place in this codebase to write something
   that fires on everything or on nothing, so each test builds the textbook
   shape by hand and asserts on the name that comes back. */

const MIN15 = 900;
const START = 1_704_153_600;

/** Candles are sized against ATR, so the fixtures need enough history for the
    ATR to be live. Filler bars have a fixed 10-pip range. */
function withHistory(tail: Omit<Candle, 0>[] | Candle[]): { candles: Candle[]; index: number } {
  const filler: Candle[] = Array.from({ length: 20 }, (_, i) => [
    START + i * MIN15,
    1.1,
    1.1005,
    1.0995,
    1.1,
  ]);
  const candles: Candle[] = [...filler];
  for (const bar of tail as Candle[]) {
    candles.push([START + candles.length * MIN15, bar[1], bar[2], bar[3], bar[4]]);
  }
  return { candles, index: candles.length - 1 };
}

function ctxFor(candles: Candle[]) {
  return { atr: atr(candles, 14) };
}

function names(candles: Candle[], index: number): string[] {
  return detectAt(candles, index, ctxFor(candles)).map((e) => e.name);
}

test("bullish engulfing needs the body to swallow the previous down bar", () => {
  const { candles, index } = withHistory([
    [0, 1.1, 1.1005, 1.0985, 1.099], // down bar
    [0, 1.0988, 1.1015, 1.0985, 1.1012], // up bar engulfing it
  ]);
  assert.ok(names(candles, index).includes("Bullish engulfing"));
});

test("an up bar that fails to cover the previous body is not engulfing", () => {
  const { candles, index } = withHistory([
    [0, 1.1, 1.1005, 1.0985, 1.099],
    [0, 1.0992, 1.1, 1.099, 1.0996], // inside the previous body
  ]);
  assert.ok(!names(candles, index).includes("Bullish engulfing"));
});

test("bearish engulfing is the mirror image", () => {
  const { candles, index } = withHistory([
    [0, 1.099, 1.1005, 1.0988, 1.1002], // up bar
    [0, 1.1004, 1.1008, 1.0982, 1.0986], // down bar engulfing it
  ]);
  assert.ok(names(candles, index).includes("Bearish engulfing"));
});

test("a hammer is a long lower wick with a small body near the top", () => {
  const { candles, index } = withHistory([
    [0, 1.1, 1.1002, 1.0998, 1.1],
    [0, 1.1, 1.1002, 1.0975, 1.0999], // long lower wick
  ]);
  const found = names(candles, index);
  assert.ok(found.includes("Hammer"), "expected a hammer, got " + JSON.stringify(found));
});

test("a shooting star is the same shape pointing up", () => {
  const { candles, index } = withHistory([
    [0, 1.1, 1.1002, 1.0998, 1.1],
    [0, 1.1, 1.1025, 1.0998, 1.1001],
  ]);
  assert.ok(names(candles, index).includes("Shooting star"));
});

test("a doji is flagged neutral rather than directional", () => {
  const { candles, index } = withHistory([
    [0, 1.1, 1.1002, 1.0998, 1.1],
    [0, 1.1, 1.1012, 1.0988, 1.10001],
  ]);
  const evidence = detectAt(candles, index, ctxFor(candles));
  const doji = evidence.find((e) => e.name === "Doji");
  assert.ok(doji, "doji not detected");
  assert.equal(doji.direction, "neutral");
});

test("an inside bar takes its direction from the bar containing it", () => {
  const { candles, index } = withHistory([
    [0, 1.0985, 1.1015, 1.098, 1.101], // large up bar
    [0, 1.0995, 1.1005, 1.099, 1.1], // fully inside it
  ]);
  const evidence = detectAt(candles, index, ctxFor(candles));
  const inside = evidence.find((e) => e.name === "Inside bar");
  assert.ok(inside, "inside bar not detected");
  assert.equal(inside.direction, "long");
});

test("a morning star needs the third bar to recover half the first", () => {
  const { candles, index } = withHistory([
    [0, 1.101, 1.1012, 1.0985, 1.0988], // strong down bar
    [0, 1.0987, 1.0992, 1.0984, 1.0989], // small pause
    [0, 1.099, 1.1008, 1.0988, 1.1005], // strong recovery past the midpoint
  ]);
  assert.ok(names(candles, index).includes("Morning star"));
});

test("a flat bar produces no pattern at all", () => {
  const { candles, index } = withHistory([
    [0, 1.1, 1.1001, 1.0999, 1.1],
    [0, 1.1, 1.1001, 1.0999, 1.1],
  ]);
  assert.deepEqual(names(candles, index), []);
});

/* --- RSI and MACD rules -------------------------------------------------- */

/** A V shape: down hard, then up hard. RSI dives under 30 and crosses back. */
function vShape(): Candle[] {
  const values: number[] = [];
  for (let i = 0; i < 40; i++) values.push(1.12 - i * 0.0008);
  for (let i = 0; i < 12; i++) values.push(values[values.length - 1] + 0.0012);
  return values.map((close, i) => [
    START + i * MIN15,
    i === 0 ? close : values[i - 1],
    Math.max(close, i === 0 ? close : values[i - 1]) + 0.0002,
    Math.min(close, i === 0 ? close : values[i - 1]) - 0.0002,
    close,
  ]);
}

test("RSI leaving oversold is reported on the bar it crosses, not while it sits there", () => {
  const candles = vShape();
  const closes = candles.map((c) => c[4]);
  const rsiSeries = rsi(closes, 14);
  const macdSeries = macd(closes);

  // Find the bar where RSI actually crosses back above 30.
  let crossIndex = -1;
  for (let i = 1; i < rsiSeries.length; i++) {
    if (rsiSeries[i - 1] <= 30 && rsiSeries[i] > 30) {
      crossIndex = i;
      break;
    }
  }
  assert.ok(crossIndex > 0, "fixture never crossed back above 30");

  const atCross = evaluateRules({
    candles,
    rsi: rsiSeries,
    macd: macdSeries,
    index: crossIndex,
    params: DEFAULT_RULE_PARAMS,
  });
  assert.ok(
    atCross.some((e) => e.name.includes("crossed back above") && e.direction === "long"),
    "the cross bar should report the signal",
  );

  const afterCross = evaluateRules({
    candles,
    rsi: rsiSeries,
    macd: macdSeries,
    index: crossIndex + 2,
    params: DEFAULT_RULE_PARAMS,
  });
  assert.ok(
    !afterCross.some((e) => e.name.includes("crossed back above")),
    "two bars later it is no longer news",
  );
});

test("a MACD bullish cross below zero scores higher than one above zero", () => {
  const candles = vShape();
  const closes = candles.map((c) => c[4]);
  const macdSeries = macd(closes);
  const rsiSeries = rsi(closes, 14);

  let crossIndex = -1;
  for (let i = 1; i < closes.length; i++) {
    if (
      !Number.isNaN(macdSeries.macd[i]) &&
      macdSeries.macd[i - 1] <= macdSeries.signal[i - 1] &&
      macdSeries.macd[i] > macdSeries.signal[i]
    ) {
      crossIndex = i;
      break;
    }
  }
  assert.ok(crossIndex > 0, "fixture never produced a bullish MACD cross");

  const evidence = evaluateRules({
    candles,
    rsi: rsiSeries,
    macd: macdSeries,
    index: crossIndex,
    params: DEFAULT_RULE_PARAMS,
  });
  const cross = evidence.find((e) => e.name.includes("MACD crossed up"));
  assert.ok(cross, "bullish cross not reported");
  assert.equal(cross.direction, "long");
  // This fixture crosses while the line is still negative.
  assert.equal(cross.strength, 0.75);
});

test("a bullish RSI divergence is found when price makes a lower low and RSI does not", () => {
  /* Two legs down. The first is steep, which drives RSI to an extreme. The
     bounce is small, so the second leg still reaches a LOWER price low, but it
     falls gently enough that RSI bottoms out higher than it did the first
     time. That gap between price and momentum is the divergence. */
  const values: number[] = [];
  for (let i = 0; i < 30; i++) values.push(1.12 - i * 0.0012); // steep leg one
  for (let i = 0; i < 8; i++) values.push(values[values.length - 1] + 0.0006); // shallow bounce
  for (let i = 0; i < 26; i++) values.push(values[values.length - 1] - 0.0003); // gentle leg two, ends lower
  for (let i = 0; i < 6; i++) values.push(values[values.length - 1] + 0.0005); // turn up

  const candles: Candle[] = values.map((close, i) => {
    const open = i === 0 ? close : values[i - 1];
    return [
      START + i * MIN15,
      open,
      Math.max(open, close) + 0.0001,
      Math.min(open, close) - 0.0001,
      close,
    ];
  });

  const closes = candles.map((c) => c[4]);
  const rsiSeries = rsi(closes, 14);

  // The fixture only means anything if it really does make a lower low on a
  // higher RSI, so assert the premise before asserting the detection.
  const { lows } = swingPoints(candles, DEFAULT_RULE_PARAMS.swingSpan);
  const second = lows[lows.length - 1];
  const first = lows[lows.length - 2];
  assert.ok(
    candles[second][3] < candles[first][3],
    "fixture must make a lower price low",
  );
  assert.ok(rsiSeries[second] > rsiSeries[first], "fixture must make a higher RSI low");

  const evidence = evaluateRules({
    candles,
    rsi: rsiSeries,
    macd: macd(closes),
    index: candles.length - 1,
    params: DEFAULT_RULE_PARAMS,
  });

  assert.ok(
    evidence.some((e) => e.name === "Bullish RSI divergence"),
    "expected a bullish divergence, got " + JSON.stringify(evidence.map((e) => e.name)),
  );
});
