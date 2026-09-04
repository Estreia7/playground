import { promises as fs } from "fs";
import path from "path";
import type {
  DatasetId,
  IrcDataset,
  IrsDataset,
  IvaDataset,
  TaxData,
  TsuDataset,
} from "@/app/lfp/types";

/* Tax datasets live as JSON on disk under storage/lfp/.
   Unlike monte-scan's storage (runtime blobs, git-ignored), this is SOURCE
   CONTENT and is committed: git log is the audit trail showing exactly when
   each published number changed and what it changed from. */

const STORAGE_DIR = path.join(process.cwd(), "storage", "lfp");
const HISTORY_DIR = path.join(STORAGE_DIR, "history");

export const DATASET_IDS = ["irs", "tsu", "iva", "irc"] as const;

export function isDatasetId(v: string): v is DatasetId {
  return (DATASET_IDS as readonly string[]).includes(v);
}

function fileFor(id: DatasetId) {
  return path.join(STORAGE_DIR, `${id}.json`);
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function readDataset<K extends DatasetId>(
  id: K
): Promise<TaxData[K] | null> {
  try {
    const raw = await fs.readFile(fileFor(id), "utf-8");
    return JSON.parse(raw) as TaxData[K];
  } catch {
    return null;
  }
}

/** Reads all four. Returns which ones are missing rather than throwing, so a
 *  partially-populated install still renders with honest gaps. */
export async function readAll(): Promise<{
  data: Partial<TaxData>;
  missing: DatasetId[];
}> {
  const data: Partial<TaxData> = {};
  const missing: DatasetId[] = [];

  await Promise.all(
    DATASET_IDS.map(async (id) => {
      const d = await readDataset(id);
      if (d) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data as any)[id] = d;
      } else {
        missing.push(id);
      }
    })
  );

  return { data, missing };
}

/* ── Validation ──────────────────────────────────────────────
   Hand-written, per repo convention (no zod). These check the shape the
   calculators actually depend on, so a bad admin edit is rejected at the
   door instead of producing a wrong euro figure on a public page. */

function checkMeta(v: unknown, errors: string[]) {
  const m = (v as { meta?: Record<string, unknown> })?.meta;
  if (!m || typeof m !== "object") {
    errors.push("meta em falta");
    return;
  }
  if (typeof m.year !== "number") errors.push("meta.year tem de ser um número");
  if (typeof m.source !== "string" || !m.source) errors.push("meta.source em falta");
  if (typeof m.lastVerified !== "string") errors.push("meta.lastVerified em falta");
  if (typeof m.version !== "number") errors.push("meta.version tem de ser um número");
}

function isRate(n: unknown): boolean {
  return typeof n === "number" && n >= 0 && n <= 1;
}

function validateIrs(v: unknown, errors: string[]) {
  const d = v as IrsDataset;
  if (!Array.isArray(d.retencao) || d.retencao.length === 0) {
    errors.push("retencao: é preciso pelo menos uma tabela");
    return;
  }
  d.retencao.forEach((t, ti) => {
    if (!Array.isArray(t.rows) || t.rows.length === 0) {
      errors.push(`retencao[${ti}].rows vazio`);
      return;
    }
    let prev = -Infinity;
    t.rows.forEach((r, ri) => {
      const where = `retencao[${ti}].rows[${ri}]`;
      if (!isRate(r.taxaMarginalMaxima)) errors.push(`${where}.taxaMarginalMaxima inválida`);
      // A row carries EITHER a constant parcela or the formula form used by
      // the first taxed brackets of the official tables. Exactly one.
      const hasConst = typeof r.parcelaAbater === "number";
      const fx = r.parcelaAbaterFormula;
      const hasFormula =
        !!fx && typeof fx.factor === "number" && typeof fx.limite === "number";
      if (!hasConst && !hasFormula) {
        errors.push(`${where}: falta parcelaAbater ou parcelaAbaterFormula`);
      }
      if (hasConst && hasFormula) {
        errors.push(`${where}: parcelaAbater e parcelaAbaterFormula são exclusivas`);
      }
      if (r.upTo !== null && typeof r.upTo !== "number") {
        errors.push(`${where}.upTo tem de ser número ou null`);
      }
      // Ordering matters: the calculator picks the first row the salary fits.
      if (r.upTo !== null) {
        if (r.upTo <= prev) errors.push(`${where}.upTo fora de ordem crescente`);
        prev = r.upTo;
      }
    });
    if (t.rows[t.rows.length - 1].upTo !== null) {
      errors.push(`retencao[${ti}]: a última linha tem de ter upTo = null (escalão superior)`);
    }
  });
}

function validateTsu(v: unknown, errors: string[]) {
  const d = v as TsuDataset;
  if (!Array.isArray(d.regimes) || d.regimes.length === 0) {
    errors.push("regimes: é preciso pelo menos um regime");
  } else {
    d.regimes.forEach((r, i) => {
      if (!isRate(r.trabalhador)) errors.push(`regimes[${i}].trabalhador inválida`);
      if (!isRate(r.entidadePatronal)) errors.push(`regimes[${i}].entidadePatronal inválida`);
    });
    if (!d.regimes.some((r) => r.id === d.defaultRegime)) {
      errors.push("defaultRegime não corresponde a nenhum regime");
    }
  }
  if (!d.subsidioRefeicao || typeof d.subsidioRefeicao.dinheiro !== "number") {
    errors.push("subsidioRefeicao.dinheiro em falta");
  }
}

function validateIva(v: unknown, errors: string[]) {
  const d = v as IvaDataset;
  (["continente", "madeira", "acores"] as const).forEach((reg) => {
    const r = d.rates?.[reg];
    if (!r) {
      errors.push(`rates.${reg} em falta`);
      return;
    }
    (["normal", "intermedia", "reduzida"] as const).forEach((t) => {
      if (!isRate(r[t])) errors.push(`rates.${reg}.${t} inválida`);
    });
  });
}

function validateIrc(v: unknown, errors: string[]) {
  const d = v as IrcDataset;
  if (!isRate(d.taxaGeral)) errors.push("taxaGeral inválida");
  if (!isRate(d.pme?.taxaReduzida)) errors.push("pme.taxaReduzida inválida");
  if (typeof d.pme?.limiteTranche !== "number") errors.push("pme.limiteTranche inválido");
  if (!isRate(d.derramaMunicipal?.max)) errors.push("derramaMunicipal.max inválida");
}

export function validateDataset(id: DatasetId, value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return ["Payload não é um objeto"];

  checkMeta(value, errors);
  if (id === "irs") validateIrs(value, errors);
  if (id === "tsu") validateTsu(value, errors);
  if (id === "iva") validateIva(value, errors);
  if (id === "irc") validateIrc(value, errors);

  return errors;
}

/** Validates, snapshots the current version to history/, then writes.
 *  No edit is ever destructive — a bad change can always be read back. */
export async function writeDataset(
  id: DatasetId,
  value: unknown
): Promise<{ ok: true; version: number } | { ok: false; errors: string[] }> {
  const errors = validateDataset(id, value);
  if (errors.length) return { ok: false, errors };

  const current = await readDataset(id);
  if (current) {
    await ensureDir(HISTORY_DIR);
    const v = current.meta?.version ?? 0;
    await fs.writeFile(
      path.join(HISTORY_DIR, `${id}.${v}.json`),
      JSON.stringify(current, null, 2),
      "utf-8"
    );
  }

  const next = value as { meta: { version: number } };
  next.meta.version = (current?.meta?.version ?? 0) + 1;

  await ensureDir(STORAGE_DIR);
  await fs.writeFile(fileFor(id), JSON.stringify(next, null, 2), "utf-8");

  return { ok: true, version: next.meta.version };
}
