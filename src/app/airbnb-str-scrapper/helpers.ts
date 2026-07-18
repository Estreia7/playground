import type { JobState, JobStatus, ListingState } from "./types";

export const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export type SummaryRow = {
  url: string;
  title: string;
  reviewsCount: number | null;
  reviewsScore: number | null;
  // 12 slots, Jan..Dec; null = not scraped / no price for that month.
  adrByMonth: (number | null)[];
  avgAdr: number | null;
};

// Map a listing's scraped months (keyed "YYYY-MM") onto a fixed Jan..Dec
// calendar. Within a rolling 12-month window each calendar month appears at
// most once, so this is a clean 1:1 placement.
function adrByCalendarMonth(ls: ListingState | undefined): (number | null)[] {
  const slots: (number | null)[] = Array(12).fill(null);
  for (const m of ls?.months ?? []) {
    const mm = parseInt(m.month.slice(5, 7), 10);
    if (mm >= 1 && mm <= 12) slots[mm - 1] = m.adr;
  }
  return slots;
}

function listingTitle(url: string, ls: ListingState | undefined): string {
  const t = ls?.meta?.title?.trim();
  if (t) return t;
  return shortUrl(url);
}

// Build the summary matrix for a job: one row per listing (Jan..Dec ADR +
// per-listing average) plus a trailing per-month average across all listings.
export function buildSummary(job: JobState): {
  rows: SummaryRow[];
  monthAverages: (number | null)[];
  overallAvg: number | null;
} {
  const rows: SummaryRow[] = job.urls.map((url) => {
    const ls = job.listings[url];
    const adrByMonth = adrByCalendarMonth(ls);
    const present = adrByMonth.filter((v): v is number => v !== null);
    const avgAdr = present.length
      ? Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 100) / 100
      : null;
    return {
      url,
      title: listingTitle(url, ls),
      reviewsCount: ls?.meta?.reviewsCount ?? null,
      reviewsScore: ls?.meta?.reviewsScore ?? null,
      adrByMonth,
      avgAdr,
    };
  });

  const monthAverages: (number | null)[] = Array.from({ length: 12 }, (_, i) => {
    const vals = rows.map((r) => r.adrByMonth[i]).filter((v): v is number => v !== null);
    return vals.length
      ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100
      : null;
  });

  const allAvgs = rows.map((r) => r.avgAdr).filter((v): v is number => v !== null);
  const overallAvg = allAvgs.length
    ? Math.round((allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length) * 100) / 100
    : null;

  return { rows, monthAverages, overallAvg };
}

export const API_BASE = "/api/airbnb";
export const AIRBNB_URL_RE = /^https?:\/\/(www\.)?airbnb\.[a-z.]+\/rooms\/\d+/i;
export const MAX_URLS = 35;

export function emptyJob(j: {
  id: string;
  status: JobStatus;
  createdAt: number;
  urls: string[];
  name?: string;
  location?: string;
}): JobState {
  const listings: Record<string, ListingState> = {};
  for (const u of j.urls) {
    listings[u] = { url: u, status: "queued", monthsDone: 0, months: [] };
  }
  return {
    ...j,
    name: j.name ?? "",
    location: j.location ?? "",
    listings,
  };
}

export function statusColor(s: JobStatus | ListingState["status"]): string {
  switch (s) {
    case "running":
      return "bg-orange-600/20 text-orange-400 border-orange-600/30";
    case "done":
      return "bg-emerald-600/20 text-emerald-400 border-emerald-600/30";
    case "cached":
      return "bg-sky-600/20 text-sky-400 border-sky-600/30";
    case "error":
      return "bg-red-600/20 text-red-400 border-red-600/30";
    case "cancelled":
      return "bg-zinc-600/20 text-zinc-400 border-zinc-600/30";
    case "interrupted":
      return "bg-amber-600/20 text-amber-400 border-amber-600/30";
    default:
      return "bg-zinc-800 text-zinc-400 border-zinc-700";
  }
}

export function shortId(id: string) {
  return id.slice(0, 6);
}

export function fmtTime(unixSec: number) {
  const ms = unixSec * 1000;
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString();
}

export function shortUrl(u: string) {
  const m = u.match(/\/rooms\/(\d+)/);
  return m ? `rooms/${m[1]}` : u;
}
