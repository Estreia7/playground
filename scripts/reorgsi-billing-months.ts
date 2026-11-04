/* Loads a CRM export of billing per month onto the consultants already in the
   ReorgSI database. The export names neither the year nor who is on the team,
   so the year is given by hand and only exact name matches are used. A
   consultant whose yearly total disagrees with the one on record is left
   alone and reported: someone has to decide which figure is right.

     node scripts/reorgsi-billing-months.ts <export.xlsx> <year> [--dry]
*/
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

const [file, year] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dry = process.argv.includes("--dry");
if (!file || !/^\d{4}$/.test(year ?? "")) {
  console.error("Uso: node scripts/reorgsi-billing-months.ts <export.xlsx> <ano> [--dry]");
  process.exit(1);
}

const DIR = path.join(process.cwd(), "storage", "reorgsi");
const DB = path.join(DIR, "db.json");
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const cents = (n: number) => Math.round(n * 100 + 1e-7) / 100;
const num = (v: unknown): number => {
  const n = v && typeof v === "object" && "result" in v ? (v as { result: unknown }).result : v;
  return typeof n === "number" ? n : 0;
};

const book = new ExcelJS.Workbook();
await book.xlsx.readFile(file);
const sheet = book.worksheets[0];
const header = sheet.getRow(1).values as unknown[];
if (header[1] !== "Nome" || header[2] !== "Janeiro" || header[13] !== "Dezembro") throw new Error("Este ficheiro não tem o formato do export do CRM.");

const rows = new Map<string, number[]>();
for (let r = 2; r <= sheet.rowCount; r++) {
  const v = sheet.getRow(r).values as unknown[];
  if (typeof v[1] === "string") rows.set(fold(v[1]), Array.from({ length: 12 }, (_, i) => cents(num(v[i + 2]))));
}

const db = JSON.parse(fs.readFileSync(DB, "utf-8"));
let done = 0;
for (const c of db.consultants) {
  const months = rows.get(fold(c.name));
  if (!months) {
    console.log(`Sem linha no ficheiro: ${c.name}`);
    continue;
  }
  const total = cents(months.reduce((s, v) => s + v, 0));
  const recorded = c.billingByYear[year];
  if (recorded != null && Math.abs(recorded - total) > 0.02) {
    console.log(`Não alterado: ${c.name} (base de dados ${recorded}, ficheiro ${total})`);
    continue;
  }
  c.billingByMonth = { ...c.billingByMonth, [year]: months };
  done++;
}

console.log(`${done} de ${db.consultants.length} consultores com os meses de ${year}.`);
if (!dry) {
  fs.copyFileSync(DB, path.join(DIR, `db.before-months-${year}.json`));
  const tmp = `${DB}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db), "utf-8");
  fs.renameSync(tmp, DB);
}
