"use client";

import { useMemo, useState } from "react";
import { LineChart } from "../../charts/LineChart";
import { compoundInterest } from "../../econ";
import { eur, eur0, num } from "../../format";
import { tr } from "../../i18n";
import { Disclaimer } from "../../ui/DataHonesty";
import { NumberField } from "../../ui/Inputs";
import { Ledger, LedgerRow } from "../../ui/Ledger";
import { PageIntro, Shell } from "../../ui/Shell";
import { useLfpLang } from "../../useLfpLang";

const HORIZONS = [10, 20, 30, 40];

export default function JurosView() {
  const { t, lang } = useLfpLang();
  const c = t.economia.juros;

  const [principal, setPrincipal] = useState(1000);
  const [monthly, setMonthly] = useState(100);
  const [ratePct, setRatePct] = useState(5);
  const [years, setYears] = useState(20);

  const result = useMemo(
    () => compoundInterest({ principal, monthly, annualRate: ratePct / 100, years }),
    [principal, monthly, ratePct, years]
  );

  const money = (n: number) => eur(n, lang);
  const money0 = (n: number) => eur0(n, lang);
  const multiple = result.totalContributed > 0 ? result.finalValue / result.totalContributed : 0;

  return (
    <Shell crumbs={[{ href: "/lfp/economia", label: t.economia.hub.crumb }, { label: c.crumb }]}>
      <PageIntro eyebrow={c.eyebrow} title={c.title} lede={c.lede} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:items-start">
        <form onSubmit={(e) => e.preventDefault()} className="lfp-panel space-y-5 p-5 lg:sticky lg:top-6" aria-label={c.formAria}>
          <NumberField label={c.fields.principal} value={principal} onChange={setPrincipal} min={0} max={100000000} />
          <NumberField label={c.fields.monthly} value={monthly} onChange={setMonthly} min={0} max={1000000} />
          <NumberField label={c.fields.rate} value={ratePct} onChange={setRatePct} suffix="%" min={0} max={30} step={0.1} hint={c.fields.rateHint} />
          <NumberField label={c.fields.years} value={years} onChange={(n) => setYears(Math.round(n))} suffix={c.fields.yearsUnit} min={1} max={60} />
          <div role="group" aria-label={c.fields.presets} className="flex flex-wrap gap-1.5">
            {HORIZONS.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYears(y)}
                aria-pressed={years === y}
                className={`lfp-num lfp-focus lfp-press min-h-11 rounded-lg border px-3 text-sm transition-colors ${
                  years === y
                    ? "border-[var(--lfp-cobalt)] bg-[var(--lfp-cobalt)] text-[var(--lfp-cal-tile)]"
                    : "border-[var(--lfp-line)] text-[var(--lfp-mist)] hover:border-[var(--lfp-cobalt)]"
                }`}
              >
                {y} {c.fields.yearsUnit}
              </button>
            ))}
          </div>
        </form>

        <div className="space-y-6">
          <div className="lfp-panel px-5 py-5 sm:px-6">
            <p className="lfp-eyebrow">{tr(c.headline.eyebrow, { years })}</p>
            <p className="lfp-display lfp-keep mt-2 text-5xl font-semibold sm:text-6xl">
              <span className="lfp-num">{money0(result.finalValue)}</span>
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-[var(--lfp-mist)]">{c.headline.contributed}</dt>
                <dd className="lfp-num font-semibold">{money0(result.totalContributed)}</dd>
              </div>
              <div>
                <dt className="text-[var(--lfp-mist)]">{c.headline.interest}</dt>
                <dd className="lfp-num lfp-keep font-semibold">{money0(result.totalInterest)}</dd>
              </div>
              <div>
                <dt className="text-[var(--lfp-mist)]">{c.headline.multiple}</dt>
                <dd className="lfp-num font-semibold">{tr(c.headline.multipleValue, { x: num(multiple, lang, 2) })}</dd>
              </div>
            </dl>
          </div>

          <div className="lfp-panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--lfp-line)] px-5 py-3">
              <h2 className="text-sm font-semibold">{c.chartTitle}</h2>
              <ul className="flex gap-4 text-xs" aria-hidden="true">
                <li className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded bg-[var(--lfp-verde)]" />{c.seriesValue}</li>
                <li className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded border-t-2 border-dashed border-[var(--lfp-cobalt)]" />{c.seriesContributed}</li>
              </ul>
            </div>
            <div className="px-2 py-3 sm:px-4">
              <LineChart
                series={[
                  { id: "value", label: c.seriesValue, tone: "liquido", points: result.series.map((p) => ({ x: p.year, y: p.value })) },
                  { id: "contributed", label: c.seriesContributed, tone: "cobalt", dashed: true, points: result.series.map((p) => ({ x: p.year, y: p.contributed })) },
                ]}
                formatX={(x) => String(x)}
                formatY={(y) => money0(y)}
                yMin={0}
                ariaLabel={tr(c.chartAria, {
                  years,
                  final: money0(result.finalValue),
                  contributed: money0(result.totalContributed),
                  interest: money0(result.totalInterest),
                })}
              />
            </div>
          </div>

          <aside className="lfp-tile p-5">
            <p className="lfp-eyebrow mb-1.5">{c.insight.title}</p>
            <p className="text-sm leading-relaxed">{c.insight.text}</p>
          </aside>

          <Ledger caption={c.ledger.caption}>
            <LedgerRow label={c.ledger.principal} value={money(principal)} />
            <LedgerRow label={tr(c.ledger.monthly, { n: years * 12 })} value={`+ ${money(monthly * years * 12)}`} />
            <LedgerRow label={c.ledger.contributed} value={money(result.totalContributed)} strong />
            <LedgerRow label={c.ledger.interest} value={`+ ${money(result.totalInterest)}`} tone="keep" />
            <LedgerRow label={c.ledger.final} value={money(result.finalValue)} strong tone="keep" />
          </Ledger>

          <Disclaimer notes={c.notes} />
        </div>
      </div>
    </Shell>
  );
}
