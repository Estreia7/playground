/* Seeds ReorgSI from the manager's two spreadsheets.

     node scripts/reorgsi-import.ts            # writes storage/reorgsi/db.json if absent
     node scripts/reorgsi-import.ts --force    # overwrites it (a backup is kept)
     node scripts/reorgsi-import.ts --dry      # report only

   Sources (private, git-ignored), in storage/reorgsi/import/:
     Equipa Direção Comercial.xlsx   team per year + monthly "Faturação Report DC"
     C C Diogo Araujo 2026.ods       one sheet per month of invoices + "Resumo"

   The .ods is read without a library: it is a zip whose content.xml holds the
   tables, and node's zlib inflates it. The report at the end is the point of
   the exercise — it shows every guess the import had to make. */

import { promises as fs } from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import crypto from "node:crypto";
import ExcelJS from "exceljs";
import {
  emptyDb,
  type Consultant,
  type ConsultantStatus,
  type Db,
  type Deal,
  type DocEntry,
  type Invoice,
  type InvoicePhase,
  type Party,
  type Transaction,
} from "../src/app/reorgsi/core/types.ts";
import { account, managerShare, sharesByMonth } from "../src/app/reorgsi/core/commission.ts";

const DIR = path.join(process.cwd(), "storage", "reorgsi");
const IMPORT = path.join(DIR, "import");
const TEAM_FILE = path.join(IMPORT, "Equipa Direção Comercial.xlsx");
const LEDGER_FILE = path.join(IMPORT, "C C Diogo Araujo 2026.ods");
const OUT = path.join(DIR, "db.json");
const YEAR = "2026";

const args = new Set(process.argv.slice(2));
const report: string[] = [];
const note = (s: string) => report.push(s);
const newId = () => crypto.randomBytes(6).toString("base64url");

/* ---------- helpers ---------- */

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const MONTHS = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function monthIndex(name: string): number {
  return MONTHS.indexOf(fold(name).replace(/[^a-z]/g, ""));
}

/** dd/mm/yyyy → yyyy-mm-dd. Typos in the year ("20256", "0206") fall back to
 *  the ledger's year and are reported. */
function parseDate(raw: string, where: string): string | undefined {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d+)$/);
  if (!m) return undefined;
  let year = m[3];
  if (!/^20(2[3-9])$/.test(year)) {
    note(`· Data com ano inválido "${s}" (${where}) → assumido ${YEAR}`);
    year = YEAR;
  }
  return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function num(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  // Numeric cells come through as "2562.5"; typed text as "2 562,50 €".
  const n = /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : Number(s.replace(/[€\s ]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/* ---------- .ods reader ---------- */

type Sheet = { name: string; rows: string[][] };

function decodeXml(s: string): string {
  return s
    .replace(/<text:s(?: text:c="(\d+)")?\/>/g, (_, n) => " ".repeat(Number(n ?? 1)))
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function readOds(file: string): Promise<Sheet[]> {
  const buf = await fs.readFile(file);
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  let xml = "";
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    if (buf.subarray(p + 46, p + 46 + nameLen).toString() === "content.xml") {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      xml = (method === 8 ? zlib.inflateRawSync(data) : data).toString("utf8");
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (!xml) throw new Error("content.xml not found in " + file);

  const sheets: Sheet[] = [];
  for (const table of xml.match(/<table:table [\s\S]*?<\/table:table>/g) ?? []) {
    const name = decodeXml(table.match(/table:name="([^"]*)"/)?.[1] ?? "");
    const rows: string[][] = [];
    for (const row of table.match(/<table:table-row[\s\S]*?<\/table:table-row>|<table:table-row[^>]*\/>/g) ?? []) {
      const repeat = Math.min(Number(row.match(/^<table:table-row[^>]*number-rows-repeated="(\d+)"/)?.[1] ?? 1), 5);
      const cells: string[] = [];
      const cellRe =
        /<table:(?:covered-)?table-cell([^>]*?)\/>|<table:(?:covered-)?table-cell([^>]*)>([\s\S]*?)<\/table:(?:covered-)?table-cell>/g;
      for (const m of row.matchAll(cellRe)) {
        const attrs = m[1] ?? m[2] ?? "";
        const body = m[3] ?? "";
        const reps = Math.min(Number(attrs.match(/number-columns-repeated="(\d+)"/)?.[1] ?? 1), 40);
        const type = attrs.match(/office:value-type="([^"]*)"/)?.[1];
        let v: string;
        if (type === "float" || type === "currency" || type === "percentage") v = attrs.match(/office:value="([^"]*)"/)?.[1] ?? "";
        else if (type === "date") v = attrs.match(/office:date-value="([^"]*)"/)?.[1] ?? "";
        else v = (body.match(/<text:p[\s\S]*?<\/text:p>/g) ?? []).map(decodeXml).join(" ").trim();
        for (let k = 0; k < reps; k++) cells.push(v);
      }
      while (cells.length && cells[cells.length - 1] === "") cells.pop();
      for (let k = 0; k < repeat; k++) rows.push(cells);
    }
    sheets.push({ name, rows });
  }
  return sheets;
}

/* ---------- team (.xlsx) ---------- */

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
    return "";
  }
  return String(v);
}

interface TeamRow {
  name: string;
  joinedAt?: string;
  prev?: number;
  curr?: number;
  prize?: string;
  section: "rookie" | "experiente";
}

interface TeamSheet {
  people: TeamRow[];
  months: { prev: (number | null)[]; curr: (number | null)[] };
  target?: number;
}

async function readTeam(file: string): Promise<Record<string, TeamSheet>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const out: Record<string, TeamSheet> = {};
  wb.eachSheet((ws) => {
    const sheet: TeamSheet = { people: [], months: { prev: Array(12).fill(null), curr: Array(12).fill(null) } };
    let section: TeamRow["section"] | null = null;
    ws.eachRow((row) => {
      const c = (i: number) => cellText(row.getCell(i).value).trim();
      const first = fold(c(1));
      if (first === "rookies") section = "rookie";
      else if (first === "experientes") section = "experiente";
      const mi = monthIndex(c(1));
      if (mi >= 0 && c(1).length > 2) {
        sheet.months.prev[mi] = num(c(2)) ?? null;
        sheet.months.curr[mi] = num(c(3)) ?? null;
        return;
      }
      if (first === "objetivo") {
        sheet.target = num(c(3));
        return;
      }
      if (section && /^\d{4}-\d{2}-\d{2}$/.test(c(2))) {
        sheet.people.push({
          name: c(1).replace(/\s+/g, " "),
          joinedAt: c(2),
          prev: num(c(3)),
          curr: num(c(4)),
          prize: c(6) || undefined,
          section,
        });
      }
    });
    out[ws.name.trim()] = sheet;
  });
  return out;
}

/* ---------- main ---------- */

async function main() {
  const db: Db = emptyDb();
  const team = await readTeam(TEAM_FILE);
  const t2025 = team["2025"];
  const t2026 = team["2026"];
  if (!t2025 || !t2026) throw new Error("Expected sheets 2025 and 2026 in the team workbook");

  // Consultants: the 2026 team, plus whoever left since 2025 as inactive.
  const byName = new Map<string, Consultant>();
  for (const p of t2026.people) {
    const old = t2025.people.find((q) => fold(q.name) === fold(p.name));
    const c: Consultant = {
      id: newId(),
      name: p.name,
      status: p.section as ConsultantStatus,
      joinedAt: p.joinedAt,
      billingByYear: {},
      prize: old?.prize,
    };
    if (old?.prev) c.billingByYear["2024"] = old.prev;
    if (p.prev != null) c.billingByYear["2025"] = p.prev;
    byName.set(fold(p.name), c);
  }
  for (const p of t2025.people) {
    if (byName.has(fold(p.name))) continue;
    const c: Consultant = {
      id: newId(),
      name: p.name,
      status: "inativo",
      joinedAt: p.joinedAt,
      billingByYear: {},
      prize: p.prize,
    };
    if (p.prev) c.billingByYear["2024"] = p.prev;
    if (p.curr != null) c.billingByYear["2025"] = p.curr;
    byName.set(fold(p.name), c);
    note(`· ${p.name} está na equipa de 2025 mas não na de 2026 → importado como inativo`);
  }
  db.consultants = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "pt"));

  db.settings.targets = { "2025": t2025.target ?? 0, "2026": t2026.target ?? 0 };
  db.settings.dcReport = { "2024": t2025.months.prev, "2025": t2025.months.curr, "2026": t2026.months.curr };

  // Name → party. Exact match first, then a first name that only one person has.
  const unmatched = new Map<string, number>();
  const toParty = (raw: string): Party | undefined => {
    const cell = raw.trim();
    if (!cell) return undefined;
    const bracket = cell.match(/\(([^)]*)\)/)?.[1]?.trim();
    const [head, ...others] = cell.replace(/\([^)]*\)/g, "").split("/").map((s) => s.trim());
    const notes = [bracket, others.length ? "com " + others.join(", ") : ""].filter(Boolean).join(" · ") || undefined;
    const key = fold(head);
    let found = byName.get(key);
    if (!found) {
      const firsts = db.consultants.filter((c) => fold(c.name).split(" ")[0] === key);
      if (firsts.length === 1 && !key.includes(" ")) found = firsts[0];
    }
    if (found) return { kind: "team", consultantId: found.id, ...(notes ? { note: notes } : {}) };
    unmatched.set(head, (unmatched.get(head) ?? 0) + 1);
    return { kind: "external", name: head, ...(notes ? { note: notes } : {}) };
  };

  // The ledger.
  const sheets = await readOds(LEDGER_FILE);
  const PHASES: Record<string, InvoicePhase> = {
    "comissao total": "total",
    "1.a parte comissao": "primeira",
    "restante comissao": "restante",
    cb: "cb",
  };
  const DOCS: Record<string, DocEntry["state"]> = {
    ok: "confirmado",
    "doc's em falta": "em_falta",
    "nao aplicavel": "na",
  };
  const docCols: [number, string][] = [
    [7, "bc-prop"],
    [8, "bc-compra"],
    [9, "cpcv"],
  ];

  const deals = new Map<string, Deal>();
  const sheetTotals = new Map<string, number>();
  const seen = new Map<string, Invoice>();

  for (const sheet of sheets) {
    const mi = monthIndex(sheet.name);
    if (mi < 0) continue;
    const month = `${YEAR}-${String(mi + 1).padStart(2, "0")}`;
    for (const r of sheet.rows) {
      const phaseKey = fold(r[0] ?? "").replace(/ª/g, "a");
      const phase = PHASES[phaseKey.replace("1.ª", "1.a")];
      if (!phase) {
        // The bare total row at the foot of each month.
        if (!r[0] && r.length >= 15 && num(r[14]) != null) sheetTotals.set(month, num(r[14])!);
        continue;
      }
      const where = `${sheet.name}, fatura ${r[5] || "?"}`;
      const isBank = phase === "cb" || fold(r[2] ?? "") === "cb";
      const ref = (r[1] ?? "").trim();
      const address = (r[10] ?? "").trim();
      const number = (r[5] ?? "").trim();
      const refKey = ref.toUpperCase().replace(/\s+/g, "");
      // Agency refs ("KW Flash") are reused across properties, so they need
      // the address too; real refs (with digits) identify the property alone.
      const key = isBank
        ? `cb:${number}:${month}`
        : /\d{3,}/.test(ref)
          ? `ref:${refKey}`
          : `ref:${refKey}:${fold(address).replace(/[^a-z0-9]/g, "").slice(0, 10)}`;

      let deal = deals.get(key);
      if (!deal) {
        const tx: Transaction = isBank ? "credito" : fold(r[2] ?? "") === "arrendamento" ? "arrendamento" : "venda";
        deal = {
          id: newId(),
          ref,
          transaction: tx,
          price: num(r[3]),
          address,
          dealTypeId: "pleno",
          angariacao: toParty(r[11] ?? "") ?? { kind: "external", name: "—" },
          compradores: isBank ? undefined : toParty(r[12] ?? ""),
          listingSplitPct: 50,
          documents: {},
          status: "aberto",
          createdAt: new Date().toISOString(),
        };
        deals.set(key, deal);
      } else if (deal.price == null) {
        deal.price = num(r[3]);
      }
      if (!isBank) {
        for (const [col, reqId] of docCols) {
          const state = DOCS[fold(r[col] ?? "")];
          if (state) deal.documents[reqId] = { state };
        }
      }

      const saldoRaw = (r[14] ?? "").trim();
      const cancelled = fold(saldoRaw) === "anulada";
      const paidAt = r[6] ? parseDate(r[6], where) : undefined;
      const inv: Invoice = {
        id: newId(),
        dealId: deal.id,
        phase,
        number,
        issuedAt: r[4] ? parseDate(r[4], where) : undefined,
        paidAt,
        settlementMonth: month,
        valueNoVat: num(r[13]) ?? 0,
        status: cancelled ? "anulada" : paidAt ? "paga" : "emitida",
      };
      const share = cancelled ? 0 : num(saldoRaw);
      (inv as Invoice & { _share?: number })._share = share;

      const dupKey = `${deal.id}:${fold(number)}:${phase}`;
      const prior = seen.get(dupKey);
      if (prior) {
        const ps = (prior as Invoice & { _share?: number })._share;
        inv.flag = `Possível duplicado da fatura ${number} em ${prior.settlementMonth}`;
        note(
          `· Fatura ${number} (${ref || address}) aparece em ${prior.settlementMonth} e ${month}` +
            (ps !== share || prior.valueNoVat !== inv.valueNoVat
              ? ` com valores diferentes: ${prior.valueNoVat}→${ps} € vs ${inv.valueNoVat}→${share} €`
              : " com os mesmos valores") +
            " — ambas mantidas, como no Resumo",
        );
      } else seen.set(dupKey, inv);
      db.invoices.push(inv);
    }
  }

  // Deal types follow from which sides are the team's.
  db.deals = [...deals.values()];
  for (const d of db.deals) {
    const a = d.angariacao.kind === "team";
    const c = d.compradores?.kind === "team";
    if (d.transaction === "credito") d.dealTypeId = "bancario";
    else if (a && c) d.dealTypeId = "pleno";
    else if (a) d.dealTypeId = "partilhado-angariacao";
    else if (c) d.dealTypeId = "partilhado-compradores";
    else {
      d.dealTypeId = "partilhado-angariacao";
      note(`· ${d.ref || d.address}: nenhum lado é da equipa → Partilhado – Angariação (rever)`);
    }
    const invs = db.invoices.filter((i) => i.dealId === d.id);
    if (invs.every((i) => i.status === "anulada")) d.status = "anulado";
    else if (invs.some((i) => (i.phase === "total" || i.phase === "restante" || i.phase === "cb") && i.status === "paga"))
      d.status = "concluido";
  }

  // Where the sheet's share is not the type's default, keep the sheet's % on the invoice.
  const dealById = new Map(db.deals.map((d) => [d.id, d]));
  let overrides = 0;
  for (const inv of db.invoices) {
    const tmp = inv as Invoice & { _share?: number };
    const target = tmp._share;
    delete tmp._share;
    if (target == null || inv.status === "anulada") continue;
    const deal = dealById.get(inv.dealId);
    if (Math.abs(managerShare(inv, deal, db.dealTypes) - target) < 0.0005) continue;
    if (!inv.valueNoVat) continue;
    // Six decimals keep 1,75 % readable while reproducing the sheet to the cent.
    inv.managerPctOverride = Math.round((target / inv.valueNoVat) * 100 * 1e6) / 1e6;
    overrides++;
  }

  // Resumo: opening balance and payouts.
  const resumo = sheets.find((s) => fold(s.name) === "resumo");
  for (const r of resumo?.rows ?? []) {
    const label = fold(r[1] ?? "");
    if (label.startsWith("saldo 2025")) {
      db.settings.openingBalance = num(r[2]) ?? 0;
      db.settings.openingMonth = "2025-12";
    } else if (r[0] && /\d/.test(r[0]) && num(r[2]) != null && label) {
      const date = parseDate(r[0], "Resumo");
      if (date) db.payouts.push({ id: newId(), date, reference: (r[1] ?? "").trim(), amount: num(r[2])! });
    }
  }

  /* ---------- report ---------- */

  const months = sharesByMonth(db);
  const lines: string[] = [];
  lines.push(`Consultores: ${db.consultants.length} (${db.consultants.filter((c) => c.status === "inativo").length} inativos)`);
  lines.push(`Negócios: ${db.deals.length} · Faturas: ${db.invoices.length} · Pagamentos: ${db.payouts.length}`);
  lines.push(`Faturas com % própria (diferente do tipo): ${overrides}`);
  lines.push("");
  lines.push("Conferência mensal (calculado vs folha):");
  let allOk = true;
  for (const [m, sheetTotal] of [...sheetTotals].sort()) {
    const calc = months.get(m) ?? 0;
    const ok = Math.abs(calc - sheetTotal) < 0.011;
    allOk &&= ok;
    lines.push(`  ${m}  ${calc.toFixed(2).padStart(9)}  ${sheetTotal.toFixed(2).padStart(9)}  ${ok ? "ok" : "DIFERENTE"}`);
  }
  const acc = account(db);
  lines.push("");
  lines.push(`Saldo inicial ${acc.opening.toFixed(2)} + ganho ${acc.earned.toFixed(2)} − pago ${acc.paid.toFixed(2)} = saldo ${acc.balance.toFixed(2)} €`);
  lines.push("");
  if (unmatched.size) {
    lines.push("Nomes fora da equipa (importados como externos):");
    for (const [n, k] of [...unmatched].sort((a, b) => b[1] - a[1])) lines.push(`  ${n} (${k}×)`);
    lines.push("");
  }
  if (report.length) {
    lines.push("Notas:");
    lines.push(...report.map((s) => "  " + s));
  }
  console.log(lines.join("\n"));
  if (!allOk) console.log("\n⚠ Há meses que não batem com a folha.");

  if (args.has("--dry")) return;
  const exists = await fs.stat(OUT).then(() => true, () => false);
  if (exists && !args.has("--force")) {
    console.log(`\n${OUT} já existe — nada escrito. Use --force para substituir.`);
    return;
  }
  await fs.mkdir(DIR, { recursive: true });
  if (exists) await fs.copyFile(OUT, OUT.replace(/\.json$/, `.before-import.${Date.now()}.json`));
  await fs.writeFile(OUT, JSON.stringify(db), "utf-8");
  console.log(`\nEscrito ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
