// Clean backend/media: drop Airbnb illustrations/avatars that were stored as
// listing photos, and trim every listing to its first N real photos.
//
//   node scripts/clean-media.js                # dry run: report only
//   node scripts/clean-media.js --apply        # rewrite DB + move files
//   node scripts/clean-media.js --apply --keep 2
//
// No source URLs were stored, so non-photos are found by CONTENT: the same
// image file (e.g. Airbnb's search-bar house icon, a default avatar) sitting in
// many different listing folders cannot be a photo of one property.
//
// Nothing is deleted. Dropped files are MOVED to backend/media-trash/<stamp>/
// (same relative paths), so the result can be checked and reverted; delete
// that folder by hand afterwards to actually free the disk space.

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { open, getDb, close } = require('../db');
const { MEDIA_ROOT } = require('../scraper/extractPhotos');

const APPLY = process.argv.includes('--apply');
const keepIdx = process.argv.indexOf('--keep');
const KEEP = keepIdx > -1 ? parseInt(process.argv[keepIdx + 1], 10) : 2;
// A file shared by this many distinct listing folders is not a listing photo.
const SHARED_MIN_DIRS = 3;

function hashFile(p) {
  return crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
}

function sizeOf(p) {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

const mb = (b) => `${(b / 1024 ** 2).toFixed(1)} MB`;

open();
const db = getDb();

// --- 1. hash every stored file; flag content shared across listings -------
const dirs = fs.existsSync(MEDIA_ROOT)
  ? fs.readdirSync(MEDIA_ROOT, { withFileTypes: true }).filter((d) => d.isDirectory())
  : [];
const hashOf = new Map(); // rel path -> sha1
const dirsByHash = new Map(); // sha1 -> Set(listing dir)
for (const d of dirs) {
  for (const f of fs.readdirSync(path.join(MEDIA_ROOT, d.name))) {
    const rel = `${d.name}/${f}`;
    const h = hashFile(path.join(MEDIA_ROOT, rel));
    hashOf.set(rel, h);
    if (!dirsByHash.has(h)) dirsByHash.set(h, new Set());
    dirsByHash.get(h).add(d.name);
  }
}
const shared = new Set(
  [...dirsByHash].filter(([, set]) => set.size >= SHARED_MIN_DIRS).map(([h]) => h)
);
console.log(`files: ${hashOf.size} in ${dirs.length} listing folders`);
for (const h of shared) {
  const example = [...hashOf].find(([, v]) => v === h)[0];
  console.log(`  shared image ${h.slice(0, 10)} in ${dirsByHash.get(h).size} listings (e.g. ${example}, ${mb(sizeOf(path.join(MEDIA_ROOT, example)))})`);
}

// --- 2. new photo list per host_results row ----------------------------------
const rows = db
  .prepare(`SELECT job_id, listing_url, result_json FROM host_results`)
  .all();
const keepFiles = new Set();
const updates = [];
let photosBefore = 0;
let photosAfter = 0;
for (const r of rows) {
  let result;
  try {
    result = JSON.parse(r.result_json);
  } catch {
    continue;
  }
  const photos = Array.isArray(result.photos) ? result.photos : [];
  photosBefore += photos.length;
  const next = photos
    .filter((rel) => hashOf.has(rel) && !shared.has(hashOf.get(rel)))
    .slice(0, KEEP);
  photosAfter += next.length;
  next.forEach((rel) => keepFiles.add(rel));
  if (next.length !== photos.length || next.some((p, i) => p !== photos[i])) {
    updates.push({ jobId: r.job_id, url: r.listing_url, result: { ...result, photos: next } });
  }
}

// --- 3. files no row references any more -------------------------------------
const drop = [...hashOf.keys()].filter((rel) => !keepFiles.has(rel));
const dropBytes = drop.reduce((s, rel) => s + sizeOf(path.join(MEDIA_ROOT, rel)), 0);
const totalBytes = [...hashOf.keys()].reduce((s, rel) => s + sizeOf(path.join(MEDIA_ROOT, rel)), 0);

console.log(`listing rows: ${rows.length}, rows to rewrite: ${updates.length}`);
console.log(`photo refs: ${photosBefore} -> ${photosAfter} (keep ${KEEP} real photos per listing)`);
console.log(`files to move out: ${drop.length} (${mb(dropBytes)} of ${mb(totalBytes)})`);

if (!APPLY) {
  console.log('\nDry run. Re-run with --apply to rewrite the DB and move the files.');
  close();
  process.exit(0);
}

// --- 4. apply: DB first (one transaction), then move the files ----------------
const upd = db.prepare(`UPDATE host_results SET result_json = ? WHERE job_id = ? AND listing_url = ?`);
db.transaction(() => {
  for (const u of updates) upd.run(JSON.stringify(u.result), u.jobId, u.url);
})();

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const trash = path.resolve(MEDIA_ROOT, '..', 'media-trash', stamp);
let moved = 0;
for (const rel of drop) {
  const to = path.join(trash, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(path.join(MEDIA_ROOT, rel), to);
  moved++;
}
// Remove listing folders left empty (rmdir only succeeds on empty folders).
for (const d of dirs) {
  try {
    fs.rmdirSync(path.join(MEDIA_ROOT, d.name));
  } catch {
    /* not empty */
  }
}
console.log(`\nApplied: ${updates.length} rows rewritten, ${moved} files moved to ${trash}`);
console.log(`Check the dossiers, then free the space with:  rm -rf "${trash}"`);
close();
