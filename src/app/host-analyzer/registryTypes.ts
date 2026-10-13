// AL Registry (RNAL export → Airbnb listing → host) — API shapes from
// backend/routes/alRegistry.js.

export type MatchStatus = "pending" | "found" | "delisted" | "not_found" | "error";
export type FoundVia = "host_dossier" | "bing" | "google";

export type RegistryRow = {
  alNumber: string;
  name: string | null;
  registeredAt: string | null;
  modalidade: string | null;
  utentes: number | null;
  quartos: number | null;
  address: string | null;
  postalCode: string | null;
  localidade: string | null;
  freguesia: string | null;
  sourceFile: string | null;
  status: MatchStatus;
  foundVia: FoundVia | null;
  roomId: string | null;
  listingUrl: string | null;
  listingTitle: string | null;
  hostId: string | null;
  hostUrl: string | null;
  hostName: string | null;
  bingTried: boolean;
  googleTried: boolean;
  checkedAt: number | null;
  error: string | null;
  dossierJobId: string | null;
  hostJobActive: boolean;
  mismatch: boolean;
};

export type RegistrySummary = {
  total: number;
  found: number;
  delisted: number;
  notFound: number;
  pending: number;
  error: number;
  byVia: Record<FoundVia, number>;
  pendingAfterBing: number;
  hostsFound: number;
  hostsWithDossier: number;
  mismatches: number;
};

export type RegistrySource = { sourceFile: string | null; rows: number; importedAt: number };

export type RegistryJob = { id: string; type: "al-registry" | "al-google"; status: string; createdAt: number };

export type RegistryPayload = {
  rows: RegistryRow[];
  summary: RegistrySummary;
  sources: RegistrySource[];
  activeJobs: RegistryJob[];
};

export type SearchProvider = {
  name: string;
  configured: boolean;
  costPerQuery: number;
  unit: string;
  exhaustedUntil: number | null;
  lastError: string | null;
  validatedAt: number | null;
  validationError: string | null;
  remaining: number | null;
  calls: number;
  spent: number;
  lastUsedAt: number | null;
};

export type ProvidersPayload = {
  providers: SearchProvider[];
  next: { name: string; costPerQuery: number; unit: string } | null;
};

// Live progress from the "al-registry" SSE event.
export type RegistryProgress = {
  jobId: string;
  phase:
    | "dossiers"
    | "hosts"
    | "bing"
    | "bing-blocked"
    | "bing-paused"
    | "profile"
    | "listings"
    | "expand"
    | "chunk-queued"
    | "google"
    | "paused"
    | "rematched"
    | "done";
  total?: number;
  done?: number;
  al?: string;
  status?: string;
  provider?: string;
  queued?: number;
  matched?: number;
  reason?: string;
  pausedNoCredits?: boolean;
  bingBlocked?: boolean;
  until?: number;
};

export type ImportRow = {
  alNumber: string;
  name: string | null;
  registeredAt: string | null;
  modalidade: string | null;
  camas: string | null;
  utentes: string | null;
  quartos: string | null;
  address: string | null;
  postalCode: string | null;
  localidade: string | null;
  freguesia: string | null;
  concelho: string | null;
};

// GET /al-registry/status — cheap live pipeline + queue state (polled).
export type PipelineCounts = {
  total: number;
  found: number;
  delisted: number;
  notFound: number;
  waitingBing: number;
  waitingGoogle: number;
  missingHost: number;
  checked: number;
  pct: number;
};

export type QueueJob = {
  id: string;
  type: string;
  name: string;
  createdAt: number;
  items: number;
  position: number;
};

export type RegistryStatus = {
  counts: PipelineCounts;
  bingPausedUntil: number | null;
  bingPause: { until: number; reason: "rest" | "blocked" } | null;
  cooldownUntil: number | null;
  running: {
    id: string;
    type: string;
    name: string;
    startedAt: number | null;
    progress: (Partial<RegistryProgress> & { phase?: string; done?: number; total?: number }) | null;
  } | null;
  queuedTotal: number;
  queuedByType: Record<string, number>;
  registryQueued: QueueJob[];
  now: number;
};

// GET /al-registry/runs — one summary per registry job (the "what happened" log).
export type RunSummary = {
  id: string;
  type: "al-registry" | "al-google";
  status: string;
  name: string;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  durationS: number | null;
  hostsRead: number;
  bing: {
    searched: number;
    found: number;
    errors: number;
    canaryChecks: number;
    canaryFailed: number;
    pausedUntil: number | null;
    pauseReason: "rest" | "blocked" | null;
    blocked: { at: number; al: string; after: number; reason: string; unmarked: number; until?: number } | null;
    restUntil: number | null;
  };
  google: {
    searched: number;
    found: number;
    delisted: number;
    notFound: number;
    providers: Record<string, { searches: number; cached: number }>;
    credits: number;
    outOfCredits: boolean;
  };
  hostsQueued: number;
  continued: boolean;
};
