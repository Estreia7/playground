import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sma,
  ema,
  rma,
  rsi,
  macd,
  atr,
  trueRange,
  swingPoints,
  percentileRank,
} from "../src/app/api/fx/engine/indicators.ts";
import type { Candle } from "../src/app/fx/types.ts";

/* The indicator numbers are the foundation everything else is scored against,
   so these tests pin them against values worked out by hand rather than
   against the implementation's own output. */

function closes(values: number[]): number[] {
  return values;
}

/** Build candles from closes, with a fixed range around each close. */
function candlesFrom(values: number[], spread = 0.001): Candle[] {
  return values.map((close, i) => [
    1_700_000_000 + i * 900,
    i === 0 ? close : values[i - 1],
    close + spread,
    close - spread,
    close,
  ]);
}

test("sma averages the trailing window and warms up with NaN", () => {
  const out = sma(closes([1, 2, 3, 4, 5]), 3);
  assert.ok(Number.isNaN(out[0]));
  assert.ok(Number.isNaN(out[1]));
  assert.equal(out[2], 2); // (1+2+3)/3
  assert.equal(out[3], 3);
  assert.equal(out[4], 4);
});

test("ema seeds from the sma then applies the smoothing constant", () => {
  const values = [1, 2, 3, 4, 5];
  const out = ema(values, 3);
  assert.ok(Number.isNaN(out[1]));
  assert.equal(out[2], 2); // seed = sma(1,2,3)
  // k = 2/(3+1) = 0.5 -> 4*0.5 + 2*0.5 = 3
  assert.equal(out[3], 3);
  assert.equal(out[4], 4); // 5*0.5 + 3*0.5
});

test("rma smooths with alpha 1/length", () => {
  const out = rma([1, 2, 3, 4, 5], 3);
  assert.equal(out[2], 2); // seed
  // (2*2 + 4)/3 = 2.6667
  assert.ok(Math.abs(out[3] - 8 / 3) < 1e-12);
});

test("rsi returns 100 for an unbroken rally and 0 for an unbroken fall", () => {
  const up = rsi(Array.from({ length: 30 }, (_, i) => 100 + i), 14);
  assert.equal(up[29], 100);

  const down = rsi(Array.from({ length: 30 }, (_, i) => 100 - i), 14);
  assert.equal(down[29], 0);
});

test("rsi warm-up ends exactly at index length", () => {
  const series = rsi([1, 3, 2, 5, 4, 7, 6, 9, 8, 11, 10, 13, 12, 15, 14, 17], 14);
  assert.ok(Number.isNaN(series[13]), "index 13 is still warming up");
  assert.ok(Number.isFinite(series[14]), "first RSI value lands at index 14");
});

test("rsi sits at 50 when average gains equal average losses", () => {
  // Alternating +1/-1 gives equal average gain and loss once smoothed.
  const values: number[] = [100];
  for (let i = 1; i < 60; i++) values.push(values[i - 1] + (i % 2 === 0 ? 1 : -1));
  const out = rsi(values, 14);
  assert.ok(Math.abs(out[59] - 50) < 6, "expected roughly 50, got " + out[59]);
});

test("macd line is the difference of the two emas and the histogram follows", () => {
  const values = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 5) * 5);
  const result = macd(values, 12, 26, 9);
  const fast = ema(values, 12);
  const slow = ema(values, 26);

  const i = 70;
  assert.ok(Math.abs(result.macd[i] - (fast[i] - slow[i])) < 1e-12);
  assert.ok(Math.abs(result.histogram[i] - (result.macd[i] - result.signal[i])) < 1e-12);
});

test("macd signal starts after the macd line, not at index zero", () => {
  const values = Array.from({ length: 60 }, (_, i) => 100 + i * 0.1);
  const result = macd(values, 12, 26, 9);
  // The line is valid from index 25; the signal needs 9 more.
  assert.ok(Number.isNaN(result.signal[30]), "signal must still be warming up at 30");
  assert.ok(Number.isFinite(result.signal[40]), "signal must be live by index 40");
});

test("true range accounts for gaps against the previous close", () => {
  const candles: Candle[] = [
    [0, 10, 11, 9, 10],
    // Gaps up: the range from the previous close is bigger than high-low.
    [900, 15, 16, 14, 15],
  ];
  const tr = trueRange(candles);
  assert.equal(tr[0], 2); // 11 - 9
  assert.equal(tr[1], 6); // |16 - 10|
});

test("atr on a constant-range series equals that range", () => {
  const candles: Candle[] = Array.from({ length: 30 }, (_, i) => [
    i * 900,
    100,
    101,
    99,
    100,
  ]);
  const out = atr(candles, 14);
  assert.ok(Math.abs(out[29] - 2) < 1e-9);
});

test("swingPoints finds the peak and the trough, not the shoulders", () => {
  const values = [5, 6, 7, 10, 7, 6, 5, 4, 1, 4, 5, 6, 7];
  const candles = candlesFrom(values, 0);
  const { highs, lows } = swingPoints(candles, 3);
  assert.deepEqual(highs, [3]);
  assert.deepEqual(lows, [8]);
});

test("percentileRank ignores NaN and reports position in the sample", () => {
  const series = [1, 2, Number.NaN, 3, 4];
  assert.equal(percentileRank(series, 2), 0.5); // 2 of 4 values are <= 2
  assert.equal(percentileRank(series, 4), 1);
});
