import { readFile } from "../../store.ts";
import { requireAccess, unauthorized } from "../../auth.ts";

export const dynamic = "force-dynamic";

/** Serves an uploaded file inline, so PDFs open in the browser's viewer. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireAccess(request))) return unauthorized();
  const { id } = await ctx.params;
  const file = await readFile(id);
  if (!file) return Response.json({ error: "notFound" }, { status: 404 });
  const download = new URL(request.url).searchParams.has("download");
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": download ? "attachment" : "inline",
      // Ids never change content, but the data is private: browser cache only.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
