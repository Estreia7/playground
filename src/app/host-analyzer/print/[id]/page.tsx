// Print-optimized host analysis, rendered server-side and consumed by the
// backend PDF endpoint (Playwright waits for #print-ready). Static, light,
// A4-friendly: no motion, no Leaflet — the operating area is an inline SVG.
//
// Design goals: a clean cover band, a scannable KPI strip, and a listings
// table where each row carries two compact icon links — one to the Airbnb
// listing, one to the RNT "consulta AL" registry page — instead of long
// inline URLs and text.

import {
  INSURANCE_LABEL,
  NIF_KIND_LABEL,
  cityFromLocationText,
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
const RNT_BASE = "https://rnt.turismodeportugal.pt/RNT/RNAL.aspx?nr=";

// Print palette — muted, ink-forward, one accent per role.
const C = {
  ink: "#1a2422",
  sub: "#6b7f7c",
  faint: "#9aa8a5",
  line: "#e2e8e6",
  panel: "#f6f8f7",
  ok: "#0e9f84",
  warn: "#c07d10",
  alert: "#d4432f",
  accent: "#0e9f84",
};

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

// --- Inline icons (currentColor, sized by font-size context) -----------------

function IconAirbnb({ size = 12 }: { size?: number }) {
  // A house/pin mark for "open the listing".
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.5 2 6.2V14h4v-3.5a2 2 0 0 1 4 0V14h4V6.2L8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconRegistry({ size = 12 }: { size?: number }) {
  // A document/seal mark for "consult the AL registry".
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 1.7h5.2L12.3 5v9.3H4V1.7Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M9 1.9V5h3.1M6 8.3h4M6 10.6h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function LinkChip({
  href,
  color,
  children,
  title,
}: {
  href: string;
  color: string;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <a
      href={href}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 20,
        height: 20,
        borderRadius: 6,
        border: `1px solid ${color}55`,
        color,
        textDecoration: "none",
        background: `${color}12`,
      }}
    >
      {children}
    </a>
  );
}

function InsurancePill({ status }: { status: string }) {
  const cfg =
    status === "valid"
      ? { c: C.ok, label: "Insured" }
      : status === "expired"
        ? { c: C.warn, label: "Expired" }
        : status === "none"
          ? { c: C.alert, label: "No cover" }
          : status === "unlicensed"
            ? { c: C.faint, label: "Exempt" }
            : { c: C.faint, label: "Pending" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 7px",
        borderRadius: 999,
        fontSize: 9,
        fontWeight: 600,
        color: cfg.c,
        border: `1px solid ${cfg.c}55`,
        background: `${cfg.c}12`,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
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
    ok: C.ok,
    warn: C.warn,
    alert: C.alert,
    muted: C.faint,
  };
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", borderRadius: 10, border: `1px solid ${C.line}`, background: C.panel }}
    >
      {area && (
        <circle
          cx={x(area.centroid.lng)}
          cy={y(area.centroid.lat)}
          r={Math.min(W, H) / 2.4}
          fill="rgba(14,159,132,0.05)"
          stroke={C.accent}
          strokeDasharray="5 5"
          strokeWidth={1}
        />
      )}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(p.lng)} cy={y(p.lat)} r={5} fill={toneColor[p.tone] || C.faint} />
          <text x={x(p.lng) + 8} y={y(p.lat) + 3} fontSize={8} fill={C.sub}>
            {p.label.slice(0, 26)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function SectionTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
      <h2
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: C.ink,
          margin: 0,
        }}
      >
        {children}
      </h2>
      <span style={{ height: 1, flex: 1, background: C.line }} />
      {note && <span style={{ fontSize: 9, color: C.faint }}>{note}</span>}
    </div>
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
      <div id="print-ready" style={{ minHeight: "100dvh", background: "#fff", padding: 40, color: C.ink }}>
        Dossier not found.
      </div>
    );
  }

  const { detail, funnel } = data;
  const licenses = detail.licenses;
  const mine = funnel.find((f) => f.jobId === id);
  const vuln = mine ? computeVulnerability(mine, funnel) : null;

  // Active listings only (removed ones stay out of the printed dossier).
  const active = detail.listings.filter((l) => !l.removed);

  const points = active
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
  const owners = new Map<
    string,
    { name: string | null; nif: string; email: string | null; n: number }
  >();
  for (const l of active) {
    const lic = l.alNumber ? licenses[l.alNumber] : undefined;
    const o = lic?.rnt.status === "found" ? lic.rnt.owners?.[0] : null;
    if (o?.nif) {
      const g = owners.get(o.nif) || { name: o.name, nif: o.nif, email: o.email, n: 0 };
      g.n += 1;
      owners.set(o.nif, g);
    }
  }

  const scores = active.map((l) => l.reviewsScore).filter((v): v is number => v != null);
  const avgScore = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : "-";
  const reviews = active.map((l) => l.reviewsCount).filter((v): v is number => v != null);
  const totalReviews = reviews.length ? reviews.reduce((a, b) => a + b, 0) : "-";
  const licensed = active.filter((l) => l.alNumber).length;
  const uninsured = active.filter((l) => {
    const s = insuranceOf(l, licenses);
    return s === "none" || s === "expired";
  }).length;

  const scoreColor =
    vuln?.score == null ? C.sub : vuln.score >= 60 ? C.alert : vuln.score >= 35 ? C.warn : C.accent;

  return (
    <div
      style={{
        minHeight: "100dvh",
        width: "100%",
        background: "#fff",
        padding: "28px 30px",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: 12,
        lineHeight: 1.5,
        color: C.ink,
      }}
    >
      {/* Cover band */}
      <header
        style={{
          display: "flex",
          alignItems: "stretch",
          justifyContent: "space-between",
          gap: 20,
          padding: "16px 18px",
          borderRadius: 14,
          background: `linear-gradient(135deg, ${C.panel}, #fff)`,
          border: `1px solid ${C.line}`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: C.accent,
            }}
          >
            Host Analyzer · Acquisition dossier
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em" }}>
            {detail.host?.hostName || detail.job.name}
          </h1>
          <div style={{ marginTop: 3, fontSize: 10.5, color: C.sub }}>
            {detail.host?.hostUrl && (
              <a href={detail.host.hostUrl} style={{ color: C.sub, textDecoration: "none" }}>
                {detail.host.hostUrl.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
            )}
            {" · generated "}
            {new Date().toISOString().slice(0, 10)}
          </div>
        </div>
        {vuln?.score != null && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 110,
              paddingLeft: 18,
              borderLeft: `1px solid ${C.line}`,
            }}
          >
            <div style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: C.faint }}>
              Approach
            </div>
            <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1, color: scoreColor, fontVariantNumeric: "tabular-nums" }}>
              {vuln.score}
            </div>
            <div style={{ fontSize: 10, color: C.faint }}>out of 100</div>
          </div>
        )}
      </header>

      {/* KPI strip */}
      <section style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
        {(
          [
            ["Listings", String(active.length)],
            ["Licensed", String(licensed)],
            ["No AL (exempt)", String(active.length - licensed)],
            ["Uninsured", String(uninsured)],
            ["Avg score", String(avgScore)],
            ["Radius", area ? `${area.radiusKm} km` : "-"],
          ] as const
        ).map(([label, value], i) => (
          <div
            key={label}
            style={{
              padding: "8px 4px",
              borderRadius: 10,
              border: `1px solid ${C.line}`,
              textAlign: "center",
              background: i === 3 && uninsured > 0 ? `${C.alert}0d` : "#fff",
            }}
          >
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                color: i === 3 && uninsured > 0 ? C.alert : C.ink,
              }}
            >
              {value}
            </div>
            <div style={{ fontSize: 8.5, letterSpacing: "0.05em", textTransform: "uppercase", color: C.sub }}>
              {label}
            </div>
          </div>
        ))}
      </section>

      {/* Listings table */}
      <section style={{ marginTop: 18 }}>
        <SectionTitle note={`${active.length} propert${active.length === 1 ? "y" : "ies"}`}>
          Listings
        </SectionTitle>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
          <thead>
            <tr style={{ textAlign: "left", color: C.faint, fontSize: 8.5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              <th style={{ padding: "0 6px 6px 0", fontWeight: 600 }}>Listing</th>
              <th style={{ padding: "0 6px 6px 0", fontWeight: 600 }}>Area</th>
              <th style={{ padding: "0 6px 6px 0", fontWeight: 600, textAlign: "right" }}>Score</th>
              <th style={{ padding: "0 6px 6px 0", fontWeight: 600 }}>Type</th>
              <th style={{ padding: "0 6px 6px 0", fontWeight: 600 }}>Owner</th>
              <th style={{ padding: "0 6px 6px 0", fontWeight: 600 }}>Insurance</th>
              {hasAdr && <th style={{ padding: "0 6px 6px 0", fontWeight: 600, textAlign: "right" }}>ADR</th>}
              <th style={{ padding: "0 0 6px 0", fontWeight: 600, textAlign: "center" }}>Links</th>
            </tr>
          </thead>
          <tbody>
            {active.map((l, idx) => {
              const lic = l.alNumber ? licenses[l.alNumber] : undefined;
              const rnt = lic?.rnt.status === "found" ? lic.rnt : null;
              const ins = insuranceOf(l, licenses);
              return (
                <tr
                  key={l.url}
                  style={{
                    borderTop: `1px solid ${C.line}`,
                    background: idx % 2 ? C.panel : "#fff",
                    breakInside: "avoid",
                  }}
                >
                  <td style={{ padding: "5px 6px 5px 0", maxWidth: 168, verticalAlign: "top" }}>
                    <div
                      style={{
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 168,
                      }}
                    >
                      {l.title || l.url.replace(/^https?:\/\/(www\.)?airbnb\.[a-z.]+/, "")}
                    </div>
                    {l.alNumber && (
                      <div style={{ fontSize: 9, color: C.faint, fontVariantNumeric: "tabular-nums" }}>
                        AL {l.alNumber}
                        {l.alSource === "manual" ? " · manual" : ""}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "5px 6px 5px 0", verticalAlign: "top", color: C.sub }}>
                    {rnt?.address?.concelho || cityFromLocationText(l.locationText)}
                  </td>
                  <td
                    style={{
                      padding: "5px 6px 5px 0",
                      verticalAlign: "top",
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      color: l.reviewsScore != null && l.reviewsScore < 4.5 ? C.warn : C.ink,
                    }}
                  >
                    {l.reviewsScore != null ? l.reviewsScore.toFixed(2) : "-"}
                    <span style={{ color: C.faint, fontSize: 8.5 }}>
                      {l.reviewsCount != null ? ` (${l.reviewsCount})` : ""}
                    </span>
                  </td>
                  <td style={{ padding: "5px 6px 5px 0", verticalAlign: "top", color: C.sub }}>
                    {rnt?.modalidade || "-"}
                  </td>
                  <td
                    style={{
                      padding: "5px 6px 5px 0",
                      verticalAlign: "top",
                      maxWidth: 110,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {rnt?.owners?.[0]?.name || "-"}
                  </td>
                  <td style={{ padding: "5px 6px 5px 0", verticalAlign: "top" }}>
                    <InsurancePill status={ins} />
                  </td>
                  {hasAdr && (
                    <td
                      style={{
                        padding: "5px 6px 5px 0",
                        verticalAlign: "top",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {adrByUrl[l.url] != null ? `€${adrByUrl[l.url]!.toFixed(0)}` : "-"}
                    </td>
                  )}
                  <td style={{ padding: "5px 0", verticalAlign: "top" }}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                      <LinkChip href={l.url} color={C.accent} title="Open the Airbnb listing">
                        <IconAirbnb />
                      </LinkChip>
                      {l.alNumber && (
                        <LinkChip
                          href={`${RNT_BASE}${l.alNumber}`}
                          color={C.warn}
                          title="Consult the AL registry record (RNT)"
                        >
                          <IconRegistry />
                        </LinkChip>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ marginTop: 6, display: "flex", gap: 16, fontSize: 8.5, color: C.faint }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: C.accent }}>
              <IconAirbnb size={10} />
            </span>
            Airbnb listing
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: C.warn }}>
              <IconRegistry size={10} />
            </span>
            AL registry (RNT consulta)
          </span>
        </div>
      </section>

      {/* Operating area + owners */}
      <section style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ breakInside: "avoid" }}>
          <SectionTitle>Operating area</SectionTitle>
          {points.length > 0 ? (
            <>
              <AreaSvg points={points} />
              {area && (
                <p style={{ margin: "6px 0 0", fontSize: 9.5, color: C.faint }}>
                  ~{area.radiusKm} km radius around the portfolio centroid.
                </p>
              )}
            </>
          ) : (
            <p style={{ color: C.faint }}>No geocoded addresses.</p>
          )}
        </div>
        <div style={{ breakInside: "avoid" }}>
          <SectionTitle note={`${owners.size} owner${owners.size === 1 ? "" : "s"}`}>Owners</SectionTitle>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {Array.from(owners.values()).map((o) => (
              <li key={o.nif} style={{ borderRadius: 8, border: `1px solid ${C.line}`, padding: "6px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600 }}>{o.name || "Unnamed"}</span>
                  <span style={{ fontSize: 8.5, textTransform: "uppercase", color: C.faint }}>
                    {NIF_KIND_LABEL[nifKind(o.nif)]}
                  </span>
                </div>
                <div style={{ fontSize: 9.5, color: C.sub }}>
                  NIF {o.nif} · {o.n} listing{o.n === 1 ? "" : "s"}
                  {o.email ? ` · ${o.email}` : ""}
                </div>
              </li>
            ))}
            {owners.size === 0 && <li style={{ color: C.faint }}>No registry owners found.</li>}
          </ul>

          {vuln && (
            <>
              <div style={{ marginTop: 14 }}>
                <SectionTitle>Score breakdown</SectionTitle>
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                {vuln.components.map((c) => {
                  const pct = c.value == null ? 0 : Math.round(c.value * 100);
                  return (
                    <li key={c.key} style={{ fontSize: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span>{c.label}</span>
                        <span style={{ color: C.faint, fontVariantNumeric: "tabular-nums" }}>
                          {c.value === null ? "n/a" : c.detail}
                        </span>
                      </div>
                      <div style={{ height: 3, borderRadius: 999, background: C.line, overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            background: pct >= 60 ? C.alert : pct >= 35 ? C.warn : C.accent,
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </section>

      {/* Licensing timeline */}
      <section style={{ marginTop: 18, breakInside: "avoid" }}>
        <SectionTitle>Licensing timeline</SectionTitle>
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            columnGap: 24,
            rowGap: 3,
            fontSize: 10,
          }}
        >
          {active.map((l) => {
            const lic = l.alNumber ? licenses[l.alNumber] : undefined;
            const rnt = lic?.rnt.status === "found" ? lic.rnt : null;
            if (!rnt?.registeredAt) return null;
            const age = licenseAgeYears(rnt.registeredAt);
            const isNew = age !== null && age < 1;
            return (
              <li key={l.url} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span
                  style={{
                    maxWidth: 200,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {l.title || l.url}
                </span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: isNew ? C.warn : C.sub }}>
                  {rnt.registeredAt}
                  {isNew ? " · new" : ""}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <footer
        id="print-ready"
        style={{ marginTop: 22, borderTop: `1px solid ${C.line}`, paddingTop: 10, fontSize: 8.5, color: C.faint }}
      >
        Sources: Airbnb public listings, RNT (Turismo de Portugal) public registry, OpenStreetMap
        geocoding. Generated by Host Analyzer.
      </footer>
    </div>
  );
}
