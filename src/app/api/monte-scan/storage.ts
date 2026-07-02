import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

// Documents are stored on the server filesystem (VPS-friendly, git-ignored).
// storage/monte-scan/<id>.pdf  + storage/monte-scan/index.json
const STORAGE_DIR = path.join(process.cwd(), "storage", "monte-scan");
const INDEX_FILE = path.join(STORAGE_DIR, "index.json");

export interface StoredDoc {
  id: string;
  name: string; // display name without extension
  fileName: string; // <id>.pdf
  docType: string;
  label: string;
  tags: string[];
  pages: number;
  size: number; // bytes
  createdAt: string; // ISO
}

async function ensureDir() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
}

async function readIndex(): Promise<StoredDoc[]> {
  try {
    const raw = await fs.readFile(INDEX_FILE, "utf-8");
    return JSON.parse(raw) as StoredDoc[];
  } catch {
    return [];
  }
}

async function writeIndex(docs: StoredDoc[]) {
  await ensureDir();
  await fs.writeFile(INDEX_FILE, JSON.stringify(docs, null, 2), "utf-8");
}

export async function listDocs(): Promise<StoredDoc[]> {
  const docs = await readIndex();
  return docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getDoc(id: string): Promise<StoredDoc | undefined> {
  const docs = await readIndex();
  return docs.find((d) => d.id === id);
}

export async function readDocFile(id: string): Promise<Buffer | null> {
  const doc = await getDoc(id);
  if (!doc) return null;
  try {
    return await fs.readFile(path.join(STORAGE_DIR, doc.fileName));
  } catch {
    return null;
  }
}

export async function saveDoc(input: {
  name: string;
  docType: string;
  label: string;
  tags: string[];
  pages: number;
  pdfBase64: string;
}): Promise<StoredDoc> {
  await ensureDir();
  const id = crypto.randomBytes(9).toString("hex");
  const fileName = `${id}.pdf`;
  const buffer = Buffer.from(input.pdfBase64, "base64");
  await fs.writeFile(path.join(STORAGE_DIR, fileName), buffer);

  const doc: StoredDoc = {
    id,
    name: sanitizeName(input.name) || "scan",
    fileName,
    docType: input.docType || "other",
    label: input.label || "Document",
    tags: (input.tags || []).slice(0, 8),
    pages: input.pages || 1,
    size: buffer.length,
    createdAt: new Date().toISOString(),
  };

  const docs = await readIndex();
  docs.push(doc);
  await writeIndex(docs);
  return doc;
}

export async function deleteDoc(id: string): Promise<boolean> {
  const docs = await readIndex();
  const doc = docs.find((d) => d.id === id);
  if (!doc) return false;
  try {
    await fs.unlink(path.join(STORAGE_DIR, doc.fileName));
  } catch {
    // file already gone — still drop the index entry
  }
  await writeIndex(docs.filter((d) => d.id !== id));
  return true;
}

function sanitizeName(name: string): string {
  return name
    .trim()
    .replace(/[^\p{L}\p{N}\s._-]/gu, "")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}
