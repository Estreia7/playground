# Airbnb STR Scrapper — Backend

Self-contained Express + Playwright service that powers the **Airbnb STR Scrapper** card on the playground frontend.

## What it does
- Accepts batches of 1–15 Airbnb listing URLs as jobs.
- Runs **one job at a time** (FIFO). Within the running job, up to **3 Playwright workers** scrape listings in parallel.
- For each listing, walks 12 calendar months (next month → +12), identifies open gaps, samples 1–3 of them, and computes an effective nightly rate → monthly ADR.
- Streams progress to the frontend over a single global **SSE** stream with `Last-Event-ID` replay so a refresh / reconnect picks up where it left off.
- Caches per-listing results in SQLite for 7 days.

## Run

```bash
cd backend
npm install
npx playwright install chromium          # on a VPS: npx playwright install --with-deps chromium
cp .env.example .env
node index.js
```

The service listens on `127.0.0.1:4001` by default. The Next.js app rewrites `/api/airbnb/*` to it, so the browser always sees one origin.

## Environment

See `.env.example` for the full list:

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `4001` | Listen port |
| `CACHE_TTL_DAYS` | `7` | Skip Playwright if a listing was analysed within this window |
| `SCRAPER_STUB` | `1` | When `1`, the three extension-point modules return synthetic data instead of throwing `IMPLEMENT_AFTER_METHODOLOGY` |
| `TZ` | `Europe/Lisbon` | Time zone for the "next 12 months" math |
| `CURRENCY` | `EUR` | Pinned currency on Airbnb URLs so ADR is comparable |
| `WORKER_POOL_SIZE` | `3` | Max parallel browsers within a single job |
| `HEADLESS` | (unset) | Set to `false` to launch headed Chrome on a dev box |
| `DB_PATH` | `./data.sqlite` | SQLite file path (relative to this folder) |

## Methodology extension points

When the methodology guide arrives, only three files change:

- `scraper/extractGaps.js` — given a Playwright `page` already navigated to a month, return the open gaps `[{ start, end, nights }, ...]`. This is where the calendar JS from the guide goes (run via `page.evaluate(...)`).
- `scraper/extractPrice.js` — given a gap, return `{ totalPrice, currency, nights }`. Effective nightly rate = `totalPrice / nights`.
- `scraper/pickSampleGaps.js` — pure function: pick 1–3 gaps from the full list. Easy to unit-test.

All three respect the `SCRAPER_STUB` flag, so you can exercise the entire pipeline (SSE, cache, Excel export, queue, cancel, delete) end-to-end **before** the methodology lands.

## HTTP API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/jobs` | Create job from `{ urls: string[] }` (1..15). Returns `{ jobId, job }`. |
| `GET`  | `/api/jobs?limit=30` | List recent jobs (newest first). |
| `GET`  | `/api/jobs/:id` | Job detail incl. per-listing results so far. |
| `POST` | `/api/jobs/:id/cancel` | Cancel a queued or running job. |
| `DELETE` | `/api/jobs/:id` | Remove a terminal job from history. Cached `listings` rows untouched. |
| `GET`  | `/api/jobs/stream` | Global SSE feed of all job events. Honours `Last-Event-ID` for replay. |
| `GET`  | `/api/health` | `{ ok, stub, tz, poolSize }`. |

## SSE event types

- `job-created` — new job submitted.
- `job-status` — `queued` → `running` → `done` / `error` / `cancelled`.
- `listing-started` — worker picked this URL.
- `progress` — `{ url, month, status: 'fetching'|'done'|'error', adr? }`.
- `listing-done` — `{ url, status: 'done'|'cached'|'error'|'cancelled', months: [{ month, adr, samples, notes }] }`.
- `deleted` — job removed from history.

All payloads include `jobId`. Every event has a numeric `id:` (global monotonically increasing `seq`) — the SSE handler queries `job_events WHERE seq > ?` on reconnect.

## Process supervision

The root `ecosystem.config.js` runs this backend alongside the Next.js playground under PM2:

```bash
pm2 start ecosystem.config.js
pm2 status
```

## Connecting to the React frontend

The Next.js app at `../next.config.ts` adds:

```ts
async rewrites() {
  return [{ source: '/api/airbnb/:path*', destination: 'http://127.0.0.1:4001/api/:path*' }];
}
```

So the browser only ever talks to `https://playground.bruno-dev.xyz/api/airbnb/...` — same origin, no CORS, no extra Nginx config.
