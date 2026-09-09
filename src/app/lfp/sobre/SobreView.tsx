"use client";

import Link from "next/link";
import { shortDate } from "../format";
import { tr } from "../i18n";
import { PageIntro, Shell } from "../ui/Shell";
import { useLfpData } from "../useLfpData";
import { useLfpEcon } from "../useLfpEcon";
import { useLfpLang } from "../useLfpLang";

const REPO_URL = "https://github.com/Estreia7/playground";

interface Row {
  id: string;
  year: number;
  verified: string;
  version: number | null;
  unverified: boolean;
  source: string;
}

export default function SobreView() {
  const { t, lang } = useLfpLang();
  const s = t.admin.sobre;
  const tax = useLfpData();
  const econ = useLfpEcon();

  const rows: Row[] = [
    ...(tax.meta?.datasets ?? []).map((d) => ({
      id: d.id.toUpperCase(),
      year: d.year,
      verified: shortDate(d.lastVerified, lang),
      version: d.version,
      unverified: d.unverified,
      source: d.source,
    })),
    ...(econ.meta?.datasets ?? []).map((d) => ({
      id: d.id,
      year: d.year,
      verified: tr(s.datasets.retrieved, { date: shortDate(d.retrievedAt.slice(0, 10), lang) }),
      version: null,
      unverified: false,
      source: d.source,
    })),
  ];

  const h2 = "lfp-display text-2xl font-semibold";
  const prose = "mt-3 max-w-2xl leading-relaxed";

  return (
    <Shell crumbs={[{ label: s.crumb }]}>
      <PageIntro eyebrow={s.eyebrow} title={s.title} lede={s.lede} />

      <div className="space-y-14">
        <section>
          <h2 className={h2}>{s.method.title}</h2>
          {s.method.body.map((p) => (
            <p key={p} className={prose}>
              {p}
            </p>
          ))}
        </section>

        <section>
          <h2 className={h2}>{s.datasets.title}</h2>
          <p className={`${prose} text-[var(--lfp-mist)]`}>{s.datasets.body}</p>
          <div className="lfp-panel mt-5 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--lfp-line)] text-left">
                  <th scope="col" className="lfp-eyebrow px-4 py-3 font-medium">{s.datasets.cols.dataset}</th>
                  <th scope="col" className="lfp-eyebrow px-4 py-3 font-medium">{s.datasets.cols.year}</th>
                  <th scope="col" className="lfp-eyebrow px-4 py-3 font-medium">{s.datasets.cols.verified}</th>
                  <th scope="col" className="lfp-eyebrow px-4 py-3 font-medium">{s.datasets.cols.version}</th>
                  <th scope="col" className="lfp-eyebrow px-4 py-3 font-medium">{s.datasets.cols.source}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--lfp-line)] last:border-b-0">
                    <th scope="row" className="px-4 py-3 text-left font-medium">
                      {r.id}
                      {r.unverified && (
                        <span className="ml-2 rounded border border-[var(--lfp-ouro)] px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide text-[var(--lfp-ouro)]">
                          {s.datasets.unverified}
                        </span>
                      )}
                    </th>
                    <td className="lfp-num px-4 py-3">{r.year}</td>
                    <td className="lfp-num px-4 py-3">{r.verified}</td>
                    <td className="lfp-num px-4 py-3">{r.version ?? "—"}</td>
                    <td className="px-4 py-3">
                      <a
                        href={r.source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="lfp-focus inline-flex min-h-11 max-w-[22rem] items-center truncate text-[var(--lfp-cobalt)] underline underline-offset-2"
                      >
                        {r.source.replace(/^https?:\/\//, "")}
                      </a>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-[var(--lfp-mist)]">
                      {t.admin.admin.common.loading}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className={h2}>{s.limits.title}</h2>
          <ul className="mt-3 max-w-2xl space-y-2">
            {s.limits.body.map((li) => (
              <li key={li} className="flex gap-3 leading-relaxed">
                <span aria-hidden="true" className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--lfp-cobalt)]" />
                {li}
              </li>
            ))}
          </ul>
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="lfp-tile p-6">
            <h2 className={h2}>{s.contribute.title}</h2>
            <p className="mt-3 leading-relaxed text-[var(--lfp-mist)]">{s.contribute.body}</p>
            <Link
              href="/lfp/contribuir"
              className="lfp-focus lfp-press mt-5 inline-flex min-h-11 items-center rounded-lg bg-[var(--lfp-cobalt)] px-5 text-sm font-semibold text-[var(--lfp-cal-tile)]"
            >
              {s.contribute.cta}
            </Link>
          </section>
          <section className="lfp-tile p-6">
            <h2 className={h2}>{s.code.title}</h2>
            <p className="mt-3 leading-relaxed text-[var(--lfp-mist)]">{s.code.body}</p>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="lfp-focus lfp-press mt-5 inline-flex min-h-11 items-center rounded-lg border border-[var(--lfp-cobalt)] px-5 text-sm font-semibold text-[var(--lfp-cobalt)]"
            >
              {s.code.cta}
            </a>
          </section>
        </div>
      </div>
    </Shell>
  );
}
