"use client";

import { useMemo, useState } from "react";
import { iva } from "../../calc";
import { fromIva } from "../../flow/adapters";
import { ExplainerSection } from "../../explainers/ExplainerLayout";
import { MoneyFlow } from "../../flow/MoneyFlow";
import { eur, num, pct } from "../../format";
import { tr } from "../../i18n";
import { Disclaimer, SourceBadge, UnverifiedBanner, YearChip } from "../../ui/DataHonesty";
import { ChoiceGroup, NumberField } from "../../ui/Inputs";
import { PageIntro, Shell } from "../../ui/Shell";
import { useLfpData } from "../../useLfpData";
import { useLfpLang } from "../../useLfpLang";
import type { IvaTipo, Regiao } from "../../types";

const REGIOES: Regiao[] = ["continente", "madeira", "acores"];
const TIPOS: IvaTipo[] = ["reduzida", "intermedia", "normal"];

export default function IvaTool() {
  const { data, meta, loading, error } = useLfpData();
  const { t, lang } = useLfpLang();
  const v = t.empresarial.iva;

  // One {amount, mode} pair, so the two price fields can never disagree:
  // whichever one was typed into is the source of truth.
  const [amount, setAmount] = useState(100);
  const [mode, setMode] = useState<"semIva" | "comIva">("semIva");
  const [tipo, setTipo] = useState<IvaTipo>("normal");
  const [regiao, setRegiao] = useState<Regiao>("continente");
  const [active, setActive] = useState<string | null>(null);

  const ivaData = data?.iva;

  const result = useMemo(
    () => (ivaData ? iva({ amount, mode, tipo, regiao }, { iva: ivaData }) : null),
    [ivaData, amount, mode, tipo, regiao]
  );

  const flow = useMemo(() => (result ? fromIva(result, v.flowLabels) : null), [result, v]);

  const money = (n: number) => eur(n, lang);
  const regiaoName = t.empresarial.regioes[regiao];
  const tipoName = (k: IvaTipo) => v.fields[k];

  return (
    <Shell crumbs={[{ href: "/lfp/empresarial", label: t.empresarial.hub.crumb }, { label: v.crumb }]}>
      <PageIntro eyebrow={v.eyebrow} title={v.title} lede={v.lede} />

      {meta && (
        <div className="mb-6">
          <UnverifiedBanner datasets={meta.datasets} missing={meta.missing} />
        </div>
      )}

      {loading && (
        <p className="py-16 text-center text-sm text-[var(--lfp-mist)]">{t.chrome.loading}</p>
      )}
      {error && (
        <p className="py-16 text-center text-sm text-[var(--lfp-vermelho)]">{t.chrome.loadError}</p>
      )}

      {result && flow && ivaData && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:items-start">
          <form
            onSubmit={(e) => e.preventDefault()}
            className="lfp-panel space-y-5 p-5 lg:sticky lg:top-6"
            aria-label={v.formAria}
          >
            <NumberField
              label={v.fields.semIva}
              value={result.semIva}
              onChange={(n) => {
                setMode("semIva");
                setAmount(n);
              }}
              min={0}
              max={10000000}
              step={0.01}
            />
            <NumberField
              label={v.fields.comIva}
              value={result.comIva}
              onChange={(n) => {
                setMode("comIva");
                setAmount(n);
              }}
              min={0}
              max={10000000}
              step={0.01}
            />

            <ChoiceGroup
              label={v.fields.tipo}
              value={tipo}
              onChange={setTipo}
              columns={1}
              choices={TIPOS.map((k) => ({
                value: k,
                label: `${tipoName(k)} · ${pct(ivaData.rates[regiao][k], lang, 0)}`,
              }))}
            />

            <ChoiceGroup
              label={v.fields.regiao}
              value={regiao}
              onChange={setRegiao}
              choices={REGIOES.map((r) => ({ value: r, label: t.empresarial.regioes[r] }))}
            />
          </form>

          <div className="space-y-6">
            <div className="lfp-panel px-5 py-5 sm:px-6">
              <p className="lfp-eyebrow">
                {v.headline.eyebrow}
                <YearChip year={ivaData.meta.year} />
              </p>
              <p className="lfp-display lfp-state mt-2 text-5xl font-semibold sm:text-6xl">
                <span className="lfp-num">{money(result.iva)}</span>
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-[var(--lfp-mist)]">{v.headline.peso}</dt>
                  <dd className="lfp-num font-semibold">
                    {tr(v.headline.pesoValue, { amount: money(result.pesoIvaNoPreco * 100) })}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{v.headline.taxa}</dt>
                  <dd className="lfp-num font-semibold">
                    {pct(result.taxa, lang, 0)} · {tipoName(tipo)} · {regiaoName}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="lfp-panel overflow-hidden">
              <div className="border-b border-[var(--lfp-line)] px-5 py-3">
                <h2 className="text-sm font-semibold">{v.flowTitle}</h2>
              </div>
              <div className="px-2 py-3 sm:px-5 sm:py-5">
                <MoneyFlow
                  hubLabel={t.chrome.flow.precoComIva}
                  origin={flow.origin}
                  destination={flow.destination}
                  streams={flow.streams}
                  baseline={flow.baseline}
                  activeStreamId={active}
                  onStreamHover={setActive}
                  formatAmount={money}
                  ariaLabel={tr(v.flowAria, {
                    total: money(result.comIva),
                    preco: money(result.semIva),
                    iva: money(result.iva),
                  })}
                />
              </div>
            </div>

            <ExplainerSection
              id="como-funciona"
              heading={v.howItWorks.heading}
              blocks={v.howItWorks.blocks}
            />

            {/* The mistake, with this purchase's own numbers — it lands
                harder than an abstract warning. */}
            <div className="lfp-tile p-5">
              <p className="lfp-eyebrow">{v.mistake.title}</p>
              <p className="mt-2 text-sm leading-relaxed">
                {tr(v.mistake.body, {
                  divisor: num(1 + result.taxa, lang, 2),
                  wrongFactor: num(1 - result.taxa, lang, 2),
                })}
              </p>
              <dl className="lfp-num mt-3 space-y-1.5 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <dt className="lfp-state">
                    {tr(v.mistake.wrong, {
                      gross: money(result.comIva),
                      wrongFactor: num(1 - result.taxa, lang, 2),
                      wrongResult: money(result.comIva * (1 - result.taxa)),
                    })}
                  </dt>
                  <dd className="lfp-eyebrow text-[var(--lfp-vermelho)]">{v.mistake.wrongLabel}</dd>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <dt className="lfp-keep">
                    {tr(v.mistake.right, {
                      gross: money(result.comIva),
                      divisor: num(1 + result.taxa, lang, 2),
                      rightResult: money(result.semIva),
                    })}
                  </dt>
                  <dd className="lfp-eyebrow text-[var(--lfp-verde)]">{v.mistake.rightLabel}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-[var(--lfp-mist)]">
                {tr(v.mistake.why, {
                  wrongFactor: num(1 - result.taxa, lang, 2),
                  rate: pct(result.taxa, lang, 0),
                })}
              </p>
            </div>

            {/* The three rates for the chosen region, with what falls under each. */}
            <div className="lfp-panel p-5">
              <h2 className="text-sm font-semibold">{tr(v.ratesTitle, { regiao: regiaoName })}</h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-3">
                {TIPOS.map((k) => {
                  const on = k === tipo;
                  const examples = ivaData.examples.filter((e) => e.tipo === k);
                  return (
                    <li key={k}>
                      <button
                        type="button"
                        onClick={() => setTipo(k)}
                        aria-pressed={on}
                        className={`lfp-focus lfp-press w-full rounded-lg border p-3 text-left transition-colors ${
                          on
                            ? "border-[var(--lfp-cobalt)] bg-[var(--lfp-cobalt-faint)]"
                            : "border-[var(--lfp-line)] hover:border-[var(--lfp-cobalt)]"
                        }`}
                      >
                        <p className="lfp-eyebrow">{tipoName(k)}</p>
                        <p className="lfp-num mt-1 text-2xl font-semibold">
                          {pct(ivaData.rates[regiao][k], lang, 0)}
                        </p>
                        <p className="mt-1.5 text-xs leading-relaxed text-[var(--lfp-mist)]">
                          {examples
                            .map((e) => (v.examples as Record<string, string>)[e.key] ?? e.key)
                            .join(" · ")}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <Disclaimer notes={v.notes} />
            <SourceBadge meta={ivaData.meta} />
          </div>
        </div>
      )}
    </Shell>
  );
}
