/* Loads the yearly Business Plan sheet onto the consultants already in the
   ReorgSI database: whether the plan was delivered, the meeting, the targets
   and the listings active at the time. Only exact name matches are used, and
   the sheet's figures are kept as written. Where the yearly target is not
   twelve monthly ones, the consultant page says so; this script only reports it.

     node scripts/reorgsi-business-plan.ts <plan.xlsx> <year> [--dry]
*/
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

const [file, year] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dry = process.argv.includes("--dry");
if (!file || !/^\d{4}$/.test(year ?? "")) {
  console.error("Uso: node scripts/reorgsi-business-plan.ts <plano.xlsx> <ano> [--dry]");
  process.exit(1);
}

const DIR = path.join(process.cwd(), "storage", "reorgsi");
const DB = path.join(DIR, "db.json");
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const value = (v: unknown) => (v && typeof v === "object" && "result" in v ? (v as { result: unknown }).result : v);
const num = (v: unknown) => {
  const n = value(v);
  return typeof n === "number" ? n : undefined;
};
const yes = (v: unknown) => typeof value(v) === "string" && fold(value(v) as string) === "sim";
const day = (v: unknown) => {
  const d = value(v);
  return d instanceof Date ? d.toISOString().slice(0, 10) : undefined;
};

const book = new ExcelJS.Workbook();
await book.xlsx.readFile(file);
const sheet = book.worksheets[0];
const header = sheet.getRow(2).values as unknown[];
if (header[1] !== "Consultor" || header[3] !== "Data Reunião" || header[6] !== "Obj. Faturação Anual") throw new Error("Este ficheiro não tem o formato do Business Plan.");

const db = JSON.parse(fs.readFileSync(DB, "utf-8"));
const team = new Map<string, { name: string; plans?: Record<string, unknown> }>(db.consultants.map((c: { name: string }) => [fold(c.name), c]));

let done = 0;
for (let r = 3; r <= sheet.rowCount; r++) {
  const v = sheet.getRow(r).values as unknown[];
  if (typeof v[1] !== "string") continue;
  const plan = {
    delivered: yes(v[2]),
    meetingDate: day(v[3]),
    meetingHeld: yes(v[4]),
    billingTarget: num(v[6]),
    billingTargetMonthly: num(v[7]),
    listingTarget: num(v[8]),
    listingTargetMonthly: num(v[9]),
    activeListings: num(v[10]),
  };
  const filled = Object.values(plan).some((x) => x !== undefined && x !== false);
  const c = team.get(fold(v[1]));
  if (!c) {
    if (filled) console.log(`Fora da base de dados, com dados no plano: ${v[1].trim()}`);
    continue;
  }
  if (!filled) {
    console.log(`Linha vazia: ${c.name}`);
    continue;
  }
  if (plan.billingTarget != null && plan.billingTargetMonthly != null && Math.abs(plan.billingTarget - plan.billingTargetMonthly * 12) > 1) {
    console.log(`Objetivos a confirmar: ${c.name} (anual ${plan.billingTarget}, mensal ${plan.billingTargetMonthly})`);
  }
  c.plans = { ...c.plans, [year]: plan };
  done++;
}

console.log(`${done} de ${db.consultants.length} consultores com o Business Plan de ${year}.`);
if (!dry) {
  fs.copyFileSync(DB, path.join(DIR, `db.before-plan-${year}.json`));
  const tmp = `${DB}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db), "utf-8");
  fs.renameSync(tmp, DB);
}
