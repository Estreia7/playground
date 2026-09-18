import type {
  AnalogStats,
  Candle,
  Direction,
  Evidence,
  ScoreComponent,
} from "../../../fx/types.ts";
import { C } from "../../../fx/types.ts";
import { percentileRank } from "./indicators.ts";

/* Turning evidence into one number.

   The score is a weighted sum of five components, and every one of them is
   reported alongside the total. That is deliberate: a single number nobody can
   take apart is a number nobody should trade on, so the UI always shows which
   part of the 74 came from history and which came from a candlestick.

   Weights are settings, not constants, but the defaults say what this tool
   believes: what the market did last time it looked like this matters more
   than any single indicator crossing a line.

   The similarity component is scored against the BASELINE, not against 50%.
   If EUR/USD closed higher 54% of the time over the sample, then a 56% win
   rate is worth almost nothing, and the arithmetic here says so. */

export interface ScoreWeights {
  similarity: number;
  momentum: number;
  candle: number;
  htf: number;
  volatility: number;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  similarity: 40,
  momentum: 22,
  candle: 15,
  htf: 15,
  volatility: 8,
};

export interface HtfState {
  tf: string;
  /** Slope of the EMA(50) over the last few bars, normalised by ATR. */
  trend: number;
  /** MACD line sign. */
  macdSign: number;
  /** RSI relative to 50. */
  rsiSide: number;
  /** True when this timeframe agrees with the setup direction. */
  aligned: boolean;
}

export interface ScoreInput {
  direction: Direction;
  /** Already oriented to `direction` via statsFor(). */
  stats: AnalogStats | null;
  evidence: Evidence[];
  htf: HtfState[];
  candles: Candle[];
  atr: number[];
  index: number;
  weights: ScoreWeights;
}

export interface ScoreResult {
  score: number;
  components: ScoreComponent[];
}

export function scoreSetup(input: ScoreInput): ScoreResult {
  const components: ScoreComponent[] = [
    similarityComponent(input),
    momentumComponent(input),
    candleComponent(input),
    htfComponent(input),
    volatilityComponent(input),
  ];
  const total = components.reduce((sum, c) => sum + c.points, 0);
  return { score: Math.round(Math.min(100, Math.max(0, total))), components };
}

/* History. Two halves: how much better than baseline the win rate was, and
   whether the average move actually paid.

   The scale matters more here than anywhere else in the file. Measured over
   two years of EUR/USD hourly bars, the median setup beats its baseline by
   under a percentage point and the best ones manage eight to ten. Scoring
   against an idealised +15pp therefore left the heaviest component sitting at
   15% utilisation, and genuinely good setups could not pull away from noise.
   The curve below is calibrated against those observed numbers: 8pp of edge is
   a strong signal and earns most of the component.

   A small sample is discounted rather than trusted — twelve coin flips prove
   nothing, whatever they landed on. */
function similarityComponent({ stats, weights }: ScoreInput): ScoreComponent {
  const max = weights.similarity;
  if (!stats || stats.count === 0) {
    return {
      key: "similarity",
      label: "Historical analogs",
      points: 0,
      max,
      detail: "No comparable windows found in the stored history.",
    };
  }

  const edge = stats.winRate - stats.baselineWinRate;
  // 8 percentage points over baseline is a strong edge in this market.
  const edgeScore = clamp01(edge / 0.08);

  // Did it pay? Average move measured against the average adverse excursion,
  // so a setup that drifts up 8 pips after diving 20 scores badly. Anything
  // that recovers its own drawdown scores full marks on this half.
  const painThreshold = Math.max(1, Math.abs(stats.avgMaePips));
  const payoff = clamp01(stats.avgPips / painThreshold);

  // Below ~15 analogs the numbers are anecdote; by 40 they are a sample.
  const confidence = clamp01((stats.count - 10) / 30);
  const points = max * (edgeScore * 0.6 + payoff * 0.4) * confidence;

  return {
    key: "similarity",
    label: "Historical analogs",
    points,
    max,
    detail:
      stats.count +
      " similar windows won " +
      pct(stats.winRate) +
      " of the time against a " +
      pct(stats.baselineWinRate) +
      " baseline, averaging " +
      stats.avgPips.toFixed(1) +
      " pips.",
  };
}

/* RSI and MACD. Evidence pointing the setup's way adds, evidence pointing the
   other way subtracts — a bullish engulfing into a bearish MACD cross is not
   a clean setup and should not read as one. */
function momentumComponent({ evidence, direction, weights }: ScoreInput): ScoreComponent {
  const max = weights.momentum;
  const relevant = evidence.filter((e) => e.kind === "rsi" || e.kind === "macd");
  if (relevant.length === 0) {
    return {
      key: "momentum",
      label: "RSI and MACD",
      points: 0,
      max,
      detail: "Neither RSI nor MACD signalled on this bar.",
    };
  }

  let forValue = 0;
  let against = 0;
  for (const e of relevant) {
    if (e.direction === direction) forValue += e.strength;
    else if (e.direction !== "neutral") against += e.strength;
  }
  // One strong signal (a divergence, or a cross out of oversold) carries most
  // of the component; a second agreeing one completes it. Requiring two full
  // strength signals set the bar so high that the component averaged 40% of
  // its range on real data and never reached the top of it.
  const net = clamp01((forValue - against) / 1.1);
  const names = relevant.filter((e) => e.direction === direction).map((e) => e.name);

  return {
    key: "momentum",
    label: "RSI and MACD",
    points: max * net,
    max,
    detail:
      names.length > 0
        ? names.join("; ") + "."
        : "The momentum signals present point against this direction.",
  };
}

function candleComponent({ evidence, direction, weights }: ScoreInput): ScoreComponent {
  const max = weights.candle;
  const relevant = evidence.filter((e) => e.kind === "candle");
  const agreeing = relevant.filter((e) => e.direction === direction);
  const opposing = relevant.filter((e) => e.direction !== direction && e.direction !== "neutral");

  if (relevant.length === 0) {
    return {
      key: "candle",
      label: "Candlestick",
      points: 0,
      max,
      detail: "No recognised candlestick pattern on this bar.",
    };
  }

  const strength = agreeing.reduce((s, e) => s + e.strength, 0) -
    opposing.reduce((s, e) => s + e.strength * 0.5, 0);
  // A textbook engulfing bar scores ~1.0 on its own and should read as a full
  // candlestick signal rather than 80% of one.
  const net = clamp01(strength / 0.9);

  return {
    key: "candle",
    label: "Candlestick",
    points: max * net,
    max,
    detail:
      agreeing.length > 0
        ? agreeing.map((e) => e.name).join("; ") + "."
        : "The patterns on this bar do not support this direction.",
  };
}

/* Higher timeframes. Full marks when both agree, roughly half when one does,
   zero when neither. Trading a 15m long while the 1h and 4h are rolling over
   is the single most common way these setups fail. */
function htfComponent({ htf, weights }: ScoreInput): ScoreComponent {
  const max = weights.htf;
  if (htf.length === 0) {
    return {
      key: "htf",
      label: "Higher timeframes",
      points: 0,
      max,
      detail: "No higher timeframe above this one.",
    };
  }
  const aligned = htf.filter((h) => h.aligned);
  const points = max * (aligned.length / htf.length);

  return {
    key: "htf",
    label: "Higher timeframes",
    points,
    max,
    detail:
      aligned.length === htf.length
        ? "Both " + htf.map((h) => h.tf).join(" and ") + " agree with this direction."
        : aligned.length === 0
          ? "Neither " + htf.map((h) => h.tf).join(" nor ") + " agrees with this direction."
          : htf
              .map((h) => h.tf + (h.aligned ? " agrees" : " disagrees"))
              .join(", ") + ".",
  };
}

/* Volatility and session. A setup in a dead market has no room to reach its
   target before the stop gets nicked by noise, and the London and New York
   hours are where the range actually happens. */
function volatilityComponent({ candles, atr, index, weights }: ScoreInput): ScoreComponent {
  const max = weights.volatility;
  const current = atr[index];
  if (!Number.isFinite(current)) {
    return {
      key: "volatility",
      label: "Conditions",
      points: 0,
      max,
      detail: "Not enough data to judge volatility.",
    };
  }

  const recent = atr.slice(Math.max(0, index - 500), index + 1);
  const rank = percentileRank(recent, current);
  // Both extremes are bad: dead markets have no follow-through, and a spike
  // usually means news, where technical patterns stop meaning much.
  const volScore = rank < 0.2 ? rank / 0.2 * 0.5 : rank > 0.9 ? 0.5 : 1;

  const hour = new Date(candles[index][0] * 1000).getUTCHours();
  const session = sessionFor(hour);
  const sessionScore = session === "overlap" ? 1 : session === "london" || session === "newyork" ? 0.85 : 0.45;

  const points = max * volScore * sessionScore;
  return {
    key: "volatility",
    label: "Conditions",
    points,
    max,
    detail:
      "Volatility is in the " +
      Math.round(rank * 100) +
      "th percentile during the " +
      sessionLabel(session) +
      " session.",
  };
}

export type Session = "sydney" | "tokyo" | "london" | "newyork" | "overlap";

/* Sessions in UTC. The London/New York overlap (13:00-16:00 UTC) is where most
   of the day's range prints. These bounds shift by an hour with daylight
   saving; the error is one hour at the edges and does not change which bucket
   the busiest part of the day falls into. */
export function sessionFor(hourUtc: number): Session {
  if (hourUtc >= 13 && hourUtc < 16) return "overlap";
  if (hourUtc >= 7 && hourUtc < 13) return "london";
  if (hourUtc >= 16 && hourUtc < 21) return "newyork";
  if (hourUtc >= 0 && hourUtc < 7) return "tokyo";
  return "sydney";
}

export function sessionLabel(session: Session): string {
  if (session === "overlap") return "London / New York overlap";
  if (session === "newyork") return "New York";
  return session.charAt(0).toUpperCase() + session.slice(1);
}

/** Build the higher-timeframe view used by the score and the UI badge. */
export function htfState(
  tf: string,
  candles: Candle[],
  ema50: number[],
  macdLine: number[],
  rsiSeries: number[],
  atrSeries: number[],
  direction: Direction,
): HtfState | null {
  const i = candles.length - 1;
  if (i < 5) return null;
  const scale = atrSeries[i];
  const slopeRaw = ema50[i] - ema50[i - 5];
  if (!Number.isFinite(slopeRaw) || !Number.isFinite(scale) || scale <= 0) return null;

  const trend = slopeRaw / scale;
  const macdSign = Number.isNaN(macdLine[i]) ? 0 : Math.sign(macdLine[i]);
  const rsiSide = Number.isNaN(rsiSeries[i]) ? 0 : Math.sign(rsiSeries[i] - 50);

  // Two of the three must point the setup's way. The EMA slope carries a
  // deadband so a flat market does not read as agreement in either direction.
  const want = direction === "long" ? 1 : -1;
  const votes =
    (Math.abs(trend) > 0.05 && Math.sign(trend) === want ? 1 : 0) +
    (macdSign === want ? 1 : 0) +
    (rsiSide === want ? 1 : 0);

  return { tf, trend, macdSign, rsiSide, aligned: votes >= 2 };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function pct(value: number): string {
  return Math.round(value * 100) + "%";
}

export { C };
