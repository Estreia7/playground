// Print-optimized host analysis, rendered server-side and consumed by the
// backend PDF endpoint (Playwright waits for #print-ready). Static, light,
// A4-friendly: no motion, no Leaflet — the operating area is an inline SVG.

import {
  INSURANCE_LABEL,
  NIF_KIND_LABEL,
  computeVulnerability,
  insuranceOf,
  licenseAgeYears,
  nifKind,
  operatingArea,
} from "../../helpers";
import type {
  FunnelHost,
  HostListing,
  HostMeta,
  JobStatus,
  License,
  MonthResult,
} from "../../types";

const BACKEND = process.env.HOST_BACKEND_URL || "http://127.0.0.1:4001";

type Detail = {
  job: { id: string; status: JobStatus; createdAt: number; urls: string[]; name: string };
  host: (HostMeta & { jobId: string }) | null;
  listings: Array<HostListing & { finishedAt: number }>;
  licenses: Record<string, License>;
  adrJobs: Array<{
    job: { id: string; status: JobStatus; name: string };
    listings: Array<{ url: string; status: string; result: MonthResult[] }>;
  }>;
};

async function getData(id: string): Promise<{ detail: Detail; funnel: FunnelHost[] } | null> {
  try {
    const [dRes, fRes] = await Promise.all([
      fetch(`${BACKEND}/api/host-jobs/${id}`, { cache: "no-store" }),
      fetch(`${BACKEND}/api/host-funnel`, { cache: "no-store" }),
    ]);
    if (!dRes.ok) return null;
    const detail = (await dRes.json()) as Detail;
    const funnel = fRes.ok ? ((await fRes.json()) as { hosts: FunnelHost[] }).hosts : [];
    return { detail, funnel };
  } catch {
    return null;
  }
}

function AreaSvg({
  points,
}: {
  points: Array<{ lat: number; lng: number; tone: string; label: string }>;
}) {
  if (points.length === 0) return null;
  const area = operatingArea(points);
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const pad = 0.02;
  const minLat = Math.min(...lats) - pad;
  const maxLat = Math.max(...lats) + pad;
  const minLng = Math.min(...lngs) - pad;
  const maxLng = Math.max(...lngs) + pad;
  const W = 640;
  const H = 300;
  const x = (lng: number) => ((lng - minLng) / (maxLng - minLng || 1)) * (W - 40) + 20;
  const y = (lat: number) => H - (((lat - minLat) / (maxLat - minLat || 1)) * (H - 40) + 20);
  const toneColor: Record<string, string> = {
    ok: "#0e9f84",
    warn: "#c07d10",
    alert: "#d4432f",
    muted: "#6b7f7c",
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg border border-neutral-200 bg-neutral-50">
      {area && (
        <circle
          cx={x(area.centroid.lng)}
          cy={y(area.centroid.lat)}
          r={Math.min(W, H) / 2.4}
          fill="rgba(14,159,132,0.05)"
          stroke="#0e9f84"
          strokeDasharray="5 5"
          strokeWidth={1}
        />
      )}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(p.lng)} cy={y(p.lat)} r={5} fill={toneColor[p.tone] || "#6b7f7c"} />
          <text x={x(p.lng) + 8} y={y(p.lat) + 3} fontSize={8} fill="#525f5d">
            {p.label.slice(0, 26)}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default async function PrintHostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getData(id);

  if (!data) {
    return (
      <div id="print-ready" className="min-h-[100dvh] bg-white p-10 text-neutral-900">
        Dossier not found.
      </div>
    );
  }

  const { detail, funnel } = data;
  const licenses = detail.licenses;
  const mine = funnel.find((f) => f.jobId === id);
  const vuln = mine ? computeVulnerability(mine, funnel) : null;

  const points = detail.listings
    .map((l) => {
      const lic = l.alNumber ? licenses[l.alNumber] : undefined;
      if (!lic || lic.lat == null || lic.lng == null) return null;
      const ins = insuranceOf(l, licenses);
      return {
        lat: lic.lat,
        lng: lic.lng,
        tone: ins === "valid" ? "ok" : ins === "expired" ? "warn" : ins === "none" ? "alert" : "muted",
        label: l.title || l.url,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
  const area = operatingArea(points);

  // ADR per listing across linked jobs.
  const adrByUrl: Record<string, number | null> = {};
  for (const a of detail.adrJobs) {
    for (const l of a.listings) {
      const vals = l.result.map((m) => m.adr).filter((v): v is number => v !== null);
      adrByUrl[l.url] = vals.length
        ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100
        : null;
    }
  }
  const hasAdr = Object.keys(adrByUrl).length > 0;

  // Owner grouping.
  const owners = new Map<string, { name: string | null; nif: string; email: string | null; n: number }>();
  for (const l of detail.listings) {
    const lic = l.alNumber ? licenses[l.alNumber] : undefined;
    const o = lic?.rnt.status === "found" ? lic.rnt.owners?.[0] : null;
    if (o?.nif) {
      const g = owners.get(o.nif) || { name: o.name, nif: o.nif, email: o.email, n: 0 };
      g.n += 1;
      owners.set(o.nif, g);
    }
  }

  const scores = detail.listings.map((l) => l.reviewsScore).filter((v): v is number => v != null);
  const avgScore = scores.length
    ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)
    : "-";
  const reviews = detail.listings.map((l) => l.reviewsCount).filter((v): v is number => v != null);
  const totalReviews = reviews.length ? reviews.reduce((a, b) => a + b, 0) : "-";
  const licensed = detail.listings.filter((l) => l.alNumber).length;

  return (
    <div className="min-h-[100dvh] w-full bg-white p-8 font-sans text-[13px] leading-relaxed text-neutral-900">
      {/* Header */}
      <header className="flex items-start justify-between border-b-2 border-neutral-900 pb-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Host Analyzer · Acquisition dossier
          </div>
          <h1 className="mt-1 text-2xl font-bold">
            {detail.host?.hostName || detail.job.name}
          </h1>
          <div className="mt-0.5 text-xs text-neutral-500">
            {detail.host?.hostUrl}
            {" · generated "}
            {new Date().toISOString().slice(0, 10)}
          </div>
        </div>
        {vuln?.score != null && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
              Approach score
            </div>
            <div className="text-4xl font-bold tabular-nums">
              {vuln.score}
              <span className="text-base font-normal text-neutral-400">/100</span>
            </div>
          </div>
        )}
      </header>

      {/* Stats */}
      <section className="mt-4 grid grid-cols-6 gap-3 text-center">
        {(
          [
            ["Listings", detail.listings.length],
            ["Licensed", licensed],
            ["Unlicensed", detail.listings.length - licensed],
            ["Reviews", totalReviews],
            ["Avg score", avgScore],
            ["Radius", area ? `${area.radiusKm} km` : "-"],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-lg border border-neutral-200 py-2">
            <div className="text-lg font-bold tabular-nums">{value}</div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
          </div>
        ))}
      </section>

      {/* Listings table */}
      <section className="mt-5">
        <h2 className="text-sm font-bold uppercase tracking-wide">Listings</h2>
        <table className="mt-2 w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-[10px] uppercase text-neutral-500">
              <th className="py-1.5 pr-2">Listing</th>
              <th className="py-1.5 pr-2">Area</th>
              <th className="py-1.5 pr-2">Score</th>
              <th className="py-1.5 pr-2">Reviews</th>
              <th className="py-1.5 pr-2">AL</th>
              <th className="py-1.5 pr-2">Type</th>
              <th className="py-1.5 pr-2">Owner</th>
              <th className="py-1.5 pr-2">Insurance</th>
              {hasAdr && <th className="py-1.5">Avg ADR</th>}
            </tr>
          </thead>
          <tbody>
            {detail.listings.map((l) => {
              const lic = l.alNumber ? licenses[l.alNumber] : undefined;
              const rnt = lic?.rnt.status === "found" ? lic.rnt : null;
              const ins = insuranceOf(l, licenses);
              const risky = ins === "none" || ins === "expired" || ins === "unlicensed";
              return (
                <tr key={l.url} className="border-b border-neutral-200 align-top">
                  <td className="max-w-[150px] truncate py-1.5 pr-2 font-medium">
                    {l.title || l.url}
                  </td>
                  <td className="py-1.5 pr-2">{rnt?.address?.concelho || l.locationText || "-"}</td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {l.reviewsScore != null ? l.reviewsScore.toFixed(2) : "-"}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">{l.reviewsCount ?? "-"}</td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {l.alNumber ? `${l.alNumber}/AL` : "none"}
                  </td>
                  <td className="py-1.5 pr-2">{rnt?.modalidade || "-"}</td>
                  <td className="max-w-[120px] truncate py-1.5 pr-2">
                    {rnt?.owners?.[0]?.name || "-"}
                  </td>
                  <td className={`py-1.5 pr-2 ${risky ? "font-semibold text-red-700" : ""}`}>
                    {risky ? "⚠ " : ""}
                    {INSURANCE_LABEL[ins]}
                  </td>
                  {hasAdr && (
                    <td className="py-1.5 tabular-nums">
                      {adrByUrl[l.url] != null ? `€${adrByUrl[l.url]!.toFixed(0)}` : "-"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Operating area + owners */}
      <section className="mt-5 grid grid-cols-2 gap-5">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide">Operating area</h2>
          <div className="mt-2">
            {points.length > 0 ? (
              <>
                <AreaSvg points={points} />
                {area && (
                  <p className="mt-1 text-[11px] text-neutral-500">
                    ~{area.radiusKm} km radius around the portfolio centroid.
                  </p>
                )}
              </>
            ) : (
              <p className="text-neutral-500">No geocoded addresses.</p>
            )}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide">Owners</h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {Array.from(owners.values()).map((o) => (
              <li key={o.nif} className="rounded-lg border border-neutral-200 px-3 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{o.name || "Unnamed"}</span>
                  <span className="text-[10px] uppercase text-neutral-500">
                    {NIF_KIND_LABEL[nifKind(o.nif)]}
                  </span>
                </div>
                <div className="text-[11px] text-neutral-500">
                  NIF {o.nif} · {o.n} listing{o.n === 1 ? "" : "s"}
                  {o.email ? ` · ${o.email}` : ""}
                </div>
              </li>
            ))}
            {owners.size === 0 && <li className="text-neutral-500">No registry owners found.</li>}
          </ul>

          {vuln && (
            <>
              <h2 className="mt-4 text-sm font-bold uppercase tracking-wide">Score breakdown</h2>
              <ul className="mt-2 flex flex-col gap-1 text-[11px]">
                {vuln.components.map((c) => (
                  <li key={c.key} className="flex items-center justify-between">
                    <span>{c.label}</span>
                    <span className="tabular-nums text-neutral-500">
                      {c.value === null ? "n/a" : c.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      {/* License age flags */}
      <section className="mt-5">
        <h2 className="text-sm font-bold uppercase tracking-wide">Licensing timeline</h2>
        <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
          {detail.listings.map((l) => {
            const lic = l.alNumber ? licenses[l.alNumber] : undefined;
            const rnt = lic?.rnt.status === "found" ? lic.rnt : null;
            if (!rnt?.registeredAt) return null;
            const age = licenseAgeYears(rnt.registeredAt);
            return (
              <li key={l.url} className="flex items-center justify-between">
                <span className="max-w-[220px] truncate">{l.title || l.url}</span>
                <span className="tabular-nums text-neutral-500">
                  {rnt.registeredAt}
                  {age !== null && age < 1 ? " · new to market" : ""}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <footer
        id="print-ready"
        className="mt-6 border-t border-neutral-300 pt-3 text-[10px] text-neutral-400"
      >
        Sources: Airbnb public listings, RNT (Turismo de Portugal) public registry, OpenStreetMap
        geocoding. Generated by Host Analyzer.
      </footer>
    </div>
  );
}
