import { promises as fs } from "fs";
import path from "path";
import { verifyAdmin } from "../auth";

/* The curated price basket for "dias de trabalho". No official source for
   product prices exists, so every item here is a first-party storefront
   price with the URL it was read from and the date it was captured — and
   the UI shows both. Admin-editable; validated on save; backed up. */

export const dynamic = "force-dynamic";

const FILE = path.join(process.cwd(), "storage", "lfp", "prices.json");
const HISTORY = path.join(process.cwd(), "storage", "lfp", "history");

export interface PriceItem {
  id: string;
  label: { pt: string; en: string };
  price: number;
  currency: "EUR";
  sourceUrl: string;
  capturedAt: string;
}

function validateItems(raw: unknown): { items: PriceItem[]; errors: string[] } {
  const errors: string[] = [];
  const items: PriceItem[] = [];
  if (!Array.isArray(raw)) return { items, errors: ["items: array obrigatório"] };
  const ids = new Set<string>();
  raw.forEach((x, i) => {
    const where = `items[${i}]`;
    const it = x as Partial<PriceItem>;
    if (typeof it.id !== "string" || !/^[a-z0-9-]+$/.test(it.id)) errors.push(`${where}.id inválido`);
    else if (ids.has(it.id)) errors.push(`${where}.id duplicado`);
    else ids.add(it.id);
    if (!it.label || typeof it.label.pt !== "string" || typeof it.label.en !== "string" || !it.label.pt || !it.label.en) errors.push(`${where}.label pt/en obrigatório`);
    if (typeof it.price !== "number" || !(it.price > 0)) errors.push(`${where}.price tem de ser positivo`);
    if (it.currency !== "EUR") errors.push(`${where}.currency tem de ser EUR`);
    if (typeof it.sourceUrl !== "string" || !/^https:\/\//.test(it.sourceUrl)) errors.push(`${where}.sourceUrl https obrigatório`);
    if (typeof it.capturedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(it.capturedAt)) errors.push(`${where}.capturedAt AAAA-MM-DD obrigatório`);
    if (!errors.some((e) => e.startsWith(where))) items.push(it as PriceItem);
  });
  return { items, errors };
}

export async function GET() {
  try {
    const raw = JSON.parse(await fs.readFile(FILE, "utf-8"));
    const { items, errors } = validateItems(raw.items);
    // Invalid items are hidden from the public, reported for the admin.
    return Response.json({ meta: raw.meta ?? null, items, rejected: errors });
  } catch {
    return Response.json({ meta: null, items: [], rejected: [] });
  }
}

export async function PUT(request: Request) {
  if (!(await verifyAdmin(request))) return Response.json({ error: "Não autorizado" }, { status: 403 });
  let body: { meta?: Record<string, unknown>; items?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { items, errors } = validateItems(body.items);
  if (errors.length) return Response.json({ error: "Validação falhou", issues: errors }, { status: 400 });

  let current: { meta?: { version?: number } } | null = null;
  try {
    current = JSON.parse(await fs.readFile(FILE, "utf-8"));
  } catch {
    /* first write */
  }
  const prevVersion = current?.meta?.version ?? 0;
  if (current) {
    await fs.mkdir(HISTORY, { recursive: true });
    await fs.writeFile(path.join(HISTORY, `prices.${prevVersion}.json`), JSON.stringify(current, null, 2), "utf-8");
  }
  const next = { meta: { ...(body.meta ?? current?.meta ?? {}), version: prevVersion + 1, lastVerified: new Date().toISOString().slice(0, 10) }, items };
  await fs.writeFile(FILE, JSON.stringify(next, null, 2) + "\n", "utf-8");
  return Response.json({ ok: true, version: prevVersion + 1, count: items.length });
}
