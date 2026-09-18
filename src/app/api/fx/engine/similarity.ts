import type { Candle, Analog, AnalogStats, Direction } from "../../../fx/types.ts";
import { H, L, C } from "../../../fx/types.ts";
import type { MacdSeries } from "./indicators.ts";

/* The similarity engine.

   The question it answers: "the last two dozen bars look like this — when the
   market looked like this before, what happened next?"

   Each window becomes a feature vector of three parts:

     shape   the closes, mean-centred and divided by the window's ATR, so a
             move of 30 pips in a quiet market matches a move of 60 in a busy
             one. Without that scaling every match would come from the same
             volatility regime and the sample would collapse.
     rsi     RSI/100 at each bar, already bounded, so it needs no scaling.
     macd    the histogram divided by ATR, same reasoning as the shape.

   Distance is plain weighted Euclidean. Fancier metrics (DTW and friends) buy
   little here: the windows are short and fixed-length, and warping would match
   patterns that took a different amount of time to play out, which is exactly
   the thing a trader with a stop-loss cannot use.

   Two details keep the statistics honest:

     - the last `horizon` bars are excluded from the candidate pool, because
       their forward outcome has not finished happening yet;
     - overlapping neighbours are suppressed, so one memorable afternoon does
       not enter the sample twelve times and pass itself off as twelve
       independent pieces of evidence. */

export interface SimilarityParams {
  /** Bars in the comparison window. */
  window: number;
  /** Bars of forward outcome studied after each match. */
  horizon: number;
  /** How many analogs to keep. */
  topK: number;
  /** Relative weight of each feature block; normalised internally. */
  shapeWeight: number;
  rsiWeight: number;
  macdWeight: number;
  /** Matches further away than this are dropped even if topK is not full.
      Expressed in average per-feature distance, so it is scale-free. */
  maxDistance: number;
  /** Minimum bars between two kept analogs, to stop overlap double-counting. */
  minSeparation: number;
  /** Stop and target for the hypothetical trade, in ATR multiples. */
  stopAtr: number;
  targetAtr: number;
}

export const DEFAULT_SIMILARITY_PARAMS: SimilarityParams = {
  window: 24,
  horizon: 12,
  topK: 50,
  shapeWeight: 0.5,
  rsiWeight: 0.25,
  macdWeight: 0.25,
  maxDistance: 0.55,
  minSeparation: 12,
  stopAtr: 1,
  targetAtr: 1.5,
};

export interface SimilarityInput {
  candles: Candle[];
  rsi: number[];
  macd: MacdSeries;
  atr: number[];
  /** Index of the window's last bar — the trigger bar. */
  index: number;
  /** Price move of one pip, for reporting outcomes in pips. */
  pipSize: number;
  params: SimilarityParams;
}

export interface SimilarityResult {
  analogs: Analog[];
  /** Stats from the perspective of a LONG. `statsFor` flips them for a short. */
  stats: AnalogStats | null;
}

/** Build the feature vector for the window ending at `index` (inclusive).
    Returns null when the window runs off the start of the data or when any
    indicator is still warming up. */
export function featuresAt(
  input: Omit<SimilarityInput, "params"> & { window: number },
): Float64Array | null {
  const { candles, rsi, macd, atr, index, window } = input;
  const start = index - window + 1;
  if (start < 0 || index >= candles.length) return null;

  const scale = atr[index];
  if (!Number.isFinite(scale) || scale <= 0) return null;

  const out = new Float64Array(window * 3);

  // Shape: centre on the window mean so the absolute price level is
  // irrelevant — 1.05 in 2019 can match 1.17 today.
  let mean = 0;
  for (let i = start; i <= index; i++) mean += candles[i][C];
  mean /= window;

  for (let k = 0; k < window; k++) {
    const i = start + k;
    const r = rsi[i];
    const h = macd.histogram[i];
    if (Number.isNaN(r) || Number.isNaN(h)) return null;
    out[k] = (candles[i][C] - mean) / scale;
    out[window + k] = r / 100;
    out[window * 2 + k] = h / scale;
  }
  return out;
}

interface Candidate {
  index: number;
  distance: number;
}

export function findAnalogs(input: SimilarityInput): SimilarityResult {
  const { candles, rsi, macd, atr, index, pipSize, params } = input;
  const { window, horizon } = params;

  const query = featuresAt({ candles, rsi, macd, atr, index, pipSize, window });
  if (!query) return { analogs: [], stats: null };

  // Per-feature weights, normalised so maxDistance means the same thing
  // whatever the weights are set to.
  const totalWeight = params.shapeWeight + params.rsiWeight + params.macdWeight;
  const wShape = params.shapeWeight / totalWeight;
  const wRsi = params.rsiWeight / totalWeight;
  const wMacd = params.macdWeight / totalWeight;

  // A candidate's forward window must have finished, and it must not overlap
  // the query window (which would be comparing the present with itself).
  const lastCandidate = index - window - horizon;
  const candidates: Candidate[] = [];

  for (let i = window - 1; i <= lastCandidate; i++) {
    const features = featuresAt({ candles, rsi, macd, atr, index: i, pipSize, window });
    if (!features) continue;

    let sumShape = 0;
    let sumRsi = 0;
    let sumMacd = 0;
    for (let k = 0; k < window; k++) {
      const a = query[k] - features[k];
      sumShape += a * a;
      const b = query[window + k] - features[window + k];
      sumRsi += b * b;
      const c = query[window * 2 + k] - features[window * 2 + k];
      sumMacd += c * c;
    }
    // Mean square per feature, so the number does not grow with window length.
    const distance = Math.sqrt(
      (wShape * sumShape + wRsi * sumRsi + wMacd * sumMacd) / window,
    );
    if (distance <= params.maxDistance) candidates.push({ index: i, distance });
  }

  candidates.sort((a, b) => a.distance - b.distance);

  // Non-maximum suppression: keep the best, then skip anything that overlaps
  // it. The same afternoon should count once.
  const kept: Candidate[] = [];
  for (const candidate of candidates) {
    if (kept.length >= params.topK) break;
    let clashes = false;
    for (const k of kept) {
      if (Math.abs(k.index - candidate.index) < params.minSeparation) {
        clashes = true;
        break;
      }
    }
    if (!clashes) kept.push(candidate);
  }

  const analogs = kept.map((c) => buildAnalog(candles, atr, c, params, pipSize));
  const stats = summarise(analogs, candles, params);
  return { analogs, stats };
}

function buildAnalog(
  candles: Candle[],
  atr: number[],
  candidate: Candidate,
  params: SimilarityParams,
  pipSize: number,
): Analog {
  const { window, horizon } = params;
  const i = candidate.index;
  const entry = candles[i][C];
  const scale = atr[i];

  const outcome = simulate(candles, i, entry, scale, params, pipSize);

  // Shapes are normalised to the window's own range so thumbnails of a quiet
  // day and a volatile one are both readable.
  const start = i - window + 1;
  const slice = candles.slice(start, i + 1 + horizon);
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of slice) {
    if (c[L] < lo) lo = c[L];
    if (c[H] > hi) hi = c[H];
  }
  const span = hi - lo || 1;
  const norm = (v: number) => (v - lo) / span;

  return {
    barTime: candles[i][0],
    distance: candidate.distance,
    forwardPips: outcome.forwardPips,
    mfePips: outcome.mfePips,
    maePips: outcome.maePips,
    outcome: outcome.result,
    shape: candles.slice(start, i + 1).map((c) => norm(c[C])),
    forwardShape: candles.slice(i + 1, i + 1 + horizon).map((c) => norm(c[C])),
  };
}

interface Outcome {
  forwardPips: number;
  mfePips: number;
  maePips: number;
  result: "win" | "loss" | "open";
}

/* Walk the bars after a match and record what a long would have felt.

   `first-touch` matters: within a single bar we cannot know whether the high
   or the low came first, so when a bar spans both the stop and the target we
   assume the stop. That biases the win rate downwards, which is the right
   direction for a number you are about to risk money on. */
function simulate(
  candles: Candle[],
  i: number,
  entry: number,
  scale: number,
  params: SimilarityParams,
  pipSize: number,
): Outcome {
  const { horizon, stopAtr, targetAtr } = params;
  const stop = entry - scale * stopAtr;
  const target = entry + scale * targetAtr;

  let mfe = 0;
  let mae = 0;
  let result: Outcome["result"] = "open";

  const end = Math.min(i + horizon, candles.length - 1);
  for (let j = i + 1; j <= end; j++) {
    const high = candles[j][H];
    const low = candles[j][L];
    mfe = Math.max(mfe, high - entry);
    mae = Math.min(mae, low - entry);

    if (result === "open") {
      const hitStop = low <= stop;
      const hitTarget = high >= target;
      if (hitStop) result = "loss";
      else if (hitTarget) result = "win";
    }
  }

  const exit = candles[end][C];
  const pip = (v: number) => v / pipSize;
  return {
    forwardPips: pip(exit - entry),
    mfePips: pip(mfe),
    maePips: pip(mae),
    result,
  };
}

function summarise(
  analogs: Analog[],
  candles: Candle[],
  params: SimilarityParams,
): AnalogStats | null {
  if (analogs.length === 0) return null;

  const pips = analogs.map((a) => a.forwardPips);
  const sorted = [...pips].sort((a, b) => a - b);
  const wins = analogs.filter((a) => a.forwardPips > 0).length;

  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const buckets = 9;
  const step = (max - min) / buckets || 1;
  const histogram = Array.from({ length: buckets }, (_, k) => ({
    from: min + step * k,
    to: min + step * (k + 1),
    count: 0,
  }));
  for (const p of pips) {
    const k = Math.min(buckets - 1, Math.max(0, Math.floor((p - min) / step)));
    histogram[k].count++;
  }

  return {
    count: analogs.length,
    winRate: wins / analogs.length,
    avgPips: mean(pips),
    medianPips: sorted[Math.floor(sorted.length / 2)],
    bestPips: max,
    worstPips: min,
    avgMfePips: mean(analogs.map((a) => a.mfePips)),
    avgMaePips: mean(analogs.map((a) => a.maePips)),
    baselineWinRate: baselineWinRate(candles, params),
    histogram,
  };
}

/* The share of ALL windows whose next `horizon` bars closed higher.

   Without this a 56% win rate looks like an edge even when the market drifted
   up 56% of the time over the sample. Computed on a stride so it stays cheap,
   and cached per candle array since it only changes when new bars arrive. */
const baselineCache = new WeakMap<Candle[], Map<number, number>>();

export function baselineWinRate(candles: Candle[], params: SimilarityParams): number {
  let perArray = baselineCache.get(candles);
  if (!perArray) {
    perArray = new Map();
    baselineCache.set(candles, perArray);
  }
  const cached = perArray.get(params.horizon);
  if (cached !== undefined) return cached;

  const stride = 5;
  let up = 0;
  let total = 0;
  for (let i = params.window; i < candles.length - params.horizon; i += stride) {
    if (candles[i + params.horizon][C] > candles[i][C]) up++;
    total++;
  }
  const value = total === 0 ? 0.5 : up / total;
  perArray.set(params.horizon, value);
  return value;
}

/** Flip long-oriented stats for a short setup: pips change sign, and the
    favourable and adverse excursions swap places. */
export function statsFor(stats: AnalogStats, direction: Direction): AnalogStats {
  if (direction === "long") return stats;
  return {
    ...stats,
    winRate: 1 - stats.winRate,
    baselineWinRate: 1 - stats.baselineWinRate,
    avgPips: -stats.avgPips,
    medianPips: -stats.medianPips,
    bestPips: -stats.worstPips,
    worstPips: -stats.bestPips,
    avgMfePips: -stats.avgMaePips,
    avgMaePips: -stats.avgMfePips,
    histogram: stats.histogram
      .map((b) => ({ from: -b.to, to: -b.from, count: b.count }))
      .reverse(),
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}
