"use client";

import { useMemo, useState } from "react";
import { LineChart } from "../../charts/LineChart";
import { adjustForInflation, annualisedInflation, cumulativeInflation, inflationFactor, yearlyInflation } from "../../econ";
import { eur, num, pct } from "../../format";
import { tr } from "../../i18n";
import { Disclaimer, SourceBadge, YearChip } from "../../ui/DataHonesty";
import { NumberField } from "../../ui/Inputs";
import { PageIntro, Shell } from "../../ui/Shell";
import { ShareCard } from "../../ui/ShareCard";
import { useLfpEcon } from "../../useLfpEcon";
import { useLfpLang } from "../../useLfpLang";

const PRESETS = [1999, 2005, 2010, 2015, 2020];

export default function InflacaoView() {
  const { data, loading, error } = useLfpEcon();
  const { t, lang } = useLfpLang();
  const c = t.economia.inflacao;
  const infl = data?.inflation;

  const [amount, setAmount] = useState(1000);
  const [from, setFrom] = useState(1999);
  const [to, setTo] = useState<number | null>(null);
  const toYear = to ?? infl?.lastYear ?? 2025;

  const result = useMemo(() => {
    if (!infl) return null;
    const v = infl.values;
    return {
      adjusted: adjustForInflation(amount, v, from, toYear),
      inverse: adjustForInflation(amount, v, toYear, from),
      cumulative: cumulativeInflation(v, from, toYear),
      annualised: annualisedInflation(v, from, toYear),
      factor: inflationFactor(v, from, toYear),
    };
  }, [infl, amount, from, toYear]);

  const money = (n: number) => eur(n, lang);
  const series = useMemo(
    () =>
      infl
        ? Object.entries(infl.values)
            .map(([y, v]) => ({ x: Number(y), y: v }))
            .sort((a, b) => a.x - b.x)
        : [],
    [infl]
  );
  const yearly = useMemo(() => (infl ? yearlyInflation(infl.values).reverse() : []), [infl]);

  return (
    <Shell crumbs={[{ href: "/lfp/economia", label: t.economia.hub.crumb }, { label: c.crumb }]}>
      <PageIntro eyebrow={c.eyebrow} title={tr(c.title, { year: from })} lede={c.lede} />

      {loading && <p className="py-16 text-center text-sm text-[var(--lfp-mist)]">{t.chrome.loading}</p>}
      {error && <p className="py-16 text-center text-sm text-[var(--lfp-vermelho)]">{t.chrome.loadError}</p>}

      {infl && result && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:items-start">
          <form onSubmit={(e) => e.preventDefault()} className="lfp-panel space-y-5 p-5 lg:sticky lg:top-6" aria-label={c.formAria}>
            <NumberField label={c.fields.amount} value={amount} onChange={setAmount} min={0} max={100000000} />
            <NumberField
              label={c.fields.fromYear}
              value={from}
              onChange={(n) => setFrom(Math.round(n))}
              suffix=""
              min={infl.firstYear}
              max={infl.lastYear}
            />
            <div role="group" aria-label={c.fields.presets} className="flex flex-wrap gap-1.5">
              {PRESETS.filter((y) => y >= infl.firstYear && y <= infl.lastYear).map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setFrom(y)}
                  aria-pressed={from === y}
                  className={`lfp-num lfp-focus lfp-press min-h-11 rounded-lg border px-3 text-sm transition-colors ${
                    from === y
                      ? "border-[var(--lfp-cobalt)] bg-[var(--lfp-cobalt)] text-[var(--lfp-cal-tile)]"
                      : "border-[var(--lfp-line)] text-[var(--lfp-mist)] hover:border-[var(--lfp-cobalt)]"
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
            <NumberField
              label={c.fields.toYear}
              value={toYear}
              onChange={(n) => setTo(Math.round(n))}
              suffix=""
              min={infl.firstYear}
              max={infl.lastYear}
            />
          </form>

          <div className="space-y-6">
            <div className="lfp-panel px-5 py-5 sm:px-6">
              <p className="lfp-eyebrow">
                {tr(c.headline.eyebrow, { amount: money(amount), from, to: toYear })}
                <YearChip year={infl.meta.year} />
              </p>
              <p className="lfp-display mt-2 text-5xl font-semibold sm:text-6xl">
                <span className="lfp-num">{result.adjusted !== null ? money(result.adjusted) : "—"}</span>
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.cumulative}</dt>
                  <dd className={`lfp-num font-semibold ${(result.cumulative ?? 0) >= 0 ? "lfp-state" : "lfp-keep"}`}>
                    {result.cumulative !== null ? `${result.cumulative >= 0 ? "+" : ""}${pct(result.cumulative, lang)}` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.annualised}</dt>
                  <dd className="lfp-num font-semibold">{result.annualised !== null ? pct(result.annualised, lang) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.factor}</dt>
                  <dd className="lfp-num font-semibold">{result.factor !== null ? `×${num(result.factor, lang, 2)}` : "—"}</dd>
                </div>
              </dl>
              {result.inverse !== null && (
                <p className="mt-4 border-t border-[var(--lfp-line)] pt-3 text-sm text-[var(--lfp-mist)]">
                  {tr(c.headline.inverse, { amount: money(amount), to: toYear, from })}{" "}
                  <span className="lfp-num font-semibold text-[var(--lfp-cobalt-deep)]">{money(result.inverse)}</span>
                </p>
              )}
            </div>

            <div className="lfp-panel overflow-hidden">
              <div className="border-b border-[var(--lfp-line)] px-5 py-3">
                <h2 className="text-sm font-semibold">{tr(c.chartTitle, { first: infl.firstYear, last: infl.lastYear })}</h2>
              </div>
              <div className="px-2 py-3 sm:px-4">
                <LineChart
                  series={[{ id: "hicp", label: "HICP", tone: "cobalt", points: series }]}
                  formatX={(x) => String(x)}
                  formatY={(y) => num(y, lang, 0)}
                  highlightX={from}
                  ariaLabel={tr(c.chartAria, {
                    first: infl.firstYear,
                    last: infl.lastYear,
                    from,
                    to: toYear,
                    idxFrom: num(infl.values[String(from)] ?? 0, lang, 1),
                    idxTo: num(infl.values[String(toYear)] ?? 0, lang, 1),
                  })}
                />
              </div>
            </div>

            <details className="lfp-panel">
              <summary className="lfp-focus flex min-h-11 cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                {c.tableTitle}
                <span aria-hidden="true" className="text-[var(--lfp-mist)]">+</span>
              </summary>
              <table className="w-full border-t border-[var(--lfp-line)] text-sm">
                <thead>
                  <tr className="border-b border-[var(--lfp-line)]">
                    <th scope="col" className="lfp-eyebrow px-5 py-2 text-left font-normal">{c.tableYear}</th>
                    <th scope="col" className="lfp-eyebrow px-5 py-2 text-right font-normal">{c.tableRate}</th>
                    <th scope="col" className="lfp-eyebrow px-5 py-2 text-right font-normal">{c.tableIndex}</th>
                  </tr>
                </thead>
                <tbody>
                  {yearly.map((r) => (
                    <tr key={r.year} className={`border-b border-[var(--lfp-line)] last:border-0 ${r.year === from ? "bg-[var(--lfp-cobalt-faint)]" : ""}`}>
                      <th scope="row" className="lfp-num px-5 py-1.5 text-left font-normal">{r.year}</th>
                      <td className={`lfp-num px-5 py-1.5 text-right ${r.rate >= 0 ? "" : "lfp-keep"}`}>
                        {r.rate >= 0 ? "+" : ""}{pct(r.rate, lang)}
                      </td>
                      <td className="lfp-num px-5 py-1.5 text-right text-[var(--lfp-mist)]">{num(infl.values[String(r.year)], lang, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>

            {result.adjusted !== null && (
              <ShareCard
                card="inflacao"
                params={{ amount, from, to: toYear }}
                pagePath="/lfp/economia/inflacao"
                title={`${tr(t.chrome.share.cards.inflacaoEyebrow, { amount: money(amount), from })} ${money(result.adjusted)}`}
              />
            )}

            <Disclaimer notes={c.notes} />
            <SourceBadge meta={infl.meta} />
          </div>
        </div>
      )}
    </Shell>
  );
}
