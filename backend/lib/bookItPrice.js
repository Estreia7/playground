// Read the price out of Airbnb's booking section — the BOOK_IT_SIDEBAR block of
// the StaysPdpSections response a listing page loads for a given stay.
//
// Why the data and not the page text: the widget's first "€X total" is not
// always the price we want. When a listing offers two rates, the headline is
// the discounted non-refundable one, and the refundable price sits further
// down as "Refundable · €X total". The old reader took the headline, so on
// those listings every stored rate was a non-refundable one. The data carries
// both, labelled, and says outright when a stay cannot be booked.
//
// The rule, per the product decision: always the refundable rate. When there
// is only one rate, it is the listing's standard refundable price, so it is
// taken as is.
//
// Pure: takes parsed JSON, returns a result. Tested with real responses in
// test/fixtures/airbnb-bookit-*.json.

/** "€1,234.56", "€ 555", "1.234,56 €" → a number, or null. */
function parseMoney(text) {
  if (typeof text !== 'string') return null;
  const m = text.match(/[\d][\d.,\s ]*/);
  if (!m) return null;
  const raw = m[0].replace(/[\s ]/g, '');
  let normalised = raw;
  if (raw.includes(',') && raw.includes('.')) {
    // Whichever separator comes last is the decimal one.
    normalised =
      raw.lastIndexOf(',') > raw.lastIndexOf('.') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  } else if (raw.includes(',')) {
    const tail = raw.split(',').pop();
    normalised = tail.length === 2 ? raw.replace(',', '.') : raw.replace(/,/g, '');
  } else if (raw.includes('.')) {
    // "1.234" is a thousands separator; "81.75" is a decimal. Three digits
    // after the last dot means thousands — no currency has three decimals.
    const tail = raw.split('.').pop();
    if (tail.length === 3) normalised = raw.replace(/\./g, '');
  }
  const n = parseFloat(normalised.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Find the booking section in a whole StaysPdpSections response. */
function findBookIt(response) {
  const sections = response?.data?.presentation?.stayProductDetailPage?.sections?.sections;
  if (!Array.isArray(sections)) return null;
  const preferred = ['BOOK_IT_SIDEBAR', 'BOOK_IT_MOBILE', 'BOOK_IT_FLOATING_FOOTER'];
  for (const id of preferred) {
    const s = sections.find((x) => x?.sectionId === id && x.section);
    if (s) return s.section;
  }
  const any = sections.find((x) => x?.section?.__typename === 'BookItSection');
  return any ? any.section : null;
}

function explanationLines(section) {
  const data = section?.productItemDetail?.explanationData || section?.structuredDisplayPrice?.explanationData;
  const out = [];
  for (const group of data?.priceDetails || []) {
    for (const item of group?.items || []) {
      if (item && typeof item.description === 'string') out.push({ label: item.description, amount: item.priceString });
    }
  }
  return out;
}

/** "7 nights x €79.29" → 7. Airbnb writes the stay's length in the first line
    of the breakdown; it is how we know the price is for the dates we asked for
    and not for dates Airbnb nudged us to. */
function nightsFromBreakdown(lines) {
  for (const l of lines) {
    const m = l.label.match(/(\d+)\s+nights?\b/i);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

/** Which of several rate options is the refundable one?

    By title first ("Refundable"; "Reembolsável" and friends if the locale ever
    changes). If no title matches, the dearest option: Airbnb's non-refundable
    rate is always offered as a discount on the refundable one, so the higher
    price is the refundable one by construction. */
function pickRefundable(options) {
  const priced = options
    .map((o) => ({ o, total: parseMoney(o.priceString) }))
    .filter((x) => x.total != null);
  if (priced.length === 0) return null;

  const isNon = (t) => /\bnon[\s-]?refundable\b|\bnão\s+reembols|\bno\s+reembols|\bnon\s+rembours/i.test(t || '');
  const isRefundable = (t) => /refundable|reembols|rembours|erstattbar/i.test(t || '') && !isNon(t);

  const byTitle = priced.find((x) => isRefundable(x.o.title));
  if (byTitle) return { total: byTitle.total, title: byTitle.o.title, how: 'title' };

  const dearest = priced.reduce((a, b) => (b.total > a.total ? b : a));
  return { total: dearest.total, title: dearest.o.title || null, how: 'highest' };
}

/**
 * @returns one of
 *   { ok: true,  total, nights, rate: 'refundable' | 'single', options }
 *   { ok: false, reason: 'unavailable', message }   Airbnb says the stay can't be booked
 *   { ok: false, reason: 'dates-changed', nights }   priced, but not for our dates
 *   { ok: false, reason: 'no-price' }               nothing we can read
 */
function readBookItPrice(section, expectedNights) {
  if (!section) return { ok: false, reason: 'no-price' };

  if (section.available === false) {
    return { ok: false, reason: 'unavailable', message: section.localizedUnavailabilityMessage || null };
  }

  const lines = explanationLines(section);
  const nights = nightsFromBreakdown(lines);
  if (expectedNights && nights && nights !== expectedNights) {
    return { ok: false, reason: 'dates-changed', nights };
  }

  const options = section.productItemDetail?.guestOptions;
  if (Array.isArray(options) && options.length > 1) {
    const pick = pickRefundable(options);
    if (pick) {
      return {
        ok: true,
        total: pick.total,
        nights: expectedNights || nights,
        rate: 'refundable',
        options: options.length,
      };
    }
  }

  // One rate: the breakdown's "Total" row is exact to the cent; the headline
  // ("€555 total") is rounded, so it is the last resort.
  const totalRow = lines.find((l) => /^total\b/i.test(l.label.trim()));
  const total =
    parseMoney(totalRow?.amount) ??
    (Array.isArray(options) && options.length === 1 ? parseMoney(options[0].priceString) : null) ??
    parseMoney(section.structuredDisplayPrice?.primaryLine?.price);

  if (total == null) return { ok: false, reason: 'no-price' };
  return { ok: true, total, nights: expectedNights || nights, rate: 'single', options: 1 };
}

module.exports = { readBookItPrice, findBookIt, parseMoney, pickRefundable, nightsFromBreakdown };
