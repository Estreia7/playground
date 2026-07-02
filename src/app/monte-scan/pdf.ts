// Minimal, dependency-free PDF writer that embeds JPEG pages (DCTDecode).
// Each page is one scanned image, scaled to fit an A4 page at 72 dpi while
// preserving aspect ratio and centering.

export interface PdfPageImage {
  /** JPEG data URL (image/jpeg) */
  dataUrl: string;
  width: number;
  height: number;
}

// A4 in PDF points (72 dpi): 595.28 x 841.89
const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 18; // ~0.25in

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Build a PDF Blob from processed JPEG pages. */
export function buildPdf(pages: PdfPageImage[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === "string" ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };

  // Object numbering:
  // 1 = Catalog, 2 = Pages tree, then per page: content, image, page.
  const pageObjNums: number[] = [];
  const imageObjNums: number[] = [];
  const contentObjNums: number[] = [];

  let nextObj = 3;
  for (let i = 0; i < pages.length; i++) {
    contentObjNums.push(nextObj++);
    imageObjNums.push(nextObj++);
    pageObjNums.push(nextObj++);
  }
  const totalObjs = nextObj - 1;

  const startObj = (num: number) => {
    offsets[num] = length;
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  // 1: Catalog
  startObj(1);
  push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);

  // 2: Pages tree
  startObj(2);
  const kids = pageObjNums.map((n) => `${n} 0 R`).join(" ");
  push(
    `2 0 obj\n<< /Type /Pages /Count ${pages.length} /Kids [ ${kids} ] >>\nendobj\n`
  );

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const imgBytes = dataUrlToBytes(page.dataUrl);

    // Fit image into printable area, preserving aspect ratio.
    const availW = A4_W - MARGIN * 2;
    const availH = A4_H - MARGIN * 2;
    const scale = Math.min(availW / page.width, availH / page.height);
    const drawW = page.width * scale;
    const drawH = page.height * scale;
    const x = (A4_W - drawW) / 2;
    const y = (A4_H - drawH) / 2;

    // content stream
    startObj(contentObjNums[i]);
    const content = `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(
      2
    )} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im${i} Do\nQ\n`;
    const contentBytes = enc.encode(content);
    push(
      `${contentObjNums[i]} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`
    );
    push(contentBytes);
    push(`\nendstream\nendobj\n`);

    // image XObject (JPEG / DCTDecode)
    startObj(imageObjNums[i]);
    push(
      `${imageObjNums[i]} 0 obj\n<< /Type /XObject /Subtype /Image ` +
        `/Width ${page.width} /Height ${page.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
        `/Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`
    );
    push(imgBytes);
    push(`\nendstream\nendobj\n`);

    // page
    startObj(pageObjNums[i]);
    push(
      `${pageObjNums[i]} 0 obj\n<< /Type /Page /Parent 2 0 R ` +
        `/MediaBox [0 0 ${A4_W.toFixed(2)} ${A4_H.toFixed(2)}] ` +
        `/Resources << /XObject << /Im${i} ${imageObjNums[i]} 0 R >> >> ` +
        `/Contents ${contentObjNums[i]} 0 R >>\nendobj\n`
    );
  }

  // xref
  const xrefStart = length;
  push(`xref\n0 ${totalObjs + 1}\n`);
  push(`0000000000 65535 f \n`);
  for (let n = 1; n <= totalObjs; n++) {
    const off = offsets[n] ?? 0;
    push(`${String(off).padStart(10, "0")} 00000 n \n`);
  }

  push(
    `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  );

  const blob = new Blob(chunks as BlobPart[], { type: "application/pdf" });
  return blob;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
