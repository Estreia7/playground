#!/usr/bin/env node
// Re-read owner contacts for AL licenses whose email the old parser dropped.
//
// From August 2026 the RNAL portal wraps each contact in its own <div> with an
// icon. The old parser joined the whole cell into one string, which read every
// contact twice: emails came out as "joao@gmail.comjoao" (repaired on read now,
// see sanitizeEmail) and, when a phone was present too, as
// "joao@gmail.com912345678joao" — which failed validation and was stored as no
// email at all. Those can only be recovered from the portal, so this script
// re-fetches every cached license that has an owner with a phone but no email.
//
// Usage:
//   node backend/scripts/refetch-rnt-contacts.js [--dry-run]

const { open } = require('../db');
const store = require('../jobs/jobStore');
const { fetchRnt } = require('../lib/rnt');

const DRY_RUN = process.argv.includes('--dry-run');
// One request at a time with a pause: this is a public government portal.
const PAUSE_MS = 800;

async function main() {
  const db = open();
  const rows = db.prepare(`SELECT * FROM al_licenses`).all();
  const targets = rows.filter((row) => {
    try {
      const rnt = JSON.parse(row.rnt_json);
      return (rnt.owners || []).some((o) => o.phone && !o.email);
    } catch {
      return false;
    }
  });

  console.log(`${targets.length} of ${rows.length} licenses have an owner with a phone but no email.`);
  if (DRY_RUN) {
    for (const row of targets) console.log(`  AL ${row.al_number}`);
    console.log('Dry run — nothing fetched or written.');
    return;
  }

  let recovered = 0;
  let noEmail = 0;
  let failed = 0;
  for (const [i, row] of targets.entries()) {
    try {
      const rnt = await fetchRnt(row.al_number);
      if (rnt.status !== 'found') {
        failed += 1;
        console.log(`AL ${row.al_number}: ${rnt.status} — kept the cached record`);
      } else {
        // Keep the stored geocode: only the registry text is being refreshed.
        store.alLicenseUpsert({
          alNumber: row.al_number,
          rnt,
          lat: row.lat,
          lng: row.lng,
          geocodeStatus: row.geocode_status,
        });
        const emails = rnt.owners.map((o) => o.email).filter(Boolean);
        if (emails.length) recovered += 1;
        else noEmail += 1;
        console.log(`AL ${row.al_number}: ${emails.length ? emails.join(', ') : 'no email on the portal'}`);
      }
    } catch (err) {
      failed += 1;
      console.log(`AL ${row.al_number}: fetch failed (${err.message}) — kept the cached record`);
    }
    if (i < targets.length - 1) await new Promise((r) => setTimeout(r, PAUSE_MS));
  }

  console.log('');
  console.log(`Emails recovered:      ${recovered}`);
  console.log(`No email on the portal: ${noEmail}`);
  console.log(`Failed / not found:    ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
