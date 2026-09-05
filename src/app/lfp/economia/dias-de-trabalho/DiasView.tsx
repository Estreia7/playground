"use client";

import { useMemo, useState } from "react";
import { BarChart } from "../../charts/BarChart";
import { daysOfWork } from "../../econ";
import { eur, eur0, num } from "../../format";
import { tr } from "../../i18n";
import { Disclaimer, SourceBadge, YearChip } from "../../ui/DataHonesty";
import { ChoiceGroup, NumberField } from "../../ui/Inputs";
import { PageIntro, Shell } from "../../ui/Shell";
import { useLfpEcon } from "../../useLfpEcon";
import { useLfpLang } from "../../useLfpLang";

const PRESETS = [500, 1000, 5000, 25000];
const WORKING_DAYS = 220;

export default function DiasView() {
  const { data, loading, error } = useLfpEcon();
  const { t, lang } = useLfpLang();
  const c = t.economia.dias;
  const wages = data?.wages;

  const [price, setPrice] = useState(1000);
  const [unit, setUnit] = useState<"pps" | "eur">("pps");

  const rows = useMemo(() => {
    if (!wages) return [];
    return wages.countries
      .map((k) => {
        const wage = unit === "pps" ? k.value : k.valueEur;
        const days = wage !== null ? daysOfWork(price, wage, WORKING_DAYS) : null;
        return { code: k.code, name: (c.countries as Record<string, string>)[k.code] ?? k.name, year: k.year, wage, days };
      })
      .filter((r): r is typeof r & { days: number; wage: number } => r.days !== null && r.wage !== null)
      .sort((a, b) => a.days - b.days);
  }, [wages, price, unit, c]);

  const pt = rows.find((r) => r.code === "PT");
  const money = (n: number) => eur(n, lang);
  const days1 = (d: number) => num(d, lang, 1);
  const missingNames = (wages?.missing ?? []).map((m) => (c.countries as Record<string, string>)[m] ?? m);

  return (
    <Shell crumbs={[{ href: "/lfp/economia", label: t.economia.hub.crumb }, { label: c.crumb }]}>
      <PageIntro eyebrow={c.eyebrow} title={c.title} lede={c.lede} />

      {loading && <p className="py-16 text-center text-sm text-[var(--lfp-mist)]">{t.chrome.loading}</p>}
      {error && <p className="py-16 text-center text-sm text-[var(--lfp-vermelho)]">{t.chrome.loadError}</p>}

      {wages && pt && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:items-start">
          <form onSubmit={(e) => e.preventDefault()} className="lfp-panel space-y-5 p-5 lg:sticky lg:top-6" aria-label={c.formAria}>
            <NumberField label={c.fields.price} value={price} onChange={setPrice} min={0} max={100000000} hint={c.fields.priceHint} />
            <div role="group" aria-label={c.fields.presets} className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrice(p)}
                  aria-pressed={price === p}
                  className={`lfp-num lfp-focus lfp-press min-h-11 rounded-lg border px-3 text-sm transition-colors ${
                    price === p
                      ? "border-[var(--lfp-cobalt)] bg-[var(--lfp-cobalt)] text-[var(--lfp-cal-tile)]"
                      : "border-[var(--lfp-line)] text-[var(--lfp-mist)] hover:border-[var(--lfp-cobalt)]"
                  }`}
                >
                  {eur0(p, lang)}
                </button>
              ))}
            </div>
            <ChoiceGroup
              label={c.fields.unit}
              value={unit}
              onChange={setUnit}
              columns={1}
              choices={[
                { value: "pps", label: c.fields.unitPps },
                { value: "eur", label: c.fields.unitEur },
              ]}
            />
            <p className="text-xs leading-relaxed text-[var(--lfp-mist)]">{c.fields.unitHint}</p>
          </form>

          <div className="space-y-6">
            <div className="lfp-panel px-5 py-5 sm:px-6">
              <p className="lfp-eyebrow">
                {c.headline.eyebrow}
                <YearChip year={pt.year} />
              </p>
              <p className="lfp-display mt-2 text-5xl font-semibold sm:text-6xl">
                <span className="lfp-num">{days1(pt.days)}</span>{" "}
                <span className="text-2xl font-normal text-[var(--lfp-mist)] sm:text-3xl">
                  {Math.round(pt.days * 10) === 10 ? c.headline.daysOne : c.headline.days}
                </span>
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-[var(--lfp-mist)]">{tr(c.headline.weeks, { weeks: days1(pt.days / 5) })}</dt>
                  <dd className="lfp-num font-semibold">{tr(c.headline.months, { months: days1(pt.days / 22) })}</dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.daily}</dt>
                  <dd className="lfp-num font-semibold">{money(pt.wage / WORKING_DAYS)}</dd>
                </div>
              </dl>
            </div>

            <div className="lfp-panel overflow-hidden">
              <div className="border-b border-[var(--lfp-line)] px-5 py-3">
                <h2 className="text-sm font-semibold">{c.chartTitle}</h2>
              </div>
              <div className="px-2 py-3 sm:px-4">
                <BarChart
                  bars={rows.map((r) => ({
                    id: r.code,
                    label: r.name,
                    value: Math.round(r.days * 10) / 10,
                    note: String(r.year),
                    highlight: r.code === "PT",
                  }))}
                  formatValue={(v) => `${days1(v)} ${c.chartUnit}`}
                  ariaLabel={tr(c.chartAria, {
                    price: money(price),
                    n: rows.length,
                    ptDays: days1(pt.days),
                    best: rows[0]?.name ?? "",
                    bestDays: days1(rows[0]?.days ?? 0),
                    worst: rows[rows.length - 1]?.name ?? "",
                    worstDays: days1(rows[rows.length - 1]?.days ?? 0),
                  })}
                />
              </div>
            </div>

            {/* Panel, not sunk: the eyebrow grey clears 4.5:1 on the tile
                ground but not on the darker sunk one. */}
            {missingNames.length > 0 && (
              <aside className="lfp-panel px-4 py-3">
                <p className="lfp-eyebrow mb-1">{c.missingTitle}</p>
                <p className="text-xs leading-relaxed text-[var(--lfp-cobalt-deep)]">
                  {tr(c.missingText, { list: missingNames.join(", ") })}
                </p>
              </aside>
            )}

            <Disclaimer notes={c.notes} />
            <SourceBadge meta={wages.meta} />
          </div>
        </div>
      )}
    </Shell>
  );
}
