"use client";

import { useMemo, useState } from "react";
import { compareBudget } from "../econ";
import { eur, eur0, pct } from "../format";
import { tr } from "../i18n";
import { Disclaimer, SourceBadge, YearChip } from "../ui/DataHonesty";
import { NumberField } from "../ui/Inputs";
import { PageIntro, Shell } from "../ui/Shell";
import { useLfpEcon } from "../useLfpEcon";
import { useLfpLang } from "../useLfpLang";

const QUINTILES = ["QU1", "QU2", "QU3", "QU4", "QU5"] as const;
type Quintile = (typeof QUINTILES)[number];

/** A plausible starting budget, so the page teaches something before the
 *  reader has typed anything. Deliberately not a recommendation. */
const SEED: Record<string, number> = {
  CP01: 350,
  CP02: 20,
  CP03: 50,
  CP04: 600,
  CP05: 60,
  CP06: 60,
  CP07: 180,
  CP08: 45,
  CP09: 70,
  CP10: 0,
  CP11: 120,
  CP12: 90,
};

export default function OrcamentoView() {
  const { data, loading, error } = useLfpEcon();
  const { t, lang } = useLfpLang();
  const c = t.sec.orcamento;
  const budget = data?.budget;

  const [income, setIncome] = useState(1800);
  const [quintile, setQuintile] = useState<Quintile>("QU3");
  const [spend, setSpend] = useState<Record<string, number>>(SEED);

  const reference = useMemo(
    () => budget?.quintiles.find((q) => q.quintile === quintile)?.divisions ?? [],
    [budget, quintile]
  );

  const result = useMemo(
    () =>
      reference.length
        ? compareBudget(
            reference.map((r) => ({ code: r.code, amount: spend[r.code] ?? 0 })),
            reference,
            income
          )
        : null,
    [reference, spend, income]
  );

  const money = (n: number) => eur(n, lang);
  const money0 = (n: number) => eur0(n, lang);
  const label = (code: string) => c.divisions[code as keyof typeof c.divisions] ?? code;
  const quintileLabel = c.quintiles[quintile];

  const verdict =
    income <= 0
      ? "noIncome"
      : !result || result.total === 0
        ? "noIncome"
        : result.balance > 1
          ? "saving"
          : result.balance < -1
            ? "deficit"
            : "breakeven";

  const topOf = (list: Array<{ code: string; share: number }>) =>
    list
      .slice()
      .sort((a, b) => b.share - a.share)
      .slice(0, 3)
      .map((x) => `${label(x.code)} ${pct(x.share, lang, 0)}`)
      .join(", ");

  return (
    <Shell crumbs={[{ label: c.crumb }]}>
      <PageIntro eyebrow={c.eyebrow} title={c.title} lede={c.lede} />

      {loading && <p className="py-16 text-center text-sm text-[var(--lfp-mist)]">{t.chrome.loading}</p>}
      {error && <p className="py-16 text-center text-sm text-[var(--lfp-vermelho)]">{t.chrome.loadError}</p>}

      {budget && result && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:items-start">
          <form onSubmit={(e) => e.preventDefault()} className="lfp-panel space-y-5 p-5" aria-label={c.formAria}>
            <fieldset className="min-w-0 space-y-4">
              <legend className="lfp-eyebrow mb-1">{c.incomeTitle}</legend>
              <NumberField label={c.fields.income} value={income} onChange={setIncome} min={0} max={1000000} hint={c.fields.incomeHint} />
              <div>
                <label htmlFor="or-quintile" className="block text-sm font-medium">{c.fields.quintile}</label>
                <select
                  id="or-quintile"
                  value={quintile}
                  onChange={(e) => setQuintile(e.target.value as Quintile)}
                  aria-describedby="or-quintile-hint"
                  className="lfp-input lfp-focus mt-1.5 h-11 w-full px-3 text-sm"
                >
                  {QUINTILES.map((q) => (
                    <option key={q} value={q}>
                      {c.quintiles[q]}
                    </option>
                  ))}
                </select>
                <p id="or-quintile-hint" className="mt-1 text-xs text-[var(--lfp-mist)]">{c.fields.quintileHint}</p>
              </div>
            </fieldset>

            <div className="border-t border-[var(--lfp-line)]" />

            <fieldset className="min-w-0 space-y-3">
              <legend className="lfp-eyebrow mb-1">{c.spendTitle}</legend>
              {reference.map((r) => (
                <NumberField
                  key={r.code}
                  label={label(r.code)}
                  value={spend[r.code] ?? 0}
                  onChange={(n) => setSpend((s) => ({ ...s, [r.code]: n }))}
                  min={0}
                  max={1000000}
                />
              ))}
            </fieldset>
          </form>

          <div className="min-w-0 space-y-6">
            <div className="lfp-panel px-5 py-5 sm:px-6">
              <p className="lfp-eyebrow">
                {c.headline.eyebrow}
                <YearChip year={budget.meta.year} />
              </p>
              <p className="lfp-display mt-2 text-5xl font-semibold sm:text-6xl">
                <span className="lfp-num">{money0(result.total)}</span>
              </p>
              {income > 0 && (
                <p className="lfp-num mt-1 text-sm text-[var(--lfp-mist)]">
                  {tr(c.headline.ofIncome, { pct: pct(result.total / income, lang) })}
                </p>
              )}
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[var(--lfp-line)] pt-4 text-sm">
                <div>
                  <dt className="text-[var(--lfp-mist)]">{result.balance >= 0 ? c.headline.balance : c.headline.deficit}</dt>
                  <dd className={`lfp-num font-semibold ${result.balance >= 0 ? "lfp-keep" : "lfp-state"}`}>
                    {money(Math.abs(result.balance))}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.savingsRate}</dt>
                  <dd className={`lfp-num font-semibold ${result.savingsRate >= 0 ? "lfp-keep" : "lfp-state"}`}>
                    {income > 0 ? pct(result.savingsRate, lang) : "—"}
                  </dd>
                </div>
              </dl>
              <p role="status" className="mt-4 max-w-xl text-sm leading-relaxed">
                {c.verdict[verdict as keyof typeof c.verdict]}
              </p>
            </div>

            {result.total === 0 ? (
              <p className="lfp-sunk px-4 py-6 text-center text-sm text-[var(--lfp-cobalt-deep)]">{c.empty}</p>
            ) : (
              <>
                <div className="lfp-panel p-5">
                  <h2 className="text-sm font-semibold">{c.bars.title}</h2>
                  <ul
                    className="mt-4 space-y-3"
                    aria-label={tr(c.bars.aria, {
                      top: topOf(result.lines.map((l) => ({ code: l.code, share: l.share }))),
                      ref: topOf(reference),
                    })}
                  >
                    {result.lines
                      .slice()
                      .sort((a, b) => b.share - a.share)
                      .map((l) => (
                        <li key={l.code} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-sm">
                          <span className="truncate">{label(l.code)}</span>
                          <span className="lfp-num whitespace-nowrap text-[var(--lfp-mist)]">
                            {pct(l.share, lang, 0)} <span className="text-[var(--lfp-line-strong)]">·</span>{" "}
                            <span className="text-[var(--lfp-mist)]">{pct(l.reference, lang, 0)}</span>
                          </span>
                          {/* Two stacked tracks: yours solid, the quintile's
                              hollow, on a shared scale so the eye compares
                              lengths rather than colours. */}
                          <span className="col-span-2 space-y-1" aria-hidden="true">
                            <span className="block h-2 rounded-sm bg-[var(--lfp-cal)]">
                              <span className="block h-full rounded-sm bg-[var(--lfp-cobalt)]" style={{ width: `${Math.min(100, l.share * 100 * 2)}%` }} />
                            </span>
                            <span className="block h-2 rounded-sm bg-[var(--lfp-cal)]">
                              <span className="block h-full rounded-sm bg-[var(--lfp-cobalt)] opacity-30" style={{ width: `${Math.min(100, l.reference * 100 * 2)}%` }} />
                            </span>
                          </span>
                        </li>
                      ))}
                  </ul>
                  <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-[var(--lfp-line)] pt-3 text-xs text-[var(--lfp-mist)]">
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true" className="h-2 w-5 rounded-sm bg-[var(--lfp-cobalt)]" />
                      {c.bars.you}
                    </span>
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true" className="h-2 w-5 rounded-sm bg-[var(--lfp-cobalt)] opacity-30" />
                      {c.bars.them}
                    </span>
                  </p>
                </div>

                {/* A region that scrolls must be reachable by keyboard, or
                    the columns past the fold are unreachable without a
                    mouse. `tabIndex` plus a group role and label is what
                    axe's scrollable-region-focusable asks for. */}
                <div
                  className="lfp-panel lfp-focus overflow-x-auto"
                  tabIndex={0}
                  role="group"
                  aria-label={tr(c.table.caption, { quintile: quintileLabel })}
                >
                  <table className="w-full min-w-[36rem] text-sm">
                    <caption className="border-b border-[var(--lfp-line)] px-4 py-3 text-left text-sm font-semibold">
                      {tr(c.table.caption, { quintile: quintileLabel })}
                    </caption>
                    <thead>
                      <tr className="border-b border-[var(--lfp-line)]">
                        <th scope="col" className="lfp-eyebrow px-4 py-2 text-left font-normal">{c.table.category}</th>
                        <th scope="col" className="lfp-eyebrow px-4 py-2 text-right font-normal">{c.table.amount}</th>
                        <th scope="col" className="lfp-eyebrow px-4 py-2 text-right font-normal">{c.table.share}</th>
                        <th scope="col" className="lfp-eyebrow px-4 py-2 text-right font-normal">{c.table.reference}</th>
                        <th scope="col" className="lfp-eyebrow px-4 py-2 text-right font-normal">{c.table.diff}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.lines.map((l) => (
                        <tr key={l.code} className="border-b border-[var(--lfp-line)] last:border-0">
                          <th scope="row" className="px-4 py-2.5 text-left font-normal">{label(l.code)}</th>
                          <td className="lfp-num px-4 py-2.5 text-right">{money(l.amount)}</td>
                          <td className="lfp-num px-4 py-2.5 text-right">{pct(l.share, lang, 0)}</td>
                          <td className="lfp-num px-4 py-2.5 text-right text-[var(--lfp-mist)]">{pct(l.reference, lang, 0)}</td>
                          <td className={`lfp-num px-4 py-2.5 text-right ${l.diff > 0.005 ? "lfp-state" : l.diff < -0.005 ? "lfp-keep" : "text-[var(--lfp-mist)]"}`}>
                            {l.diff > 0 ? "+" : ""}
                            {pct(l.diff, lang, 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <aside className="lfp-tile p-5">
                  <p className="lfp-eyebrow">{c.over.title}</p>
                  {result.overspending.length === 0 ? (
                    <p className="mt-2 text-sm leading-relaxed">{c.over.none}</p>
                  ) : (
                    <>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--lfp-mist)]">{c.over.body}</p>
                      <ul className="mt-3 space-y-2">
                        {result.overspending.slice(0, 3).map((o) => (
                          <li key={o.code} className="flex gap-3 text-sm leading-relaxed">
                            <span aria-hidden="true" className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--lfp-vermelho)]" />
                            {tr(c.over.row, {
                              label: label(o.code),
                              diff: pct(o.diff, lang, 0),
                              amount: money(o.amount - o.referenceAmount),
                            })}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </aside>
              </>
            )}

            <Disclaimer notes={c.notes.map((n) => tr(n, { year: budget.meta.year }))} />
            <SourceBadge meta={budget.meta} />
          </div>
        </div>
      )}
    </Shell>
  );
}
