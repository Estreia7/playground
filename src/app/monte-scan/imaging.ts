// Client-side image processing for Monte Scan.
// Runs entirely in the browser via <canvas>. No dependencies.

export type EnhanceMode = "auto" | "color" | "grayscale" | "bw";

export interface ProcessedPage {
  /** JPEG data URL, ready for preview + PDF embedding */
  dataUrl: string;
  width: number;
  height: number;
}

/** Load a File or data URL into an HTMLImageElement. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Auto-crop to the document by trimming near-uniform border margins, then
 * apply an "enhance" pass (contrast / white balance / optional B&W) so scans
 * look clean. Downscales very large captures to keep PDFs reasonable.
 */
export async function processPage(
  src: string,
  mode: EnhanceMode = "auto"
): Promise<ProcessedPage> {
  const img = await loadImage(src);

  // Downscale to a sane max dimension (long edge) before processing.
  const MAX = 2200;
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  const scale = Math.min(1, MAX / Math.max(w, h));
  w = Math.round(w * scale);
  h = Math.round(h * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);

  // --- auto-crop border ---
  const crop = detectContentBox(ctx, w, h);
  let cx = crop.x;
  let cy = crop.y;
  let cw = crop.w;
  let ch = crop.h;
  // Guard: if crop collapsed too far, keep full frame.
  if (cw < w * 0.3 || ch < h * 0.3) {
    cx = 0;
    cy = 0;
    cw = w;
    ch = h;
  }

  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  const octx = out.getContext("2d", { willReadFrequently: true })!;
  octx.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);

  enhance(octx, cw, ch, mode);

  const dataUrl = out.toDataURL("image/jpeg", 0.82);
  return { dataUrl, width: cw, height: ch };
}

/** Find the bounding box of non-background content by scanning row/col energy. */
function detectContentBox(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): { x: number; y: number; w: number; h: number } {
  const { data } = ctx.getImageData(0, 0, w, h);

  // Sample the four corners to estimate background luminance.
  const lum = (i: number) =>
    0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  const corners = [
    0,
    (w - 1) * 4,
    (h - 1) * w * 4,
    ((h - 1) * w + (w - 1)) * 4,
  ];
  const bg = corners.reduce((s, i) => s + lum(i), 0) / corners.length;
  const THRESH = 34; // luminance delta counted as "content"

  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 600)); // subsample for speed

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (Math.abs(lum(i) - bg) > THRESH) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX <= minX || maxY <= minY) {
    return { x: 0, y: 0, w, h };
  }

  // Pad slightly so we don't clip edges.
  const pad = Math.round(Math.min(w, h) * 0.015);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Contrast stretch + white balance; grayscale / B&W variants for text docs. */
function enhance(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  mode: EnhanceMode
) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  // Compute luminance percentiles for a contrast stretch.
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
    hist[l]++;
  }
  const total = w * h;
  const lowP = percentile(hist, total, 0.02);
  const highP = percentile(hist, total, 0.98);
  const range = Math.max(1, highP - lowP);

  const bw = mode === "bw";
  const gray = mode === "grayscale";
  const threshold = 150;

  for (let i = 0; i < d.length; i += 4) {
    // stretch each channel around the luminance window
    let r = clamp(((d[i] - lowP) / range) * 255);
    let g = clamp(((d[i + 1] - lowP) / range) * 255);
    let b = clamp(((d[i + 2] - lowP) / range) * 255);

    if (gray || bw) {
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      if (bw) {
        const v = l > threshold ? 255 : 0;
        r = g = b = v;
      } else {
        r = g = b = l;
      }
    }

    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }

  ctx.putImageData(imgData, 0, 0);
}

function percentile(hist: Uint32Array, total: number, p: number): number {
  const target = total * p;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= target) return i;
  }
  return 255;
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
