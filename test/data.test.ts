import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { salarioLiquido, custoEmpresa, iva, irc } from "../src/app/lfp/calc.ts";
import { validateDataset, DATASET_IDS } from "../src/app/api/lfp/storage.ts";
import type { DatasetId } from "../src/app/lfp/types.ts";

/* These test the PUBLISHED datasets, not fixtures. They are the guard rail
   for the numbers the public actually sees: an admin edit or a hand-patch
   that breaks an invariant fails here rather than on someone's payslip. */

const dir = path.join(process.cwd(), "storage", "lfp");
const load = (id: string) =>
  JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), "utf8"));

const irsData = load("irs");
const tsuData = load("tsu");
const ivaData = load("iva");
const ircData = load("irc");
const data = { irs: irsData, tsu: tsuData };

const salary = (bruto: number, situacao = "nao_casado", dependentes = 0) =>
  salarioLiquido(
    {
      brutoMensal: bruto,
      meses: 14 as const,
      situacao: situacao as never,
      dependentes,
      regiao: "continente" as const,
      subsidioRefeicao: { ativo: false, valorDiario: 0, meio: "cartao" as const, diasMes: 22 },
    },
    data
  );

test("every published dataset passes its own validator", () => {
  for (const id of DATASET_IDS) {
    const errors = validateDataset(id as DatasetId, load(id));
    assert.deepEqual(errors, [], `${id}: ${errors.join("; ")}`);
  }
});

test("every dataset cites a source and a verification date", () => {
  for (const id of DATASET_IDS) {
    const m = load(id).meta;
    assert.match(m.source, /^https:\/\//, `${id} source must be a URL`);
    assert.match(m.lastVerified, /^\d{4}-\d{2}-\d{2}$/, `${id} lastVerified`);
    assert.equal(typeof m.year, "number");
  }
});

test("the minimum wage pays no IRS withholding", () => {
  // 2026 RMMG is 920 EUR and the first withholding bracket is exempt up to
  // exactly that. If this ever fails, the tables and the minimum wage have
  // drifted apart and the whole first bracket is suspect.
  assert.equal(salary(920).irsRetido, 0);
  assert.equal(salary(920).tsuTrabalhador, 101.2);
});

test("withholding is monotonic in gross pay", () => {
  let prevIrs = -1;
  let prevNet = -1;
  for (let b = 800; b <= 12000; b += 50) {
    const r = salary(b);
    assert.ok(r.irsRetido >= prevIrs, `IRS dropped at ${b}`);
    // Earning more must never leave you with less in hand.
    assert.ok(r.liquidoMensal > prevNet, `net pay dropped at ${b}`);
    prevIrs = r.irsRetido;
    prevNet = r.liquidoMensal;
  }
});

test("crossing a bracket never costs more than it gains", () => {
  // The "subir de escalao faz-me ganhar menos" myth, asserted false against
  // the real tables — this is a claim the site makes, so it is tested.
  for (const bound of [920, 1042, 1108, 1154, 1212, 1819, 2119, 2499, 3305]) {
    const below = salary(bound);
    const above = salary(bound + 1);
    assert.ok(
      above.liquidoMensal > below.liquidoMensal,
      `net pay fell crossing ${bound}: ${below.liquidoMensal} -> ${above.liquidoMensal}`
    );
  }
});

test("the formula brackets taper the parcela as pay rises", () => {
  // 12.5% x 2.60 x (1273.85 - 1000) = 89.00
  const r = salary(1000);
  assert.equal(r.irsRetido, 36); // 1000 * 0.125 - 89
  const r2 = salary(1040);
  assert.ok(r2.irsRetido > r.irsRetido);
});

test("more dependants always mean less withholding", () => {
  let prev = Infinity;
  for (const d of [0, 1, 2, 3, 4]) {
    const irsRet = salary(2000, "nao_casado", d).irsRetido;
    assert.ok(irsRet < prev, `dependant ${d} did not reduce withholding`);
    prev = irsRet;
  }
});

test("Tabela I gives less per-dependant relief than Tabela II", () => {
  // Tabela I covers "casado, dois titulares" (21.43/dep); Tabela II covers
  // "nao casado com dependentes" (34.29/dep).
  const casado = salary(2000, "casado_dois_titulares", 1).irsRetido;
  const naoCasado = salary(2000, "nao_casado", 1).irsRetido;
  assert.ok(casado > naoCasado);
  assert.equal(Math.round((casado - naoCasado) * 100) / 100, 12.86); // 34.29 - 21.43
});

test("effective tax rate rises with income and never reaches the marginal rate", () => {
  const rates = [1000, 2000, 3000, 5000, 10000].map((b) => salary(b).taxaEfetivaIrs);
  for (let i = 1; i < rates.length; i++) assert.ok(rates[i] > rates[i - 1]);
  // Top marginal withholding rate is 47.17%; the average must stay under it.
  assert.ok(rates[rates.length - 1] < 0.4717);
});

test("the meal allowance card ceiling is 70% above the cash one", () => {
  const { dinheiro, cartao } = tsuData.subsidioRefeicao;
  assert.equal(Math.round(cartao * 1000) / 1000, Math.round(dinheiro * 1.7 * 1000) / 1000);
});

test("employer cost breakdown sums to the total on real data", () => {
  const r = custoEmpresa(
    {
      brutoMensal: 1500,
      meses: 14,
      subsidioRefeicao: { ativo: true, valorDiario: 6, meio: "cartao", diasMes: 22 },
      trabalhador: { situacao: "nao_casado", dependentes: 0, regiao: "continente" },
    },
    data
  );
  // The breakdown already carries the meal allowance inside the worker's
  // net pay, so it must sum to the total on its own.
  const sum = Math.round(r.breakdown.reduce((s, b) => s + b.amount, 0) * 100) / 100;
  assert.equal(sum, r.custoTotalMensal);
  assert.ok(r.multiplicador > 1.4 && r.multiplicador < 1.9);
});

test("IVA rates are ordered and regional variants are lower than Continente", () => {
  for (const reg of ["continente", "madeira", "acores"] as const) {
    const r = ivaData.rates[reg];
    assert.ok(r.reduzida < r.intermedia, `${reg}`);
    assert.ok(r.intermedia < r.normal, `${reg}`);
  }
  assert.ok(ivaData.rates.acores.normal < ivaData.rates.continente.normal);
  assert.ok(ivaData.rates.madeira.normal < ivaData.rates.continente.normal);
  // Madeira's reduced rate was cut to 4% in Oct 2024; many sources still say 5%.
  assert.equal(ivaData.rates.madeira.reduzida, 0.04);
});

test("IVA backs out of a gross price correctly on real rates", () => {
  const r = iva({ amount: 123, mode: "comIva", tipo: "normal", regiao: "continente" }, { iva: ivaData });
  assert.equal(r.semIva, 100);
  assert.equal(r.iva, 23);
});

test("IRC 2026 uses the transitional 19 percent rate, not the 17 in the code", () => {
  // CIRC art. 87 reads 17%, but Lei 64/2025 art. 3 sets 19% for 2026.
  assert.equal(ircData.taxaGeral, 0.19);
  assert.equal(ircData.pme.taxaReduzida, 0.15);
  assert.equal(ircData.pme.limiteTranche, 50000);
});

test("a PME pays less than a large company on the same profit", () => {
  const input = { lucroTributavel: 200000, aplicarDerramaEstadual: false };
  const pme = irc({ ...input, isPme: true }, { irc: ircData });
  const big = irc({ ...input, isPme: false }, { irc: ircData });
  assert.ok(pme.totalImposto < big.totalImposto);
  // The gap is exactly the reduced rate applied to the first tranche.
  assert.equal(
    Math.round((big.totalImposto - pme.totalImposto) * 100) / 100,
    Math.round(50000 * (0.19 - 0.15) * 100) / 100
  );
});

test("derrama estadual brackets are contiguous and ascending", () => {
  const b = ircData.derramaEstadual;
  for (let i = 1; i < b.length; i++) {
    assert.equal(b[i].from, b[i - 1].to, "gap or overlap between derrama brackets");
    assert.ok(b[i].rate > b[i - 1].rate);
  }
  assert.equal(b[b.length - 1].to, null);
});

test("IRS annual brackets are contiguous, ascending and top out unbounded", () => {
  const e = irsData.escaloes.continente;
  assert.equal(e[0].from, 0);
  for (let i = 1; i < e.length; i++) {
    assert.equal(e[i].from, e[i - 1].to, "gap between annual brackets");
    assert.ok(e[i].rate > e[i - 1].rate);
  }
  assert.equal(e[e.length - 1].to, null);
});
