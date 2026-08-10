import type {
  FunnelHost,
  HostJobState,
  HostListing,
  InsuranceStatus,
  JobStatus,
  License,
  VulnerabilityResult,
} from "./types";

export const API_BASE = "/api/airbnb";
export const PROFILE_URL_RE =
  /^https?:\/\/(www\.)?airbnb\.[a-z.]+\/users\/(profile|show)\/\d+/i;

export function mediaUrl(relPath: string): string {
  return `${API_BASE}/media/${relPath}`;
}

export function shortRoomUrl(u: string): string {
  const m = u.match(/\/rooms\/(\d+)/);
  return m ? `rooms/${m[1]}` : u;
}

export function fmtTime(unixSec: number): string {
  const ms = unixSec * 1000;
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString();
}

export function statusTone(s: JobStatus | string): string {
  switch (s) {
    case "running":
      return "text-[var(--verdi)] border-[var(--verdi)]/40 bg-[var(--verdi-dim)]";
    case "done":
      return "text-[var(--foam)] border-[var(--tide)] bg-[var(--harbor-raised)]";
    case "error":
    case "interrupted":
      return "text-[var(--coral)] border-[var(--coral)]/40 bg-[var(--coral-dim)]";
    case "cancelled":
      return "text-[var(--mist)] border-[var(--tide)] bg-transparent";
    default:
      return "text-[var(--mist)] border-[var(--tide)] bg-transparent";
  }
}

// --- RNT-derived helpers -----------------------------------------------------

export function insuranceOf(
  listing: HostListing,
  licenses: Record<string, License>
): InsuranceStatus | "unknown" | "unlicensed" {
  if (!listing.alNumber) {
    // Only call it unlicensed once the listing was actually scraped —
    // queued/running rows just haven't been read yet.
    return listing.status === "done" ? "unlicensed" : "unknown";
  }
  const lic = licenses[listing.alNumber];
  if (!lic || lic.rnt.status !== "found") return "unknown";
  return lic.rnt.insurance?.status ?? "none";
}

export const INSURANCE_LABEL: Record<string, string> = {
  valid: "Insured",
  expired: "Insurance expired",
  none: "No insurance",
  unknown: "Registry pending",
  // Listings without an AL are usually legally exempt — neutral info, not risk.
  unlicensed: "No AL — likely exempt",
};

// NIF first digit → entity kind (Portuguese fiscal numbers).
export function nifKind(nif: string | null): "individual" | "company" | "public" | "other" {
  if (!nif) return "other";
  const d = String(nif).trim()[0];
  if (d === "1" || d === "2" || d === "3") return "individual";
  if (d === "5") return "company";
  if (d === "6") return "public";
  return "other";
}

export const NIF_KIND_LABEL: Record<string, string> = {
  individual: "Individual",
  company: "Company",
  public: "Public entity",
  other: "Other",
};

// License age: "new to market" when registered less than a year ago.
export function licenseAgeYears(registeredAt: string | null | undefined): number | null {
  if (!registeredAt) return null;
  const t = Date.parse(registeredAt);
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / (365.25 * 86400 * 1000);
}

// --- Geometry for the operating-area map ------------------------------------

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function operatingArea(points: Array<{ lat: number; lng: number }>) {
  if (points.length === 0) return null;
  const centroid = {
    lat: points.reduce((a, p) => a + p.lat, 0) / points.length,
    lng: points.reduce((a, p) => a + p.lng, 0) / points.length,
  };
  const radiusKm = Math.max(...points.map((p) => haversineKm(centroid, p)), 0.5);
  return { centroid, radiusKm: Math.round(radiusKm * 10) / 10 };
}

// --- ADR aggregation ---------------------------------------------------------

export type AdrSegmentRow = {
  key: string;
  listings: number;
  avgAdr: number | null;
  avgScore: number | null;
};

function mean(vals: number[]): number | null {
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

export function adrPerListing(job: HostJobState): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const adr of Object.values(job.adrJobs)) {
    for (const [url, l] of Object.entries(adr.listings)) {
      const vals = l.result.map((m) => m.adr).filter((v): v is number => v !== null);
      out[url] = mean(vals);
    }
  }
  return out;
}

export function segmentAdr(
  job: HostJobState,
  keyOf: (listing: HostListing, lic: License | undefined) => string | null
): AdrSegmentRow[] {
  const adrByUrl = adrPerListing(job);
  const groups = new Map<string, { adr: number[]; score: number[]; n: number }>();
  for (const url of job.listingOrder) {
    const l = job.listings[url];
    if (!l) continue;
    const lic = l.alNumber ? job.licenses[l.alNumber] : undefined;
    const key = keyOf(l, lic);
    if (!key) continue;
    const g = groups.get(key) || { adr: [], score: [], n: 0 };
    g.n += 1;
    const adr = adrByUrl[url];
    if (adr != null) g.adr.push(adr);
    if (l.reviewsScore != null) g.score.push(l.reviewsScore);
    groups.set(key, g);
  }
  return Array.from(groups.entries())
    .map(([key, g]) => ({ key, listings: g.n, avgAdr: mean(g.adr), avgScore: mean(g.score) }))
    .sort((a, b) => (b.avgAdr ?? -1) - (a.avgAdr ?? -1));
}

// --- Vulnerability score -----------------------------------------------------
// Weights are the single tuning point for the acquisition funnel.

export const VULN_WEIGHTS = {
  smallPortfolio: 20,
  lowRatings: 20,
  insuranceNeglect: 20,
  shrinkingPortfolio: 15,
  underperformance: 15,
  companyNif: 10,
};

export function computeVulnerability(
  h: FunnelHost,
  allHosts: FunnelHost[]
): VulnerabilityResult {
  const components: VulnerabilityResult["components"] = [];

  // Small portfolio → easier direct approach.
  const small =
    h.listingsTotal <= 3 ? 1 : h.listingsTotal <= 6 ? 0.6 : h.listingsTotal <= 10 ? 0.3 : 0.1;
  components.push({
    key: "smallPortfolio",
    label: "Small portfolio",
    value: small,
    weight: VULN_WEIGHTS.smallPortfolio,
    detail: `${h.listingsTotal} listing${h.listingsTotal === 1 ? "" : "s"}`,
  });

  // Low guest ratings.
  let lowRatings: number | null = null;
  let ratingsDetail = "no rating data";
  if (h.avgScore != null) {
    lowRatings = Math.min(1, Math.max(0, (4.85 - h.avgScore) / 0.85));
    if (h.lowRatedShare != null) lowRatings = Math.min(1, lowRatings * 0.6 + h.lowRatedShare * 0.4);
    ratingsDetail = `avg ${h.avgScore.toFixed(2)}`;
  }
  components.push({
    key: "lowRatings",
    label: "Weak ratings",
    value: lowRatings,
    weight: VULN_WEIGHTS.lowRatings,
    detail: ratingsDetail,
  });

  // Insurance neglect among listings with a known registry record.
  const known = h.insurance.valid + h.insurance.expired + h.insurance.none;
  const neglect = known > 0 ? (h.insurance.expired + h.insurance.none) / known : null;
  components.push({
    key: "insuranceNeglect",
    label: "Insurance neglect",
    value: neglect,
    weight: VULN_WEIGHTS.insuranceNeglect,
    detail:
      known > 0
        ? `${h.insurance.none} missing, ${h.insurance.expired} expired`
        : "no registry data",
  });

  // Shrinking portfolio → a host losing listings is receptive to a
  // management offer. Relative loss over 30 days, saturating at 50% of the
  // portfolio: losing 3 of 5 → 1.0; 1 of 10 → 0.2; 3 of 300 → 0.02.
  let shrinking: number | null = null;
  let shrinkDetail = "no 30-day history";
  if (h.delta30d != null && h.count30dAgo != null) {
    const lost = Math.max(0, -h.delta30d);
    const base = Math.max(1, h.count30dAgo);
    shrinking = Math.min(1, lost / base / 0.5);
    shrinkDetail =
      lost > 0
        ? `lost ${lost} of ${h.count30dAgo} (30d)`
        : h.delta30d > 0
          ? `+${h.delta30d} listings (30d)`
          : "stable (30d)";
  }
  components.push({
    key: "shrinkingPortfolio",
    label: "Shrinking portfolio",
    value: shrinking,
    weight: VULN_WEIGHTS.shrinkingPortfolio,
    detail: shrinkDetail,
  });

  // Underperformance in a valuable area: host has ADR above the pool median
  // but ratings below 4.5 (paying guests, weak operation).
  let underperf: number | null = null;
  let underperfDetail = "run ADR analysis";
  const pool = allHosts.map((x) => x.avgAdr).filter((v): v is number => v != null);
  if (h.avgAdr != null && h.avgScore != null && pool.length > 0) {
    const sorted = [...pool].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const valuable = h.avgAdr >= median;
    const weakOps = h.avgScore < 4.5;
    underperf = valuable && weakOps ? 1 : valuable || weakOps ? 0.35 : 0;
    underperfDetail = `ADR €${h.avgAdr.toFixed(0)} vs median €${median.toFixed(0)}`;
  }
  components.push({
    key: "underperformance",
    label: "Underperforming in valuable area",
    value: underperf,
    weight: VULN_WEIGHTS.underperformance,
    detail: underperfDetail,
  });

  // Company-NIF concentration → VAT / invoicing / cashflow exposure.
  const companyShare = h.licensed > 0 ? h.companyListings / h.licensed : null;
  components.push({
    key: "companyNif",
    label: "Company-NIF exposure",
    value: companyShare,
    weight: VULN_WEIGHTS.companyNif,
    detail:
      h.licensed > 0 ? `${h.companyListings} of ${h.licensed} under company NIF` : "no NIF data",
  });

  const usable = components.filter((c) => c.value !== null);
  if (usable.length === 0) return { score: null, components };
  const totalWeight = usable.reduce((a, c) => a + c.weight, 0);
  const raw = usable.reduce((a, c) => a + (c.value as number) * c.weight, 0) / totalWeight;
  return { score: Math.round(raw * 100), components };
}
