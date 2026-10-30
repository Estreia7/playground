/* The ReorgSI data model.

   One document holds everything a manager's team produces in a year or two:
   a few dozen consultants, a few hundred invoices. It is read and written
   whole, like the padel club, so every shape here is plain JSON. Money is in
   euros as numbers; dates are ISO strings (YYYY-MM-DD) or months (YYYY-MM). */

export type ConsultantStatus = "rookie" | "experiente" | "inativo";

export interface Consultant {
  id: string;
  name: string;
  status: ConsultantStatus;
  joinedAt?: string;
  /** Billing figures carried over from the team sheet, by year ("2024": 78132). */
  billingByYear: Record<string, number>;
  /** Prize tier on the team sheet (RUBY, EMERALD, CENTURION…). */
  prize?: string;
}

/** One side of a deal: someone on the team, or anyone else (an agency or an
 *  outside consultant). `note` keeps what was in brackets, e.g. "ref C21Heritage". */
export type Party =
  | { kind: "team"; consultantId: string; note?: string }
  | { kind: "external"; name: string; note?: string };

/** Which sides of a deal the team covers, which decides the manager's cut. */
export type DealSides = "both" | "listing" | "buyer" | "bank";

export interface DealType {
  id: string;
  name: string;
  sides: DealSides;
  /** Manager's share as a percentage of the invoice value without VAT. */
  defaultManagerPct: number;
  active: boolean;
}

export interface DocRequirement {
  id: string;
  name: string;
  required: boolean;
  /** Deal types this applies to; empty means every type. */
  appliesTo: string[];
  order: number;
}

export interface FileRef {
  id: string;
  name: string;
  mime: string;
  size: number;
  uploadedAt: string;
}

/** "confirmado" is a document someone ticked as Ok without uploading it —
 *  the spreadsheets are full of those. It counts as done, flagged "sem ficheiro". */
export type DocState = "ficheiro" | "confirmado" | "em_falta" | "na";

export interface DocEntry {
  state: DocState;
  file?: FileRef;
}

export type Transaction = "venda" | "arrendamento" | "credito";
export type DealStatus = "aberto" | "concluido" | "anulado";

export interface Deal {
  id: string;
  ref: string;
  listingUrl?: string;
  listingShot?: FileRef;
  transaction: Transaction;
  price?: number;
  /** Property address; for a bank process, the bank and client. */
  address: string;
  dealTypeId: string;
  angariacao: Party;
  compradores?: Party;
  /** Commission agreed on the price, as a percentage. */
  commissionPct?: number;
  /** Share of the commission that goes to the listing side, as a percentage. */
  listingSplitPct: number;
  documents: Record<string, DocEntry>;
  status: DealStatus;
  createdAt: string;
  notes?: string;
}

export type InvoicePhase = "total" | "primeira" | "restante" | "cb";
export type InvoiceStatus = "emitida" | "paga" | "anulada";

export interface Invoice {
  id: string;
  dealId: string;
  phase: InvoicePhase;
  number: string;
  issuedAt?: string;
  paidAt?: string;
  /** Month this invoice counts towards on the manager's account (YYYY-MM). */
  settlementMonth: string;
  valueNoVat: number;
  /** Replaces the deal type's default when this deal was agreed differently. */
  managerPctOverride?: number;
  status: InvoiceStatus;
  file?: FileRef;
  /** Something to check by hand, e.g. the import found the same invoice in two months. */
  flag?: string;
}

/** Money paid out to the manager, against which the balance runs down. */
export interface Payout {
  id: string;
  date: string;
  reference: string;
  amount: number;
  file?: FileRef;
}

export interface Settings {
  managerName: string;
  /** Balance carried into the account, and the month it was carried from. */
  openingBalance: number;
  openingMonth: string;
  /** Annual billing target by year. */
  targets: Record<string, number>;
  /** "Faturação Report DC": twelve monthly figures per year, null when not yet known. */
  dcReport: Record<string, (number | null)[]>;
}

export interface Db {
  version: 1;
  consultants: Consultant[];
  dealTypes: DealType[];
  docRequirements: DocRequirement[];
  deals: Deal[];
  invoices: Invoice[];
  payouts: Payout[];
  settings: Settings;
}

export const PHASE_LABEL: Record<InvoicePhase, string> = {
  total: "Comissão Total",
  primeira: "1.ª Parte Comissão",
  restante: "Restante Comissão",
  cb: "CB",
};

export const TRANSACTION_LABEL: Record<Transaction, string> = {
  venda: "Venda",
  arrendamento: "Arrendamento",
  credito: "Crédito bancário",
};

export const STATUS_LABEL: Record<ConsultantStatus, string> = {
  rookie: "Rookie",
  experiente: "Experiente",
  inativo: "Inativo",
};

export const SIDES_LABEL: Record<DealSides, string> = {
  both: "Angariação e compradores",
  listing: "Só angariação",
  buyer: "Só compradores",
  bank: "Processo bancário",
};

export const DOC_STATE_LABEL: Record<DocState, string> = {
  ficheiro: "Carregado",
  confirmado: "Ok, sem ficheiro",
  em_falta: "Em falta",
  na: "Não aplicável",
};

export const DEFAULT_DEAL_TYPES: DealType[] = [
  { id: "pleno", name: "Negócio Pleno", sides: "both", defaultManagerPct: 2, active: true },
  { id: "partilhado-angariacao", name: "Partilhado – Angariação", sides: "listing", defaultManagerPct: 1, active: true },
  { id: "partilhado-compradores", name: "Partilhado – Compradores", sides: "buyer", defaultManagerPct: 1, active: true },
  { id: "bancario", name: "Processo Bancário", sides: "bank", defaultManagerPct: 2, active: true },
];

const SALE_TYPES = ["pleno", "partilhado-angariacao", "partilhado-compradores"];

export const DEFAULT_DOC_REQUIREMENTS: DocRequirement[] = [
  { id: "bc-prop", name: "BC Proprietário", required: true, appliesTo: SALE_TYPES, order: 0 },
  { id: "bc-compra", name: "BC Comprador", required: true, appliesTo: SALE_TYPES, order: 1 },
  { id: "cpcv", name: "CPCV / Escritura", required: true, appliesTo: SALE_TYPES, order: 2 },
  { id: "caderneta", name: "Caderneta / Certidão", required: false, appliesTo: SALE_TYPES, order: 3 },
  { id: "aprovacao", name: "Aprovação bancária", required: true, appliesTo: ["bancario"], order: 4 },
];

export function emptyDb(): Db {
  return {
    version: 1,
    consultants: [],
    dealTypes: DEFAULT_DEAL_TYPES,
    docRequirements: DEFAULT_DOC_REQUIREMENTS,
    deals: [],
    invoices: [],
    payouts: [],
    settings: {
      managerName: "Diogo Araújo",
      openingBalance: 0,
      openingMonth: "",
      targets: {},
      dcReport: {},
    },
  };
}
