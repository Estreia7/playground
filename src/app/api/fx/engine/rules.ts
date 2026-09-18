import type { Candle, Evidence } from "../../../fx/types.ts";
import { T, H, L } from "../../../fx/types.ts";
import { swingPoints, type MacdSeries } from "./indicators.ts";

/* Rule-based signals from RSI and MACD.

   Two families live here. Crosses are events: RSI leaving oversold, MACD
   cutting its signal line, the histogram flipping sign. Divergences are
   relationships: price made a higher high while the oscillator made a lower
   one, which says the push had less behind it than the one before.

   Crosses are detected on the trigger bar only, because a cross that happened
   six bars ago is not news. Divergences look back over a window, because that
   is the only way they exist. */

export interface RuleParams {
  rsiLength: number;
  rsiOversold: number;
  rsiOverbought: number;
  /** How far back divergences may reach, in bars. */
  divergenceLookback: number;
  /** Bars either side of a pivot for it to count as a swing. */
  swingSpan: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
}

export const DEFAULT_RULE_PARAMS: RuleParams = {
  rsiLength: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
  divergenceLookback: 60,
  swingSpan: 3,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
};

export interface RuleInput {
  candles: Candle[];
  rsi: number[];
  macd: MacdSeries;
  /** Index of the bar being judged — always the last closed bar in a scan. */
  index: number;
  params: RuleParams;
}

export function evaluateRules(input: RuleInput): Evidence[] {
  const { candles, index } = input;
  if (index < 2 || index >= candles.length) return [];
  const out: Evidence[] = [];
  out.push(...rsiRules(input));
  out.push(...macdRules(input));
  out.push(...divergences(input));
  return out;
}

function rsiRules({ candles, rsi, index, params }: RuleInput): Evidence[] {
  const out: Evidence[] = [];
  const now = rsi[index];
  const prev = rsi[index - 1];
  const time = candles[index][T];
  if (Number.isNaN(now) || Number.isNaN(prev)) return out;

  // Leaving oversold is the signal, not being oversold. A market can sit at
  // RSI 22 for twenty bars while it keeps falling; the turn is the cross back.
  if (prev <= params.rsiOversold && now > params.rsiOversold) {
    out.push({
      kind: "rsi",
      name: "RSI crossed back above " + params.rsiOversold,
      direction: "long",
      barTime: time,
      strength: 0.7,
      detail: "RSI turned up out of oversold (" + prev.toFixed(1) + " to " + now.toFixed(1) + ").",
    });
  }
  if (prev >= params.rsiOverbought && now < params.rsiOverbought) {
    out.push({
      kind: "rsi",
      name: "RSI crossed back below " + params.rsiOverbought,
      direction: "short",
      barTime: time,
      strength: 0.7,
      detail: "RSI turned down out of overbought (" + prev.toFixed(1) + " to " + now.toFixed(1) + ").",
    });
  }
  // The 50 line as a trend filter: crossing it is a weaker, more frequent cue.
  if (prev < 50 && now >= 50) {
    out.push({
      kind: "rsi",
      name: "RSI crossed above 50",
      direction: "long",
      barTime: time,
      strength: 0.35,
      detail: "Momentum tipped to the upside on the RSI midline.",
    });
  }
  if (prev > 50 && now <= 50) {
    out.push({
      kind: "rsi",
      name: "RSI crossed below 50",
      direction: "short",
      barTime: time,
      strength: 0.35,
      detail: "Momentum tipped to the downside on the RSI midline.",
    });
  }
  return out;
}

function macdRules({ candles, macd, index }: RuleInput): Evidence[] {
  const out: Evidence[] = [];
  const time = candles[index][T];
  const line = macd.macd[index];
  const prevLine = macd.macd[index - 1];
  const signal = macd.signal[index];
  const prevSignal = macd.signal[index - 1];
  const hist = macd.histogram[index];
  const prevHist = macd.histogram[index - 1];

  const linesReady =
    !Number.isNaN(line) && !Number.isNaN(prevLine) && !Number.isNaN(signal) && !Number.isNaN(prevSignal);

  if (linesReady) {
    if (prevLine <= prevSignal && line > signal) {
      out.push({
        kind: "macd",
        name: "MACD crossed up through its signal",
        direction: "long",
        barTime: time,
        // A cross below zero is where reversals start; above zero it only
        // confirms a trend that is already running, so it counts for less.
        strength: line < 0 ? 0.75 : 0.55,
        detail:
          line < 0
            ? "A bullish cross below the zero line, where reversals usually start."
            : "A bullish cross above zero, continuing an existing uptrend.",
      });
    }
    if (prevLine >= prevSignal && line < signal) {
      out.push({
        kind: "macd",
        name: "MACD crossed down through its signal",
        direction: "short",
        barTime: time,
        strength: line > 0 ? 0.75 : 0.55,
        detail:
          line > 0
            ? "A bearish cross above the zero line, where reversals usually start."
            : "A bearish cross below zero, continuing an existing downtrend.",
      });
    }
  }

  if (!Number.isNaN(hist) && !Number.isNaN(prevHist)) {
    if (prevHist < 0 && hist >= 0) {
      out.push({
        kind: "macd",
        name: "MACD histogram turned positive",
        direction: "long",
        barTime: time,
        strength: 0.4,
        detail: "The histogram flipped above zero.",
      });
    }
    if (prevHist > 0 && hist <= 0) {
      out.push({
        kind: "macd",
        name: "MACD histogram turned negative",
        direction: "short",
        barTime: time,
        strength: 0.4,
        detail: "The histogram flipped below zero.",
      });
    }
  }
  return out;
}

/* Regular divergence.

   Take the last two swing lows: if price made a lower low while the oscillator
   made a higher low, the second push down had less force behind it. The mirror
   applies to swing highs. Both pivots must sit inside the lookback window and
   the most recent one must be close to the trigger bar, or we would be
   reporting a divergence that resolved a month ago. */
function divergences({ candles, rsi, macd, index, params }: RuleInput): Evidence[] {
  const out: Evidence[] = [];
  const from = Math.max(0, index - params.divergenceLookback);
  const slice = candles.slice(from, index + 1);
  if (slice.length < params.swingSpan * 2 + 3) return out;

  const { highs, lows } = swingPoints(slice, params.swingSpan);
  const time = candles[index][T];
  // The newest pivot has to be recent enough to still matter.
  const recentLimit = params.swingSpan * 3;

  const checkPair = (
    pivots: number[],
    kind: "low" | "high",
    series: number[],
    label: "RSI" | "MACD",
    seriesName: string,
  ) => {
    if (pivots.length < 2) return;
    const b = pivots[pivots.length - 1];
    const a = pivots[pivots.length - 2];
    if (slice.length - 1 - b > recentLimit) return;

    const ia = from + a;
    const ib = from + b;
    const priceA = kind === "low" ? candles[ia][L] : candles[ia][H];
    const priceB = kind === "low" ? candles[ib][L] : candles[ib][H];
    const oscA = series[ia];
    const oscB = series[ib];
    if (Number.isNaN(oscA) || Number.isNaN(oscB)) return;

    if (kind === "low" && priceB < priceA && oscB > oscA) {
      out.push({
        kind: label === "RSI" ? "rsi" : "macd",
        name: "Bullish " + label + " divergence",
        direction: "long",
        barTime: time,
        strength: 0.8,
        detail:
          "Price made a lower low but " + seriesName + " made a higher one: the selling is losing force.",
      });
    }
    if (kind === "high" && priceB > priceA && oscB < oscA) {
      out.push({
        kind: label === "RSI" ? "rsi" : "macd",
        name: "Bearish " + label + " divergence",
        direction: "short",
        barTime: time,
        strength: 0.8,
        detail:
          "Price made a higher high but " + seriesName + " made a lower one: the buying is losing force.",
      });
    }
  };

  checkPair(lows, "low", rsi, "RSI", "RSI");
  checkPair(highs, "high", rsi, "RSI", "RSI");
  checkPair(lows, "low", macd.histogram, "MACD", "the MACD histogram");
  checkPair(highs, "high", macd.histogram, "MACD", "the MACD histogram");
  return out;
}
