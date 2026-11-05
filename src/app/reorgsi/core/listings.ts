import type { Consultant, Db, Deal, Listing } from "./types.ts";
import { closedUpTo, goalPace, sumTo } from "./billing.ts";
import { cents, teamId } from "./commission.ts";

/* Angariações: what each consultant has taken on to sell, and what it could
   bring. A listing sold as a pleno brings the whole commission; sold as a
   partilha, the other agency brings the buyer and the team keeps its side,
   half by default. The expected figure weighs the two by a scenario: even
   odds, or how the team's own listings actually sold. */

/** The year a deal counts in: its first invoice, or when it was registered. */
function dealYear(db: Db, deal: Deal): string {
  const first = db.invoices
    .filter((i) => i.dealId === deal.id && i.status !== "anulada")
    .map((i) => i.settlementMonth)
    .sort()[0];
  return (first ?? deal.createdAt).slice(0, 4);
}

export interface SaleMix {
  plenos: number;
  partilhas: number;
  /** Plenos over all sales counted, 0..1; 0.5 when there is nothing to count. */
  plenoRatio: number;
  years: string[];
}

/** How sales with the listing on the team ended, plenos against partilhas,
 *  over the given years. */
export function listingSaleMix(db: Db, years: string[]): SaleMix {
  let plenos = 0;
  let partilhas = 0;
  for (const d of db.deals) {
    if (d.transaction !== "venda" || d.status === "anulado") continue;
    if (!teamId(d.angariacao)) continue;
    if (!years.includes(dealYear(db, d))) continue;
    if (teamId(d.compradores)) plenos++;
    else partilhas++;
  }
  const n = plenos + partilhas;
  return { plenos, partilhas, plenoRatio: n ? plenos / n : 0.5, years };
}

export interface ListingRow {
  consultantId: string;
  count: number;
  /** Sum of asking prices. */
  portfolio: number;
  /** Mean commission % across the listings, or undefined without any. */
  avgPct?: number;
  /** Whole commission if every listing sold as a pleno. */
  ifPleno: number;
  /** The team's side if every listing sold as a partilha. */
  ifPartilha: number;
}

/** Share of the commission the listing side keeps in a partilha. */
export const PARTILHA_SHARE = 0.5;

/** The years the plenos and partilhas average is taken over: last year and this one. */
export function mixYears(now = new Date()): string[] {
  return [String(now.getFullYear() - 1), String(now.getFullYear())];
}

/** Listings a consultant took in a year, by the CRM's monthly count. */
export function listedIn(c: Consultant | undefined, year: string): number {
  return (c?.listingsByMonth?.[year] ?? []).reduce((s, v) => s + v, 0);
}

/** What a listing brings as a pleno: its whole commission. */
export const potential = (l: Pick<Listing, "price" | "commissionPct">) => cents((l.price * l.commissionPct) / 100);

export function listingRows(db: Db): ListingRow[] {
  const active = (db.listings ?? []).filter((l) => l.status === "ativa");
  const byConsultant = new Map<string, Listing[]>();
  for (const l of active) byConsultant.set(l.consultantId, [...(byConsultant.get(l.consultantId) ?? []), l]);
  return db.consultants
    .filter((c) => c.status !== "inativo" || byConsultant.has(c.id))
    .map((c) => {
      const list = byConsultant.get(c.id) ?? [];
      const commission = list.reduce((s, l) => s + (l.price * l.commissionPct) / 100, 0);
      return {
        consultantId: c.id,
        count: list.length,
        portfolio: cents(list.reduce((s, l) => s + l.price, 0)),
        avgPct: list.length ? list.reduce((s, l) => s + l.commissionPct, 0) / list.length : undefined,
        ifPleno: cents(commission),
        ifPartilha: cents(commission * PARTILHA_SHARE),
      };
    });
}

/** One consultant's row, empty when they have no listings and are inactive. */
export function listingRowOf(db: Db, consultantId: string): ListingRow {
  return listingRows(db).find((r) => r.consultantId === consultantId) ?? { consultantId, count: 0, portfolio: 0, ifPleno: 0, ifPartilha: 0 };
}

/** Expected earnings from a row, sold as plenos with probability `plenoRatio`. */
export function expected(row: Pick<ListingRow, "ifPleno" | "ifPartilha">, plenoRatio: number): number {
  return cents(row.ifPleno * plenoRatio + row.ifPartilha * (1 - plenoRatio));
}

/* ---------- how the team is taking listings ----------

   From the CRM's monthly count. Comparisons stop at the last month that is
   over, so a month still running never reads as a fall. */

const monthsListed = (c: Consultant, year: string) => c.listingsByMonth?.[year] ?? (Array(12).fill(0) as number[]);

export interface ListingTrend {
  /** Last month that is over, 0..11. */
  upTo: number;
  months: number[];
  prevMonths: number[];
  toDate: number;
  prevToDate: number;
  /** Against the same months of the year before. */
  change: number | null;
}

export function listingTrend(db: Db, year: string, now = new Date()): ListingTrend {
  const prevYear = String(Number(year) - 1);
  const total = (y: string) => db.consultants.reduce((t, c) => t.map((v, i) => v + monthsListed(c, y)[i]), Array(12).fill(0) as number[]);
  const upTo = closedUpTo(year, now);
  const months = total(year);
  const prevMonths = total(prevYear);
  const toDate = sumTo(months, upTo);
  const prevToDate = sumTo(prevMonths, upTo);
  return { upTo, months, prevMonths, toDate, prevToDate, change: prevToDate ? toDate / prevToDate - 1 : null };
}

export interface PlanPaceRow {
  consultant: Consultant;
  target: number;
  done: number;
  /** Where a steady pace to the target would be by now. */
  due: number;
}

/** Listings taken against each Business Plan's yearly target, furthest behind first. */
export function planPace(db: Db, year: string, now = new Date()): { rows: PlanPaceRow[]; target: number; done: number; due: number } {
  const span = closedUpTo(year, now) + 1;
  const rows = db.consultants
    .filter((c) => c.status !== "inativo" && c.plans?.[year]?.listingTarget)
    .map((c) => {
      const target = c.plans![year].listingTarget!;
      return { consultant: c, target, done: sumTo(monthsListed(c, year), 11), due: (target * span) / 12 };
    })
    .sort((a, b) => a.done / a.due - b.done / b.due || a.consultant.name.localeCompare(b.consultant.name, "pt"));
  const add = (k: "target" | "done" | "due") => rows.reduce((s, r) => s + r[k], 0);
  return { rows, target: add("target"), done: add("done"), due: add("due") };
}

export interface IdleLister {
  consultant: Consultant;
  /** Month of the last listing (YYYY-MM), or null with none in the two years. */
  last: string | null;
}

/** Active consultants with no listing in the last `span` months that are over.
 *  People with no count for the year, or who joined within the window, are left out. */
export function idleListers(db: Db, year: string, now = new Date(), span = 3): IdleLister[] {
  const prevYear = String(Number(year) - 1);
  const end = 12 + closedUpTo(year, now);
  const start = end - span + 1;
  const ym = (i: number) => `${i < 12 ? prevYear : year}-${String((i % 12) + 1).padStart(2, "0")}`;
  const out: IdleLister[] = [];
  for (const c of db.consultants) {
    if (c.status === "inativo" || !c.listingsByMonth?.[year]) continue;
    if (c.joinedAt && c.joinedAt.slice(0, 7) > ym(start)) continue;
    const seq = [...monthsListed(c, prevYear), ...monthsListed(c, year)];
    if (seq.slice(start).some((v) => v > 0)) continue;
    const at = seq.findLastIndex((v) => v > 0);
    out.push({ consultant: c, last: at < 0 ? null : ym(at) });
  }
  return out.sort((a, b) => (a.last ?? "").localeCompare(b.last ?? "") || a.consultant.name.localeCompare(b.consultant.name, "pt"));
}

/** Sales with the listing on the team in a year, against listings taken in it.
 *  Only an indication: a sale can come from a listing of an earlier year. */
export function listingConversion(db: Db, year: string): { sold: number; listed: number; rate: number | null } {
  const mix = listingSaleMix(db, [year]);
  const sold = mix.plenos + mix.partilhas;
  const listed = db.consultants.reduce((s, c) => s + listedIn(c, year), 0);
  return { sold, listed, rate: listed ? sold / listed : null };
}

/** What the active listings are expected to bring, against what is left to bill
 *  to reach the goals of the year. */
export function goalCoverage(db: Db, year: string, plenoRatio: number, now = new Date()): { expected: number; missing: number; ratio: number | null; people: number } {
  const rows = new Map(listingRows(db).map((r) => [r.consultantId, r]));
  let total = 0;
  let missing = 0;
  let people = 0;
  for (const c of db.consultants) {
    const pace = c.status === "inativo" ? null : goalPace(c, year, now);
    if (!pace || pace.reached) continue;
    people++;
    missing += pace.missing;
    const row = rows.get(c.id);
    if (row) total += expected(row, plenoRatio);
  }
  return { expected: cents(total), missing: cents(missing), ratio: missing ? total / missing : null, people };
}
