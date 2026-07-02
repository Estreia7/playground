// Client-side image processing for Monte Scan.
// Runs entirely in the browser via <canvas>. No dependencies.

export type EnhanceMode = "auto" | "color" | "grayscale" | "bw";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BaseImage {
  /** Normalized (EXIF-corrected, downscaled) JPEG data URL of the full frame */
  dataUrl: string;
  width: number;
  height: number;
}

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
    img.onerror = () =>
      reject(new Error("Could not read this image (unsupported format?)"));
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
 * Normalize a captured image: apply EXIF orientation (phone photos are often
 * rotated), downscale the long edge to keep everything fast and within the
 * vision API's size budget, and re-encode as a clean JPEG. Returns the full
 * frame — cropping happens later once the user confirms the box.
 */
export async function makeBaseImage(src: string): Promise<BaseImage> {
  const img = await loadImage(src);

  const MAX = 1600; // long edge — well under the vision API's pixel budget
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error("Image has no dimensions");

  const scale = Math.min(1, MAX / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  // Browsers apply EXIF orientation automatically when drawing an <img> that
  // has already decoded it, so a plain draw here yields an upright frame.
  ctx.drawImage(img, 0, 0, w, h);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  return { dataUrl, width: w, height: h };
}

/**
 * Suggest a crop rectangle for a base image by trimming near-uniform borders.
 * Returns a rect in the base image's pixel coordinates.
 */
export async function suggestCrop(base: BaseImage): Promise<Rect> {
  const img = await loadImage(base.dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = base.width;
  canvas.height = base.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);

  const box = detectContentBox(ctx, base.width, base.height);
  // If the detector collapsed or barely trimmed, fall back to the full frame.
  if (box.w < base.width * 0.3 || box.h < base.height * 0.3) {
    return { x: 0, y: 0, w: base.width, h: base.height };
  }
  return box;
}

/**
 * Apply a crop rectangle + enhancement to a base image and return the final
 * page JPEG ready for the PDF.
 */
export async function applyCrop(
  base: BaseImage,
  rect: Rect,
  mode: EnhanceMode = "auto"
): Promise<ProcessedPage> {
  const img = await loadImage(base.dataUrl);

  const x = Math.max(0, Math.round(rect.x));
  const y = Math.max(0, Math.round(rect.y));
  const w = Math.min(base.width - x, Math.round(rect.w));
  const h = Math.min(base.height - y, Math.round(rect.h));

  const out = document.createElement("canvas");
  out.width = Math.max(1, w);
  out.height = Math.max(1, h);
  const octx = out.getContext("2d", { willReadFrequently: true })!;
  octx.drawImage(img, x, y, w, h, 0, 0, w, h);

  enhance(octx, out.width, out.height, mode);

  const dataUrl = out.toDataURL("image/jpeg", 0.82);
  return { dataUrl, width: out.width, height: out.height };
}

/** Find the bounding box of non-background content by scanning pixel energy. */
function detectContentBox(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): Rect {
  const { data } = ctx.getImageData(0, 0, w, h);

  const lum = (i: number) =>
    0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  const corners = [
    0,
    (w - 1) * 4,
    (h - 1) * w * 4,
    ((h - 1) * w + (w - 1)) * 4,
  ];
  const bg = corners.reduce((s, i) => s + lum(i), 0) / corners.length;
  const THRESH = 34;

  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 600));

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
