import { cellKey, type JobState, type JobStatus, type ListingState } from "./types";

export const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// A listing is "recent on market" when it has at most this many reviews.
// A listing with no reviews at all is brand-new, so it also counts as recent.
export const RECENT_MAX_REVIEWS = 15;

export function isRecentOnMarket(reviewsCount: number | null): boolean {
  if (reviewsCount === null) return true; // no reviews yet = brand-new
  return reviewsCount <= RECENT_MAX_REVIEWS;
}

export type SummaryRow = {
  url: string;
  title: string;
  reviewsCount: number | null;
  reviewsScore: number | null;
  recent: boolean;
  // 12 slots, Jan..Dec; null = not scraped / no price for that month.
  adrByMonth: (number | null)[];
  // true where the user manually hid that month's ADR.
  excludedByMonth: boolean[];
  // per-listing average over included (non-hidden) months only.
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
function roundMean(vals: number[]): number | null {
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

export function buildSummary(job: JobState): {
  rows: SummaryRow[];
  monthAverages: (number | null)[];
  overallAvg: number | null;
  avgReviewsScore: number | null;
  recentYes: number;
  recentNo: number;
} {
  const rows: SummaryRow[] = job.urls.map((url) => {
    const ls = job.listings[url];
    const adrByMonth = adrByCalendarMonth(ls);
    const excludedByMonth = adrByMonth.map((_, i) => job.excluded.has(cellKey(url, i)));
    // Per-listing average counts only months that have a value AND aren't hidden.
    const included = adrByMonth.filter(
      (v, i): v is number => v !== null && !excludedByMonth[i]
    );
    const reviewsCount = ls?.meta?.reviewsCount ?? null;
    return {
      url,
      title: listingTitle(url, ls),
      reviewsCount,
      reviewsScore: ls?.meta?.reviewsScore ?? null,
      recent: isRecentOnMarket(reviewsCount),
      adrByMonth,
      excludedByMonth,
      avgAdr: roundMean(included),
    };
  });

  const monthAverages: (number | null)[] = Array.from({ length: 12 }, (_, i) => {
    const vals = rows
      .filter((r) => !r.excludedByMonth[i])
      .map((r) => r.adrByMonth[i])
      .filter((v): v is number => v !== null);
    return roundMean(vals);
  });

  const overallAvg = roundMean(
    rows.map((r) => r.avgAdr).filter((v): v is number => v !== null)
  );

  const avgReviewsScore = roundMean(
    rows.map((r) => r.reviewsScore).filter((v): v is number => v !== null)
  );

  const recentYes = rows.filter((r) => r.recent).length;
  const recentNo = rows.length - recentYes;

  return { rows, monthAverages, overallAvg, avgReviewsScore, recentYes, recentNo };
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
    excluded: new Set<string>(),
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
