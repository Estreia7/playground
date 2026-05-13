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

export type ListingState = {
  url: string;
  status: ListingStatus;
  currentMonth?: string;
  monthsDone: number;
  months: MonthResult[];
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
};
