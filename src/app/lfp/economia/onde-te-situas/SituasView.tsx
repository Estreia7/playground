"use client";

import { useMemo, useState } from "react";
import { wageStanding } from "../../econ";
import { eur, eur0, num } from "../../format";
import { tr } from "../../i18n";
import { Disclaimer, SourceBadge, YearChip } from "../../ui/DataHonesty";
import { NumberField } from "../../ui/Inputs";
import { PageIntro, Shell } from "../../ui/Shell";
import { useLfpEcon } from "../../useLfpEcon";
import { useLfpLang } from "../../useLfpLang";

/** The scale runs a little past D9 so the top marker isn't glued to the
 *  edge, and starts at zero because a wage scale that doesn't is misleading. */
const SCALE_HEADROOM = 1.25;

export default function SituasView() {
  const { data, loading, error } = useLfpEcon();
  const { t, lang } = useLfpLang();
  const c = t.sec.situas;
  const dist = data?.distribution;

  const [bruto, setBruto] = useState(1200);

  const standing = useMemo(() => (dist ? wageStanding(bruto, dist.points) : null), [dist, bruto]);

  const money = (n: number) => eur(n, lang);
  const money0 = (n: number) => eur0(n, lang);

  const byLabel = (l: string) => dist?.points.find((p) => p.label === l);
  const d1 = byLabel("D1");
  const median = byLabel("median");
  const d9 = byLabel("D9");

  const scaleMax = d9 ? d9.value * SCALE_HEADROOM : 3000;
  const pos = (v: number) => Math.min(100, Math.max(0, (v / scaleMax) * 100));

  return (
    <Shell crumbs={[{ href: "/lfp/economia", label: t.economia.hub.crumb }, { label: c.crumb }]}>
      <PageIntro eyebrow={c.eyebrow} title={c.title} lede={c.lede} />

      {loading && <p className="py-16 text-center text-sm text-[var(--lfp-mist)]">{t.chrome.loading}</p>}
      {error && <p className="py-16 text-center text-sm text-[var(--lfp-vermelho)]">{t.chrome.loadError}</p>}

      {dist && d1 && median && d9 && standing && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:items-start">
          <form onSubmit={(e) => e.preventDefault()} className="lfp-panel space-y-5 p-5" aria-label={c.formAria}>
            <NumberField label={c.fields.bruto} value={bruto} onChange={setBruto} min={0} max={100000} hint={c.fields.brutoHint} />
          </form>

          <div className="min-w-0 space-y-6">
            <div className="lfp-panel px-5 py-5 sm:px-6">
              {standing.outside === null ? (
                <>
                  <p className="lfp-eyebrow">
                    {c.headline.eyebrow}
                    <YearChip year={dist.meta.year} />
                  </p>
                  <p className="lfp-display mt-2 text-5xl font-semibold sm:text-6xl">
                    <span className="lfp-num">{tr(c.headline.between, { low: standing.low, high: standing.high })}</span>
                  </p>
                  <p className="mt-2 text-sm text-[var(--lfp-mist)]">
                    {c.headline.of} · <span className="lfp-num">{tr(c.headline.estimate, { n: num(standing.estimate, lang, 0) })}</span>
                  </p>
                </>
              ) : (
                <>
                  <p className="lfp-eyebrow">
                    {standing.outside === "below" ? c.headline.belowTitle : c.headline.aboveTitle}
                    <YearChip year={dist.meta.year} />
                  </p>
                  <p className="lfp-display mt-2 text-4xl font-semibold sm:text-5xl">
                    <span className="lfp-num">
                      {standing.outside === "below"
                        ? tr(c.headline.between, { low: 0, high: 10 })
                        : tr(c.headline.between, { low: 90, high: 100 })}
                    </span>
                  </p>
                  <p className="mt-3 max-w-xl text-sm leading-relaxed">
                    {standing.outside === "below" ? c.headline.belowBody : c.headline.aboveBody}
                  </p>
                </>
              )}
            </div>

            <div className="lfp-panel p-5">
              <h2 className="text-sm font-semibold">{c.scale.title}</h2>
              <div
                role="img"
                aria-label={tr(c.scale.aria, {
                  year: dist.meta.year,
                  d1: money0(d1.value),
                  median: money0(median.value),
                  mean: money0(dist.mean),
                  d9: money0(d9.value),
                  yours: money0(bruto),
                  pct: num(standing.estimate, lang, 0),
                })}
                className="mt-6"
              >
                {/* The bar is the distribution's span; the markers are the
                    published points. Nothing here is interpolated. */}
                <div className="relative h-3 rounded-full bg-gradient-to-r from-[var(--lfp-cal)] via-[var(--lfp-cobalt-faint)] to-[var(--lfp-cal)] ring-1 ring-[var(--lfp-line)] ring-inset">
                  <span
                    className="absolute top-0 h-3 rounded-full bg-[var(--lfp-cobalt)] opacity-25"
                    style={{ left: `${pos(d1.value)}%`, width: `${pos(d9.value) - pos(d1.value)}%` }}
                  />
                  {[
                    { v: d1.value, k: "d1" as const },
                    { v: median.value, k: "median" as const },
                    { v: dist.mean, k: "mean" as const },
                    { v: d9.value, k: "d9" as const },
                  ].map(({ v, k }) => (
                    <span key={k} className="absolute -top-1 h-5 w-px bg-[var(--lfp-line-strong)]" style={{ left: `${pos(v)}%` }} />
                  ))}
                  <span
                    aria-hidden="true"
                    className="absolute -top-2.5 h-8 w-1 -translate-x-1/2 rounded-full bg-[var(--lfp-verde)]"
                    style={{ left: `${pos(bruto)}%` }}
                  />
                </div>
                {/* At 375px the three lower anchors sit inside a third of the
                    bar — D1 to the mean is under 25% of its width — so centred
                    labels collide however narrow they get, and two rows are
                    not enough either. On mobile the mean's label is dropped
                    (the table below carries it) and the rest are staggered,
                    each lower label with a leader line back to its mark. From
                    `sm` up there is room for all four on one row. */}
                <div className="relative mt-1 h-16 sm:h-11">
                  {[
                    { v: d1.value, label: c.scale.d1, row: 0, mobile: true },
                    { v: median.value, label: c.scale.median, row: 1, mobile: true },
                    { v: dist.mean, label: c.scale.mean, row: 1, mobile: false },
                    { v: d9.value, label: c.scale.d9, row: 0, mobile: true },
                  ].map(({ v, label, row, mobile }) => (
                    <span
                      key={label}
                      className={`absolute w-16 -translate-x-1/2 text-center text-[0.625rem] leading-tight text-[var(--lfp-mist)] ${
                        row === 1 ? "top-8 sm:top-1" : "top-1"
                      } ${mobile ? "" : "hidden sm:block"}`}
                      style={{ left: `${pos(v)}%` }}
                    >
                      {row === 1 && (
                        <span aria-hidden="true" className="absolute -top-7 left-1/2 h-7 w-px bg-[var(--lfp-line)] sm:hidden" />
                      )}
                      <span className="lfp-num block font-semibold text-[var(--lfp-cobalt-deep)]">{money0(v)}</span>
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <p className="mt-2 flex items-center gap-2 text-xs">
                <span aria-hidden="true" className="h-3 w-1 rounded-full bg-[var(--lfp-verde)]" />
                <span className="text-[var(--lfp-mist)]">{c.scale.you}</span>
                <span className="lfp-num font-semibold">{money(bruto)}</span>
              </p>
            </div>

            <div className="lfp-panel overflow-hidden">
              <table className="w-full text-sm">
                <caption className="border-b border-[var(--lfp-line)] px-5 py-3 text-left text-sm font-semibold">{c.points.title}</caption>
                <tbody>
                  {[
                    { label: c.points.d1, v: d1.value },
                    { label: c.points.median, v: median.value },
                    { label: c.points.mean, v: dist.mean },
                    { label: c.points.d9, v: d9.value },
                  ].map(({ label, v }) => (
                    <tr key={label} className="border-b border-[var(--lfp-line)] last:border-0">
                      <th scope="row" className="px-5 py-2.5 text-left font-normal text-[var(--lfp-mist)]">{label}</th>
                      <td className="lfp-num whitespace-nowrap px-5 py-2.5 text-right font-semibold">{money(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <aside className="lfp-tile p-5">
              <p className="lfp-eyebrow">{c.gap.title}</p>
              <p className="mt-2 text-sm leading-relaxed">
                {tr(c.gap.text, { mean: money0(dist.mean), median: money0(median.value) })}
              </p>
            </aside>

            <aside className="lfp-sunk px-4 py-3">
              <p className="text-xs font-semibold text-[var(--lfp-cobalt-deep)]">{c.caveat.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--lfp-cobalt-deep)]">{c.caveat.text}</p>
            </aside>

            <Disclaimer notes={c.notes.map((n) => tr(n, { year: dist.meta.year }))} />
            <SourceBadge meta={dist.meta} />
          </div>
        </div>
      )}
    </Shell>
  );
}
