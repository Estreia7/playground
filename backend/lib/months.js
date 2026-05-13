function nextTwelveMonths(now = new Date()) {
  const tz = process.env.TZ || 'Europe/Lisbon';

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);

  const year = parseInt(parts.find((p) => p.type === 'year').value, 10);
  const month = parseInt(parts.find((p) => p.type === 'month').value, 10);

  const out = [];
  for (let i = 1; i <= 12; i++) {
    let y = year;
    let m = month + i;
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    out.push({ year: y, month: m, key: `${y}-${String(m).padStart(2, '0')}` });
  }
  return out;
}

module.exports = { nextTwelveMonths };
