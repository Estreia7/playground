// Pick up to `maxSamples` sample windows from the gaps detected by
// extractGaps. Strategy (per user choice):
//   - Longest gaps first (peak/representative pricing)
//   - Window length is capped at the gap's own length (no shrink-and-retry)
//   - Prefer windows in {7, 6, 5, 4, 3} nights when the gap allows it,
//     otherwise use the full gap length down to a minimum of 2 nights.
// Returns up to `maxSamples` items shaped like the gap itself, but with
// `nights` and `end` adjusted to the chosen window length.

const PREFERRED_LENGTHS = [7, 6, 5, 4, 3];
const MIN_NIGHTS = 2;

function pickSampleGaps(gaps, maxSamples = 3) {
  if (!Array.isArray(gaps) || gaps.length === 0) return [];

  const usable = gaps
    .filter((g) => g && g.nights >= MIN_NIGHTS)
    .sort((a, b) => b.nights - a.nights);

  const samples = [];
  for (const gap of usable) {
    if (samples.length >= maxSamples) break;

    const windowLen = pickWindowLength(gap.nights);
    if (windowLen < MIN_NIGHTS) continue;

    samples.push({
      start: gap.start,
      end: addDays(gap.start, windowLen),
      nights: windowLen,
    });
  }
  return samples;
}

function pickWindowLength(gapNights) {
  for (const want of PREFERRED_LENGTHS) {
    if (want <= gapNights) return want;
  }
  return gapNights;
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

module.exports = { pickSampleGaps };
