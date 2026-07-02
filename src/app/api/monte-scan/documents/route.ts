import { listDocs, saveDoc } from "../storage";

export async function GET() {
  const docs = await listDocs();
  return Response.json({ documents: docs });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      docType?: string;
      label?: string;
      tags?: string[];
      pages?: number;
      pdfBase64?: string;
    };

    if (!body.pdfBase64) {
      return Response.json({ error: "Missing pdfBase64" }, { status: 400 });
    }

    const doc = await saveDoc({
      name: body.name ?? "scan",
      docType: body.docType ?? "other",
      label: body.label ?? "Document",
      tags: body.tags ?? [],
      pages: body.pages ?? 1,
      pdfBase64: body.pdfBase64,
    });

    return Response.json({ document: doc }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Monte Scan save error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
