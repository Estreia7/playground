"use client";

import { useMemo, useState } from "react";
import { round2, salarioLiquido } from "../../calc";
import { realRaise, yearlyInflation } from "../../econ";
import { eur, pct } from "../../format";
import { tr } from "../../i18n";
import { Disclaimer, SourceBadge, UnverifiedBanner, YearChip } from "../../ui/DataHonesty";
import { NumberField } from "../../ui/Inputs";
import { Ledger, LedgerRow } from "../../ui/Ledger";
import { PageIntro, Shell } from "../../ui/Shell";
import { useLfpData } from "../../useLfpData";
import { useLfpEcon } from "../../useLfpEcon";
import { useLfpLang } from "../../useLfpLang";
import type { SalarioLiquidoInput } from "../../types";

const NO_SUB = { ativo: false, valorDiario: 0, meio: "cartao" as const, diasMes: 22 };

export default function AumentoView() {
  const tax = useLfpData();
  const econ = useLfpEcon();
  const { t, lang } = useLfpLang();
  const c = t.sec.aumento;

  const [bruto, setBruto] = useState(1500);
  const [raisePct, setRaisePct] = useState(3);
  const [inflOverride, setInflOverride] = useState<number | null>(null);

  const latest = useMemo(() => {
    const v = econ.data?.inflation?.values;
    if (!v) return null;
    const y = yearlyInflation(v);
    return y.length ? y[y.length - 1] : null;
  }, [econ.data]);
  const inflPct = inflOverride ?? (latest ? Math.round(latest.rate * 1000) / 10 : 2);

  const result = useMemo(() => {
    const irs = tax.data?.irs;
    const tsu = tax.data?.tsu;
    if (!irs || !tsu) return null;
    const base: Omit<SalarioLiquidoInput, "brutoMensal"> = {
      meses: 14,
      situacao: "nao_casado",
      dependentes: 0,
      regiao: "continente",
      subsidioRefeicao: NO_SUB,
    };
    const raise = raisePct / 100;
    const infl = inflPct / 100;
    const brutoDepois = round2(bruto * (1 + raise));
    const before = salarioLiquido({ ...base, brutoMensal: bruto }, { irs, tsu });
    const after = salarioLiquido({ ...base, brutoMensal: brutoDepois }, { irs, tsu });
    const real = realRaise(raise, infl);
    const aumentoBruto = round2(brutoDepois - bruto);
    const aumentoLiquido = round2(after.liquidoMensal - before.liquidoMensal);
    return {
      real,
      brutoDepois,
      before,
      after,
      aumentoBruto,
      aumentoLiquido,
      // The new net, deflated to today's prices, against the old net.
      realMonthly: round2(after.liquidoMensal / (1 + infl) - before.liquidoMensal),
      neededBruto: round2(bruto * infl),
      estadoFica: round2(aumentoBruto - aumentoLiquido),
      estadoShare: aumentoBruto > 0 ? (aumentoBruto - aumentoLiquido) / aumentoBruto : 0,
    };
  }, [tax.data, bruto, raisePct, inflPct]);

  const money = (n: number) => eur(n, lang);
  const signed = (n: number) => `${n > 0 ? "+" : ""}${pct(n, lang)}`;
  const verdict =
    result === null ? null : Math.abs(result.real) < 0.0005 ? "flat" : result.real > 0 ? "gain" : "loss";
  const loading = tax.loading || econ.loading;

  return (
    <Shell crumbs={[{ href: "/lfp/economia", label: t.economia.hub.crumb }, { label: c.crumb }]}>
      <PageIntro eyebrow={c.eyebrow} title={c.title} lede={c.lede} />

      {tax.meta && (
        <div className="mb-6">
          <UnverifiedBanner datasets={tax.meta.datasets} missing={tax.meta.missing} />
        </div>
      )}
      {loading && <p className="py-16 text-center text-sm text-[var(--lfp-mist)]">{t.chrome.loading}</p>}
      {(tax.error || econ.error) && <p className="py-16 text-center text-sm text-[var(--lfp-vermelho)]">{t.chrome.loadError}</p>}

      {result && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:items-start">
          <form onSubmit={(e) => e.preventDefault()} className="lfp-panel space-y-5 p-5 lg:sticky lg:top-6" aria-label={c.formAria}>
            <NumberField label={c.fields.bruto} value={bruto} onChange={setBruto} min={0} max={100000} />
            <NumberField label={c.fields.raise} value={raisePct} onChange={setRaisePct} suffix="%" min={-50} max={200} step={0.5} hint={c.fields.raiseHint} />
            <NumberField
              label={c.fields.inflation}
              value={inflPct}
              onChange={setInflOverride}
              suffix="%"
              min={-20}
              max={100}
              step={0.1}
              hint={latest ? tr(c.fields.inflationHint, { year: latest.year, rate: pct(latest.rate, lang) }) : undefined}
            />
          </form>

          <div className="space-y-6">
            <div className="lfp-panel px-5 py-5 sm:px-6">
              <p className="lfp-eyebrow">
                {c.headline.eyebrow}
                {latest && <YearChip year={latest.year} />}
              </p>
              <p className={`lfp-display mt-2 text-5xl font-semibold sm:text-6xl ${verdict === "loss" ? "lfp-state" : verdict === "gain" ? "lfp-keep" : ""}`}>
                <span className="lfp-num">{signed(result.real)}</span>
              </p>
              <p role="status" className="mt-3 max-w-xl text-sm leading-relaxed">
                {verdict === "gain" ? c.verdict.gain : verdict === "loss" ? c.verdict.loss : c.verdict.flat}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[var(--lfp-line)] pt-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.nominal}</dt>
                  <dd className="lfp-num font-semibold">{signed(raisePct / 100)} · {money(result.aumentoBruto)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.realMonthly}</dt>
                  <dd className={`lfp-num font-semibold ${result.realMonthly < 0 ? "lfp-state" : "lfp-keep"}`}>{money(result.realMonthly)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.needed}</dt>
                  <dd className="lfp-num font-semibold">{pct(inflPct / 100, lang)} · {money(result.neededBruto)}</dd>
                </div>
              </dl>
            </div>

            <Ledger caption={c.ledger.caption}>
              <LedgerRow label={c.ledger.brutoAntes} value={money(bruto)} />
              <LedgerRow label={c.ledger.brutoDepois} value={money(result.brutoDepois)} />
              <LedgerRow label={c.ledger.liquidoAntes} value={money(result.before.liquidoMensal)} />
              <LedgerRow label={c.ledger.liquidoDepois} value={money(result.after.liquidoMensal)} />
              <LedgerRow label={c.ledger.aumentoLiquido} value={money(result.aumentoLiquido)} strong tone="keep" />
              <LedgerRow label={`${c.ledger.estadoFica} (${pct(result.estadoShare, lang)})`} value={money(result.estadoFica)} tone="state" />
            </Ledger>
            <p className="-mt-3 text-xs text-[var(--lfp-mist)]">{c.ledger.estadoFicaHint}</p>

            <Disclaimer notes={c.notes} />
            {econ.data?.inflation && <SourceBadge meta={econ.data.inflation.meta} />}
            {tax.data?.irs && <SourceBadge meta={tax.data.irs.meta} />}
          </div>
        </div>
      )}
    </Shell>
  );
}
