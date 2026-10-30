import { ALLOWED, MAX_BYTES, saveFile } from "../store.ts";
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

  const name = (file.name || "ficheiro").slice(0, 160);
  const ref = await saveFile(name, file.type, Buffer.from(await file.arrayBuffer()));
  return Response.json({ file: ref });
}
