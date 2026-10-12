#!/usr/bin/env node
// Repair mislocated AL license geocodes. Wrong hits (e.g. mainland addresses
// pinned in the Azores/Madeira because of colliding street names) are cached
// in al_licenses with a 10-year read TTL, so they never self-heal — this
// script finds rows whose stored coords disagree with the region implied by
// the RNT address and re-geocodes them with the region-validated pipeline.
//
// Usage:
//   node backend/scripts/fix-geocodes.js [--dry-run] [--retry-failed] [--upgrade-locality]
//
//   --dry-run           list mismatches without writing anything
//   --retry-failed      also re-attempt rows with geocode_status = 'failed'
//   --upgrade-locality  also re-attempt rows pinned only to a parish/town
//                       centre (written by the old geocoder, which couldn't
//                       read messy RNT street fields); the old pin is kept
//                       when the new lookup finds nothing

const { open } = require('../db');
const store = require('../jobs/jobStore');
const { geocodeAddress, expectedRegion, coordsRegion } = require('../lib/geocode');

const DRY_RUN = process.argv.includes('--dry-run');
const RETRY_FAILED = process.argv.includes('--retry-failed');
const UPGRADE_LOCALITY = process.argv.includes('--upgrade-locality');

async function main() {
  const db = open();
  const rows = db.prepare(`SELECT * FROM al_licenses`).all();

  let scanned = 0;
  let mismatched = 0;
  let fixed = 0;
  let stillFailed = 0;
  let skipped = 0;
  let repinned = 0;
  let kept = 0;

  for (const row of rows) {
    scanned += 1;
    let rnt;
    try {
      rnt = JSON.parse(row.rnt_json);
    } catch {
      skipped += 1;
      continue;
    }
    const address = rnt?.address;
    if (!address) {
      skipped += 1;
      continue;
    }

    const expected = expectedRegion(address);
    const hasCoords = Number.isFinite(row.lat) && Number.isFinite(row.lng);
    const actual = hasCoords ? coordsRegion(row.lat, row.lng) : null;

    const isMismatch = hasCoords && expected && actual !== expected;
    const isRetry = RETRY_FAILED && !hasCoords && row.geocode_status === 'failed';
    const isUpgrade =
      UPGRADE_LOCALITY && !isMismatch && hasCoords && row.geocode_status === 'locality';
    if (!isMismatch && !isRetry && !isUpgrade) continue;

    mismatched += 1;
    const label = isMismatch
      ? `stored ${actual} (${row.lat.toFixed(3)}, ${row.lng.toFixed(3)}) but address says ${expected}`
      : isUpgrade
        ? `locality pin only`
        : `previously failed`;
    console.log(`AL ${row.al_number}: ${label} — ${address.full || address.postalCode || '?'}`);

    if (DRY_RUN) continue;

    const geo = await geocodeAddress(address);
    if (isUpgrade) {
      // Every result is at least locality precision, so any hit is no worse
      // than the stored pin; a miss keeps it rather than clearing the marker.
      if (geo.lat != null) {
        store.alLicenseSetGeocode(row.al_number, {
          lat: geo.lat,
          lng: geo.lng,
          geocodeStatus: geo.precision,
        });
        repinned += 1;
        console.log(`  → (${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}) [${geo.precision}]`);
      } else {
        kept += 1;
        console.log(`  → no hit; kept the old pin`);
      }
      continue;
    }
    if (geo.lat != null) {
      store.alLicenseSetGeocode(row.al_number, {
        lat: geo.lat,
        lng: geo.lng,
        geocodeStatus: geo.precision,
      });
      fixed += 1;
      console.log(`  → fixed: (${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}) [${geo.precision}]`);
    } else {
      store.alLicenseSetGeocode(row.al_number, {
        lat: null,
        lng: null,
        geocodeStatus: 'failed',
      });
      stillFailed += 1;
      console.log(`  → no valid hit; cleared coords (better no pin than a wrong island pin)`);
    }
  }

  console.log('');
  console.log(`Scanned:      ${scanned}`);
  console.log(`Selected:     ${mismatched}${DRY_RUN ? ' (dry run — nothing written)' : ''}`);
  if (!DRY_RUN) {
    console.log(`Fixed:        ${fixed}`);
    console.log(`Still failed: ${stillFailed}`);
    if (UPGRADE_LOCALITY) console.log(`Re-pinned:    ${repinned} (kept old pin: ${kept})`);
  }
  console.log(`Skipped (no address): ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
