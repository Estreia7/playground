import type { Consultant, Db, Deal } from "./types.ts";
import { billedIn, goalOf, monthsOf, startMonth, sumTo } from "./billing.ts";
import { consultantStats, currentBacklog } from "./analytics.ts";
import { cents } from "./commission.ts";
import { expected, listingRowOf, listingSaleMix, mixYears } from "./listings.ts";
import { PRIZE_LEVELS, levelFor, prizeProgress, type PrizeLevel, type PrizeProgress } from "./prizes.ts";

/* The figures of a consultant's PDF analysis, as they stood at the end of the
   chosen month. It is shown to the consultant, so nothing here is about what
   the manager earns. */

export interface ReportTarget {
  label: string;
  value: number;
  missing: number;
  /** What each month left has to bring; null with no months left. */
  perMonth: number | null;
  reached: boolean;
  level?: PrizeLevel;
}

export interface Report {
  name: string;
  year: string;
  prevYear: string;
  /** Last month counted, 0..11. */
  month: number;
  months: number[];
  prevMonths: number[] | null;
  billed: number;
  /** The previous year over the same months; null without monthly figures. */
  prevToDate: number | null;
  prevFull: number;
  growth: number | null;
  monthlyAverage: number;
  monthsLeft: number;
  /** Year-end figure if the months left keep the monthly average so far. */
  projection: number;
  projectedLevel: PrizeLevel | null;
  backlog: number | null;
  goal: number | null;
  /** Per month left to reach the goal, for the chart. */
  goalPerMonth: number | null;
  prize: PrizeProgress;
  targets: ReportTarget[];
  deals: { total: number; plenos: number; partilhas: number; bank: number };
  listings: { count: number; potential: number; expected: number; ifPartilha: number };
}

/** The month a deal starts counting: its first invoice, or when it was registered. */
function dealMonth(db: Db, deal: Deal): string {
  const first = db.invoices
    .filter((i) => i.dealId === deal.id && i.status !== "anulada")
    .map((i) => i.settlementMonth)
    .sort()[0];
  return first ?? deal.createdAt.slice(0, 7);
}

export function buildReport(db: Db, c: Consultant, year: string, month: number, now = new Date()): Report {
  const prevYear = String(Number(year) - 1);
  const all = monthsOf(c, year);
  const months = Array.from({ length: 12 }, (_, i) => (i <= month ? (all?.[i] ?? 0) : 0));
  const prevMonths = monthsOf(c, prevYear) ?? null;
  const billed = all ? sumTo(all, month) : billedIn(c, year);
  const prevToDate = prevMonths ? sumTo(prevMonths, month) : null;
  const active = Math.max(1, month - startMonth(c, year) + 1);
  const monthlyAverage = cents(billed / active);
  const monthsLeft = 11 - month;
  const projection = cents(billed + monthlyAverage * monthsLeft);

  const target = (label: string, value: number, level?: PrizeLevel): ReportTarget => {
    const missing = cents(Math.max(0, value - billed));
    return { label, value, missing, perMonth: monthsLeft > 0 ? cents(missing / monthsLeft) : null, reached: missing === 0, level };
  };
  const goal = goalOf(c, year);
  const prize = prizeProgress(billed);
  const nextLevels = PRIZE_LEVELS.filter((l) => l.min > billed).slice(0, 2);
  const targets = [...(goal ? [target(`Objetivo ${year}`, goal)] : []), ...nextLevels.map((l) => target(l.label, l.min, l))];

  const ym = `${year}-${String(month + 1).padStart(2, "0")}`;
  const stats = consultantStats(db, c, year);
  const deals = { total: 0, plenos: 0, partilhas: 0, bank: 0 };
  for (const d of stats.deals) {
    if (dealMonth(db, d) > ym) continue;
    deals.total++;
    const a = d.angariacao.kind === "team" ? d.angariacao.consultantId : null;
    const b = d.compradores?.kind === "team" ? d.compradores.consultantId : null;
    if (d.transaction === "credito") deals.bank++;
    else if (a === c.id && b === c.id) deals.plenos++;
    else deals.partilhas++;
  }

  const row = listingRowOf(db, c.id);
  const ratio = listingSaleMix(db, mixYears(now)).plenoRatio;
  const isCurrent = year === String(now.getFullYear());

  return {
    name: c.name,
    year,
    prevYear,
    month,
    months,
    prevMonths,
    billed,
    prevToDate,
    prevFull: billedIn(c, prevYear),
    growth: prevToDate ? billed / prevToDate - 1 : null,
    monthlyAverage,
    monthsLeft,
    projection,
    projectedLevel: levelFor(projection),
    backlog: isCurrent ? cents(currentBacklog(db, c.id).reduce((s, b) => s + b.remaining, 0)) : null,
    goal,
    goalPerMonth: goal && monthsLeft > 0 ? cents(Math.max(0, goal - billed) / monthsLeft) : null,
    prize,
    targets,
    deals,
    listings: { count: row.count, potential: row.ifPleno, expected: expected(row, ratio), ifPartilha: row.ifPartilha },
  };
}
