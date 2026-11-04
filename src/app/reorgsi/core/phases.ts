import type { Db, Deal, DealType, Invoice, InvoicePhase } from "./types.ts";
import { CPCV_SHARE } from "./types.ts";
import { cents, invoicesOf } from "./commission.ts";
import { teamFraction } from "./analytics.ts";

/* A sale is paid in two phases: the CPCV (contrato-promessa de compra e
   venda) and the escritura. On some deals half the commission is received
   at the CPCV and the consultant's invoice for that half can be paid then;
   on others everything comes at the escritura. Rentals and bank processes
   have a single payment. */

export type PhaseKey = "cpcv" | "escritura" | "unica";

export type PhaseState =
  /** Every invoice of the phase is paid. */
  | "paga"
  /** Invoiced, waiting for payment. */
  | "por_pagar"
  /** Nothing invoiced yet. */
  | "por_faturar"
  /** This deal receives nothing at the CPCV. */
  | "nao_aplica"
  /** Nobody said yet whether this deal receives half at the CPCV. */
  | "por_indicar";

export interface Phase {
  key: PhaseKey;
  label: string;
  /** The invoice phase a new invoice for this step is filed under. */
  invoicePhase: InvoicePhase;
  invoices: Invoice[];
  state: PhaseState;
  /** What the team should invoice in this phase, when price and % are known. */
  expected?: number;
  billed: number;
}

export const PHASE_STATE_LABEL: Record<PhaseState, string> = {
  paga: "Paga",
  por_pagar: "Por pagar",
  por_faturar: "Por faturar",
  nao_aplica: "Sem pagamento",
  por_indicar: "Por indicar",
};

/** Only sales go through a CPCV. */
export function hasPhases(deal: Deal, types: DealType[]): boolean {
  const type = types.find((t) => t.id === deal.dealTypeId);
  return deal.transaction === "venda" && type?.sides !== "bank";
}

/** The deal's whole commission: price × %. */
export function totalCommission(deal: Deal): number | undefined {
  if (deal.price == null || deal.commissionPct == null) return undefined;
  return cents((deal.price * deal.commissionPct) / 100);
}

/** What the team invoices: the whole commission on a pleno, its side on a
 *  partilha (50% unless the deal was split differently). */
export function teamCommission(deal: Deal): number | undefined {
  const total = totalCommission(deal);
  return total == null ? undefined : cents(total * teamFraction(deal));
}

function stateOf(invoices: Invoice[], empty: PhaseState): PhaseState {
  const live = invoices.filter((i) => i.status !== "anulada");
  if (live.length === 0) return empty;
  return live.every((i) => i.status === "paga") ? "paga" : "por_pagar";
}

const billedOf = (invoices: Invoice[]) => cents(invoices.filter((i) => i.status !== "anulada").reduce((s, i) => s + i.valueNoVat, 0));

export function dealPhases(db: Db, deal: Deal): Phase[] {
  const invoices = invoicesOf(db, deal.id);
  const team = teamCommission(deal);
  if (!hasPhases(deal, db.dealTypes)) {
    return [
      {
        key: "unica",
        label: deal.transaction === "credito" ? "Processo bancário" : "Comissão",
        invoicePhase: deal.transaction === "credito" ? "cb" : "total",
        invoices,
        state: stateOf(invoices, "por_faturar"),
        expected: team,
        billed: billedOf(invoices),
      },
    ];
  }
  const first = invoices.filter((i) => i.phase === "primeira");
  const rest = invoices.filter((i) => i.phase !== "primeira");
  const split = deal.cpcvSplit;
  return [
    {
      key: "cpcv",
      label: "CPCV",
      invoicePhase: "primeira",
      invoices: first,
      state: stateOf(first, split === false ? "nao_aplica" : split == null ? "por_indicar" : "por_faturar"),
      expected: team == null || split == null ? undefined : split ? cents(team * CPCV_SHARE) : 0,
      billed: billedOf(first),
    },
    {
      key: "escritura",
      label: "Escritura",
      invoicePhase: split ? "restante" : "total",
      invoices: rest,
      state: stateOf(rest, "por_faturar"),
      expected: team == null || split == null ? undefined : split ? cents(team - cents(team * CPCV_SHARE)) : team,
      billed: billedOf(rest),
    },
  ];
}

/** Deals still missing the CPCV answer, the ones the list flags. */
export function needsCpcvAnswer(deal: Deal, types: DealType[]): boolean {
  return deal.cpcvSplit == null && deal.status !== "anulado" && hasPhases(deal, types);
}
