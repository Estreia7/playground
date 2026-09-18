import type { Candle } from "../../../fx/types.ts";
import { H, L, C } from "../../../fx/types.ts";

/* Indicator math, written out rather than pulled from a package.

   The point of this tool is that a number on screen can be traced to a rule,
   so the arithmetic lives here in full where a test can pin it. Every series
   returned is the same length as the input, padded at the front with NaN for
   the warm-up bars — index i of any output always lines up with candle i,
   which is what lets the similarity engine slice windows without bookkeeping.

   RSI and MACD follow TradingView's definitions (Wilder's RMA for RSI, EMA
   seeded with an SMA for MACD) so that a divergence we flag is one the user
   can see on their own chart. */

const NA = Number.NaN;

export function sma(values: number[], length: number): number[] {
  const out = new Array<number>(values.length).fill(NA);
  if (length <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= length) sum -= values[i - length];
    if (i >= length - 1) out[i] = sum / length;
  }
  return out;
}

/** EMA seeded with the SMA of the first `length` values, which is how
    TradingView and most charting packages start the series. */
export function ema(values: number[], length: number): number[] {
  const out = new Array<number>(values.length).fill(NA);
  if (length <= 0 || values.length < length) return out;
  const k = 2 / (length + 1);
  let seed = 0;
  for (let i = 0; i < length; i++) seed += values[i];
  let prev = seed / length;
  out[length - 1] = prev;
  for (let i = length; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's running moving average (alpha = 1/length). RSI and ATR both use
    it; it is an EMA with a different smoothing constant. */
export function rma(values: number[], length: number): number[] {
  const out = new Array<number>(values.length).fill(NA);
  if (length <= 0 || values.length < length) return out;
  let seed = 0;
  for (let i = 0; i < length; i++) seed += values[i];
  let prev = seed / length;
  out[length - 1] = prev;
  for (let i = length; i < values.length; i++) {
    prev = (prev * (length - 1) + values[i]) / length;
    out[i] = prev;
  }
  return out;
}

/** RSI over closes. First value lands at index `length`, matching TradingView
    (the first bar has no change to measure, so the warm-up is length+1 bars). */
export function rsi(closes: number[], length = 14): number[] {
  const out = new Array<number>(closes.length).fill(NA);
  if (closes.length <= length) return out;

  const gains = new Array<number>(closes.length).fill(0);
  const losses = new Array<number>(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains[i] = change > 0 ? change : 0;
    losses[i] = change < 0 ? -change : 0;
  }

  // Seed from bars 1..length; index 0 has no change and must not dilute it.
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= length; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= length;
  avgLoss /= length;
  out[length] = toRsi(avgGain, avgLoss);

  for (let i = length + 1; i < closes.length; i++) {
    avgGain = (avgGain * (length - 1) + gains[i]) / length;
    avgLoss = (avgLoss * (length - 1) + losses[i]) / length;
    out[i] = toRsi(avgGain, avgLoss);
  }
  return out;
}

function toRsi(avgGain: number, avgLoss: number): number {
  // A window with no losses is RSI 100 by definition; guarding the division
  // keeps Infinity out of the feature vectors.
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface MacdSeries {
  macd: number[];
  signal: number[];
  histogram: number[];
}

export function macd(closes: number[], fast = 12, slow = 26, signalLength = 9): MacdSeries {
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const line = closes.map((_, i) =>
    Number.isNaN(fastEma[i]) || Number.isNaN(slowEma[i]) ? NA : fastEma[i] - slowEma[i],
  );

  // The signal EMA must start where the MACD line starts, not at index 0,
  // otherwise the NaN warm-up poisons the average.
  const firstValid = line.findIndex((v) => !Number.isNaN(v));
  const signal = new Array<number>(closes.length).fill(NA);
  if (firstValid >= 0) {
    const tail = line.slice(firstValid);
    const tailSignal = ema(tail, signalLength);
    for (let i = 0; i < tailSignal.length; i++) signal[firstValid + i] = tailSignal[i];
  }

  const histogram = line.map((v, i) =>
    Number.isNaN(v) || Number.isNaN(signal[i]) ? NA : v - signal[i],
  );
  return { macd: line, signal, histogram };
}

/** True range of bar i against bar i-1. */
export function trueRange(candles: Candle[]): number[] {
  const out = new Array<number>(candles.length).fill(NA);
  if (candles.length === 0) return out;
  out[0] = candles[0][H] - candles[0][L];
  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1][C];
    const high = candles[i][H];
    const low = candles[i][L];
    out[i] = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
  }
  return out;
}

export function atr(candles: Candle[], length = 14): number[] {
  return rma(trueRange(candles), length);
}

/** Swing highs and lows: a bar whose high (low) is the most extreme within
    `span` bars either side.

    Ties are resolved towards the FIRST bar of a flat extreme rather than
    rejected. Double bottoms and flat tops are ordinary on a real chart, and a
    strict comparison would silently find no pivots at all on exactly the bars
    a trader cares most about. */
export function swingPoints(
  candles: Candle[],
  span = 3,
): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = span; i < candles.length - span; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - span; j <= i + span; j++) {
      if (j === i) continue;
      // Bars to the left must be strictly less extreme; bars to the right may
      // equal, so the first bar of a flat extreme is the pivot.
      const left = j < i;
      if (left ? candles[j][H] >= candles[i][H] : candles[j][H] > candles[i][H]) isHigh = false;
      if (left ? candles[j][L] <= candles[i][L] : candles[j][L] < candles[i][L]) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) highs.push(i);
    if (isLow) lows.push(i);
  }
  return { highs, lows };
}

/** Percentile rank (0..1) of `value` within `series`, ignoring NaN. Used to
    say "this ATR is in the 20th percentile", i.e. an unusually quiet market. */
export function percentileRank(series: number[], value: number): number {
  let below = 0;
  let total = 0;
  for (const v of series) {
    if (Number.isNaN(v)) continue;
    total++;
    if (v <= value) below++;
  }
  return total === 0 ? 0.5 : below / total;
}

export function lastValid(series: number[]): number {
  for (let i = series.length - 1; i >= 0; i--) {
    if (!Number.isNaN(series[i])) return series[i];
  }
  return NA;
}
