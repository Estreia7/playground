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
  /** Twelve monthly figures by year: the billing record, loaded from the CRM
   *  export and corrected by hand. See core/billing.ts. */
  billingByMonth?: Record<string, number[]>;
  /** The yearly Business Plan, by year ("2026"). */
  plans?: Record<string, BusinessPlan>;
  /** Prizes won, each with the year it was won for (RUBY 2025…). */
  prizes?: Prize[];
  /** Older records: one prize with no year. It came from the 2025 team sheet. */
  prize?: string;
  /** Profile photo, square JPEG cut in the browser before upload. */
  photo?: FileRef;
}

/** What a consultant agreed for the year. Every figure is as written on the
 *  plan: the monthly targets are not worked out from the yearly ones. */
export interface BusinessPlan {
  delivered: boolean;
  meetingDate?: string;
  meetingHeld: boolean;
  billingTarget?: number;
  billingTargetMonthly?: number;
  listingTarget?: number;
  listingTargetMonthly?: number;
  /** Listings active when the plan was made, not today's count. */
  activeListings?: number;
}

export interface Prize {
  name: string;
  year: string;
}

export const PRIZE_NAMES = ["RUBY", "EMERALD", "DIAMOND", "CENTURION", "DOUBLE CENTURION", "GRAND CENTURION"];

/** A consultant's prizes, newest first, reading the older single field too. */
export function prizesOf(c: Consultant): Prize[] {
  const list = c.prizes ?? (c.prize ? [{ name: c.prize, year: "2025" }] : []);
  return [...list].sort((a, b) => b.year.localeCompare(a.year));
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
  /** A sale is paid in two phases, CPCV and escritura. True when half the
   *  commission is received at the CPCV; false when it all comes at the
   *  escritura. Missing on deals imported before this was asked. */
  cpcvSplit?: boolean;
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
  /** Desktop navigation: the sidebar (default) or the floating dock. */
  navMode?: "sidebar" | "dock";
  /** The dock's own look, light (default) or dark. */
  dockTheme?: "light" | "dark";
  /** Message templates; a missing one falls back to the built-in text. */
  templates?: { docRequest?: string };
}

export type ListingKind = "apartamento" | "moradia" | "terreno_rustico" | "espaco_comercial" | "construcao_nova";

export const LISTING_KIND_LABEL: Record<ListingKind, string> = {
  apartamento: "Apartamento",
  moradia: "Moradia",
  terreno_rustico: "Terreno rústico",
  espaco_comercial: "Espaço comercial",
  construcao_nova: "Construção nova",
};

/** A property the team has taken on to sell. Not yet a deal: it becomes one
 *  when a buyer is found, as a pleno or a partilha. */
export interface Listing {
  id: string;
  consultantId: string;
  kind: ListingKind;
  price: number;
  commissionPct: number;
  status: "ativa" | "vendida" | "retirada";
  createdAt: string;
}

export interface Db {
  version: 1;
  consultants: Consultant[];
  dealTypes: DealType[];
  docRequirements: DocRequirement[];
  deals: Deal[];
  invoices: Invoice[];
  payouts: Payout[];
  /** Angariações; missing in documents saved before the tab existed. */
  listings?: Listing[];
  settings: Settings;
}

export const PHASE_LABEL: Record<InvoicePhase, string> = {
  total: "Comissão Total",
  primeira: "1.ª Parte Comissão",
  restante: "Restante Comissão",
  cb: "CB",
};

/** Standard commission on the sale price, when nothing else was agreed. */
export const DEFAULT_COMMISSION_PCT = 5;

/** Part of the commission received at the CPCV when the deal is split. */
export const CPCV_SHARE = 0.5;

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
