export type JobStatus =
  | "queued"
  | "running"
  | "done"
  | "error"
  | "cancelled"
  | "interrupted";

export type ListingStatus =
  | "queued"
  | "running"
  | "done"
  | "cached"
  | "error"
  | "cancelled";

export type MonthResult = {
  month: string;
  adr: number | null;
  samples: number;
  notes: string;
};

export type ListingMeta = {
  title: string | null;
  reviewsCount: number | null;
  reviewsScore: number | null;
};

export type ListingState = {
  url: string;
  status: ListingStatus;
  currentMonth?: string;
  monthsDone: number;
  months: MonthResult[];
  meta?: ListingMeta;
  error?: string;
};

export type JobState = {
  id: string;
  status: JobStatus;
  createdAt: number;
  startedAt?: number | null;
  finishedAt?: number | null;
  urls: string[];
  listings: Record<string, ListingState>;
  name: string;
  location: string;
  // Manually hidden ADR cells, keyed "url|monthIndex" (monthIndex 0..11,
  // Jan..Dec). Excluded cells are greyed and dropped from all averages.
  excluded: Set<string>;
};

export function cellKey(url: string, monthIndex: number): string {
  return `${url}|${monthIndex}`;
}
