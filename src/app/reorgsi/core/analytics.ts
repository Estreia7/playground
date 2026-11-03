import type { Consultant, Db, Deal, Invoice } from "./types.ts";
import { cents, docProgress, managerShare, teamId } from "./commission.ts";

/* Indicators for the Análises tab: one consultant at a time, and the whole
   team as the manager sees it.

   Everything is counted from the invoices settled in the chosen year, with
   the same rule as billingByConsultant: an invoice covers only the team's
   side, so a consultant who holds a side alone gets the whole value, and two
   team members on one deal share it by the listing split. The manager's share
   is divided the same way, so the per-consultant shares add up to the
   manager's total. */

export interface ConsultantStats {
  consultant: Consultant;
  /** Billing credited to this consultant in the year (€, without VAT). */
  billed: number;
  billedByMonth: number[];
  /** Billing in the previous year: from the deals if there are any, else the team sheet. */
  previous: number;
  growth: number | null;
  /** What this consultant's deals earned the manager in the year (paid invoices only). */
  managerShare: number;
  /** Deals with activity in the year that this consultant took part in. */
  deals: Deal[];
  asListing: number;
  asBuyer: number;
  /** Both sides held by this consultant. */
  fullDeals: number;
  /** One side theirs, the other an outside agency or consultant. */
  sharedExternal: number;
  /** Shared with another team member. */
  sharedTeam: number;
  bank: number;
  averagePrice: number | null;
  averageInvoice: number | null;
  invoices: number;
  docsComplete: number;
  docsMissing: number;
  unfiled: number;
  unpaid: number;
  unpaidValue: number;
}

export interface TeamStats {
  year: string;
  people: ConsultantStats[];
  billed: number;
  previous: number;
  growth: number | null;
  managerShare: number;
  billedByMonth: number[];
  shareByMonth: number[];
  deals: number;
  byType: { id: string; name: string; count: number; billed: number }[];
  byStatus: { status: Consultant["status"]; people: number; billed: number }[];
  /** Consultants with no billing in the year among those still active. */
  idle: Consultant[];
  docsComplete: number;
  docsTotal: number;
  unpaidValue: number;
}

const month = (inv: Invoice) => Number(inv.settlementMonth.slice(5, 7)) - 1;

/** The share of an invoice that belongs to a consultant on this deal (0..1). */
export function weightFor(deal: Deal, consultantId: string): number {
  const a = teamId(deal.angariacao);
  const c = teamId(deal.compradores);
  if (a === consultantId && c === consultantId) return 1;
  if (a === consultantId) return c ? deal.listingSplitPct / 100 : 1;
  if (c === consultantId) return a ? (100 - deal.listingSplitPct) / 100 : 1;
  return 0;
}

function inYear(inv: Invoice, year: string): boolean {
  return inv.status !== "anulada" && inv.settlementMonth.startsWith(year);
}

export function consultantStats(db: Db, consultant: Consultant, year: string): ConsultantStats {
  const prevYear = String(Number(year) - 1);
  const dealsById = new Map(db.deals.map((d) => [d.id, d]));
  const billedByMonth = Array(12).fill(0) as number[];
  let billed = 0;
  let previousFromDeals = 0;
  let share = 0;
  let invoices = 0;
  let unpaid = 0;
  let unpaidValue = 0;
  const active = new Set<string>();

  for (const inv of db.invoices) {
    const deal = dealsById.get(inv.dealId);
    if (!deal) continue;
    const w = weightFor(deal, consultant.id);
    if (!w) continue;
    if (inYear(inv, prevYear)) previousFromDeals += inv.valueNoVat * w;
    if (!inYear(inv, year)) continue;
    active.add(deal.id);
    invoices++;
    billed += inv.valueNoVat * w;
    billedByMonth[month(inv)] += inv.valueNoVat * w;
    if (inv.status === "paga") share += managerShare(inv, deal, db.dealTypes) * w;
    if (inv.status === "emitida") {
      unpaid++;
      unpaidValue += inv.valueNoVat * w;
    }
  }
  // Open deals without an invoice yet still belong to the year they were opened in.
  for (const d of db.deals) {
    if (d.status === "aberto" && d.createdAt.startsWith(year) && weightFor(d, consultant.id)) active.add(d.id);
  }

  const deals = [...active].map((id) => dealsById.get(id)!).filter(Boolean);
  let asListing = 0;
  let asBuyer = 0;
  let fullDeals = 0;
  let sharedExternal = 0;
  let sharedTeam = 0;
  let bank = 0;
  let docsComplete = 0;
  let docsMissing = 0;
  let unfiled = 0;
  const prices: number[] = [];

  for (const d of deals) {
    const a = teamId(d.angariacao);
    const c = teamId(d.compradores);
    if (d.transaction === "credito") bank++;
    else if (a === consultant.id && c === consultant.id) fullDeals++;
    else if ((a && a !== consultant.id) || (c && c !== consultant.id)) sharedTeam++;
    else sharedExternal++;
    if (a === consultant.id) asListing++;
    if (c === consultant.id) asBuyer++;
    if (d.transaction === "venda" && d.price) prices.push(d.price);
    const p = docProgress(d, db.docRequirements);
    if (p.ratio >= 1) docsComplete++;
    docsMissing += p.missing;
    unfiled += p.unfiled;
  }

  const previous = previousFromDeals > 0 ? previousFromDeals : (consultant.billingByYear[prevYear] ?? 0);
  return {
    consultant,
    billed: cents(billed),
    billedByMonth: billedByMonth.map(cents),
    previous: cents(previous),
    growth: previous ? billed / previous - 1 : null,
    managerShare: cents(share),
    deals,
    asListing,
    asBuyer,
    fullDeals,
    sharedExternal,
    sharedTeam,
    bank,
    averagePrice: prices.length ? cents(prices.reduce((s, p) => s + p, 0) / prices.length) : null,
    averageInvoice: invoices ? cents(billed / invoices) : null,
    invoices,
    docsComplete,
    docsMissing,
    unfiled,
    unpaid,
    unpaidValue: cents(unpaidValue),
  };
}

export function teamStats(db: Db, year: string): TeamStats {
  const people = db.consultants
    .map((c) => consultantStats(db, c, year))
    .filter((s) => s.billed > 0 || s.deals.length > 0 || s.consultant.status !== "inativo")
    .sort((a, b) => b.billed - a.billed || a.consultant.name.localeCompare(b.consultant.name, "pt"));

  const dealsById = new Map(db.deals.map((d) => [d.id, d]));
  const shareByMonth = Array(12).fill(0) as number[];
  const billedByMonth = Array(12).fill(0) as number[];
  const typeCount = new Map<string, { count: Set<string>; billed: number }>();
  const teamDeals = new Set<string>();
  let share = 0;

  for (const inv of db.invoices) {
    if (!inYear(inv, year)) continue;
    const deal = dealsById.get(inv.dealId);
    if (!deal) continue;
    // Team billing = the part of the invoice credited to team members.
    const teamPart =
      [...new Set([teamId(deal.angariacao), teamId(deal.compradores)].filter(Boolean) as string[])].reduce(
        (s, id) => s + weightFor(deal, id),
        0,
      ) || 0;
    billedByMonth[month(inv)] += inv.valueNoVat * Math.min(1, teamPart);
    if (inv.status === "paga") {
      const s = managerShare(inv, deal, db.dealTypes);
      share += s;
      shareByMonth[month(inv)] += s;
    }
    teamDeals.add(deal.id);
    const t = typeCount.get(deal.dealTypeId) ?? { count: new Set<string>(), billed: 0 };
    t.count.add(deal.id);
    t.billed += inv.valueNoVat;
    typeCount.set(deal.dealTypeId, t);
  }

  const billed = billedByMonth.reduce((s, v) => s + v, 0);
  const previous = people.reduce((s, p) => s + p.previous, 0);
  const statuses: Consultant["status"][] = ["experiente", "rookie", "inativo"];
  const allDeals = [...teamDeals].map((id) => dealsById.get(id)!).filter(Boolean);

  return {
    year,
    people,
    billed: cents(billed),
    previous: cents(previous),
    growth: previous ? billed / previous - 1 : null,
    managerShare: cents(share),
    billedByMonth: billedByMonth.map(cents),
    shareByMonth: shareByMonth.map(cents),
    deals: teamDeals.size,
    byType: db.dealTypes
      .map((t) => ({ id: t.id, name: t.name, count: typeCount.get(t.id)?.count.size ?? 0, billed: cents(typeCount.get(t.id)?.billed ?? 0) }))
      .filter((t) => t.count > 0),
    byStatus: statuses
      .map((status) => {
        const group = people.filter((p) => p.consultant.status === status);
        return { status, people: group.length, billed: cents(group.reduce((s, p) => s + p.billed, 0)) };
      })
      .filter((g) => g.people > 0),
    idle: people.filter((p) => p.billed === 0 && p.consultant.status !== "inativo").map((p) => p.consultant),
    docsComplete: allDeals.filter((d) => docProgress(d, db.docRequirements).ratio >= 1).length,
    docsTotal: allDeals.length,
    unpaidValue: cents(people.reduce((s, p) => s + p.unpaidValue, 0)),
  };
}

/* ---------- backlog ----------

   Backlog is commission already won but not yet billed: a deal whose first
   part was invoiced and whose rest has not been, or a new deal with an agreed
   commission and nothing invoiced yet.

   With price and commission % on the deal, what is still to come is the
   team's side of the commission minus what was billed. Imported deals carry
   neither, so the rest is estimated as equal to the first part, which is how
   most of the manager's deals were split (4 500 + 4 500, 8 706,25 +
   8 706,25…). Those items are marked as estimates. */

export interface BacklogItem {
  deal: Deal;
  remaining: number;
  managerPart: number;
  estimated: boolean;
  /** First month this deal counted as backlog (YYYY-MM). */
  since: string;
}

/** Fraction of a deal's whole commission that the team's invoices cover. */
function teamFraction(deal: Deal): number {
  const a = teamId(deal.angariacao);
  const c = teamId(deal.compradores);
  if (a && c) return 1;
  if (a) return deal.compradores ? deal.listingSplitPct / 100 : 1;
  if (c) return (100 - deal.listingSplitPct) / 100;
  return 0;
}

/** This deal's backlog as it stood at the end of month `ym`, or null. */
export function backlogAt(db: Db, deal: Deal, ym: string): BacklogItem | null {
  if (deal.status === "anulado" || deal.transaction === "credito") return null;
  const invs = db.invoices.filter((i) => i.dealId === deal.id && i.status !== "anulada" && i.settlementMonth <= ym);
  if (invs.some((i) => i.phase === "total" || i.phase === "restante")) return null;
  const billed = invs.reduce((s, i) => s + i.valueNoVat, 0);
  const first = invs.map((i) => i.settlementMonth).sort()[0];
  const opened = deal.createdAt.slice(0, 7);

  let remaining = 0;
  let estimated = false;
  let since = first ?? opened;
  if (deal.price && deal.commissionPct) {
    remaining = (deal.price * deal.commissionPct * teamFraction(deal)) / 100 - billed;
    if (!first) since = opened;
  } else if (invs.some((i) => i.phase === "primeira")) {
    remaining = invs.filter((i) => i.phase === "primeira").reduce((s, i) => s + i.valueNoVat, 0);
    estimated = true;
  }
  if (remaining <= 0.005 || since > ym) return null;

  const last = invs[invs.length - 1];
  const type = db.dealTypes.find((t) => t.id === deal.dealTypeId);
  const pct = last?.managerPctOverride ?? type?.defaultManagerPct ?? 0;
  return { deal, remaining: cents(remaining), managerPart: cents((remaining * pct) / 100), estimated, since };
}

const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Backlog right now. `consultantId` narrows it to that person's part. */
export function currentBacklog(db: Db, consultantId?: string): BacklogItem[] {
  const now = ym(new Date());
  return db.deals
    .map((d) => {
      const item = backlogAt(db, d, now);
      if (!item) return null;
      if (!consultantId) return item;
      const w = weightFor(d, consultantId);
      return w ? { ...item, remaining: cents(item.remaining * w), managerPart: cents(item.managerPart * w) } : null;
    })
    .filter((x): x is BacklogItem => x !== null)
    .sort((a, b) => b.remaining - a.remaining);
}

export interface BacklogPoint {
  month: string;
  value: number;
  managerPart: number;
  estimated: number;
  deals: number;
}

/** Backlog at the end of each month of `year`, up to the current month. */
export function backlogSeries(db: Db, year: string, consultantId?: string): BacklogPoint[] {
  const now = ym(new Date());
  const out: BacklogPoint[] = [];
  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${String(m).padStart(2, "0")}`;
    if (month > now) break;
    let value = 0;
    let managerPart = 0;
    let estimated = 0;
    let deals = 0;
    for (const d of db.deals) {
      const w = consultantId ? weightFor(d, consultantId) : 1;
      if (!w) continue;
      const item = backlogAt(db, d, month);
      if (!item) continue;
      value += item.remaining * w;
      managerPart += item.managerPart * w;
      if (item.estimated) estimated += item.remaining * w;
      deals++;
    }
    out.push({ month, value: cents(value), managerPart: cents(managerPart), estimated: cents(estimated), deals });
  }
  return out;
}

/** Years that have invoices, newest first, always including the current one. */
export function activityYears(db: Db): string[] {
  const years = new Set(db.invoices.map((i) => i.settlementMonth.slice(0, 4)));
  years.add(String(new Date().getFullYear()));
  return [...years].sort().reverse();
}

/** Every year a consultant has billing in: from invoices where the app has
 *  them, otherwise the yearly figure from the team spreadsheet. */
export function billingYears(db: Db): string[] {
  const years = new Set(activityYears(db));
  for (const c of db.consultants) for (const y of Object.keys(c.billingByYear)) years.add(y);
  return [...years].sort().reverse();
}

/** All-time billing: each year counted once, from invoices when the app has
 *  that year's invoices, from the spreadsheet figure when it does not. */
export function allTimeBilled(db: Db, consultant: Consultant): number {
  const invoiceYears = new Set(db.invoices.map((i) => i.settlementMonth.slice(0, 4)));
  let total = 0;
  for (const y of billingYears(db)) {
    total += invoiceYears.has(y) ? consultantStats(db, consultant, y).billed : (consultant.billingByYear[y] ?? 0);
  }
  return cents(total);
}

export interface PeriodCompare {
  label: string;
  /** Month range as "jan–mar". */
  months: [number, number];
  now: number;
  /** The previous year over the same months this year has figures for. */
  prev: number;
  /** The previous year's whole period, for the reference on what is still to come. */
  prevFull: number;
  state: "done" | "running" | "ahead";
  /** The months this year has so far, when the period is running. */
  upTo: number;
}

/** Quarters and semesters of a monthly series against the year before. A
 *  period under way is compared over the same months only. */
export function periodCompare(now: (number | null)[], prev: (number | null)[], upTo: number): { quarters: PeriodCompare[]; semesters: PeriodCompare[] } {
  const sum = (s: (number | null)[], a: number, b: number) => {
    let t = 0;
    for (let i = a; i <= b; i++) t += s[i] ?? 0;
    return cents(t);
  };
  const make = (label: string, a: number, b: number): PeriodCompare => {
    const state = upTo >= b ? "done" : upTo >= a ? "running" : "ahead";
    const end = state === "running" ? upTo : b;
    return { label, months: [a, b], now: state === "ahead" ? 0 : sum(now, a, end), prev: sum(prev, a, end), prevFull: sum(prev, a, b), state, upTo };
  };
  return {
    quarters: [make("1.º trimestre", 0, 2), make("2.º trimestre", 3, 5), make("3.º trimestre", 6, 8), make("4.º trimestre", 9, 11)],
    semesters: [make("1.º semestre", 0, 5), make("2.º semestre", 6, 11)],
  };
}

export interface BehindItem {
  stats: ConsultantStats;
  /** What they did this year so far: € in billing mode, deals in deals mode. */
  actual: number;
  /** What they were expected to have by now. */
  expected: number;
  /** Where the expectation comes from. */
  basis: "own" | "team";
  /** Settlement month of their last invoice, if any. */
  lastInvoice: string | null;
}

/** The active consultants furthest behind this year, by billing or by deals.
 *  Billing is measured against their own previous year over the same months
 *  (from the deals, or the team sheet's annual figure at a steady pace); people
 *  without a previous year, and deal counts, against the team's median,
 *  adjusted for the months each person has been in the team. */
export function behindTeam(db: Db, year: string, by: "billed" | "deals", limit = 5): { items: BehindItem[]; upTo: number } {
  const prevYear = String(Number(year) - 1);
  const team = teamStats(db, year);
  let upTo = 11;
  if (year === String(new Date().getFullYear())) {
    upTo = -1;
    team.billedByMonth.forEach((v, i) => v > 0 && (upTo = i));
  }
  if (upTo < 0) return { items: [], upTo };
  const span = upTo + 1;
  // Share of the elapsed months each person was in the team.
  const presence = (c: Consultant) => {
    if (!c.joinedAt || c.joinedAt.slice(0, 4) < year) return 1;
    if (c.joinedAt.slice(0, 4) > year) return 0;
    const from = Number(c.joinedAt.slice(5, 7)) - 1;
    return Math.max(0, span - from) / span;
  };
  const people = team.people.filter((p) => p.consultant.status !== "inativo" && presence(p.consultant) > 0);
  const valueOf = (p: ConsultantStats) => (by === "billed" ? ytdOf(p.billedByMonth, upTo) : p.deals.length);
  // The median, per full period in the team: one big earner would make everyone else look behind.
  const rates = people.map((p) => valueOf(p) / presence(p.consultant)).sort((a, b) => a - b);
  const mid = rates.length >> 1;
  const typical = rates.length ? (rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2) : 0;

  const lastInvoice = new Map<string, string>();
  const dealsById = new Map(db.deals.map((d) => [d.id, d]));
  for (const inv of db.invoices) {
    const deal = dealsById.get(inv.dealId);
    if (!deal || inv.status === "anulada") continue;
    for (const p of people) {
      const id = p.consultant.id;
      if (weightFor(deal, id) && (lastInvoice.get(id) ?? "") < inv.settlementMonth) lastInvoice.set(id, inv.settlementMonth);
    }
  }

  const items: BehindItem[] = people.map((p) => {
    const actual = valueOf(p);
    let expected = typical * presence(p.consultant);
    let basis: BehindItem["basis"] = "team";
    if (by === "billed") {
      const prev = consultantStats(db, p.consultant, prevYear);
      const own = prev.billed > 0 ? ytdOf(prev.billedByMonth, upTo) : ((p.consultant.billingByYear[prevYear] ?? 0) * span) / 12;
      if (own > 0) {
        expected = own;
        basis = "own";
      }
    }
    return { stats: p, actual: by === "billed" ? cents(actual) : actual, expected: by === "billed" ? cents(expected) : expected, basis, lastInvoice: lastInvoice.get(p.consultant.id) ?? null };
  });

  return {
    upTo,
    items: items
      .filter((i) => i.expected > 0 && i.actual < i.expected)
      .sort((a, b) => a.actual / a.expected - b.actual / b.expected || a.actual - a.expected - (b.actual - b.expected))
      .slice(0, limit),
  };
}

function ytdOf(series: number[], upTo: number): number {
  let t = 0;
  for (let i = 0; i <= upTo; i++) t += series[i] ?? 0;
  return t;
}
