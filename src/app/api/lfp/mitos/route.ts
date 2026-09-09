import { promises as fs } from "fs";
import path from "path";
import { validateMyths } from "@/app/lfp/mitos/engine";
import { verifyAdmin } from "../auth";

// Same shape as the quiz route: validated on every read, clean on write.
export const dynamic = "force-dynamic";

const FILE = path.join(process.cwd(), "storage", "lfp", "mitos.json");
const HISTORY = path.join(process.cwd(), "storage", "lfp", "history");

export async function GET() {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(FILE, "utf-8"));
  } catch {
    return Response.json({ error: "Mitos indisponíveis" }, { status: 503 });
  }
  const { myths, rejected } = validateMyths(raw);
  return Response.json({ meta: (raw as { meta?: unknown }).meta ?? null, myths, rejected });
}

export async function PUT(request: Request) {
  if (!(await verifyAdmin(request))) return Response.json({ error: "Não autorizado" }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { myths, rejected } = validateMyths(body);
  if (rejected.length) return Response.json({ error: "Validação falhou", rejected }, { status: 400 });
  const meta = (body as { meta?: Record<string, unknown> }).meta;
  if (!meta || typeof meta !== "object") return Response.json({ error: "meta em falta" }, { status: 400 });

  let current: { meta?: { version?: number } } | null = null;
  try {
    current = JSON.parse(await fs.readFile(FILE, "utf-8"));
  } catch {
    /* first write */
  }
  const prevVersion = current?.meta?.version ?? 0;
  if (current) {
    await fs.mkdir(HISTORY, { recursive: true });
    await fs.writeFile(path.join(HISTORY, `mitos.${prevVersion}.json`), JSON.stringify(current, null, 2), "utf-8");
  }
  const next = { meta: { ...meta, version: prevVersion + 1 }, myths };
  await fs.writeFile(FILE, JSON.stringify(next, null, 2) + "\n", "utf-8");
  return Response.json({ ok: true, version: prevVersion + 1, count: myths.length });
}
