import { promises as fs } from "fs";
import path from "path";
import { validateBank } from "@/app/lfp/quiz/engine";

// The bank is admin-editable JSON; it is validated on every read so a bad
// edit hides the broken question instead of taking the quiz down.
export const dynamic = "force-dynamic";

const FILE = path.join(process.cwd(), "storage", "lfp", "quiz.json");

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
