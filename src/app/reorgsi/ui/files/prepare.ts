/* Screenshots of listings are often 3–6 MB PNGs. Before upload, images
   larger than 2000 px or 1,5 MB are redrawn as JPEG at 0.85, which keeps them
   sharp for reading and small enough to preview instantly. PDFs go as they are. */

const MAX_SIDE = 2000;
const KEEP_BELOW = 1.5 * 1024 * 1024;

export async function prepareUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < KEEP_BELOW) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob) return file;
  const name = (file.name.replace(/\.[^.]+$/, "") || "captura") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}

/** A pasted screenshot arrives as "image.png"; give it a useful name. */
export function namePasted(file: File, label: string): File {
  if (file.name && file.name !== "image.png") return file;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const ext = file.type.split("/")[1] ?? "png";
  return new File([file], `${label}-${stamp}.${ext}`, { type: file.type });
}

/** A profile photo: the centre square of the image, 512 px, JPEG. */
export async function preparePhoto(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const out = Math.min(512, side);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out, out);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}
