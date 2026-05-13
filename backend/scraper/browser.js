const path = require('path');
const fs = require('fs');

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];
const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

let chromiumPromise = null;
function loadChromium() {
  if (chromiumPromise) return chromiumPromise;
  chromiumPromise = (async () => {
    const { chromium } = require('playwright-extra');
    const stealth = require('puppeteer-extra-plugin-stealth')();
    chromium.use(stealth);
    return chromium;
  })();
  return chromiumPromise;
}

function profileDir(workerId) {
  const dir = path.resolve(__dirname, '..', '.profiles', `worker-${workerId}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function launchContext(workerId) {
  if (process.env.SCRAPER_STUB === '1') {
    return { context: { newPage: async () => ({ goto: async () => {}, close: async () => {} }) }, close: async () => {} };
  }

  const chromium = await loadChromium();
  const ua = UA_POOL[workerId % UA_POOL.length];
  const viewport = VIEWPORTS[workerId % VIEWPORTS.length];

  const context = await chromium.launchPersistentContext(profileDir(workerId), {
    headless: process.env.HEADLESS === 'false' ? false : 'new',
    viewport,
    userAgent: ua,
    locale: 'en-US',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
  return { context, close: () => context.close() };
}

module.exports = { launchContext };
