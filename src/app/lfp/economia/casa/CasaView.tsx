"use client";

import { useMemo, useState } from "react";
import { custoCasa } from "../../calc";
import { eur, eur0, num, pct } from "../../format";
import { tr } from "../../i18n";
import { Disclaimer, SourceBadge, UnverifiedBanner, YearChip } from "../../ui/DataHonesty";
import { ChoiceGroup, NumberField } from "../../ui/Inputs";
import { Ledger, LedgerRow } from "../../ui/Ledger";
import { PageIntro, Shell } from "../../ui/Shell";
import { useLfpData } from "../../useLfpData";
import { useLfpLang } from "../../useLfpLang";
import type { ImtFinalidade } from "../../types";

/** Tax values sit below prices as a rule; 70% is the default guess until
 *  the reader types the one on their caderneta predial. */
const VPT_RATIO = 0.7;

export default function CasaView() {
  const { data, meta, loading, error } = useLfpData();
  const { t, lang } = useLfpLang();
  const c = t.sec.casa;
  const hab = data?.habitacao;

  const [preco, setPreco] = useState(250000);
  const [entradaPct, setEntradaPct] = useState(10);
  const [prazo, setPrazo] = useState(30);
  const [taxaPct, setTaxaPct] = useState(3);
  const [finalidade, setFinalidade] = useState<ImtFinalidade>("hpp");
  const [vptOverride, setVptOverride] = useState<number | null>(null);
  const [imiOverride, setImiOverride] = useState<number | null>(null);

  const vpt = vptOverride ?? Math.round(preco * VPT_RATIO);
  const imiPct = imiOverride ?? (hab ? hab.imi.default * 100 : 0.3);

  const result = useMemo(
    () =>
      hab
        ? custoCasa(
            { preco, entradaPct: entradaPct / 100, prazoAnos: prazo, taxaJuro: taxaPct / 100, finalidade, regiao: "continente", vpt, taxaImi: imiPct / 100 },
            { habitacao: hab }
          )
        : null,
    [hab, preco, entradaPct, prazo, taxaPct, finalidade, vpt, imiPct]
  );

  const money = (n: number) => eur(n, lang);
  const money0 = (n: number) => eur0(n, lang);
  const imiMin = hab ? pct(hab.imi.min, lang, 1) : "";
  const imiMax = hab ? pct(hab.imi.max, lang, 2) : "";

  return (
    <Shell crumbs={[{ href: "/lfp/economia", label: t.economia.hub.crumb }, { label: c.crumb }]}>
      <PageIntro eyebrow={c.eyebrow} title={c.title} lede={c.lede} />

      {meta && (
        <div className="mb-6">
          <UnverifiedBanner datasets={meta.datasets} missing={meta.missing} />
        </div>
      )}
      {loading && <p className="py-16 text-center text-sm text-[var(--lfp-mist)]">{t.chrome.loading}</p>}
      {error && <p className="py-16 text-center text-sm text-[var(--lfp-vermelho)]">{t.chrome.loadError}</p>}

      {hab && result && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
          <form onSubmit={(e) => e.preventDefault()} className="lfp-panel space-y-5 p-5" aria-label={c.formAria}>
            <NumberField label={c.fields.preco} value={preco} onChange={setPreco} min={0} max={50000000} step={1000} />
            <NumberField label={c.fields.entrada} value={entradaPct} onChange={setEntradaPct} suffix="%" min={0} max={100} step={1} hint={c.fields.entradaHint} />
            <NumberField label={c.fields.prazo} value={prazo} onChange={(n) => setPrazo(Math.round(n))} suffix={c.fields.prazoUnit} min={1} max={40} />
            <NumberField label={c.fields.taxa} value={taxaPct} onChange={setTaxaPct} suffix="%" min={0} max={20} step={0.1} hint={c.fields.taxaHint} />
            <ChoiceGroup
              label={c.fields.finalidade}
              value={finalidade}
              onChange={setFinalidade}
              columns={1}
              choices={[
                { value: "hpp" as const, label: c.fields.hpp },
                { value: "hpp_jovem" as const, label: c.fields.jovem },
                { value: "outra" as const, label: c.fields.outra },
              ]}
            />
            <NumberField label={c.fields.vpt} value={vpt} onChange={setVptOverride} min={0} max={50000000} step={1000} hint={c.fields.vptHint} />
            <NumberField label={c.fields.imi} value={imiPct} onChange={setImiOverride} suffix="%" min={0} max={2} step={0.05} hint={tr(c.fields.imiHint, { min: imiMin, max: imiMax })} />
          </form>

          <div className="min-w-0 space-y-6">
            <div className="lfp-panel px-5 py-5 sm:px-6">
              <p className="lfp-eyebrow">
                {tr(c.headline.eyebrow, { anos: prazo })}
                <YearChip year={hab.meta.year} />
              </p>
              <p className="lfp-display mt-2 text-5xl font-semibold sm:text-6xl">
                <span className="lfp-num">{money0(result.custoTotal)}</span>
              </p>
              <p className="lfp-num mt-1 text-sm text-[var(--lfp-mist)]">{tr(c.headline.multiplier, { x: num(result.multiplicador, lang, 2) })}</p>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[var(--lfp-line)] pt-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.inicial}</dt>
                  <dd className="lfp-num font-semibold">{money0(result.totalInicial)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.prestacao}</dt>
                  <dd className="lfp-num font-semibold">{money(result.prestacao)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.tudo}</dt>
                  <dd className="lfp-num font-semibold">{money(result.custoMensalTudo)}</dd>
                </div>
              </dl>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Ledger caption={c.ledgerInicial.caption}>
                <LedgerRow label={c.ledgerInicial.entrada} value={money(result.entrada)} />
                <LedgerRow label={result.imt === 0 ? c.ledgerInicial.imtIsento : c.ledgerInicial.imt} value={money(result.imt)} tone="state" />
                <LedgerRow label={tr(c.ledgerInicial.seloCompra, { rate: pct(hab.seloCompra, lang) })} value={money(result.seloCompra)} tone="state" />
                {result.emprestimo > 0 && (
                  <LedgerRow label={tr(c.ledgerInicial.seloCredito, { rate: pct(hab.seloCredito, lang) })} value={money(result.seloCredito)} tone="state" />
                )}
                <LedgerRow label={c.ledgerInicial.registos} value={money(result.registos)} />
                {result.custosBanco > 0 && <LedgerRow label={c.ledgerInicial.banco} value={money(result.custosBanco)} />}
                <LedgerRow label={c.ledgerInicial.total} value={money(result.totalInicial)} strong />
              </Ledger>
              <Ledger caption={tr(c.ledgerTotal.caption, { anos: prazo })}>
                <LedgerRow label={c.ledgerTotal.preco} value={money(result.preco)} />
                <LedgerRow
                  label={c.ledgerTotal.impostos}
                  value={money(result.imt + result.seloCompra + result.seloCredito + result.registos + result.custosBanco)}
                  tone="state"
                />
                <LedgerRow label={c.ledgerTotal.juros} value={money(result.jurosTotais)} tone="state" />
                <LedgerRow
                  label={tr(c.ledgerTotal.imi, {
                    anos: prazo,
                    isento: result.imiIsencaoAnos > 0 ? tr(c.ledgerTotal.imiIsento, { n: result.imiIsencaoAnos }) : "",
                  })}
                  value={money(result.imiTotal)}
                  tone="state"
                />
                <LedgerRow label={c.ledgerTotal.total} value={money(result.custoTotal)} strong />
                <LedgerRow label={c.ledgerTotal.porMes} value={money(result.custoMensalTudo)} strong />
              </Ledger>
            </div>

            <aside className="lfp-tile p-5">
              <p className="lfp-eyebrow">{c.insight.title}</p>
              <p className="mt-2 text-sm leading-relaxed">{c.insight.text}</p>
            </aside>

            <Disclaimer
              notes={c.notes.map((n) =>
                tr(n, { vpt: money0(hab.imi.isencaoVptMax), min: money0(hab.custosBanco.estimativaMin), max: money0(hab.custosBanco.estimativaMax) })
              )}
            />
            <SourceBadge meta={hab.meta} />
          </div>
        </div>
      )}
    </Shell>
  );
}
