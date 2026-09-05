"use client";

import { useMemo, useState } from "react";
import { salarioLiquido } from "../../calc";
import { BarChart } from "../../charts/BarChart";
import { eur, eur0, pct } from "../../format";
import { tr } from "../../i18n";
import { Disclaimer, SourceBadge, YearChip } from "../../ui/DataHonesty";
import { NumberField } from "../../ui/Inputs";
import { Ledger, LedgerRow } from "../../ui/Ledger";
import { PageIntro, Shell } from "../../ui/Shell";
import { useLfpData } from "../../useLfpData";
import { useLfpEcon } from "../../useLfpEcon";
import { useLfpLang } from "../../useLfpLang";

const NO_SUB = { ativo: false, valorDiario: 0, meio: "cartao" as const, diasMes: 22 };

export default function ImpostosView() {
  const tax = useLfpData();
  const econ = useLfpEcon();
  const { t, lang } = useLfpLang();
  const c = t.economia.impostos;

  const [bruto, setBruto] = useState(1500);

  const cofog = econ.data?.cofog;
  const irs = tax.data?.irs;
  const tsu = tax.data?.tsu;

  const pay = useMemo(
    () =>
      irs && tsu
        ? salarioLiquido(
            { brutoMensal: bruto, meses: 14, situacao: "nao_casado", dependentes: 0, regiao: "continente", subsidioRefeicao: NO_SUB },
            { irs, tsu }
          )
        : null,
    [irs, tsu, bruto]
  );

  // Your monthly contribution, split by the same shares the State spends in.
  const receipt = useMemo(() => {
    if (!pay || !cofog) return [];
    const total = pay.totalEntregueAoEstado;
    return cofog.items.map((it) => ({
      code: it.code,
      label: (c.cofog as Record<string, string>)[it.code] ?? it.label,
      share: it.share,
      amount: Math.round(total * it.share * 100) / 100,
    }));
  }, [pay, cofog, c]);

  const money = (n: number) => eur(n, lang);
  const loading = tax.loading || econ.loading;
  const error = tax.error || econ.error;

  return (
    <Shell crumbs={[{ href: "/lfp/economia", label: t.economia.hub.crumb }, { label: c.crumb }]}>
      <PageIntro eyebrow={c.eyebrow} title={c.title} lede={c.lede} />

      {loading && <p className="py-16 text-center text-sm text-[var(--lfp-mist)]">{t.chrome.loading}</p>}
      {error && <p className="py-16 text-center text-sm text-[var(--lfp-vermelho)]">{t.chrome.loadError}</p>}

      {pay && cofog && irs && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:items-start">
          <form onSubmit={(e) => e.preventDefault()} className="lfp-panel space-y-5 p-5 lg:sticky lg:top-6" aria-label={c.formAria}>
            <NumberField label={c.fields.bruto} value={bruto} onChange={setBruto} min={0} max={100000} hint={c.fields.brutoHint} />
          </form>

          <div className="space-y-6">
            <div className="lfp-panel px-5 py-5 sm:px-6">
              <p className="lfp-eyebrow">
                {c.headline.eyebrow}
                <YearChip year={irs.meta.year} />
              </p>
              <p className="lfp-display lfp-state mt-2 text-5xl font-semibold sm:text-6xl">
                <span className="lfp-num">{money(pay.totalEntregueAoEstado)}</span>
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.irs}</dt>
                  <dd className="lfp-num font-semibold">{money(pay.irsRetido)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.tsu}</dt>
                  <dd className="lfp-num font-semibold">{money(pay.tsuTrabalhador)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.year}</dt>
                  <dd className="lfp-num font-semibold">{cofog.meta.year}</dd>
                </div>
              </dl>
            </div>

            <div className="lfp-panel overflow-hidden">
              <div className="border-b border-[var(--lfp-line)] px-5 py-3">
                <h2 className="text-sm font-semibold">{tr(c.chartTitle, { amount: money(pay.totalEntregueAoEstado) })}</h2>
              </div>
              <div className="px-2 py-3 sm:px-4">
                <BarChart
                  bars={receipt.map((r, i) => ({
                    id: r.code,
                    label: r.label,
                    value: r.amount,
                    tone: i === 0 ? "cobalt" : "mist",
                  }))}
                  formatValue={(v) => money(v)}
                  ariaLabel={tr(c.chartAria, {
                    amount: money(pay.totalEntregueAoEstado),
                    year: cofog.meta.year,
                    top: receipt[0]?.label ?? "",
                    topAmount: money(receipt[0]?.amount ?? 0),
                  })}
                />
              </div>
            </div>

            <Ledger caption={c.crumb}>
              {receipt.map((r) => (
                <LedgerRow
                  key={r.code}
                  label={`${r.label} · ${pct(r.share, lang)}`}
                  value={`${money(r.amount)}${c.perMonth}`}
                />
              ))}
              <LedgerRow label={c.headline.eyebrow} value={money(pay.totalEntregueAoEstado)} strong tone="state" />
            </Ledger>

            <Disclaimer notes={c.notes} />
            <div className="space-y-1.5">
              <SourceBadge meta={cofog.meta} />
              <SourceBadge meta={irs.meta} />
            </div>
            <p className="lfp-num text-xs text-[var(--lfp-mist)]">{eur0(cofog.totalMillionEur * 1e6, lang)} · {cofog.meta.year}</p>
          </div>
        </div>
      )}
    </Shell>
  );
}
