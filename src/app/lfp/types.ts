/* LFP — shared types.
   Every dataset carries its own provenance: this is what makes the
   "informação pública, sem valor legal" claim auditable rather than a slogan. */

export type Lang = "pt" | "en";

export type Regiao = "continente" | "madeira" | "acores";

export interface DatasetMeta {
  /** The year the DATA refers to — not when it was fetched. Shown next to every figure. */
  year: number;
  label: string;
  /** Canonical public source URL. */
  source: string;
  sources?: string[];
  license?: string;
  /** When the sync script last fetched it (economic datasets). */
  retrievedAt?: string;
  /** ISO date a human last checked the values against the source. */
  lastVerified: string;
  /** Bumped on every write; lets clients bust caches and admin show history. */
  version: number;
  /** True until a human signs off. Renders a loud amber banner. */
  unverified?: boolean;
  /** Caveats rendered under the calculator, not hidden in a footer. */
  notes?: string[];
}

/* ─────────────── IRS ─────────────── */

/** Annual progressive bracket — used by the explainer's BracketTable. */
export interface IrsEscalao {
  from: number;
  /** null = top bracket, unbounded. */
  to: number | null;
  /** Marginal rate as a fraction, e.g. 0.13 for 13%. */
  rate: number;
  parcelaAbater?: number;
}

/** A row of the MONTHLY retenção na fonte table — what the salary calculator uses.
 *  Deliberately distinct from IrsEscalao: withholding is a monthly advance using
 *  marginal rate minus a deductible parcel, not the final annual tax. */
export interface RetencaoRow {
  /** Upper bound of monthly gross remuneration. null = top row. */
  upTo: number | null;
  taxaMarginalMaxima: number;
  /** Fixed deductible parcel, EUR/month. Mutually exclusive with the formula
   *  below: the official 2026 tables express the first two taxed brackets as
   *  a formula of R instead of a constant. */
  parcelaAbater?: number;
  /**
   * Formula form of the parcela: `taxa * factor * (limite - R)`, taken
   * verbatim from Despacho n.º 233-A/2026. Modelling this properly matters —
   * substituting a constant would misprice every salary in these brackets.
   */
  parcelaAbaterFormula?: { factor: number; limite: number };
  parcelaAbaterPorDependente: number;
}

export type SituacaoIrs =
  | "nao_casado"
  | "casado_unico_titular"
  | "casado_dois_titulares";

export interface RetencaoTable {
  situacao: SituacaoIrs;
  regiao: Regiao;
  /** Ascending by upTo; last row has upTo === null. */
  rows: RetencaoRow[];
}

export interface IrsDataset {
  meta: DatasetMeta;
  escaloes: Partial<Record<Regiao, IrsEscalao[]>>;
  retencao: RetencaoTable[];
  /** Dedução específica for dependent work, EUR/year. */
  deducaoEspecifica: number;
  minimoExistencia: number;
}

/* ─────────────── TSU / Segurança Social ─────────────── */

export interface TsuRegime {
  id: string;
  trabalhador: number;
  entidadePatronal: number;
}

export interface TsuDataset {
  meta: DatasetMeta;
  regimes: TsuRegime[];
  defaultRegime: string;
  /** Meal allowance exemption ceilings. Above these, the excess is taxed. */
  subsidioRefeicao: {
    dinheiro: number;
    cartao: number;
    diasUteisMes: number;
  };
  /** A MARKET premium, not a legal rate — flagged so the UI can say so. */
  seguroAcidentesTrabalho: {
    estimativaMin: number;
    estimativaMax: number;
    estimativaDefault: number;
    isEstimate: true;
  };
}

/* ─────────────── IVA ─────────────── */

export type IvaTipo = "normal" | "intermedia" | "reduzida";

export interface IvaDataset {
  meta: DatasetMeta;
  rates: Record<Regiao, Record<IvaTipo, number>>;
  examples: Array<{ tipo: IvaTipo; key: string; icon: string }>;
}

/* ─────────────── IRC ─────────────── */

export interface IrcDataset {
  meta: DatasetMeta;
  taxaGeral: number;
  pme: {
    taxaReduzida: number;
    limiteTranche: number;
  };
  derramaMunicipal: {
    max: number;
    default: number;
    municipios?: Record<string, number>;
  };
  derramaEstadual: Array<{ from: number; to: number | null; rate: number }>;
}

export interface TaxData {
  irs: IrsDataset;
  tsu: TsuDataset;
  iva: IvaDataset;
  irc: IrcDataset;
}

export type DatasetId = keyof TaxData;

/* ─────────────── Calculator IO ─────────────── */

export interface SubsidioRefeicaoInput {
  ativo: boolean;
  valorDiario: number;
  meio: "dinheiro" | "cartao";
  diasMes: number;
}

export interface SalarioLiquidoInput {
  brutoMensal: number;
  /** 14 = subsídios paid separately; 12 = duodécimos. */
  meses: 12 | 14;
  situacao: SituacaoIrs;
  dependentes: number;
  regiao: Regiao;
  subsidioRefeicao: SubsidioRefeicaoInput;
  taxaTsuTrabalhador?: number;
}

export interface SalarioLiquidoResult {
  brutoMensal: number;
  tsuTrabalhador: number;
  irsRetido: number;
  taxaEfetivaIrs: number;
  subsidioRefeicaoIsento: number;
  subsidioRefeicaoTributado: number;
  liquidoMensal: number;
  liquidoAnual: number;
  brutoAnual: number;
  totalEntregueAoEstado: number;
  /** The row actually used, so BracketTable can highlight it. */
  escalaoAplicado: RetencaoRow | null;
  /** i18n keys, e.g. "aviso.subsidio_excede_isencao". */
  avisos: string[];
}

export type BreakdownSide = "trabalhador" | "estado" | "empresa";

export interface CustoEmpresaInput {
  brutoMensal: number;
  meses: 12 | 14;
  subsidioRefeicao: SubsidioRefeicaoInput;
  taxaSeguroAT?: number;
  outrosCustosMensais?: number;
  trabalhador: Pick<SalarioLiquidoInput, "situacao" | "dependentes" | "regiao">;
}

export interface CustoEmpresaResult {
  brutoMensal: number;
  tsuPatronal: number;
  seguroAT: number;
  subsidioRefeicaoCusto: number;
  outrosCustos: number;
  custoTotalMensal: number;
  custoTotalAnual: number;
  liquidoTrabalhador: number;
  /** The headline: total cost minus what the worker actually banks. */
  wedge: number;
  wedgePct: number;
  /** For every €1 the worker banks, the company spends €N. */
  multiplicador: number;
  breakdown: Array<{ key: string; amount: number; side: BreakdownSide }>;
}

export interface IvaInput {
  amount: number;
  mode: "semIva" | "comIva";
  tipo: IvaTipo;
  regiao: Regiao;
}

export interface IvaResult {
  semIva: number;
  iva: number;
  comIva: number;
  taxa: number;
  /** "de cada €100 que pagas, €X é IVA" */
  pesoIvaNoPreco: number;
}

export interface IrcInput {
  lucroTributavel: number;
  isPme: boolean;
  derramaMunicipalRate?: number;
  municipio?: string;
  aplicarDerramaEstadual: boolean;
}

export interface IrcResult {
  lucroTributavel: number;
  coletaTrancheReduzida: number;
  coletaRestante: number;
  coletaIrc: number;
  derramaMunicipal: number;
  derramaEstadual: number;
  totalImposto: number;
  taxaEfetiva: number;
  lucroLiquido: number;
  breakdown: Array<{ key: string; base: number; rate: number; amount: number }>;
}

/* ─────────────── Economic datasets ───────────────
   Produced by scripts/sync-data.mjs from official APIs, never fetched at
   runtime. `retrievedAt` is when the script ran; `year` is what the data
   refers to — the two are shown separately. */

export interface EconMeta extends DatasetMeta {
  sourceUrl: string;
  datasetCode: string;
  retrievedAt: string;
}

/** Annual average price index, one country. `values` is year → index. */
export interface InflationSeries {
  meta: EconMeta;
  geo: string;
  base: string;
  firstYear: number;
  lastYear: number;
  values: Record<string, number>;
}

/** Government expenditure by function (COFOG divisions), one year. */
export interface CofogBreakdown {
  meta: EconMeta;
  geo: string;
  totalMillionEur: number;
  items: Array<{ code: string; label: string; millionEur: number; share: number }>;
}

/** Net annual earnings per country, in a comparable unit plus nominal EUR. */
export interface CountryWages {
  meta: EconMeta;
  unit: "PPS" | "USD_PPP";
  countries: Array<{ code: string; name: string; year: number; value: number; valueEur: number | null }>;
  missing: string[];
}

export interface EconData {
  inflation: InflationSeries;
  cofog: CofogBreakdown;
  wages: CountryWages;
}

export type EconId = keyof EconData;

/* ─────────────── Flow ─────────────── */

export type FlowDirection = "toState" | "toPeople";

export type FlowTone =
  | "liquido"
  | "irs"
  | "tsu-trab"
  | "tsu-patronal"
  | "iva"
  | "irc"
  | "empresa"
  | "servico";

export interface FlowStream {
  /** Stable id; drives React keys and deterministic particle seeding. */
  id: string;
  label: string;
  amount: number;
  direction: FlowDirection;
  tone: FlowTone;
  href?: string;
}
