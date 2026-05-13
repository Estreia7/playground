function pickSampleGaps(gaps, maxSamples = 3) {
  if (!Array.isArray(gaps) || gaps.length === 0) return [];
  const usable = gaps.filter((g) => g && g.nights >= 1);
  if (usable.length === 0) return [];

  const sorted = [...usable].sort((a, b) => b.nights - a.nights);
  const n = Math.min(maxSamples, sorted.length);

  if (n === 1) return [sorted[0]];
  if (n === 2) return [sorted[0], sorted[Math.floor(sorted.length / 2)]];

  return [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1]];
}

module.exports = { pickSampleGaps };
