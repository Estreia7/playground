import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { emptyDb, type Db, type FileRef } from "../../reorgsi/core/types.ts";
import { apply, type Action, type Result } from "../../reorgsi/core/actions.ts";

/* ReorgSI keeps everything in one JSON file on the server disk
   (storage/reorgsi/db.json, git-ignored), seeded by scripts/reorgsi-import.ts.
   Same discipline as the padel club: changes queue one behind another, each
   write goes to a temp file renamed into place, and the previous version is
   kept as db.bak.json.

   Uploaded files sit beside it in storage/reorgsi/files/, named by a random
   id, with their metadata held in the deal or invoice that points at them. */

const DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "storage", "reorgsi");
const FILE = path.join(DIR, "db.json");
const BACKUP = path.join(DIR, "db.bak.json");
export const FILES_DIR = path.join(DIR, "files");

const QUEUE_KEY = Symbol.for("playground.reorgsi.queue");

function queue(): { tail: Promise<unknown> } {
  const holder = globalThis as unknown as Record<symbol, { tail: Promise<unknown> } | undefined>;
  if (!holder[QUEUE_KEY]) holder[QUEUE_KEY] = { tail: Promise.resolve() };
  return holder[QUEUE_KEY];
}

const valid = (db: Db | null): db is Db => Boolean(db && Array.isArray(db.deals) && Array.isArray(db.invoices));

export async function readDb(): Promise<Db> {
  for (const f of [FILE, BACKUP]) {
    try {
      const db = JSON.parse(await fs.readFile(f, "utf-8")) as Db;
      if (valid(db)) return db;
    } catch {
      // missing or unreadable — try the next
    }
  }
  return emptyDb();
}

async function writeDb(db: Db): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  const tmp = FILE + "." + process.pid + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(db), "utf-8");
  await fs.copyFile(FILE, BACKUP).catch(() => undefined);
  await fs.rename(tmp, FILE);
}

export function applyAction(action: Action): Promise<Result> {
  const q = queue();
  const run = q.tail.then(async () => {
    const result = apply(await readDb(), action, {
      newId: () => crypto.randomBytes(6).toString("base64url"),
      now: () => new Date().toISOString(),
    });
    if (result.ok) await writeDb(result.db);
    return result;
  });
  q.tail = run.catch(() => undefined);
  return run;
}

export const ALLOWED: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const MAX_BYTES = 15 * 1024 * 1024;

/** What the bytes actually are, from their signature. A file is accepted only
 *  when this agrees with the type it claims: a renamed .exe is not a PDF. */
export function sniff(bytes: Buffer): string | null {
  const at = (offset: number, sig: number[]) => sig.every((b, i) => bytes[offset + i] === b);
  if (at(0, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (at(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return "image/webp"; // RIFF....WEBP
  return null;
}

/** Ids are generated here, so a valid one is exactly this shape. */
export const FILE_ID = /^[A-Za-z0-9_-]{16}$/;

export async function saveFile(name: string, mime: string, bytes: Buffer): Promise<FileRef> {
  const id = crypto.randomBytes(12).toString("base64url");
  await fs.mkdir(FILES_DIR, { recursive: true });
  await fs.writeFile(path.join(/*turbopackIgnore: true*/ FILES_DIR, `${id}.${ALLOWED[mime]}`), bytes);
  return { id, name, mime, size: bytes.length, uploadedAt: new Date().toISOString() };
}

export async function readFile(id: string): Promise<{ bytes: Buffer; mime: string } | null> {
  if (!FILE_ID.test(id)) return null;
  for (const [mime, ext] of Object.entries(ALLOWED)) {
    try {
      return { bytes: await fs.readFile(path.join(/*turbopackIgnore: true*/ FILES_DIR, `${id}.${ext}`)), mime };
    } catch {
      // not this extension
    }
  }
  return null;
}
