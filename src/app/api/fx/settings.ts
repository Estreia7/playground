import { readJson, writeJson } from "./storage.ts";
import { DEFAULT_RULE_PARAMS, type RuleParams } from "./engine/rules.ts";
import { DEFAULT_SIMILARITY_PARAMS, type SimilarityParams } from "./engine/similarity.ts";
import { DEFAULT_SCORE_WEIGHTS, type ScoreWeights } from "./engine/score.ts";

/* Settings: the knobs, their defaults, and the validation that keeps a typo in
   the UI from producing a scan that silently means nothing.

   Validation is hand-written (repo convention: no zod) and returns a list of
   human-readable problems rather than throwing on the first one, so the form
   can show every issue at once. Bounds are chosen to keep the engine honest —
   an RSI length of 1 or a similarity window of 500 would technically run, but
   the numbers that came out the other side would be noise. */

export interface PaperSettings {
  startingBalance: number;
  leverage: number;
  /** Spread charged at fill, in pips. */
  spreadPips: number;
  /** Percentage of the account risked per trade, used to size the ticket. */
  riskPercent: number;
}

export interface FxSettings {
  rules: RuleParams;
  similarity: SimilarityParams;
  weights: ScoreWeights;
  paper: PaperSettings;
  /** Setups at or above this score raise an alert. */
  alertThreshold: number;
  /** Setups below this score are not shown at all. */
  minScore: number;
}

export const DEFAULT_SETTINGS: FxSettings = {
  rules: DEFAULT_RULE_PARAMS,
  similarity: DEFAULT_SIMILARITY_PARAMS,
  weights: DEFAULT_SCORE_WEIGHTS,
  paper: {
    startingBalance: 10_000,
    leverage: 30,
    spreadPips: 0.8,
    riskPercent: 1,
  },
  alertThreshold: 70,
  minScore: 40,
};

const FILE = "settings.json";

export async function readSettings(): Promise<FxSettings> {
  const stored = await readJson<Partial<FxSettings>>(FILE, {});
  // Merge field by field so a settings file written by an older version keeps
  // working when new knobs are added.
  return {
    rules: { ...DEFAULT_SETTINGS.rules, ...stored.rules },
    similarity: { ...DEFAULT_SETTINGS.similarity, ...stored.similarity },
    weights: { ...DEFAULT_SETTINGS.weights, ...stored.weights },
    paper: { ...DEFAULT_SETTINGS.paper, ...stored.paper },
    alertThreshold: stored.alertThreshold ?? DEFAULT_SETTINGS.alertThreshold,
    minScore: stored.minScore ?? DEFAULT_SETTINGS.minScore,
  };
}

export async function writeSettings(settings: FxSettings): Promise<void> {
  await writeJson(FILE, settings);
}

/** Validate an incoming settings payload. Returns the problems found; an empty
    array means the value is safe to store. */
export function validateSettings(input: unknown): string[] {
  const issues: string[] = [];
  if (typeof input !== "object" || input === null) {
    return ["The payload must be an object."];
  }
  const s = input as Partial<FxSettings>;

  /* Only judge fields the payload actually carries. A settings form may send
     one section at a time, and reporting every absent field as "must be a
     number" would bury the one real problem under a dozen invented ones. */
  const num = (
    value: unknown,
    label: string,
    min: number,
    max: number,
    integer = false,
  ): void => {
    if (value === undefined) return;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      issues.push(label + " must be a number.");
      return;
    }
    if (integer && !Number.isInteger(value)) {
      issues.push(label + " must be a whole number.");
      return;
    }
    if (value < min || value > max) {
      issues.push(label + " must be between " + min + " and " + max + ".");
    }
  };

  if (s.rules) {
    const r = s.rules;
    num(r.rsiLength, "RSI length", 2, 100, true);
    num(r.rsiOversold, "RSI oversold level", 1, 49);
    num(r.rsiOverbought, "RSI overbought level", 51, 99);
    num(r.divergenceLookback, "Divergence lookback", 10, 500, true);
    num(r.swingSpan, "Swing span", 1, 20, true);
    num(r.macdFast, "MACD fast length", 2, 100, true);
    num(r.macdSlow, "MACD slow length", 3, 200, true);
    num(r.macdSignal, "MACD signal length", 1, 100, true);
    if (
      typeof r.macdFast === "number" &&
      typeof r.macdSlow === "number" &&
      r.macdFast >= r.macdSlow
    ) {
      issues.push("The MACD fast length must be shorter than the slow length.");
    }
    if (
      typeof r.rsiOversold === "number" &&
      typeof r.rsiOverbought === "number" &&
      r.rsiOversold >= r.rsiOverbought
    ) {
      issues.push("The RSI oversold level must sit below the overbought level.");
    }
  }

  if (s.similarity) {
    const sim = s.similarity;
    num(sim.window, "Similarity window", 6, 120, true);
    num(sim.horizon, "Forward horizon", 2, 200, true);
    num(sim.topK, "Number of analogs", 5, 300, true);
    num(sim.shapeWeight, "Shape weight", 0, 1);
    num(sim.rsiWeight, "RSI weight", 0, 1);
    num(sim.macdWeight, "MACD weight", 0, 1);
    num(sim.maxDistance, "Distance threshold", 0.01, 5);
    num(sim.minSeparation, "Minimum separation", 1, 200, true);
    num(sim.stopAtr, "Stop distance in ATR", 0.1, 10);
    num(sim.targetAtr, "Target distance in ATR", 0.1, 20);

    // Only meaningful when the caller actually sent the weights.
    const sentWeights =
      sim.shapeWeight !== undefined || sim.rsiWeight !== undefined || sim.macdWeight !== undefined;
    const weightSum =
      (sim.shapeWeight ?? 0) + (sim.rsiWeight ?? 0) + (sim.macdWeight ?? 0);
    if (sentWeights && weightSum <= 0) {
      issues.push("At least one of the similarity weights must be above zero.");
    }
  }

  if (s.weights) {
    const w = s.weights;
    num(w.similarity, "Analog weight", 0, 100);
    num(w.momentum, "Momentum weight", 0, 100);
    num(w.candle, "Candlestick weight", 0, 100);
    num(w.htf, "Higher-timeframe weight", 0, 100);
    num(w.volatility, "Conditions weight", 0, 100);

    // A partial weights update is merged over the stored values, so the total
    // is only checked when every component was supplied.
    const complete =
      w.similarity !== undefined &&
      w.momentum !== undefined &&
      w.candle !== undefined &&
      w.htf !== undefined &&
      w.volatility !== undefined;
    const total =
      (w.similarity ?? 0) + (w.momentum ?? 0) + (w.candle ?? 0) + (w.htf ?? 0) + (w.volatility ?? 0);
    if (complete && total <= 0) {
      issues.push("The score weights cannot all be zero.");
    }
    if (complete && total > 100) {
      issues.push(
        "The score weights add up to " + total + "; they must total 100 or less so the score stays on a 0-100 scale.",
      );
    }
  }

  if (s.paper) {
    const p = s.paper;
    num(p.startingBalance, "Starting balance", 100, 10_000_000);
    num(p.leverage, "Leverage", 1, 500, true);
    num(p.spreadPips, "Spread", 0, 20);
    num(p.riskPercent, "Risk per trade", 0.01, 100);
  }

  if (s.alertThreshold !== undefined) num(s.alertThreshold, "Alert threshold", 0, 100);
  if (s.minScore !== undefined) num(s.minScore, "Minimum score", 0, 100);
  if (
    typeof s.alertThreshold === "number" &&
    typeof s.minScore === "number" &&
    s.minScore > s.alertThreshold
  ) {
    issues.push("The minimum score cannot be higher than the alert threshold, or no alert could ever fire.");
  }

  return issues;
}

/** Merge a validated payload over the stored settings. */
export function mergeSettings(current: FxSettings, input: Partial<FxSettings>): FxSettings {
  return {
    rules: { ...current.rules, ...input.rules },
    similarity: { ...current.similarity, ...input.similarity },
    weights: { ...current.weights, ...input.weights },
    paper: { ...current.paper, ...input.paper },
    alertThreshold: input.alertThreshold ?? current.alertThreshold,
    minScore: input.minScore ?? current.minScore,
  };
}
