import { promises as fs } from "fs";
import path from "path";
import { validateBank } from "@/app/lfp/quiz/engine";
import { verifyAdmin } from "../auth";

// The bank is admin-editable JSON; it is validated on every read so a bad
// edit hides the broken question instead of taking the quiz down.
export const dynamic = "force-dynamic";

const FILE = path.join(process.cwd(), "storage", "lfp", "quiz.json");
const HISTORY = path.join(process.cwd(), "storage", "lfp", "history");

/** Admin: replace the bank. Unlike reads, a save must be CLEAN — a bank
 *  with even one rejected question is refused with the reasons, so the
 *  file on disk never carries a known-bad question. The previous version
 *  is snapshotted to history/ first; no edit is destructive. */
export async function PUT(request: Request) {
  if (!(await verifyAdmin(request))) return Response.json({ error: "Não autorizado" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { questions, rejected } = validateBank(body);
  if (rejected.length) {
    return Response.json({ error: "Validação falhou", rejected }, { status: 400 });
  }
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
    await fs.writeFile(path.join(HISTORY, `quiz.${prevVersion}.json`), JSON.stringify(current, null, 2), "utf-8");
  }

  const next = { meta: { ...meta, version: prevVersion + 1 }, questions };
  await fs.writeFile(FILE, JSON.stringify(next, null, 2) + "\n", "utf-8");
  return Response.json({ ok: true, version: prevVersion + 1, count: questions.length });
}

export async function GET() {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(FILE, "utf-8"));
  } catch {
    return Response.json({ error: "Banco de perguntas indisponível" }, { status: 503 });
  }

  const { questions, rejected } = validateBank(raw);
  const meta = (raw as { meta?: unknown }).meta ?? null;

  return Response.json({
    meta,
    questions,
    // Ids and reasons, so the admin can see what was hidden and why.
    rejected,
  });
}
