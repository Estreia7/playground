import type { Db, Deal, DealType, DocRequirement, Invoice, Party } from "./types.ts";

/* Everything the screens compute from the stored data. Pure functions: the
   same numbers come out on the server, in the browser and in the import
   report, which is what lets the import be checked against the spreadsheets. */

/** Euros rounded half-up to the cent, the way the spreadsheets round. Done in
 *  cents so 48,125 € becomes 48,13 € and not 48,12 € through float noise. */
export function cents(euros: number): number {
  return Math.round(euros * 100 + 1e-7) / 100;
}

export function managerPct(invoice: Invoice, deal: Deal | undefined, types: DealType[]): number {
  if (invoice.managerPctOverride != null) return invoice.managerPctOverride;
  const type = types.find((t) => t.id === deal?.dealTypeId);
  return type?.defaultManagerPct ?? 0;
}

/** The manager's cut of one invoice. A cancelled invoice earns nothing.
 *  Not rounded: the spreadsheets keep 48,125 € and round only the totals,
 *  and rounding each line drifts a cent or two off their monthly figures. */
export function managerShare(invoice: Invoice, deal: Deal | undefined, types: DealType[]): number {
  if (invoice.status === "anulada") return 0;
  return (invoice.valueNoVat * managerPct(invoice, deal, types)) / 100;
}

/** Only paid invoices reach the manager's account; issued ones are pending. */
export function counts(invoice: Invoice): boolean {
  return invoice.status === "paga";
}

export function requirementsFor(deal: Deal, reqs: DocRequirement[]): DocRequirement[] {
  return reqs
    .filter((r) => r.appliesTo.length === 0 || r.appliesTo.includes(deal.dealTypeId))
    .sort((a, b) => a.order - b.order);
}

export interface DocProgress {
  /** 0..1 over the required documents that apply. */
  ratio: number;
  done: number;
  total: number;
  /** Required documents explicitly marked as missing. */
  missing: number;
  /** Done but only ticked, with no file attached. */
  unfiled: number;
}

export function docProgress(deal: Deal, reqs: DocRequirement[]): DocProgress {
  let done = 0;
  let total = 0;
  let missing = 0;
  let unfiled = 0;
  for (const r of requirementsFor(deal, reqs)) {
    if (!r.required) continue;
    const entry = deal.documents[r.id];
    if (entry?.state === "na") continue;
    total++;
    if (entry?.state === "ficheiro" || entry?.state === "confirmado") {
      done++;
      if (entry.state === "confirmado") unfiled++;
    } else if (entry?.state === "em_falta") {
      missing++;
    }
  }
  return { ratio: total === 0 ? 1 : done / total, done, total, missing, unfiled };
}

export function invoicesOf(db: Db, dealId: string): Invoice[] {
  return db.invoices
    .filter((i) => i.dealId === dealId)
    .sort((a, b) => (a.issuedAt ?? a.settlementMonth).localeCompare(b.issuedAt ?? b.settlementMonth));
}

export function dealShare(db: Db, deal: Deal): number {
  return cents(invoicesOf(db, deal.id).reduce((s, i) => s + managerShare(i, deal, db.dealTypes), 0));
}

export function dealBilled(db: Db, deal: Deal): number {
  return cents(
    invoicesOf(db, deal.id)
      .filter((i) => i.status !== "anulada")
      .reduce((s, i) => s + i.valueNoVat, 0),
  );
}

/** Manager's earnings from paid invoices, by settlement month (YYYY-MM → €).
 *  Values are left unrounded so sums match the spreadsheet; round to show. */
export function sharesByMonth(db: Db): Map<string, number> {
  const deals = new Map(db.deals.map((d) => [d.id, d]));
  const out = new Map<string, number>();
  for (const inv of db.invoices) {
    if (!counts(inv)) continue;
    const share = managerShare(inv, deals.get(inv.dealId), db.dealTypes);
    out.set(inv.settlementMonth, (out.get(inv.settlementMonth) ?? 0) + share);
  }
  return out;
}

export interface Account {
  opening: number;
  earned: number;
  paid: number;
  balance: number;
  /** Shares on invoices issued but not yet paid. */
  pending: number;
}

export function account(db: Db): Account {
  let earned = 0;
  for (const v of sharesByMonth(db).values()) earned += v;
  const deals = new Map(db.deals.map((d) => [d.id, d]));
  const pending = db.invoices
    .filter((i) => i.status === "emitida")
    .reduce((s, i) => s + managerShare(i, deals.get(i.dealId), db.dealTypes), 0);
  const paid = db.payouts.reduce((s, p) => s + p.amount, 0);
  const opening = db.settings.openingBalance;
  return {
    opening,
    earned: cents(earned),
    paid: cents(paid),
    balance: cents(opening + earned - paid),
    pending: cents(pending),
  };
}

export function teamId(party: Party | undefined): string | null {
  return party?.kind === "team" ? party.consultantId : null;
}

/** What each team consultant billed through the deals, by year of the
 *  invoice's settlement month. An invoice covers only the team's side, so
 *  a one-sided deal credits the whole value to that side; when two different
 *  team members share a deal it is split by the listing share. */
export function billingByConsultant(db: Db, year: string): Map<string, number> {
  const deals = new Map(db.deals.map((d) => [d.id, d]));
  const out = new Map<string, number>();
  const add = (id: string, v: number) => out.set(id, (out.get(id) ?? 0) + v);
  for (const inv of db.invoices) {
    if (inv.status === "anulada" || !inv.settlementMonth.startsWith(year)) continue;
    const deal = deals.get(inv.dealId);
    if (!deal) continue;
    const a = teamId(deal.angariacao);
    const c = teamId(deal.compradores);
    if (a && c && a !== c) {
      add(a, (inv.valueNoVat * deal.listingSplitPct) / 100);
      add(c, (inv.valueNoVat * (100 - deal.listingSplitPct)) / 100);
    } else if (a ?? c) {
      add((a ?? c)!, inv.valueNoVat);
    }
  }
  for (const [k, v] of out) out.set(k, cents(v));
  return out;
}

export function dealCountByConsultant(db: Db): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of db.deals) {
    const ids = new Set([teamId(d.angariacao), teamId(d.compradores)].filter(Boolean) as string[]);
    for (const id of ids) out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/** Year-to-date sum of a monthly series, up to and including month index `upTo`. */
export function ytd(series: (number | null)[] | undefined, upTo: number): number {
  if (!series) return 0;
  let s = 0;
  for (let i = 0; i <= upTo && i < series.length; i++) s += series[i] ?? 0;
  return cents(s);
}

/** Last month index with a figure in the series, or -1. */
export function lastFilledMonth(series: (number | null)[] | undefined): number {
  if (!series) return -1;
  for (let i = series.length - 1; i >= 0; i--) if (series[i] != null) return i;
  return -1;
}

export function growth(current: number, previous: number): number | null {
  if (!previous) return null;
  return current / previous - 1;
}

export function partyName(db: Db, party: Party | undefined): string {
  if (!party) return "";
  if (party.kind === "external") return party.name;
  return db.consultants.find((c) => c.id === party.consultantId)?.name ?? "—";
}
