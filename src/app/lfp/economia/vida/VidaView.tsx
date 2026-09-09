"use client";

import { useMemo, useState } from "react";
import { LineChart } from "../../charts/LineChart";
import { projectLife } from "../../econ";
import { eur, eur0, num } from "../../format";
import { tr } from "../../i18n";
import { Disclaimer, SourceBadge, UnverifiedBanner, YearChip } from "../../ui/DataHonesty";
import { NumberField } from "../../ui/Inputs";
import { PageIntro, Shell } from "../../ui/Shell";
import { useLfpData } from "../../useLfpData";
import { useLfpLang } from "../../useLfpLang";

const END_AGE = 85;

export default function VidaView() {
  const { data, meta, loading, error } = useLfpData();
  const { t, lang } = useLfpLang();
  const c = t.sec.vida;
  const ref = data?.reforma;

  const [idade, setIdade] = useState(30);
  const [liquido, setLiquido] = useState(1200);
  const [crescimento, setCrescimento] = useState(1);
  const [inflacao, setInflacao] = useState(2);
  const [poupanca, setPoupanca] = useState(100);
  const [rendimento, setRendimento] = useState(3);
  const [pensaoPct, setPensaoPct] = useState(70);

  const idadeReforma = ref ? ref.idadeNormal.anos + ref.idadeNormal.meses / 12 : 66.75;
  const idadeReformaLabel = ref
    ? ref.idadeNormal.meses > 0
      ? `${ref.idadeNormal.anos}${lang === "pt" ? " anos e " : "y "}${ref.idadeNormal.meses}${lang === "pt" ? " meses" : "m"}`
      : `${ref.idadeNormal.anos}`
    : "";

  const result = useMemo(
    () =>
      projectLife({
        idade,
        liquidoMensal: liquido,
        crescimentoReal: crescimento / 100,
        inflacao: inflacao / 100,
        poupancaMensal: poupanca,
        rendimentoPoupanca: rendimento / 100,
        idadeReforma,
        pensaoPct: pensaoPct / 100,
        idadeFinal: Math.max(END_AGE, idade),
      }),
    [idade, liquido, crescimento, inflacao, poupanca, rendimento, idadeReforma, pensaoPct]
  );

  const money = (n: number) => eur(n, lang);
  const money0 = (n: number) => eur0(n, lang);
  const retireAge = Math.ceil(idadeReforma);
  const first = result.series[0];
  const lastWorking = result.series[Math.max(0, result.anosAteReforma - 1)];
  const notRetiredYet = idade < idadeReforma;

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

      {ref && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:items-start">
          <form onSubmit={(e) => e.preventDefault()} className="lfp-panel space-y-5 p-5" aria-label={c.formAria}>
            <NumberField label={c.fields.idade} value={idade} onChange={(n) => setIdade(Math.round(n))} suffix={c.fields.idadeUnit} min={16} max={80} />
            <NumberField label={c.fields.liquido} value={liquido} onChange={setLiquido} min={0} max={100000} />
            <NumberField label={c.fields.crescimento} value={crescimento} onChange={setCrescimento} suffix="%" min={-5} max={10} step={0.5} hint={c.fields.crescimentoHint} />
            <NumberField label={c.fields.inflacao} value={inflacao} onChange={setInflacao} suffix="%" min={0} max={20} step={0.5} hint={c.fields.inflacaoHint} />
            <NumberField label={c.fields.poupanca} value={poupanca} onChange={setPoupanca} min={0} max={100000} step={10} />
            <NumberField label={c.fields.rendimento} value={rendimento} onChange={setRendimento} suffix="%" min={0} max={20} step={0.5} hint={c.fields.rendimentoHint} />
            <NumberField label={c.fields.pensao} value={pensaoPct} onChange={setPensaoPct} suffix="%" min={0} max={100} step={5} hint={c.fields.pensaoHint} />
          </form>

          <div className="min-w-0 space-y-6">
            <div className="lfp-panel px-5 py-5 sm:px-6">
              <p className="lfp-eyebrow">
                {tr(c.headline.eyebrow, { idade: idadeReformaLabel, anos: result.anosAteReforma })}
                <YearChip year={ref.meta.year} />
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.ultimo}</dt>
                  <dd className="lfp-num lfp-display text-2xl font-semibold">{money0(result.ultimoLiquidoNominal)}</dd>
                  <dd className="lfp-num text-xs text-[var(--lfp-mist)]">{money0(result.ultimoLiquidoReal)} {c.headline.ultimoReal}</dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.pensao}</dt>
                  <dd className="lfp-num lfp-display text-2xl font-semibold">{money0(result.pensaoNominal)}</dd>
                  <dd className="lfp-num text-xs text-[var(--lfp-mist)]">{money0(result.pensaoReal)} {c.headline.ultimoReal}</dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.gap}</dt>
                  <dd className={`lfp-num lfp-display text-2xl font-semibold ${result.gapMensalReal > 0 ? "lfp-state" : "lfp-keep"}`}>{money0(result.gapMensalReal)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.poupanca}</dt>
                  <dd className="lfp-num lfp-display text-2xl font-semibold lfp-keep">{money0(result.poupancaReal)}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[var(--lfp-mist)]">{c.headline.cobre}</dt>
                  <dd className="lfp-num lfp-display text-2xl font-semibold">
                    {result.anosCobertos === null ? c.headline.cobreNone : tr(c.headline.cobreYears, { n: num(result.anosCobertos, lang, 1) })}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="lfp-panel overflow-hidden">
              <div className="border-b border-[var(--lfp-line)] px-5 py-3">
                <h2 className="text-sm font-semibold">{tr(c.chartTitle, { from: idade, to: Math.max(END_AGE, idade) })}</h2>
              </div>
              <div className="px-2 py-3 sm:px-4">
                <LineChart
                  series={[
                    { id: "real", label: c.seriesReal, tone: "cobalt", points: result.series.map((p) => ({ x: p.idade, y: p.incomeReal })) },
                    { id: "nominal", label: c.seriesNominal, tone: "irs", dashed: true, points: result.series.map((p) => ({ x: p.idade, y: p.incomeNominal })) },
                    { id: "savings", label: c.seriesSavings, tone: "liquido", points: result.series.map((p) => ({ x: p.idade, y: p.savingsReal / 12 })) },
                  ]}
                  formatX={(x) => String(x)}
                  formatY={(y) => money0(Math.abs(y) < 0.5 ? 0 : y)}
                  highlightX={notRetiredYet ? retireAge : undefined}
                  ariaLabel={tr(c.chartAria, {
                    from: idade,
                    to: Math.max(END_AGE, idade),
                    start: money0(first.incomeReal),
                    end: money0(lastWorking.incomeReal),
                    pension: money0(result.pensaoReal),
                    savings: money0(result.poupancaReal),
                  })}
                />
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-1 border-t border-[var(--lfp-line)] px-5 py-3 text-xs text-[var(--lfp-mist)]">
                <li className="flex items-center gap-2"><span aria-hidden="true" className="h-0.5 w-5 bg-[var(--lfp-cobalt)]" />{c.seriesReal}</li>
                <li className="flex items-center gap-2"><span aria-hidden="true" className="h-0.5 w-5 border-t-2 border-dashed border-[var(--lfp-tone-irs)]" />{c.seriesNominal}</li>
                <li className="flex items-center gap-2"><span aria-hidden="true" className="h-0.5 w-5 bg-[var(--lfp-tone-liquido)]" />{c.seriesSavings} ÷ 12</li>
              </ul>
            </div>

            <Disclaimer notes={c.notes.map((n) => tr(n, { year: ref.meta.year, idade: idadeReformaLabel }))} />
            <SourceBadge meta={ref.meta} />
          </div>
        </div>
      )}
    </Shell>
  );
}
