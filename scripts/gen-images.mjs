#!/usr/bin/env node
/* LFP — image generation via KIE (GPT Image 2.5).

   Run:  node scripts/gen-images.mjs [slug|all] [--force]

   Images are generated ONCE and committed. The runtime never calls this
   API: a generated file on disk costs nothing per view, cannot fail on a
   slow night, and stays identical for everyone — the same reasoning as the
   economic data sync.

   What is deliberately NOT generated: anything that stands in for a
   number. The MoneyFlow diagram, the charts and the ledgers are drawn
   from the real tables, and their proportions change with the input. A
   painted "wallet with money" would be a fixed picture that contradicts
   the figure beside it the moment the reader types a different salary.
   These images sit where there is no data to represent: the branch doors
   and the quiz invitation.

   Style: the project's azulejo identity — cal ground (#F5F2E9), cobalt
   ink (#1B4E8C), with the flag's green and red reserved for meaning
   elsewhere, so they stay out of the illustrations. */

import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = path.join(process.cwd(), "public", "lfp");
const MODEL = "gpt-image-2-5-flare-text-to-image";
const API = "https://api.kie.ai/api/v1";

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const which = args.find((a) => !a.startsWith("--")) ?? "all";

/* A shared preamble keeps the six images looking like one set rather than
   six separate commissions. */
const STYLE =
  "Flat vector editorial illustration in the style of Portuguese azulejo tile art. " +
  "Strictly limited palette: warm off-white lime-plaster background #F5F2E9, deep cobalt blue #1B4E8C line work and fills, " +
  "muted gold #8A6314 for small accents only. No other colours. No red, no green. " +
  "Clean confident linework, generous negative space, " +
  "no text, no letters, no numbers, no logos, no watermark, no people's faces. " +
  "Calm, precise, documentary feel — not playful, not cartoonish, not 3D, no gradients, no drop shadows. " +
  // The first pass came back as a decorative tile panel with the subject
  // small inside it; the ornament has to stay subordinate.
  "The subject fills most of the frame and is the clear focus. " +
  "Plain uncluttered background with at most a faint tile seam — no decorative corner flourishes, no tile borders, no framing pattern.";

const IMAGES = [
  {
    slug: "door-individual",
    ratio: "3:2",
    prompt:
      "A single payslip envelope, half-opened, seen straight on from above on a plain surface. " +
      "Beside it a few coins stacked in a neat column. Simple, quiet, domestic.",
  },
  {
    slug: "door-empresarial",
    ratio: "3:2",
    prompt:
      "A small shopfront seen straight on: awning, door, one window, in the manner of a Lisbon street business. " +
      "Simple geometric architecture, no signage, no lettering.",
  },
  {
    slug: "door-economia",
    ratio: "3:2",
    prompt:
      "An antique navigator's compass rose beside a folded paper map, seen from above. " +
      "Age-of-Discoveries cartography feel, geometric and precise.",
  },
  {
    slug: "quiz",
    ratio: "3:2",
    prompt:
      "An open notebook seen from above with a fountain pen resting on it, " +
      "and three small blank checkbox squares drawn on the page. No writing, no words.",
  },
  {
    slug: "hero-tiles",
    ratio: "16:9",
    width: 1600,
    prompt:
      "A wide decorative azulejo tile panel: repeating geometric pattern of interlocking squares and quarter-circles, " +
      "the kind found on a Lisbon building facade. Purely ornamental pattern, seamless, evenly lit, very subtle contrast.",
  },
  {
    slug: "contribuir",
    ratio: "3:2",
    prompt:
      "A hand-written letter and a simple envelope on a plain surface, seen from above, " +
      "with a magnifying glass resting beside them. The letter's lines are suggested by plain ruled strokes, not readable text.",
  },
];

/* ── api ─────────────────────────────────────────────────── */

async function readKey() {
  const env = await readFile(path.join(process.cwd(), ".env.local"), "utf8");
  const m = env.match(/^KIE_API_KEY=(.+)$/m);
  if (!m) throw new Error("KIE_API_KEY em falta no .env.local");
  return m[1].trim();
}

async function createTask(key, { prompt, ratio }) {
  const r = await fetch(`${API}/jobs/createTask`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      // `aspect_ratio`, not `image_size`: the latter is accepted without
      // complaint and then ignored, returning a square every time. Probed
      // against the live API — 3:2 requested via image_size came back 1:1.
      input: { prompt: `${STYLE} ${prompt}`, aspect_ratio: ratio },
    }),
  });
  const j = await r.json();
  if (j.code !== 200 || !j.data?.taskId) {
    throw new Error(`createTask ${j.code}: ${j.msg}`);
  }
  return j.data.taskId;
}

/** Polls until the task settles. Generation takes about a minute, so the
 *  interval is generous; the cap stops a stuck task hanging the script. */
async function waitFor(key, taskId, { intervalMs = 5000, maxTries = 60 } = {}) {
  for (let i = 0; i < maxTries; i++) {
    const r = await fetch(`${API}/jobs/recordInfo?taskId=${taskId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const j = await r.json();
    const d = j.data ?? {};
    if (d.state === "success") {
      const urls = JSON.parse(d.resultJson || "{}").resultUrls ?? [];
      if (!urls.length) throw new Error("sucesso sem resultUrls");
      return { url: urls[0], costTime: d.costTime };
    }
    if (d.state === "fail") throw new Error(`falhou: ${d.failCode} ${d.failMsg}`);
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  throw new Error(`sem resposta ao fim de ${(intervalMs * maxTries) / 1000}s`);
}

/** Downloads, checks the shape, and writes a display-sized WebP.
 *  The raw PNGs arrive around 2 MB each — fine as a source, unacceptable
 *  on a landing page. These are flat illustrations, so WebP at q80 is
 *  visually identical at a twentieth of the weight. */
async function download(url, file, ratio, width) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  // A truncated or error-page download would otherwise be committed as a
  // valid-looking file; PNG magic bytes are the cheapest guard.
  if (!(buf[0] === 0x89 && buf.subarray(1, 4).toString() === "PNG")) {
    throw new Error(`não é um PNG (${buf.length} bytes)`);
  }
  // PNG IHDR: width and height as big-endian uint32 at offsets 16 and 20.
  // The API silently ignored a wrong ratio field once, so the shape is
  // checked rather than trusted.
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const [rw, rh] = ratio.split(":").map(Number);
  if (Math.abs(w / h - rw / rh) > 0.05) {
    throw new Error(`rácio errado: pedido ${ratio}, recebido ${w}x${h}`);
  }
  const out = await sharp(buf).resize(width, null, { withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  await writeFile(file, out);
  const m = await sharp(out).metadata();
  return { bytes: out.length, w: m.width, h: m.height };
}

const exists = (p) => access(p).then(() => true, () => false);

/* ── run ─────────────────────────────────────────────────── */

const key = await readKey();
await mkdir(OUT_DIR, { recursive: true });

const todo = which === "all" ? IMAGES : IMAGES.filter((i) => i.slug === which);
if (!todo.length) {
  console.error(`slug desconhecido: ${which}\ndisponíveis: ${IMAGES.map((i) => i.slug).join(", ")}`);
  process.exit(1);
}

let done = 0;
let failed = 0;
for (const img of todo) {
  const file = path.join(OUT_DIR, `${img.slug}.webp`);
  if (!FORCE && (await exists(file))) {
    console.log(`↷ ${img.slug} já existe (--force para refazer)`);
    continue;
  }
  try {
    process.stdout.write(`… ${img.slug} (${img.ratio}) `);
    const taskId = await createTask(key, img);
    const { url, costTime } = await waitFor(key, taskId);
    const { bytes, w, h } = await download(url, file, img.ratio, img.width ?? 1200);
    console.log(`✓ ${w}x${h}, ${Math.round(bytes / 1024)}KB em ${costTime}s`);
    done++;
  } catch (e) {
    console.log(`✗ ${e.message}`);
    failed++;
  }
}

console.log(`\n${done} gerada(s), ${failed} falhada(s). ~${done * 6} créditos usados.`);
