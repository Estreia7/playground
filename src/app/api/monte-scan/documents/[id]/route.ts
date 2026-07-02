import { deleteDoc, getDoc, readDocFile } from "../../storage";

// GET serves the raw PDF (inline) so it can be viewed or linked from WhatsApp.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const doc = await getDoc(id);
  const file = await readDocFile(id);

  if (!doc || !file) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return new Response(new Uint8Array(file), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.name}.pdf"`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const ok = await deleteDoc(id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
