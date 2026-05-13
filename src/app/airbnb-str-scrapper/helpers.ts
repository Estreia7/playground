import type { JobState, JobStatus, ListingState } from "./types";

export const API_BASE = "/api/airbnb";
export const AIRBNB_URL_RE = /^https?:\/\/(www\.)?airbnb\.[a-z.]+\/rooms\/\d+/i;
export const MAX_URLS = 15;

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
