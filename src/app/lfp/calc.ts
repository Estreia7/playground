/* Pure tax maths. No React, no DOM, no clock, no module state.
   Every function is (input, data) => result, so the animation layer consumes
   a plain value and every branch is unit-testable.

   Scope, stated once and surfaced in the UI: these model RETENÇÃO NA FONTE —
   the monthly advance — not the final annual settlement. No IRS Jovem, no
   deficiency regimes, no non-habitual resident, no other income. */

import type {
  CustoEmpresaInput,
  CustoEmpresaResult,
  IrcDataset,
  IrcInput,
  IrcResult,
  IrsDataset,
  IvaDataset,
  IvaInput,
  IvaResult,
  RetencaoRow,
  SalarioLiquidoInput,
  SalarioLiquidoResult,
  SubsidioRefeicaoInput,
  TsuDataset,
} from "./types";

/* ── helpers ─────────────────────────────────────────────── */

/** Round to cents. Half-up on a value scaled by 100; the epsilon absorbs
 *  binary-float error so 0.145 does not silently round down. */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function clampNonNegative(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** First row whose ceiling the value fits under. Rows are validated as
 *  ascending with a null-terminated top row, so this always matches. */
export function findRetencaoRow(rows: RetencaoRow[], value: number): RetencaoRow | null {
  for (const r of rows) {
    if (r.upTo === null || value <= r.upTo) return r;
  }
  return rows.length ? rows[rows.length - 1] : null;
}

/**
 * The deductible parcel for a withholding row.
 *
 * Most rows carry a constant, but the first two taxed brackets of the official
 * 2026 tables define it as `taxa x factor x (limite - R)` — a taper that
 * phases the tax in just above the minimum wage. Collapsing that to a constant
 * would misprice every salary in those brackets, so both forms are supported.
 */
export function parcelaAbaterFor(row: RetencaoRow, base: number): number {
  if (row.parcelaAbaterFormula) {
    const { factor, limite } = row.parcelaAbaterFormula;
    // Never negative: above `limite` the taper is spent, not reversed.
    return Math.max(0, row.taxaMarginalMaxima * factor * (limite - base));
  }
  return row.parcelaAbater ?? 0;
}

/** Meal allowance: exempt up to a daily ceiling; the excess joins the taxable
 *  base for BOTH IRS and Segurança Social. */
function splitSubsidio(
  sub: SubsidioRefeicaoInput,
  tsu: TsuDataset
): { pago: number; isento: number; tributado: number } {
  if (!sub?.ativo) return { pago: 0, isento: 0, tributado: 0 };

  const dias = clampNonNegative(sub.diasMes);
  const valorDiario = clampNonNegative(sub.valorDiario);
  const ceiling = sub.meio === "cartao"
    ? tsu.subsidioRefeicao.cartao
    : tsu.subsidioRefeicao.dinheiro;

  const pago = round2(valorDiario * dias);
  const isento = round2(Math.min(valorDiario, ceiling) * dias);
  return { pago, isento, tributado: round2(Math.max(0, pago - isento)) };
}

/* ── salário líquido ─────────────────────────────────────── */

export function salarioLiquido(
  input: SalarioLiquidoInput,
  data: { irs: IrsDataset; tsu: TsuDataset }
): SalarioLiquidoResult {
  const avisos: string[] = [];
  const bruto = clampNonNegative(input.brutoMensal);

  const regime =
    data.tsu.regimes.find((r) => r.id === data.tsu.defaultRegime) ?? data.tsu.regimes[0];
  const taxaTsu = input.taxaTsuTrabalhador ?? regime?.trabalhador ?? 0;

  const sub = splitSubsidio(input.subsidioRefeicao, data.tsu);
  if (sub.tributado > 0) avisos.push("aviso.subsidio_excede_isencao");

  // The taxed portion of the meal allowance is part of the base for both.
  const baseTributavel = round2(bruto + sub.tributado);

  const tsuTrabalhador = round2(baseTributavel * taxaTsu);

  const tabela = data.irs.retencao.find(
    (t) => t.situacao === input.situacao && t.regiao === input.regiao
  );

  let irsRetido = 0;
  let escalaoAplicado: RetencaoRow | null = null;

  if (!tabela) {
    avisos.push("aviso.tabela_indisponivel");
  } else {
    const row = findRetencaoRow(tabela.rows, baseTributavel);
    escalaoAplicado = row;
    if (row) {
      const dependentes = Math.max(0, Math.floor(input.dependentes || 0));
      const parcela =
        parcelaAbaterFor(row, baseTributavel) +
        row.parcelaAbaterPorDependente * dependentes;
      irsRetido = clampNonNegative(
        round2(baseTributavel * row.taxaMarginalMaxima - parcela)
      );
      // Withholding can never exceed the base it is withheld from.
      irsRetido = Math.min(irsRetido, baseTributavel);
    }
  }

  const liquidoMensal = round2(bruto - tsuTrabalhador - irsRetido + sub.pago);
  const brutoAnual = round2(bruto * input.meses);
  const liquidoAnual = round2(liquidoMensal * input.meses);

  return {
    brutoMensal: bruto,
    tsuTrabalhador,
    irsRetido,
    taxaEfetivaIrs: bruto > 0 ? irsRetido / bruto : 0,
    subsidioRefeicaoIsento: sub.isento,
    subsidioRefeicaoTributado: sub.tributado,
    liquidoMensal,
    liquidoAnual,
    brutoAnual,
    totalEntregueAoEstado: round2(tsuTrabalhador + irsRetido),
    escalaoAplicado,
    avisos,
  };
}

/* ── custo total para a empresa ──────────────────────────── */

export function custoEmpresa(
  input: CustoEmpresaInput,
  data: { irs: IrsDataset; tsu: TsuDataset }
): CustoEmpresaResult {
  const bruto = clampNonNegative(input.brutoMensal);

  // Reuse rather than duplicate, so both sides of the wedge always agree.
  const liq = salarioLiquido(
    {
      brutoMensal: bruto,
      meses: input.meses,
      situacao: input.trabalhador.situacao,
      dependentes: input.trabalhador.dependentes,
      regiao: input.trabalhador.regiao,
      subsidioRefeicao: input.subsidioRefeicao,
    },
    data
  );

  const regime =
    data.tsu.regimes.find((r) => r.id === data.tsu.defaultRegime) ?? data.tsu.regimes[0];

  const baseTributavel = round2(bruto + liq.subsidioRefeicaoTributado);
  const tsuPatronal = round2(baseTributavel * (regime?.entidadePatronal ?? 0));

  const taxaAT =
    input.taxaSeguroAT ?? data.tsu.seguroAcidentesTrabalho.estimativaDefault;
  const seguroAT = round2(bruto * taxaAT);

  const sub = splitSubsidio(input.subsidioRefeicao, data.tsu);
  const subsidioRefeicaoCusto = sub.pago;
  const outrosCustos = clampNonNegative(input.outrosCustosMensais ?? 0);

  const custoTotalMensal = round2(
    bruto + tsuPatronal + seguroAT + subsidioRefeicaoCusto + outrosCustos
  );

  const wedge = round2(custoTotalMensal - liq.liquidoMensal);

  return {
    brutoMensal: bruto,
    tsuPatronal,
    seguroAT,
    subsidioRefeicaoCusto,
    outrosCustos,
    custoTotalMensal,
    custoTotalAnual: round2(custoTotalMensal * input.meses),
    liquidoTrabalhador: liq.liquidoMensal,
    wedge,
    wedgePct: custoTotalMensal > 0 ? wedge / custoTotalMensal : 0,
    multiplicador: liq.liquidoMensal > 0 ? custoTotalMensal / liq.liquidoMensal : 0,
    // Sums exactly to custoTotalMensal — asserted in the tests, because a
    // breakdown that does not add up would quietly mislead.
    breakdown: [
      { key: "liquido", amount: liq.liquidoMensal, side: "trabalhador" },
      { key: "irs", amount: liq.irsRetido, side: "estado" },
      { key: "tsu_trab", amount: liq.tsuTrabalhador, side: "estado" },
      { key: "tsu_patronal", amount: tsuPatronal, side: "estado" },
      { key: "seguro_at", amount: seguroAT, side: "empresa" },
      { key: "outros", amount: outrosCustos, side: "empresa" },
    ],
  };
}

/* ── IVA ─────────────────────────────────────────────────── */

export function iva(input: IvaInput, data: { iva: IvaDataset }): IvaResult {
  const taxa = data.iva.rates[input.regiao]?.[input.tipo] ?? 0;
  const amount = clampNonNegative(input.amount);

  let semIva: number;
  let ivaVal: number;
  let comIva: number;

  if (input.mode === "semIva") {
    semIva = amount;
    ivaVal = round2(semIva * taxa);
    comIva = round2(semIva + ivaVal);
  } else {
    // The direction people get wrong: divide by (1 + taxa), never multiply
    // the gross price by (1 - taxa).
    comIva = amount;
    semIva = round2(comIva / (1 + taxa));
    ivaVal = round2(comIva - semIva);
  }

  return {
    semIva,
    iva: ivaVal,
    comIva,
    taxa,
    pesoIvaNoPreco: comIva > 0 ? ivaVal / comIva : 0,
  };
}

/* ── IRC ─────────────────────────────────────────────────── */

export function irc(input: IrcInput, data: { irc: IrcDataset }): IrcResult {
  const L = clampNonNegative(input.lucroTributavel);
  const d = data.irc;

  let coletaTrancheReduzida = 0;
  let coletaRestante = 0;

  if (input.isPme) {
    const tranche = Math.min(L, d.pme.limiteTranche);
    const resto = L - tranche;
    coletaTrancheReduzida = round2(tranche * d.pme.taxaReduzida);
    coletaRestante = round2(resto * d.taxaGeral);
  } else {
    coletaRestante = round2(L * d.taxaGeral);
  }

  const coletaIrc = round2(coletaTrancheReduzida + coletaRestante);

  // Derrama municipal falls on lucro tributável, NOT on the colecta.
  const rawRate =
    input.derramaMunicipalRate ??
    (input.municipio ? d.derramaMunicipal.municipios?.[input.municipio] : undefined) ??
    d.derramaMunicipal.default;
  const derramaMunicipal = round2(L * Math.min(rawRate, d.derramaMunicipal.max));

  let derramaEstadual = 0;
  if (input.aplicarDerramaEstadual) {
    for (const t of d.derramaEstadual) {
      const slice = Math.max(0, Math.min(L, t.to ?? Infinity) - t.from);
      derramaEstadual += slice * t.rate;
    }
    derramaEstadual = round2(derramaEstadual);
  }

  const totalImposto = round2(coletaIrc + derramaMunicipal + derramaEstadual);

  return {
    lucroTributavel: L,
    coletaTrancheReduzida,
    coletaRestante,
    coletaIrc,
    derramaMunicipal,
    derramaEstadual,
    totalImposto,
    taxaEfetiva: L > 0 ? totalImposto / L : 0,
    lucroLiquido: round2(L - totalImposto),
    breakdown: [
      {
        key: "irc_tranche_reduzida",
        base: input.isPme ? Math.min(L, d.pme.limiteTranche) : 0,
        rate: d.pme.taxaReduzida,
        amount: coletaTrancheReduzida,
      },
      {
        key: "irc_geral",
        base: input.isPme ? Math.max(0, L - d.pme.limiteTranche) : L,
        rate: d.taxaGeral,
        amount: coletaRestante,
      },
      {
        key: "derrama_municipal",
        base: L,
        rate: Math.min(rawRate, d.derramaMunicipal.max),
        amount: derramaMunicipal,
      },
      { key: "derrama_estadual", base: L, rate: 0, amount: derramaEstadual },
    ],
  };
}
