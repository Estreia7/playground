// One-off: load an RNAL export plus already-verified Airbnb matches into the
// AL Registry without spending any search credits.
//
//   node scripts/seed-al-registry.js <seed.json>
//
// seed.json: {
//   sourceFile: "ListaRegisto_AL_….xlsx",
//   rows:    [{ alNumber, name, registeredAt, modalidade, camas, utentes, quartos,
//               address, postalCode, localidade, freguesia, concelho }],
//   matches: [{ alNumber, status, foundVia, roomId, title?, hostId?, hostUrl?,
//               hostName?, bingTried?, googleTried? }]
// }
// Matches without a host are filled by the next "al-registry" run (free:
// one listing visit each), which then queues host dossiers.

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const fs = require('fs');
const { open, close } = require('../db');
const reg = require('../jobs/alRegistryStore');

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/seed-al-registry.js <seed.json>');
  process.exit(1);
}

const seed = JSON.parse(fs.readFileSync(file, 'utf8'));
open();
const { imported, skipped } = reg.importRows(seed.rows || [], seed.sourceFile);

let seeded = 0;
const now = Math.floor(Date.now() / 1000);
for (const m of seed.matches || []) {
  const al = reg.cleanAl(m.alNumber);
  if (!al) continue;
  const current = reg.getMatch(al);
  if (current && current.status === 'found') continue; // never downgrade
  reg.updateMatch(al, {
    status: m.status,
    found_via: m.foundVia || null,
    room_id: m.roomId || null,
    listing_url: m.roomId ? `https://www.airbnb.com/rooms/${m.roomId}` : null,
    listing_title: m.title || null,
    host_id: m.hostId || null,
    host_url: m.hostUrl || null,
    host_name: m.hostName || null,
    bing_tried: m.bingTried ? 1 : 0,
    google_tried: m.googleTried ? 1 : 0,
    checked_at: now,
    error: null,
  });
  seeded++;
}

const fromDossiers = reg.matchFromDossiers().length;
console.log(JSON.stringify({ imported, skipped, seeded, fromDossiers }));
close();
