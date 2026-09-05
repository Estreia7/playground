"use client";

import { useMemo, useState } from "react";
import { custoEmpresa } from "../../calc";
import { fromCustoEmpresa } from "../../flow/adapters";
import { MoneyFlow } from "../../flow/MoneyFlow";
import { WedgeBar } from "../../flow/WedgeBar";
import { eur, eur0, pct } from "../../format";
import { tr } from "../../i18n";
import { Disclaimer, SourceBadge, UnverifiedBanner, YearChip } from "../../ui/DataHonesty";
import { ChoiceGroup, NumberField, Stepper, Toggle } from "../../ui/Inputs";
import { Ledger, LedgerRow } from "../../ui/Ledger";
import { PageIntro, Shell } from "../../ui/Shell";
import { useLfpData } from "../../useLfpData";
import { useLfpLang } from "../../useLfpLang";
import type { CustoEmpresaInput, FlowStream, FlowTone, SituacaoIrs } from "../../types";

const TONES: Record<string, FlowTone> = {
  liquido: "liquido",
  irs: "irs",
  tsu_trab: "tsu-trab",
  tsu_patronal: "tsu-patronal",
  seguro_at: "empresa",
  outros: "empresa",
};

export default function CustoTrabalhadorCalculator() {
  const { data, meta, loading, error } = useLfpData();
  const { t, lang } = useLfpLang();
  const c = t.empresarial.custo;
  const sal = t.calc.salario.fields;

  const [bruto, setBruto] = useState(1500);
  const [meses, setMeses] = useState<12 | 14>(14);
  const [situacao, setSituacao] = useState<SituacaoIrs>("nao_casado");
  const [dependentes, setDependentes] = useState(0);
  const [subAtivo, setSubAtivo] = useState(false);
  const [subValor, setSubValor] = useState(6);
  const [subMeio, setSubMeio] = useState<"dinheiro" | "cartao">("cartao");
  const [subDias, setSubDias] = useState(22);
  // Percent in the UI, fraction in the maths. null = "use the dataset default".
  const [seguroPct, setSeguroPct] = useState<number | null>(null);
  const [outros, setOutros] = useState(0);
  const [active, setActive] = useState<string | null>(null);

  const tsu = data?.tsu;
  const seguroDefault = tsu ? tsu.seguroAcidentesTrabalho.estimativaDefault * 100 : 1;
  const seguroEffective = seguroPct ?? seguroDefault;

  const input = useMemo<CustoEmpresaInput>(
    () => ({
      brutoMensal: bruto,
      meses,
      subsidioRefeicao: { ativo: subAtivo, valorDiario: subValor, meio: subMeio, diasMes: subDias },
      taxaSeguroAT: seguroEffective / 100,
      outrosCustosMensais: outros,
      trabalhador: { situacao, dependentes, regiao: "continente" },
    }),
    [bruto, meses, subAtivo, subValor, subMeio, subDias, seguroEffective, outros, situacao, dependentes]
  );

  const result = useMemo(
    () => (data?.irs && tsu ? custoEmpresa(input, { irs: data.irs, tsu }) : null),
    [data, tsu, input]
  );

  const flow = useMemo(
    () => (result ? fromCustoEmpresa(result, c.flowLabels) : null),
    [result, c]
  );

  // The wedge bar shows EVERY cost, including the third-party ones the flow
  // leaves out, so the bar always sums to the total.
  const wedgeStreams = useMemo<FlowStream[]>(
    () =>
      result
        ? result.breakdown
            .filter((b) => b.amount > 0)
            .map((b) => ({
              id: b.key,
              label: (c.flowLabels as Record<string, string>)[b.key] ?? b.key,
              amount: b.amount,
              direction: b.side === "estado" ? "toState" : "toPeople",
              tone: TONES[b.key] ?? "empresa",
            }))
        : [],
    [result, c]
  );

  const money = (n: number) => eur(n, lang);
  const money0 = (n: number) => eur0(n, lang);

  const regime = tsu
    ? (tsu.regimes.find((r) => r.id === tsu.defaultRegime) ?? tsu.regimes[0])
    : null;

  const estadoTotal = result
    ? result.breakdown.filter((b) => b.side === "estado").reduce((s, b) => s + b.amount, 0)
    : 0;
  const empresaTotal = result
    ? result.breakdown.filter((b) => b.side === "empresa").reduce((s, b) => s + b.amount, 0)
    : 0;

  return (
    <Shell crumbs={[{ href: "/lfp/empresarial", label: t.empresarial.hub.crumb }, { label: c.crumb }]}>
      <PageIntro
        eyebrow={c.eyebrow}
        title={tr(c.title, { amount: money0(bruto) })}
        lede={c.lede}
      />

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

      {result && flow && tsu && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:items-start">
          <form
            onSubmit={(e) => e.preventDefault()}
            className="lfp-panel space-y-5 p-5 lg:sticky lg:top-6"
            aria-label={c.formAria}
          >
            <NumberField label={c.fields.bruto} value={bruto} onChange={setBruto} min={0} max={100000} />

            <ChoiceGroup
              label={sal.meses}
              value={meses}
              onChange={setMeses}
              choices={[
                { value: 14, label: sal.meses14 },
                { value: 12, label: sal.meses12 },
              ]}
            />

            <ChoiceGroup
              label={sal.situacao}
              value={situacao}
              onChange={setSituacao}
              columns={1}
              choices={[
                { value: "nao_casado", label: sal.naoCasado },
                { value: "casado_dois_titulares", label: sal.casado2 },
              ]}
            />

            <Stepper label={sal.dependentes} value={dependentes} onChange={setDependentes} max={10} />

            <div className="space-y-4 border-t border-[var(--lfp-line)] pt-5">
              <Toggle label={sal.subToggle} checked={subAtivo} onChange={setSubAtivo} />
              {subAtivo && (
                <div className="space-y-4 pl-1">
                  <ChoiceGroup
                    label={sal.subMeio}
                    value={subMeio}
                    onChange={setSubMeio}
                    choices={[
                      { value: "cartao", label: sal.subCartao },
                      { value: "dinheiro", label: sal.subDinheiro },
                    ]}
                  />
                  <NumberField
                    label={sal.subValor}
                    value={subValor}
                    onChange={setSubValor}
                    min={0}
                    max={100}
                    step={0.05}
                  />
                  <Stepper label={sal.subDias} value={subDias} onChange={setSubDias} min={1} max={23} />
                </div>
              )}
            </div>

            <div className="space-y-4 border-t border-[var(--lfp-line)] pt-5">
              <NumberField
                label={c.fields.seguro}
                value={seguroEffective}
                onChange={setSeguroPct}
                suffix="%"
                min={0}
                max={10}
                step={0.1}
                hint={tr(c.fields.seguroHint, {
                  min: pct(tsu.seguroAcidentesTrabalho.estimativaMin, lang),
                  max: pct(tsu.seguroAcidentesTrabalho.estimativaMax, lang),
                })}
              />
              <NumberField
                label={c.fields.outros}
                value={outros}
                onChange={setOutros}
                min={0}
                max={100000}
                hint={c.fields.outrosHint}
              />
            </div>
          </form>

          <div className="space-y-6">
            <div className="lfp-panel px-5 py-5 sm:px-6">
              <p className="lfp-eyebrow">
                {c.headline.eyebrow}
                <YearChip year={tsu.meta.year} />
              </p>
              <p className="lfp-display mt-2 text-5xl font-semibold sm:text-6xl">
                <span className="lfp-num">{money(result.custoTotalMensal)}</span>
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.recebe}</dt>
                  <dd className="lfp-num lfp-keep font-semibold">{money(result.liquidoTrabalhador)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.fatia}</dt>
                  <dd className="lfp-num lfp-state font-semibold">
                    {money(result.wedge)}{" "}
                    <span className="font-normal text-[var(--lfp-mist)]">
                      ({pct(result.wedgePct, lang, 0)})
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.multiplicador}</dt>
                  <dd className="lfp-num font-semibold">
                    {tr(c.headline.multiplicadorValue, { amount: money(result.multiplicador) })}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.anual}</dt>
                  <dd className="lfp-num font-semibold">{money0(result.custoTotalAnual)}</dd>
                </div>
              </dl>
            </div>

            <div className="lfp-panel overflow-hidden">
              <div className="border-b border-[var(--lfp-line)] px-5 py-3">
                <h2 className="text-sm font-semibold">{c.flowTitle}</h2>
              </div>
              <div className="px-2 py-3 sm:px-5 sm:py-5">
                <MoneyFlow
                  hubLabel={t.chrome.flow.custoTotal}
                  origin={flow.origin}
                  destination={flow.destination}
                  streams={flow.streams}
                  baseline={flow.baseline}
                  activeStreamId={active}
                  onStreamHover={setActive}
                  formatAmount={money0}
                  ariaLabel={tr(c.flowAria, {
                    total: money0(result.custoTotalMensal),
                    liquido: money0(result.liquidoTrabalhador),
                    estado: money0(estadoTotal),
                    empresa: money0(empresaTotal),
                  })}
                />
              </div>
              <div className="border-t border-[var(--lfp-line)] px-5 py-4">
                <WedgeBar
                  streams={wedgeStreams}
                  baseline={result.custoTotalMensal}
                  activeStreamId={active}
                  onStreamHover={setActive}
                  formatAmount={money}
                />
              </div>
            </div>

            <Ledger caption={c.ledger.caption}>
              <LedgerRow label={c.ledger.bruto} value={money(result.brutoMensal)} strong />
              <LedgerRow
                label={tr(c.ledger.tsuPatronal, {
                  rate: pct(regime?.entidadePatronal ?? 0, lang),
                })}
                value={`+ ${money(result.tsuPatronal)}`}
                tone="state"
              />
              <LedgerRow label={c.ledger.seguro} value={`+ ${money(result.seguroAT)}`} />
              {result.subsidioRefeicaoCusto > 0 && (
                <LedgerRow label={c.ledger.subsidio} value={`+ ${money(result.subsidioRefeicaoCusto)}`} />
              )}
              {result.outrosCustos > 0 && (
                <LedgerRow label={c.ledger.outros} value={`+ ${money(result.outrosCustos)}`} />
              )}
              <LedgerRow label={c.ledger.total} value={money(result.custoTotalMensal)} strong />
              <LedgerRow label={c.ledger.liquido} value={money(result.liquidoTrabalhador)} tone="keep" />
              <LedgerRow label={c.ledger.fatia} value={money(result.wedge)} strong tone="state" />
            </Ledger>

            <Disclaimer notes={c.notes} />

            <div className="space-y-1.5">
              <SourceBadge meta={tsu.meta} />
              {data?.irs && <SourceBadge meta={data.irs.meta} />}
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
