// Read the declared listing count from a host profile page's body text:
// "View all 48 listings" / "N listings" / "listings (N)" / PT "N anúncios".
// Shared by the full profile scraper and the lightweight tracker check.
async function readDeclaredCount(page) {
  return page
    .evaluate(() => {
      const body = document.body?.innerText || '';
      const cm =
        body.match(/(?:view|show) all (\d+) listings?/i) ||
        body.match(/(\d+)\s+listings?\b/i) ||
        body.match(/listings?\s*\((\d+)\)/i) ||
        body.match(/(\d+)\s+an[uú]ncios?\b/i);
      return cm ? parseInt(cm[1], 10) : null;
    })
    .catch(() => null);
}

module.exports = { readDeclaredCount };
