/* Scanned pages into one PDF, in the browser. Each page keeps its own shape,
   fitted to A4 width, so a receipt stays a receipt and a contract an A4. */

const A4_WIDTH = 595.28; // points

function jpeg(canvas: HTMLCanvasElement, quality: number): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? b.arrayBuffer().then(resolve, reject) : reject(new Error("encode"))), "image/jpeg", quality),
  );
}

/** Builds the PDF. Stays under `maxBytes` by lowering JPEG quality if a long
 *  document would otherwise be refused by the upload limit. */
export async function pagesToPdf(pages: HTMLCanvasElement[], name: string, maxBytes: number): Promise<File> {
  const { PDFDocument } = await import("pdf-lib");
  let bytes: Uint8Array | null = null;
  for (const quality of [0.85, 0.72, 0.6, 0.5]) {
    const doc = await PDFDocument.create();
    doc.setTitle(name);
    doc.setProducer("ReorgSI");
    for (const canvas of pages) {
      const image = await doc.embedJpg(await jpeg(canvas, quality));
      const height = (A4_WIDTH * canvas.height) / canvas.width;
      doc.addPage([A4_WIDTH, height]).drawImage(image, { x: 0, y: 0, width: A4_WIDTH, height });
    }
    bytes = await doc.save();
    if (bytes.length <= maxBytes) break;
  }
  const safe = name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "documento";
  return new File([bytes as BlobPart], `${safe}.pdf`, { type: "application/pdf" });
}
