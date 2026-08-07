export type JobStatus =
  | "queued"
  | "running"
  | "done"
  | "error"
  | "cancelled"
  | "interrupted";

export type HostPhase = "profile" | "listings" | "licenses" | null;

export type RntAddress = {
  tipoVia: string | null;
  via: string | null;
  porta: string | null;
  andar: string | null;
  lado: string | null;
  postalCode: string | null;
  localidade: string | null;
  freguesia: string | null;
  concelho: string | null;
  distrito: string | null;
  full: string | null;
};

export type RntOwner = {
  quality: string | null;
  nif: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type InsuranceStatus = "valid" | "expired" | "none";

export type RntInsurance = {
  status: InsuranceStatus;
  company: string | null;
  policy: string | null;
  startDate: string | null;
  validUntil: string | null;
};

export type RntRecord = {
  status: "found" | "not-found";
  alNumber: string;
  name?: string | null;
  registeredAt?: string | null;
  openedAt?: string | null;
  modalidade?: string | null;
  capacity?: { utentes: number | null; quartos: number | null; camas: number | null };
  address?: RntAddress;
  owners?: RntOwner[];
  insurance?: RntInsurance;
};

export type License = {
  alNumber: string;
  rnt: RntRecord;
  lat: number | null;
  lng: number | null;
  geocodeStatus: string;
  error?: string;
};

export type ListingStatus = "queued" | "running" | "done" | "error";

export type HostListing = {
  url: string;
  status: ListingStatus;
  title: string | null;
  locationText: string | null;
  reviewsCount: number | null;
  reviewsScore: number | null;
  alNumber: string | null;
  photos: string[];
  error?: string;
};

export type MonthResult = {
  month: string;
  adr: number | null;
  samples: number;
  notes: string;
};

export type AdrListing = {
  url: string;
  status: string;
  monthsDone: number;
  result: MonthResult[];
};

export type AdrJobInfo = {
  id: string;
  status: JobStatus;
  name: string;
  urls: string[];
  listings: Record<string, AdrListing>;
};

export type HostMeta = {
  hostId: string | null;
  hostUrl: string;
  hostName: string | null;
  listingsCount: number | null;
  adrJobIds: string[];
};

export type HostJobState = {
  id: string;
  status: JobStatus;
  createdAt: number;
  name: string;
  profileUrl: string;
  phase: HostPhase;
  host: HostMeta | null;
  listings: Record<string, HostListing>;
  listingOrder: string[];
  licenses: Record<string, License>;
  adrJobs: Record<string, AdrJobInfo>;
  truncated?: boolean;
};

// Shape returned by GET /host-funnel.
export type FunnelHost = {
  jobId: string;
  status: JobStatus;
  createdAt: number;
  name: string;
  hostName: string | null;
  hostUrl: string | null;
  listingsTotal: number;
  licensed: number;
  unlicensed: number;
  avgScore: number | null;
  lowRatedShare: number | null;
  totalReviews: number | null;
  insurance: { valid: number; expired: number; none: number; unknown: number };
  owners: Array<{ nif: string | null; name: string | null }>;
  companyListings: number;
  concelhos: string[];
  avgAdr: number | null;
};

export type VulnerabilityComponent = {
  key: string;
  label: string;
  value: number | null; // 0..1, null = no data
  weight: number;
  detail: string;
};

export type VulnerabilityResult = {
  score: number | null; // 0..100
  components: VulnerabilityComponent[];
};
