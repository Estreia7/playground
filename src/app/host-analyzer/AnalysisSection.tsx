"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { NIF_KIND_LABEL, insuranceOf, licenseAgeYears, nifKind } from "./helpers";
import { InsuranceBadge } from "./ListingsTable";
import type { HostJobState, RntOwner } from "./types";

type OwnerGroup = {
  owner: RntOwner;
  kind: ReturnType<typeof nifKind>;
  listings: number;
  concelhos: Set<string>;
};

export function AnalysisSection({ job }: { job: HostJobState }) {
  const analysis = useMemo(() => {
    const owners = new Map<string, OwnerGroup>();
    const insurance = { valid: 0, expired: 0, none: 0, unknown: 0, unlicensed: 0 };
    let newToMarket = 0;

    for (const url of job.listingOrder) {
      const l = job.listings[url];
      if (!l) continue;
      const ins = insuranceOf(l, job.licenses);
      insurance[ins] += 1;

      const lic = l.alNumber ? job.licenses[l.alNumber] : undefined;
      const rnt = lic?.rnt.status === "found" ? lic.rnt : null;
      const age = licenseAgeYears(rnt?.registeredAt);
      if (age !== null && age < 1) newToMarket += 1;

      const owner = rnt?.owners?.[0];
      if (owner?.nif) {
        const g = owners.get(owner.nif) || {
          owner,
          kind: nifKind(owner.nif),
          listings: 0,
          concelhos: new Set<string>(),
        };
        g.listings += 1;
        if (rnt?.address?.concelho) g.concelhos.add(rnt.address.concelho);
        owners.set(owner.nif, g);
      }
    }

    const groups = Array.from(owners.values()).sort((a, b) => b.listings - a.listings);
    const companyListings = groups
      .filter((g) => g.kind === "company")
      .reduce((a, g) => a + g.listings, 0);
    const hostIsManager =
      groups.length > 1 ||
      (groups.length === 1 && job.host?.hostName
        ? !groups[0].owner.name?.toLowerCase().includes(job.host.hostName.toLowerCase().split(" ")[0] || "")
        : false);

    return { groups, insurance, newToMarket, companyListings, hostIsManager };
  }, [job]);

  // No-AL listings are usually legally exempt — only genuine insurance gaps
  // count as a compliance signal.
  const flaggedInsurance = analysis.insurance.none + analysis.insurance.expired;

  return (
    <section className="flex flex-col gap-4">
      {/* Company-NIF / VAT exposure banner */}
      {analysis.companyListings >= 2 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="ha-panel flex items-start gap-3 border-[var(--amber)]/35 p-4"
        >
          <span className="mt-0.5 text-[var(--amber)]" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M8 2 1.8 13h12.4L8 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M8 6.4v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="8" cy="11.4" r="0.9" fill="currentColor" />
            </svg>
          </span>
          <div>
            <div className="text-sm font-semibold text-[var(--amber)]">
              VAT and cashflow exposure
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--mist)]">
              {analysis.companyListings} listings sit under company NIFs. Company-held AL
              registrations carry invoicing and VAT obligations, which adds cashflow pressure and
              makes a structured exit more attractive to the owner.
            </p>
          </div>
        </motion.div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Owner dossier cards */}
        <div className="ha-panel p-4">
          <h3 className="ha-display text-sm font-semibold">Owners</h3>
          <p className="mt-0.5 text-xs text-[var(--mist)]">
            {analysis.hostIsManager
              ? "Multiple owners behind this host. The people below are the real acquisition targets."
              : "Registry owners behind this host's licenses."}
          </p>
          {analysis.groups.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--mist)]">
              Owner identities appear once registry lookups finish.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {analysis.groups.map((g, i) => (
                <motion.li
                  key={g.owner.nif}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="rounded-[10px] border border-[var(--tide)] bg-[var(--ink-deep)]/50 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{g.owner.name || "Unnamed"}</div>
                      <div className="ha-mono mt-0.5 text-[11px] text-[var(--mist)]">
                        NIF {g.owner.nif}
                        {g.concelhos.size > 0 && ` · ${Array.from(g.concelhos).join(", ")}`}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        g.kind === "company"
                          ? "border-[var(--amber)]/40 text-[var(--amber)]"
                          : "border-[var(--tide)] text-[var(--mist)]"
                      }`}
                    >
                      {NIF_KIND_LABEL[g.kind]}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs">
                    <span className="text-[var(--mist)]">
                      {g.listings} listing{g.listings === 1 ? "" : "s"}
                    </span>
                    {g.owner.email && (
                      <a
                        href={`mailto:${g.owner.email}`}
                        className="ha-focus truncate text-[var(--verdi)] hover:underline"
                      >
                        {g.owner.email}
                      </a>
                    )}
                  </div>
                </motion.li>
              ))}
            </ul>
          )}
        </div>

        {/* Insurance + licensing summary */}
        <div className="ha-panel p-4">
          <h3 className="ha-display text-sm font-semibold">Compliance signals</h3>
          <div className="mt-3 flex flex-col gap-2.5">
            {(
              [
                ["valid", analysis.insurance.valid],
                ["expired", analysis.insurance.expired],
                ["none", analysis.insurance.none],
                ["unlicensed", analysis.insurance.unlicensed],
                ["unknown", analysis.insurance.unknown],
              ] as const
            )
              .filter(([, n]) => n > 0)
              .map(([status, n]) => (
                <div key={status} className="flex items-center justify-between">
                  <InsuranceBadge status={status} />
                  <span className="ha-mono text-sm">{n}</span>
                </div>
              ))}
          </div>
          {flaggedInsurance > 0 && (
            <p className="mt-3 border-t border-[var(--tide)] pt-3 text-xs leading-relaxed text-[var(--mist)]">
              {flaggedInsurance} listing{flaggedInsurance === 1 ? "" : "s"} with missing or expired
              cover. A host who neglects mandatory liability insurance is usually not maximizing the
              asset, which is an opening line for an approach.
            </p>
          )}
          {analysis.newToMarket > 0 && (
            <p className="mt-2 text-xs text-[var(--amber)]">
              {analysis.newToMarket} license{analysis.newToMarket === 1 ? "" : "s"} registered less
              than a year ago (new to market).
            </p>
          )}
          <p className="mt-3 text-[10px] text-[var(--mist)]/70">
            Source: RNT, Turismo de Portugal (public registry).
          </p>
        </div>
      </div>
    </section>
  );
}
