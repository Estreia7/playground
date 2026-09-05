/* Pure economy maths. No React, no DOM, no clock, no module state.
   Same contract as calc.ts: (input, data) => result, unit-testable, and
   consumed by the pages as plain values. */

/** Round to cents. Duplicated from calc.ts on purpose: a value import
 *  from "./calc" would need a file extension for Node to run the tests, and
 *  this module should stay dependency-free like calc.ts. */
function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/* ── inflation ───────────────────────────────────────────── */

/** Ratio of the price index between two years. null when either year is
 *  outside the series — the caller must not guess. */
export function inflationFactor(
  values: Record<string, number>,
  fromYear: number,
  toYear: number
): number | null {
  const a = values[String(fromYear)];
  const b = values[String(toYear)];
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) return null;
  return b / a;
}

/** What `amount` in `fromYear` is worth in `toYear` money. */
export function adjustForInflation(
  amount: number,
  values: Record<string, number>,
  fromYear: number,
  toYear: number
): number | null {
  const f = inflationFactor(values, fromYear, toYear);
  return f === null ? null : round2(amount * f);
}

/** Total price change between two years as a fraction (0.75 = +75%). */
export function cumulativeInflation(
  values: Record<string, number>,
  fromYear: number,
  toYear: number
): number | null {
  const f = inflationFactor(values, fromYear, toYear);
  return f === null ? null : f - 1;
}

/** Average yearly inflation over the span, as a fraction. */
export function annualisedInflation(
  values: Record<string, number>,
  fromYear: number,
  toYear: number
): number | null {
  const f = inflationFactor(values, fromYear, toYear);
  const n = toYear - fromYear;
  if (f === null || n <= 0) return null;
  return Math.pow(f, 1 / n) - 1;
}

/** Year-on-year inflation for every year the series can compute it. */
export function yearlyInflation(values: Record<string, number>): Array<{ year: number; rate: number }> {
  const years = Object.keys(values).map(Number).sort((a, b) => a - b);
  const out: Array<{ year: number; rate: number }> = [];
  for (let i = 1; i < years.length; i++) {
    const prev = values[String(years[i - 1])];
    const cur = values[String(years[i])];
    if (prev > 0) out.push({ year: years[i], rate: cur / prev - 1 });
  }
  return out;
}

/* ── raise vs inflation ──────────────────────────────────── */

/** Real change in purchasing power from a nominal raise under inflation.
 *  (1 + nominal) / (1 + inflation) − 1, NOT nominal − inflation: the
 *  subtraction is the everyday approximation and it flatters the raise. */
export function realRaise(nominalRate: number, inflationRate: number): number {
  return (1 + nominalRate) / (1 + inflationRate) - 1;
}

/* ── compound interest ───────────────────────────────────── */

export interface CompoundInput {
  principal: number;
  /** Added at the END of every month. */
  monthly: number;
  /** Nominal annual rate as a fraction (0.05 = 5%). */
  annualRate: number;
  years: number;
}

export interface CompoundResult {
  finalValue: number;
  totalContributed: number;
  totalInterest: number;
  /** One point per year, starting at year 0 (the principal). */
  series: Array<{ year: number; value: number; contributed: number }>;
}

/** Monthly compounding, contributions at month end. Iterated rather than
 *  closed-form so the yearly series is exact and the maths is legible. */
export function compoundInterest(input: CompoundInput): CompoundResult {
  const principal = Math.max(0, input.principal);
  const monthly = Math.max(0, input.monthly);
  const years = Math.max(0, Math.floor(input.years));
  const r = Number.isFinite(input.annualRate) ? input.annualRate / 12 : 0;

  let value = principal;
  let contributed = principal;
  const series: CompoundResult["series"] = [{ year: 0, value: round2(value), contributed: round2(contributed) }];

  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) {
      value = value * (1 + r) + monthly;
      contributed += monthly;
    }
    series.push({ year: y, value: round2(value), contributed: round2(contributed) });
  }

  const finalValue = round2(value);
  const totalContributed = round2(contributed);
  return {
    finalValue,
    totalContributed,
    totalInterest: round2(finalValue - totalContributed),
    series,
  };
}

/* ── days of work ────────────────────────────────────────── */

/** Working days needed to afford `price` on a net annual wage. */
export function daysOfWork(price: number, annualNetWage: number, workingDaysPerYear = 220): number | null {
  if (!(annualNetWage > 0) || !(workingDaysPerYear > 0)) return null;
  const daily = annualNetWage / workingDaysPerYear;
  return Math.max(0, price) / daily;
}

/* ── wage percentile ─────────────────────────────────────── */

export interface WageBracket {
  from: number;
  /** null = open top bracket */
  to: number | null;
  /** Fraction of workers in this bracket. Shares should sum to ~1. */
  share: number;
}

export interface PercentileRange {
  /** Fraction of workers earning less than the bottom of your bracket. */
  low: number;
  /** ...and less than the top of your bracket. */
  high: number;
  /** Linear interpolation inside the bracket — an estimate, flagged as such. */
  estimate: number;
  bracketIndex: number;
}

/**
 * Where a gross wage sits in a bracketed distribution. Returns a RANGE
 * (the bracket's cumulative bounds) plus an interpolated point estimate.
 * Official sources publish brackets, not percentiles, so the range is the
 * honest answer and the estimate is labelled as one.
 */
export function wagePercentile(gross: number, brackets: WageBracket[]): PercentileRange | null {
  if (!brackets.length || !Number.isFinite(gross)) return null;
  const sorted = [...brackets].sort((a, b) => a.from - b.from);
  const totalShare = sorted.reduce((s, b) => s + b.share, 0);
  if (totalShare <= 0) return null;

  let cum = 0;
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    const share = b.share / totalShare;
    const inBracket = gross >= b.from && (b.to === null || gross < b.to);
    if (inBracket) {
      const low = cum;
      const high = cum + share;
      let t = 1;
      if (b.to !== null && b.to > b.from) t = (gross - b.from) / (b.to - b.from);
      // Open top bracket: no width to interpolate over, sit at its start.
      if (b.to === null) t = 0;
      return { low, high, estimate: low + share * Math.min(1, Math.max(0, t)), bracketIndex: i };
    }
    cum += share;
  }
  // Below the first bracket's floor.
  return { low: 0, high: 0, estimate: 0, bracketIndex: -1 };
}
