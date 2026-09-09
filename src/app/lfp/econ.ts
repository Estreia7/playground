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

/* ── life projection ─────────────────────────────────────── */

export interface LifeInput {
  idade: number;
  liquidoMensal: number;
  /** Real (above-inflation) yearly wage growth, as a fraction. */
  crescimentoReal: number;
  inflacao: number;
  poupancaMensal: number;
  /** Nominal yearly return on savings. */
  rendimentoPoupanca: number;
  /** Decimal years, e.g. 66.75 for 66 years and 9 months. */
  idadeReforma: number;
  /** Pension as a fraction of the last net salary — an assumption. */
  pensaoPct: number;
  idadeFinal?: number;
}

export interface LifePoint {
  idade: number;
  ano: number;
  incomeNominal: number;
  incomeReal: number;
  savingsNominal: number;
  savingsReal: number;
  retired: boolean;
}

export interface LifeResult {
  series: LifePoint[];
  anosAteReforma: number;
  ultimoLiquidoNominal: number;
  ultimoLiquidoReal: number;
  pensaoNominal: number;
  pensaoReal: number;
  /** Monthly gap between the last salary and the pension, in today's money. */
  gapMensalReal: number;
  poupancaNominal: number;
  poupancaReal: number;
  /** Years the savings cover the gap; null when there is no gap. */
  anosCobertos: number | null;
}

/** A PROJECTION, not a calculation: constant rates, no taxes on returns,
 *  no career breaks. Everything is shown both nominal and in today's money
 *  so a 2056 number cannot masquerade as a 2026 one. */
export function projectLife(input: LifeInput): LifeResult {
  const idade = Math.max(0, Math.floor(input.idade));
  const idadeFinal = Math.max(idade, Math.floor(input.idadeFinal ?? 85));
  const g = input.crescimentoReal;
  const pi = input.inflacao;
  const rm = input.rendimentoPoupanca / 12;
  const series: LifePoint[] = [];

  let income = Math.max(0, input.liquidoMensal);
  let savings = 0;
  let lastWorking = income;
  let pension = 0;
  let anosAteReforma = 0;
  let retiredAt = -1;

  for (let y = 0; idade + y <= idadeFinal; y++) {
    const age = idade + y;
    const retired = age >= input.idadeReforma;
    if (y > 0) {
      if (!retired) {
        income = income * (1 + g) * (1 + pi);
        lastWorking = income;
      } else if (retiredAt >= 0) {
        pension = pension * (1 + pi);
      }
    }
    if (retired && retiredAt < 0) {
      retiredAt = y;
      anosAteReforma = y;
      // The pension starts the year after the last salary, so it carries one
      // more year of inflation — keeps "pct of the last salary" true in real terms.
      pension = lastWorking * input.pensaoPct * (y > 0 ? 1 + pi : 1);
    }
    for (let m = 0; m < 12; m++) {
      savings = savings * (1 + rm) + (retired ? 0 : Math.max(0, input.poupancaMensal));
    }
    const deflator = Math.pow(1 + pi, y);
    const shown = retired ? pension : income;
    series.push({
      idade: age,
      ano: y,
      incomeNominal: round2(shown),
      incomeReal: round2(shown / deflator),
      savingsNominal: round2(savings),
      savingsReal: round2(savings / deflator),
      retired,
    });
  }

  // Savings at the moment of retirement (or at the end, if never retired).
  const at = retiredAt >= 0 ? series[retiredAt] : series[series.length - 1];
  // The last salary is deflated to the year it was earned; the pension to
  // the year it starts. Both then read in today's euros.
  const lastWorkYear = retiredAt > 0 ? retiredAt - 1 : retiredAt === 0 ? 0 : series.length - 1;
  const ultimoLiquidoNominal = round2(lastWorking);
  const ultimoLiquidoReal = round2(lastWorking / Math.pow(1 + pi, lastWorkYear));
  const pensaoNominal = round2(retiredAt >= 0 ? lastWorking * input.pensaoPct * (retiredAt > 0 ? 1 + pi : 1) : 0);
  const pensaoReal = round2(pensaoNominal / Math.pow(1 + pi, at.ano));
  const gapMensalReal = round2(Math.max(0, ultimoLiquidoReal - pensaoReal));
  const poupancaReal = at.savingsReal;

  return {
    series,
    anosAteReforma,
    ultimoLiquidoNominal,
    ultimoLiquidoReal,
    pensaoNominal,
    pensaoReal,
    gapMensalReal,
    poupancaNominal: at.savingsNominal,
    poupancaReal,
    anosCobertos:
      gapMensalReal > 0 ? Math.round((poupancaReal / (gapMensalReal * 12)) * 10) / 10 : null,
  };
}

/* ── where you stand ─────────────────────────────────────── */

export interface DistributionPoint {
  /** 10, 50, 90 — the percentile this euro value marks. */
  percentile: number;
  value: number;
  label: string;
}

export interface StandingResult {
  /** Point estimate, 0–100. Interpolated between anchors — never precise. */
  estimate: number;
  /** The honest span: the two published anchors this salary falls between. */
  low: number;
  high: number;
  /** True when the salary is below the lowest or above the highest anchor,
   *  where there is nothing to interpolate and the answer is a bound. */
  outside: "below" | "above" | null;
  /** The anchors bracketing the salary, for the caller to name them. */
  lower: DistributionPoint | null;
  upper: DistributionPoint | null;
}

/**
 * Where a gross monthly salary sits, from a handful of published anchor
 * points (D1, median, D9) rather than a full bracket table.
 *
 * Between two anchors the position is interpolated LINEARLY IN LOG SPACE:
 * wage distributions are right-skewed, and a straight line in euros between
 * the median and D9 puts a €1,500 salary far too high. Log space is the
 * standard approximation and errs toward modesty.
 *
 * Below the first anchor or above the last, no interpolation is possible:
 * the result is the bound itself, flagged with `outside`, so the page can
 * say "below the first decile" instead of inventing a number.
 */
export function wageStanding(gross: number, points: DistributionPoint[]): StandingResult | null {
  if (!Number.isFinite(gross) || points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.percentile - b.percentile);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (gross <= first.value) {
    return { estimate: first.percentile, low: 0, high: first.percentile, outside: "below", lower: null, upper: first };
  }
  if (gross >= last.value) {
    return { estimate: last.percentile, low: last.percentile, high: 100, outside: "above", lower: last, upper: null };
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (gross >= a.value && gross <= b.value) {
      const t =
        a.value > 0 && b.value > a.value
          ? (Math.log(gross) - Math.log(a.value)) / (Math.log(b.value) - Math.log(a.value))
          : 0;
      return {
        estimate: Math.round((a.percentile + (b.percentile - a.percentile) * t) * 10) / 10,
        low: a.percentile,
        high: b.percentile,
        outside: null,
        lower: a,
        upper: b,
      };
    }
  }
  return null;
}
