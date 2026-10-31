import { ALLOWED, MAX_BYTES, saveFile, sniff } from "../store.ts";
import { requireAccess, unauthorized } from "../auth.ts";

export const dynamic = "force-dynamic";

/** Multipart upload of one file (field "file"). Returns its FileRef; the
 *  caller then attaches it to a deal, document or invoice with an action. */
export async function POST(request: Request) {
  if (!(await requireAccess(request))) return unauthorized();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "badRequest" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "badRequest" }, { status: 400 });
  if (!ALLOWED[file.type]) return Response.json({ error: "type" }, { status: 415 });
  if (file.size > MAX_BYTES) return Response.json({ error: "size" }, { status: 413 });
  if (file.size === 0) return Response.json({ error: "empty" }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  // The declared type is the browser's guess from the name; the bytes decide.
  const real = sniff(bytes);
  if (!real || !ALLOWED[real]) return Response.json({ error: "type" }, { status: 415 });

  const name = (file.name || "ficheiro").replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 160);
  const ref = await saveFile(name, real, bytes);
  return Response.json({ file: ref });
}
