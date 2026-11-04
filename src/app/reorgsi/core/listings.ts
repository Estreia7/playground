import type { Db, Deal, Listing } from "./types.ts";
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
