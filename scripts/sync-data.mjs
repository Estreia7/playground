#!/usr/bin/env node
/* LFP — economic data sync.

   Fetches from official statistical APIs and writes JSON to storage/lfp/econ/.
   Runtime never calls these APIs: a committed file IS the audit trail
   (git log shows when each number changed), and a Eurostat timeout can't
   blank a page on a small VPS with no cache layer.

   Every output carries { source, sourceUrl, datasetCode, license,
   retrievedAt, year } so a figure can never appear without its provenance.

   Usage:  node scripts/sync-data.mjs [inflation|cofog|wages|all]  [--inspect]
   --inspect prints the structure of each response without writing files. */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "storage", "lfp", "econ");
const args = process.argv.slice(2);
const INSPECT = args.includes("--inspect");
const which = args.find((a) => !a.startsWith("--")) ?? "all";
const today = new Date().toISOString().slice(0, 10);

const EUROSTAT = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";
const EUROSTAT_LICENSE =
  "Eurostat — reuse permitted with attribution (Commission Decision 2011/833/EU)";

/* The 25 countries for the international comparison. ISO3 for OECD. */
export const COUNTRIES = [
  "PRT", "ESP", "FRA", "DEU", "ITA", "NLD", "BEL", "AUT", "IRL", "POL",
  "CZE", "SVK", "SWE", "DNK", "FIN", "GRC", "HUN", "LUX", "GBR", "CHE",
  "NOR", "USA", "BRA", "CAN", "AUS",
];

/** Eurostat geo codes for the European countries on the list. The four
 *  non-European ones (USA, CAN, BRA, AUS) are not in Eurostat and depend on
 *  the OECD endpoint, which at the time of writing fails for nearly every
 *  query shape — see syncWagesOecd. */
export const EUROSTAT_GEO = [
  "PT", "ES", "FR", "DE", "IT", "NL", "BE", "AT", "IE", "PL",
  "CZ", "SK", "SE", "DK", "FI", "EL", "HU", "LU", "UK", "CH", "NO",
];

/* ── helpers ─────────────────────────────────────────────── */

async function getJson(url) {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

async function getText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}

/** JSON-stat 2.0 → rows. `value` is keyed by FLAT position over the
 *  dimensions in `id` order (row-major), so each key is decoded back into
 *  coordinates and then into category codes/labels. */
function jsonStatRows(ds) {
  const ids = ds.id;
  const size = ds.size;
  const strides = ids.map((_, i) => size.slice(i + 1).reduce((a, b) => a * b, 1));
  const decoders = ids.map((id) => {
    const cat = ds.dimension[id].category;
    const byPos = [];
    for (const [code, pos] of Object.entries(cat.index)) byPos[pos] = code;
    return { byPos, label: cat.label ?? {} };
  });
  const rows = [];
  for (const [k, v] of Object.entries(ds.value)) {
    let rem = Number(k);
    const dims = {};
    const labels = {};
    ids.forEach((id, i) => {
      const pos = Math.floor(rem / strides[i]) % size[i];
      const code = decoders[i].byPos[pos];
      dims[id] = code;
      labels[id] = decoders[i].label[code] ?? code;
    });
    rows.push({ dims, labels, value: v });
  }
  return rows;
}

/** Minimal CSV parser that copes with quoted fields. */
function parseCsv(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.length);
  const split = (line) => {
    const out = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; }
        else q = !q;
      } else if (ch === "," && !q) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const header = split(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = split(l);
    const o = {};
    header.forEach((h, i) => (o[h] = cells[i]));
    return o;
  });
}

async function write(name, data) {
  if (INSPECT) return;
  await mkdir(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${name}.json`);
  await writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`  wrote ${path.relative(process.cwd(), file)}`);
}

/* ── datasets ────────────────────────────────────────────── */

/** HICP annual average index, Portugal, all items, 1996+ (2015 = 100).
 *  Eurostat rather than INE: INE rebased to 2025 and its long series is
 *  fragmented across base years; Eurostat gives one continuous index. */
async function syncInflation() {
  const url = `${EUROSTAT}/prc_hicp_aind?format=JSON&lang=EN&geo=PT&unit=INX_A_AVG&coicop=CP00&sinceTimePeriod=1996`;
  console.log("inflation ←", url);
  const ds = await getJson(url);
  const rows = jsonStatRows(ds);
  if (INSPECT) { console.log("  dims:", ds.id, "size:", ds.size, "rows:", rows.length); console.log("  sample:", rows.slice(0, 3)); }

  const values = {};
  for (const r of rows) if (r.dims.geo === "PT") values[r.dims.time] = r.value;
  const years = Object.keys(values).map(Number).sort((a, b) => a - b);
  if (years.length < 10) throw new Error("inflation: too few years parsed");

  await write("inflation", {
    meta: {
      year: years[years.length - 1],
      label: "Índice Harmonizado de Preços no Consumidor — média anual, Portugal (2015 = 100)",
      source: "https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_aind/default/table",
      sourceUrl: url,
      datasetCode: "prc_hicp_aind",
      license: EUROSTAT_LICENSE,
      retrievedAt: today,
      lastVerified: today,
      version: 1,
      notes: [
        "IHPC (Eurostat), não o IPC do INE — âmbito ligeiramente diferente. Adequado para comparar poder de compra entre anos.",
        "Base 2015 = 100. Os valores de cada ano são a média anual do índice.",
        "Antes de 1996 não há série harmonizada; anos anteriores precisariam do INE (escudos).",
      ],
    },
    geo: "PT",
    base: "2015=100",
    firstYear: years[0],
    lastYear: years[years.length - 1],
    values,
  });
  console.log(`  ${years[0]}–${years[years.length - 1]}: ${years.length} years; ${years[0]}=${values[years[0]]}, ${years[years.length - 1]}=${values[years[years.length - 1]]}`);
}

/** General government expenditure by function (COFOG divisions), Portugal,
 *  latest year — "where the taxes go". Shares computed from MIO_EUR. */
async function syncCofog() {
  const url = `${EUROSTAT}/gov_10a_exp?format=JSON&lang=EN&geo=PT&unit=MIO_EUR&sector=S13&na_item=TE&cofog99=GF01&cofog99=GF02&cofog99=GF03&cofog99=GF04&cofog99=GF05&cofog99=GF06&cofog99=GF07&cofog99=GF08&cofog99=GF09&cofog99=GF10&cofog99=TOTAL&sinceTimePeriod=2018`;
  console.log("cofog ←", url);
  const ds = await getJson(url);
  const rows = jsonStatRows(ds);
  if (INSPECT) { console.log("  dims:", ds.id, "size:", ds.size, "rows:", rows.length); console.log("  sample:", rows.slice(0, 3)); }

  // Latest year that has the TOTAL row.
  const byYear = {};
  for (const r of rows) {
    const y = r.dims.time;
    (byYear[y] ??= {})[r.dims.cofog99] = { value: r.value, label: r.labels.cofog99 };
  }
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
  const year = years.find((y) => byYear[y].TOTAL && Object.keys(byYear[y]).length >= 10);
  if (!year) throw new Error("cofog: no complete year found");
  const data = byYear[year];
  const total = data.TOTAL.value;

  const items = Object.entries(data)
    .filter(([code]) => code !== "TOTAL")
    .map(([code, { value, label }]) => ({
      code,
      label,
      millionEur: value,
      share: value / total,
    }))
    .sort((a, b) => b.share - a.share);

  await write("cofog", {
    meta: {
      year,
      label: "Despesa das administrações públicas por função (COFOG), Portugal",
      source: "https://ec.europa.eu/eurostat/databrowser/view/gov_10a_exp/default/table",
      sourceUrl: url,
      datasetCode: "gov_10a_exp",
      license: EUROSTAT_LICENSE,
      retrievedAt: today,
      lastVerified: today,
      version: 1,
      notes: [
        "Despesa total das administrações públicas (S13) por divisão COFOG, em milhões de euros; as percentagens são calculadas sobre o total.",
        "É a despesa de todo o Estado, não só a financiada pelo IRS. O «recibo do contribuinte» distribui o teu imposto proporcionalmente — uma aproximação honesta, não uma contabilidade real.",
        "Publicado com cerca de um ano de atraso.",
      ],
    },
    geo: "PT",
    totalMillionEur: total,
    items,
  });
  console.log(`  year ${year}, total ${total} M€, ${items.length} functions; top: ${items[0].label} ${(items[0].share * 100).toFixed(1)}%`);
}

/** OECD average annual wages, USD at PPP, current prices — the one source
 *  that covers the non-European countries on the list with one unit.
 *
 *  The OECD SDMX endpoint answers HTTP 500 ("languageTag1") to almost every
 *  shape of this query: a single country, a dimension-pinned key, or a
 *  start period before 2023 all fail, whatever the response size. The one
 *  shape that works is a few countries per request, an unpinned key, and
 *  startPeriod=2023. So that is exactly what is sent — batches of three,
 *  spaced out to stay under the rate limit, retried once on 429/500. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Annual NET earnings, single person without children at 100% of the
 *  average wage, in EUR and in PPS (purchasing power standard — the EU's
 *  PPP unit). Net is the right basis for "days of work to buy X": it is
 *  what people actually have. */
async function syncWages() {
  const geo = EUROSTAT_GEO.map((g) => `geo=${g}`).join("&");
  const fetchCase = async (ecase) => {
    const url = `${EUROSTAT}/earn_nt_net?format=JSON&lang=EN&${geo}&currency=EUR&currency=PPS&estruct=NET${ecase ? `&ecase=${ecase}` : ""}&sinceTimePeriod=2021`;
    console.log("wages ←", url.slice(0, 140) + "…");
    const ds = await getJson(url);
    return { url, rows: jsonStatRows(ds), ds };
  };

  // The case code for "single, no children, 100% of AW"; if the code is
  // rejected or empty, fall back to fetching all cases and matching the label.
  let got;
  try {
    got = await fetchCase("P1_NCH_AW100");
    if (got.rows.length === 0) throw new Error("empty");
  } catch {
    got = await fetchCase(null);
    got.rows = got.rows.filter((r) => /single/i.test(r.labels.ecase) && /no child/i.test(r.labels.ecase) && /100/.test(r.labels.ecase));
  }
  if (INSPECT) { console.log("  dims:", got.ds.id, "rows:", got.rows.length); console.log("  sample:", got.rows.slice(0, 2)); }

  const latest = {};
  for (const r of got.rows) {
    const c = r.dims.geo;
    const y = Number(r.dims.time);
    const cur = r.dims.currency;
    if (!Number.isFinite(r.value)) continue;
    const e = (latest[c] ??= { code: c, name: r.labels.geo, year: 0, pps: null, eur: null });
    if (y > e.year) { e.year = y; e.pps = null; e.eur = null; }
    if (y === e.year) { if (cur === "PPS") e.pps = r.value; if (cur === "EUR") e.eur = r.value; }
  }
  const countries = EUROSTAT_GEO.map((g) => latest[g]).filter((c) => c && c.pps !== null);
  const missingEu = EUROSTAT_GEO.filter((g) => !latest[g] || latest[g].pps === null);
  const missing = [...missingEu, "US", "CA", "BR", "AU"];
  if (countries.length < 10) throw new Error(`wages: only ${countries.length} countries parsed`);

  await write("wages", {
    meta: {
      year: Math.max(...countries.map((c) => c.year)),
      label: "Ganhos líquidos anuais, pessoa solteira sem filhos, 100% do salário médio (Eurostat)",
      source: "https://ec.europa.eu/eurostat/databrowser/view/earn_nt_net/default/table",
      sourceUrl: got.url,
      datasetCode: "earn_nt_net",
      license: EUROSTAT_LICENSE,
      retrievedAt: today,
      lastVerified: today,
      version: 1,
      notes: [
        "Líquido — depois de impostos e contribuições — é o que as pessoas têm mesmo, e por isso a base certa para «dias de trabalho para comprar X».",
        "PPS (padrão de poder de compra) compara o que o dinheiro compra em cada país; EUR é o valor nominal.",
        "O ano varia por país; cada valor indica o seu. O Reino Unido deixou de ser reportado pelo Eurostat após 2020.",
        "Sem dados para os países não europeus (EUA, Canadá, Brasil, Austrália): a OCDE, a única fonte com uma unidade comum, tem o serviço instável. Serão acrescentados quando o endpoint responder.",
      ],
    },
    unit: "PPS",
    countries: countries.map((c) => ({ code: c.code, name: c.name, year: c.year, value: c.pps, valueEur: c.eur })),
    missing,
  });
  const pt = latest.PT, de = latest.DE;
  console.log(`  ${countries.length}/${EUROSTAT_GEO.length} European countries; missing: ${missing.join(", ")}`);
  if (pt && de) console.log(`  PT ${pt.year}: ${pt.eur} EUR / ${pt.pps} PPS   DE ${de.year}: ${de.eur} EUR / ${de.pps} PPS`);
}

/** OECD average annual wages — kept for when the endpoint is usable again. */
async function syncWagesOecd() {
  const base = "https://sdmx.oecd.org/public/rest/data/OECD.ELS.SAE,DSD_EARNINGS@AV_AN_WAGE,1.0/";
  const latest = {};
  const failed = [];
  const why = {};

  const batches = [];
  for (let i = 0; i < COUNTRIES.length; i += 3) batches.push(COUNTRIES.slice(i, i + 3));

  for (const batch of batches) {
    const url = `${base}${batch.join("+")}......?startPeriod=2023&format=csvfilewithlabels`;
    let rows = null;
    for (let attempt = 0; attempt < 2 && !rows; attempt++) {
      try {
        rows = parseCsv(await getText(url));
      } catch (e) {
        why[batch.join("+")] = e.message.replace(/ for https.*$/, "");
        await sleep(6000);
      }
    }
    if (!rows) { failed.push(...batch); process.stdout.write(`[${batch.join("+")}: FAIL] `); await sleep(3000); continue; }

    const pick = rows.filter((r) => r.UNIT_MEASURE === "USD_PPP" && r.PRICE_BASE === "V");
    for (const r of pick) {
      const c = r.REF_AREA;
      const y = Number(r.TIME_PERIOD);
      const v = Number(r.OBS_VALUE);
      if (!Number.isFinite(v)) continue;
      if (!latest[c] || y > latest[c].year) {
        latest[c] = { code: c, name: r["Reference area"] ?? c, year: y, usdPpp: v };
      }
    }
    for (const c of batch) {
      if (!latest[c]) { failed.push(c); why[c] = "no USD_PPP rows"; }
      process.stdout.write(latest[c] ? `${c}:${latest[c].year} ` : `${c}:— `);
    }
    await sleep(3000);
  }
  console.log();
  if (failed.length) console.log("  failed:", [...new Set(failed)].map((c) => `${c} (${why[c] ?? why[Object.keys(why).find((k) => k.includes(c)) ?? ""] ?? "?"})`).join(", "));

  const countries = COUNTRIES.map((c) => latest[c]).filter(Boolean);
  if (countries.length < 10) throw new Error(`wages: only ${countries.length} countries parsed`);
  const years = countries.map((c) => c.year);
  const missing = [...new Set(failed)];

  await write("wages-oecd", {
    meta: {
      year: Math.max(...years),
      label: "Salário médio anual, USD em paridade de poder de compra (OCDE)",
      source: "https://data-explorer.oecd.org/vis?df[ds]=DisseminateFinalDMZ&df[id]=DSD_EARNINGS%40AV_AN_WAGE&df[ag]=OECD.ELS.SAE",
      sourceUrl: base + "{A}+{B}+{C}......?startPeriod=2023&format=csvfilewithlabels",
      datasetCode: "OECD.ELS.SAE/DSD_EARNINGS@AV_AN_WAGE",
      license: "OECD — reuse permitted with attribution (OECD terms and conditions)",
      retrievedAt: today,
      lastVerified: today,
      version: 1,
      notes: [
        "USD convertidos em paridade de poder de compra: compara o que o salário compra em cada país, não o valor nominal.",
        "Salário médio de trabalhadores a tempo inteiro, definição OCDE. O ano varia por país; cada valor indica o seu.",
        missing.length ? `Sem dados na OCDE para: ${missing.join(", ")}.` : "Todos os 25 países presentes.",
      ],
    },
    unit: "USD_PPP",
    countries,
    missing,
  });
  console.log(`  ${countries.length}/${COUNTRIES.length} countries; missing: ${missing.join(", ") || "none"}`);
  const pt = latest.PRT, de = latest.DEU;
  if (pt && de) console.log(`  PRT ${pt.year}=${pt.usdPpp}  DEU ${de.year}=${de.usdPpp}`);
}

/* ── run ─────────────────────────────────────────────────── */

const tasks = { inflation: syncInflation, cofog: syncCofog, wages: syncWages, "wages-oecd": syncWagesOecd };
// "all" excludes the OECD task until that endpoint is dependable.
const run = which === "all" ? ["inflation", "cofog", "wages"] : [which];
let failed = 0;
for (const name of run) {
  try {
    await tasks[name]();
  } catch (e) {
    failed++;
    console.error(`  FAILED ${name}: ${e.message}`);
  }
}
console.log(failed ? `\n${failed} dataset(s) failed` : "\nall datasets synced");
process.exit(failed ? 1 : 0);
