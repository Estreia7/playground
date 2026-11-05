/* Loads a CRM export of listings taken per month onto the consultants already
   in the ReorgSI database. The export only counts them: it says nothing of each
   property, so these figures stay apart from the listings registered in the app.
   The export names no year, so it is given by hand, and only exact name matches
   are used.

     node scripts/reorgsi-listings-months.ts <export.xlsx> <year> [--dry]
*/
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

const [file, year] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dry = process.argv.includes("--dry");
if (!file || !/^\d{4}$/.test(year ?? "")) {
  console.error("Uso: node scripts/reorgsi-listings-months.ts <export.xlsx> <ano> [--dry]");
  process.exit(1);
}

const DIR = path.join(process.cwd(), "storage", "reorgsi");
const DB = path.join(DIR, "db.json");
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
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
  if (typeof v[1] === "string") rows.set(fold(v[1]), Array.from({ length: 12 }, (_, i) => num(v[i + 2])));
}

const db = JSON.parse(fs.readFileSync(DB, "utf-8"));
let done = 0;
let total = 0;
for (const c of db.consultants) {
  const months = rows.get(fold(c.name));
  if (!months) {
    console.log(`Sem linha no ficheiro: ${c.name}`);
    continue;
  }
  c.listingsByMonth = { ...c.listingsByMonth, [year]: months };
  total += months.reduce((s, v) => s + v, 0);
  done++;
}

console.log(`${done} de ${db.consultants.length} consultores com as angariações de ${year}: ${total} no total.`);
if (!dry) {
  fs.copyFileSync(DB, path.join(DIR, `db.before-listings-${year}.json`));
  const tmp = `${DB}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db), "utf-8");
  fs.renameSync(tmp, DB);
}
