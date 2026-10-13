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
