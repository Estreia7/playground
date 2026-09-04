import { test } from "node:test";
import assert from "node:assert/strict";
import {
  custoEmpresa,
  findRetencaoRow,
  irc,
  iva,
  round2,
  salarioLiquido,
} from "../src/app/lfp/calc.ts";
import type {
  IrcDataset,
  IrsDataset,
  IvaDataset,
  TsuDataset,
} from "../src/app/lfp/types.ts";

/* Fixtures use ROUND, OBVIOUSLY-SYNTHETIC values, not the real published
   tables. These tests verify the arithmetic and the invariants; whether the
   published numbers are correct is a data question, answered by the source
   citations on each dataset, not by unit tests. */

const meta = {
  year: 2026,
  label: "Fixture",
  source: "https://example.test",
  lastVerified: "2026-01-01",
  version: 1,
};

const irsFixture: IrsDataset = {
  meta,
  escaloes: {},
  deducaoEspecifica: 4104,
  minimoExistencia: 12180,
  retencao: [
    {
      situacao: "nao_casado",
      regiao: "continente",
      rows: [
        { upTo: 1000, taxaMarginalMaxima: 0.1, parcelaAbater: 50, parcelaAbaterPorDependente: 20 },
        { upTo: 2000, taxaMarginalMaxima: 0.2, parcelaAbater: 150, parcelaAbaterPorDependente: 30 },
        { upTo: null, taxaMarginalMaxima: 0.3, parcelaAbater: 350, parcelaAbaterPorDependente: 40 },
      ],
    },
  ],
};

const tsuFixture: TsuDataset = {
  meta,
  regimes: [{ id: "geral", trabalhador: 0.11, entidadePatronal: 0.2375 }],
  defaultRegime: "geral",
  subsidioRefeicao: { dinheiro: 6, cartao: 10.2, diasUteisMes: 22 },
  seguroAcidentesTrabalho: {
    estimativaMin: 0.005,
    estimativaMax: 0.02,
    estimativaDefault: 0.01,
    isEstimate: true,
  },
};

const ivaFixture: IvaDataset = {
  meta,
  rates: {
    continente: { normal: 0.23, intermedia: 0.13, reduzida: 0.06 },
    madeira: { normal: 0.22, intermedia: 0.12, reduzida: 0.05 },
    acores: { normal: 0.16, intermedia: 0.09, reduzida: 0.04 },
  },
  examples: [],
};

const ircFixture: IrcDataset = {
  meta,
  taxaGeral: 0.2,
  pme: { taxaReduzida: 0.16, limiteTranche: 50000 },
  derramaMunicipal: { max: 0.015, default: 0.015 },
  derramaEstadual: [
    { from: 1500000, to: 7500000, rate: 0.03 },
    { from: 7500000, to: null, rate: 0.05 },
  ],
};

const noSub = { ativo: false, valorDiario: 0, meio: "cartao" as const, diasMes: 22 };
const taxData = { irs: irsFixture, tsu: tsuFixture };

const baseInput = {
  brutoMensal: 1500,
  meses: 14 as const,
  situacao: "nao_casado" as const,
  dependentes: 0,
  regiao: "continente" as const,
  subsidioRefeicao: noSub,
};

/* ── round2 ─────────────────────────────────────────────── */

test("round2 rounds half up and survives float error", () => {
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(2.675), 2.68);
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(NaN), 0);
});

/* ── bracket lookup ─────────────────────────────────────── */

test("findRetencaoRow picks the first row the value fits under", () => {
  const rows = irsFixture.retencao[0].rows;
  assert.equal(findRetencaoRow(rows, 500)?.taxaMarginalMaxima, 0.1);
  assert.equal(findRetencaoRow(rows, 1500)?.taxaMarginalMaxima, 0.2);
  assert.equal(findRetencaoRow(rows, 99999)?.taxaMarginalMaxima, 0.3);
});

test("bracket boundaries are inclusive of the upper bound", () => {
  const rows = irsFixture.retencao[0].rows;
  // Exactly at the ceiling stays in the lower bracket; a cent over moves up.
  assert.equal(findRetencaoRow(rows, 1000)?.taxaMarginalMaxima, 0.1);
  assert.equal(findRetencaoRow(rows, 1000.01)?.taxaMarginalMaxima, 0.2);
});

/* ── salário líquido ────────────────────────────────────── */

test("salarioLiquido computes TSU and IRS from the right bracket", () => {
  const r = salarioLiquido(baseInput, taxData);
  assert.equal(r.tsuTrabalhador, 165); // 1500 * 0.11
  assert.equal(r.irsRetido, 150); // 1500 * 0.20 - 150
  assert.equal(r.liquidoMensal, 1185); // 1500 - 165 - 150
  assert.equal(r.totalEntregueAoEstado, 315);
});

test("dependants reduce withholding, never below zero", () => {
  const one = salarioLiquido({ ...baseInput, dependentes: 1 }, taxData);
  assert.equal(one.irsRetido, 120); // parcela 150 + 30

  // Enough dependants to drive the formula negative must clamp at zero,
  // not hand money back.
  const many = salarioLiquido({ ...baseInput, dependentes: 99 }, taxData);
  assert.equal(many.irsRetido, 0);
  assert.ok(many.liquidoMensal <= many.brutoMensal);
});

test("withholding never exceeds the taxable base", () => {
  const r = salarioLiquido({ ...baseInput, brutoMensal: 1 }, taxData);
  assert.ok(r.irsRetido <= 1);
  assert.ok(r.irsRetido >= 0);
});

test("zero and negative gross are handled without NaN", () => {
  for (const bruto of [0, -500]) {
    const r = salarioLiquido({ ...baseInput, brutoMensal: bruto }, taxData);
    assert.equal(r.brutoMensal, 0);
    assert.equal(r.liquidoMensal, 0);
    assert.equal(r.taxaEfetivaIrs, 0);
    assert.ok(Number.isFinite(r.irsRetido));
  }
});

test("meal allowance below the ceiling is fully exempt and adds to net pay", () => {
  const r = salarioLiquido(
    {
      ...baseInput,
      subsidioRefeicao: { ativo: true, valorDiario: 6, meio: "cartao", diasMes: 20 },
    },
    taxData
  );
  assert.equal(r.subsidioRefeicaoTributado, 0);
  assert.equal(r.subsidioRefeicaoIsento, 120);
  // Exempt, so it does not change TSU or IRS — it just arrives.
  assert.equal(r.tsuTrabalhador, 165);
  assert.equal(r.liquidoMensal, 1305); // 1185 + 120
});

test("meal allowance above the ceiling taxes only the excess", () => {
  const r = salarioLiquido(
    {
      ...baseInput,
      subsidioRefeicao: { ativo: true, valorDiario: 12, meio: "cartao", diasMes: 20 },
    },
    taxData
  );
  // ceiling 10.20 → 1.80/day over, 20 days = 36 taxed
  assert.equal(r.subsidioRefeicaoIsento, 204);
  assert.equal(r.subsidioRefeicaoTributado, 36);
  assert.equal(r.tsuTrabalhador, round2(1536 * 0.11));
  assert.ok(r.avisos.includes("aviso.subsidio_excede_isencao"));
});

test("cash meal allowance has a lower ceiling than a card", () => {
  const mk = (meio: "dinheiro" | "cartao") =>
    salarioLiquido(
      { ...baseInput, subsidioRefeicao: { ativo: true, valorDiario: 9, meio, diasMes: 20 } },
      taxData
    );
  assert.ok(mk("dinheiro").subsidioRefeicaoTributado > mk("cartao").subsidioRefeicaoTributado);
  assert.equal(mk("cartao").subsidioRefeicaoTributado, 0);
});

test("a missing table is reported instead of silently returning zero tax", () => {
  const r = salarioLiquido({ ...baseInput, regiao: "madeira" }, taxData);
  assert.ok(r.avisos.includes("aviso.tabela_indisponivel"));
  assert.equal(r.irsRetido, 0);
});

test("12 vs 14 months changes annual totals, not the monthly figure", () => {
  const a = salarioLiquido({ ...baseInput, meses: 12 }, taxData);
  const b = salarioLiquido({ ...baseInput, meses: 14 }, taxData);
  assert.equal(a.liquidoMensal, b.liquidoMensal);
  assert.equal(b.brutoAnual, round2(a.brutoAnual * (14 / 12)));
});

/* ── custo empresa ──────────────────────────────────────── */

test("custoEmpresa breakdown sums exactly to the total cost", () => {
  const r = custoEmpresa(
    {
      brutoMensal: 1500,
      meses: 14,
      subsidioRefeicao: noSub,
      trabalhador: { situacao: "nao_casado", dependentes: 0, regiao: "continente" },
    },
    taxData
  );
  const sum = round2(r.breakdown.reduce((s, b) => s + b.amount, 0));
  assert.equal(sum, r.custoTotalMensal);
});

test("custoEmpresa agrees with salarioLiquido on the worker's side", () => {
  const shared = { situacao: "nao_casado" as const, dependentes: 2, regiao: "continente" as const };
  const liq = salarioLiquido({ ...baseInput, ...shared }, taxData);
  const emp = custoEmpresa(
    { brutoMensal: 1500, meses: 14, subsidioRefeicao: noSub, trabalhador: shared },
    taxData
  );
  assert.equal(emp.liquidoTrabalhador, liq.liquidoMensal);
});

test("the wedge is the gap between company cost and take-home pay", () => {
  const r = custoEmpresa(
    {
      brutoMensal: 1500,
      meses: 14,
      subsidioRefeicao: noSub,
      trabalhador: { situacao: "nao_casado", dependentes: 0, regiao: "continente" },
    },
    taxData
  );
  assert.equal(r.tsuPatronal, round2(1500 * 0.2375));
  assert.equal(r.seguroAT, 15);
  assert.equal(r.custoTotalMensal, round2(1500 + 356.25 + 15));
  assert.equal(r.wedge, round2(r.custoTotalMensal - r.liquidoTrabalhador));
  assert.ok(r.multiplicador > 1);
});

test("custoEmpresa does not divide by zero when net pay is zero", () => {
  const r = custoEmpresa(
    {
      brutoMensal: 0,
      meses: 14,
      subsidioRefeicao: noSub,
      trabalhador: { situacao: "nao_casado", dependentes: 0, regiao: "continente" },
    },
    taxData
  );
  assert.equal(r.multiplicador, 0);
  assert.equal(r.wedgePct, 0);
  assert.ok(Number.isFinite(r.custoTotalMensal));
});

/* ── IVA ────────────────────────────────────────────────── */

test("IVA adds forward from the net price", () => {
  const r = iva({ amount: 100, mode: "semIva", tipo: "normal", regiao: "continente" }, { iva: ivaFixture });
  assert.equal(r.iva, 23);
  assert.equal(r.comIva, 123);
});

test("IVA backs out of a gross price by dividing, not by subtracting a percent", () => {
  const r = iva({ amount: 123, mode: "comIva", tipo: "normal", regiao: "continente" }, { iva: ivaFixture });
  assert.equal(r.semIva, 100);
  assert.equal(r.iva, 23);
  // The common mistake — 123 * 0.77 = 94.71 — must NOT be what we produce.
  assert.notEqual(r.semIva, round2(123 * 0.77));
});

test("IVA round trips in both directions", () => {
  for (const tipo of ["normal", "intermedia", "reduzida"] as const) {
    const fwd = iva({ amount: 250, mode: "semIva", tipo, regiao: "continente" }, { iva: ivaFixture });
    const back = iva({ amount: fwd.comIva, mode: "comIva", tipo, regiao: "continente" }, { iva: ivaFixture });
    assert.ok(Math.abs(back.semIva - 250) < 0.02, `${tipo}: ${back.semIva}`);
  }
});

test("IVA rates differ by region", () => {
  const c = iva({ amount: 100, mode: "semIva", tipo: "normal", regiao: "continente" }, { iva: ivaFixture });
  const a = iva({ amount: 100, mode: "semIva", tipo: "normal", regiao: "acores" }, { iva: ivaFixture });
  assert.ok(a.comIva < c.comIva);
});

/* ── IRC ────────────────────────────────────────────────── */

test("IRC applies the reduced PME rate only to the first tranche", () => {
  const r = irc(
    { lucroTributavel: 80000, isPme: true, aplicarDerramaEstadual: false },
    { irc: ircFixture }
  );
  assert.equal(r.coletaTrancheReduzida, round2(50000 * 0.16));
  assert.equal(r.coletaRestante, round2(30000 * 0.2));
  assert.equal(r.coletaIrc, 14000);
});

test("a non-PME pays the general rate on the whole profit", () => {
  const r = irc(
    { lucroTributavel: 80000, isPme: false, aplicarDerramaEstadual: false },
    { irc: ircFixture }
  );
  assert.equal(r.coletaTrancheReduzida, 0);
  assert.equal(r.coletaIrc, 16000);
});

test("derrama municipal falls on taxable profit, not on the colecta", () => {
  const r = irc(
    { lucroTributavel: 100000, isPme: false, aplicarDerramaEstadual: false },
    { irc: ircFixture }
  );
  assert.equal(r.derramaMunicipal, round2(100000 * 0.015));
  assert.notEqual(r.derramaMunicipal, round2(r.coletaIrc * 0.015));
});

test("derrama municipal is capped at the legal maximum", () => {
  const r = irc(
    { lucroTributavel: 100000, isPme: false, derramaMunicipalRate: 0.9, aplicarDerramaEstadual: false },
    { irc: ircFixture }
  );
  assert.equal(r.derramaMunicipal, round2(100000 * 0.015));
});

test("derrama estadual only bites above its threshold and is progressive", () => {
  const below = irc(
    { lucroTributavel: 1000000, isPme: false, aplicarDerramaEstadual: true },
    { irc: ircFixture }
  );
  assert.equal(below.derramaEstadual, 0);

  const above = irc(
    { lucroTributavel: 2000000, isPme: false, aplicarDerramaEstadual: true },
    { irc: ircFixture }
  );
  assert.equal(above.derramaEstadual, round2(500000 * 0.03));

  const top = irc(
    { lucroTributavel: 10000000, isPme: false, aplicarDerramaEstadual: true },
    { irc: ircFixture }
  );
  assert.equal(top.derramaEstadual, round2(6000000 * 0.03 + 2500000 * 0.05));
});

test("IRC on zero profit is zero, not NaN", () => {
  const r = irc({ lucroTributavel: 0, isPme: true, aplicarDerramaEstadual: true }, { irc: ircFixture });
  assert.equal(r.totalImposto, 0);
  assert.equal(r.taxaEfetiva, 0);
  assert.equal(r.lucroLiquido, 0);
});

test("IRC effective rate stays below the headline rate for a PME", () => {
  const r = irc(
    { lucroTributavel: 60000, isPme: true, aplicarDerramaEstadual: false },
    { irc: ircFixture }
  );
  // Reduced tranche pulls the average below the general rate, before derrama.
  const efetivaSemDerrama = r.coletaIrc / r.lucroTributavel;
  assert.ok(efetivaSemDerrama < ircFixture.taxaGeral);
});
