import type { Consultant } from "./types.ts";

/* Billing is its own record, apart from the deals: twelve figures per
   consultant per year, loaded from the CRM export and corrected by hand. Deals
   are for organising the work; every billing figure in the app reads from here.

   A year with no months on record falls back to the yearly total carried over
   from the team sheet, which has no shape across the year. */

/** The manager earns this share of whatever a consultant bills. */
export const MANAGER_RATE = 0.02;

const round = (n: number) => Math.round(n * 100 + 1e-7) / 100;

export function monthsOf(c: Consultant, year: string): number[] | undefined {
  return c.billingByMonth?.[year];
}

export function billedIn(c: Consultant, year: string): number {
  const months = monthsOf(c, year);
  return round(months ? months.reduce((s, v) => s + v, 0) : (c.billingByYear[year] ?? 0));
}

/** Sum of a year's months up to and including `upTo`. */
export function sumTo(months: number[] | undefined, upTo: number): number {
  let t = 0;
  for (let i = 0; i <= upTo; i++) t += months?.[i] ?? 0;
  return round(t);
}

/** Last month of a year that is over: all of a past year, none of a future
 *  one, and up to last month in the current one. */
export function closedUpTo(year: string, now = new Date()): number {
  const current = String(now.getFullYear());
  if (year < current) return 11;
  if (year > current) return -1;
  return now.getMonth() - 1;
}

/** Last month that counts for this consultant: the closed months, or further
 *  if figures were already entered for a month still running. */
export function billedUpTo(c: Consultant, year: string, now = new Date()): number {
  const months = monthsOf(c, year) ?? [];
  let last = closedUpTo(year, now);
  months.forEach((v, i) => {
    if (v !== 0 && i > last) last = i;
  });
  return last;
}

/** First month of the year this consultant was in the team. */
export function startMonth(c: Consultant, year: string): number {
  return c.joinedAt?.startsWith(year) ? Number(c.joinedAt.slice(5, 7)) - 1 : 0;
}

export interface GoalPace {
  goal: number;
  billed: number;
  /** Still to bill to reach the goal; 0 once reached. */
  missing: number;
  monthsLeft: number;
  /** What each remaining month has to bring. Moves as figures are entered. */
  perMonth: number;
  upTo: number;
  reached: boolean;
}

/** The year's billing goal: the yearly target on the consultant's Business Plan. */
export function goalOf(c: Consultant, year: string): number | null {
  return c.plans?.[year]?.billingTarget || null;
}

export function goalPace(c: Consultant, year: string, now = new Date()): GoalPace | null {
  const goal = goalOf(c, year);
  if (!goal) return null;
  const billed = billedIn(c, year);
  const upTo = billedUpTo(c, year, now);
  const missing = round(Math.max(0, goal - billed));
  const monthsLeft = 11 - upTo;
  return { goal, billed, missing, monthsLeft, perMonth: monthsLeft > 0 ? round(missing / monthsLeft) : 0, upTo, reached: missing === 0 };
}
