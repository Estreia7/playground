"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { salarioLiquido } from "../../calc";
import { fromSalarioLiquido } from "../../flow/adapters";
import { MoneyFlow } from "../../flow/MoneyFlow";
import { WedgeBar } from "../../flow/WedgeBar";
import { eur, eur0, pct } from "../../format";
import { tr } from "../../i18n";
import { Disclaimer, SourceBadge, UnverifiedBanner, YearChip } from "../../ui/DataHonesty";
import { ChoiceGroup, NumberField, Stepper, Toggle } from "../../ui/Inputs";
import { PageIntro, Shell } from "../../ui/Shell";
import { useLfpData } from "../../useLfpData";
import { useLfpLang } from "../../useLfpLang";
import type { SalarioLiquidoInput, SituacaoIrs } from "../../types";

export default function SalarioLiquidoCalculator() {
  const { data, meta, loading, error } = useLfpData();
  const { t, lang } = useLfpLang();
  const s = t.calc.salario;

  const [bruto, setBruto] = useState(1500);
  const [meses, setMeses] = useState<12 | 14>(14);
  const [situacao, setSituacao] = useState<SituacaoIrs>("nao_casado");
  const [dependentes, setDependentes] = useState(0);
  const [subAtivo, setSubAtivo] = useState(false);
  const [subValor, setSubValor] = useState(6);
  const [subMeio, setSubMeio] = useState<"dinheiro" | "cartao">("cartao");
  const [subDias, setSubDias] = useState(22);
  const [active, setActive] = useState<string | null>(null);

  const input = useMemo<SalarioLiquidoInput>(
    () => ({
      brutoMensal: bruto,
      meses,
      situacao,
      dependentes,
      regiao: "continente",
      subsidioRefeicao: { ativo: subAtivo, valorDiario: subValor, meio: subMeio, diasMes: subDias },
    }),
    [bruto, meses, situacao, dependentes, subAtivo, subValor, subMeio, subDias]
  );

  const result = useMemo(
    () => (data?.irs && data?.tsu ? salarioLiquido(input, { irs: data.irs, tsu: data.tsu }) : null),
    [data, input]
  );

  const flow = useMemo(
    () => (result ? fromSalarioLiquido(result, t.chrome.flow) : null),
    [result, t]
  );

  const irsMeta = data?.irs?.meta;
  const tsuMeta = data?.tsu?.meta;
  // Captured once so the narrowing survives into the .find() callback.
  const tsu = data?.tsu;
  const tsuRate = tsu
    ? (tsu.regimes.find((r) => r.id === tsu.defaultRegime) ?? tsu.regimes[0])?.trabalhador ??
      null
    : null;
  const ceiling = tsu
    ? subMeio === "cartao"
      ? tsu.subsidioRefeicao.cartao
      : tsu.subsidioRefeicao.dinheiro
    : null;

  const money = (n: number) => eur(n, lang);
  const money0 = (n: number) => eur0(n, lang);

  return (
    <Shell crumbs={[{ href: "/lfp/individual", label: t.chrome.individual.crumb }, { label: s.crumb }]}>
      <PageIntro eyebrow={s.eyebrow} title={s.title} lede={s.lede} />

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

      {result && flow && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:items-start">
          {/* ── Inputs ─────────────────────────────────── */}
          <form
            onSubmit={(e) => e.preventDefault()}
            className="lfp-panel space-y-5 p-5 lg:sticky lg:top-6"
            aria-label={s.formAria}
          >
            <NumberField
              label={s.fields.bruto}
              value={bruto}
              onChange={setBruto}
              min={0}
              max={100000}
              hint={s.fields.brutoHint}
            />

            <ChoiceGroup
              label={s.fields.meses}
              value={meses}
              onChange={setMeses}
              choices={[
                { value: 14, label: s.fields.meses14 },
                { value: 12, label: s.fields.meses12 },
              ]}
            />

            <ChoiceGroup
              label={s.fields.situacao}
              value={situacao}
              onChange={setSituacao}
              columns={1}
              choices={[
                { value: "nao_casado", label: s.fields.naoCasado },
                { value: "casado_dois_titulares", label: s.fields.casado2 },
              ]}
            />

            <Stepper
              label={s.fields.dependentes}
              value={dependentes}
              onChange={setDependentes}
              max={10}
              hint={s.fields.dependentesHint}
            />

            <div className="space-y-4 border-t border-[var(--lfp-line)] pt-5">
              <Toggle label={s.fields.subToggle} checked={subAtivo} onChange={setSubAtivo} />
              {subAtivo && (
                <div className="space-y-4 pl-1">
                  <ChoiceGroup
                    label={s.fields.subMeio}
                    value={subMeio}
                    onChange={setSubMeio}
                    choices={[
                      { value: "cartao", label: s.fields.subCartao },
                      { value: "dinheiro", label: s.fields.subDinheiro },
                    ]}
                  />
                  <NumberField
                    label={s.fields.subValor}
                    value={subValor}
                    onChange={setSubValor}
                    min={0}
                    max={100}
                    step={0.05}
                    hint={
                      ceiling !== null
                        ? tr(s.fields.subValorHint, { amount: money(ceiling) })
                        : undefined
                    }
                  />
                  <Stepper
                    label={s.fields.subDias}
                    value={subDias}
                    onChange={setSubDias}
                    min={1}
                    max={23}
                  />
                </div>
              )}
            </div>
          </form>

          {/* ── Results ────────────────────────────────── */}
          <div className="space-y-6">
            {/* Headline */}
            <div className="lfp-panel px-5 py-5 sm:px-6">
              <p className="lfp-eyebrow">
                {s.headline.eyebrow}
                {irsMeta && <YearChip year={irsMeta.year} />}
              </p>
              <p className="lfp-display lfp-keep mt-2 text-5xl font-semibold sm:text-6xl">
                <span className="lfp-num">{money(result.liquidoMensal)}</span>
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-[var(--lfp-mist)]">{s.headline.porAno}</dt>
                  <dd className="lfp-num font-semibold">{money0(result.liquidoAnual)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{s.headline.estado}</dt>
                  <dd className="lfp-num lfp-state font-semibold">
                    {money(result.totalEntregueAoEstado)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{s.headline.taxaEfetiva}</dt>
                  <dd className="lfp-num font-semibold">{pct(result.taxaEfetivaIrs, lang)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{s.headline.taxaMarginal}</dt>
                  <dd className="lfp-num font-semibold">
                    {result.escalaoAplicado
                      ? pct(result.escalaoAplicado.taxaMarginalMaxima, lang)
                      : "—"}
                  </dd>
                </div>
              </dl>
            </div>

            {result.avisos.length > 0 && (
              <ul className="space-y-2" aria-label={s.avisosAria}>
                {result.avisos.map((a) => (
                  <li
                    key={a}
                    role="status"
                    className="rounded-lg border border-[var(--lfp-ouro)] bg-[var(--lfp-ouro-dim)] px-4 py-2.5 text-sm"
                  >
                    {(s.avisos as Record<string, string>)[a] ?? a}
                  </li>
                ))}
              </ul>
            )}

            {/* The flow */}
            <div className="lfp-panel overflow-hidden">
              <div className="border-b border-[var(--lfp-line)] px-5 py-3">
                <h2 className="text-sm font-semibold">{s.flowTitle}</h2>
              </div>
              <div className="px-2 py-3 sm:px-5 sm:py-5">
                <MoneyFlow
                  origin={flow.origin}
                  destination={flow.destination}
                  streams={flow.streams}
                  baseline={flow.baseline}
                  activeStreamId={active}
                  onStreamHover={setActive}
                  formatAmount={money0}
                  ariaLabel={tr(s.flowAria, {
                    bruto: money0(flow.baseline),
                    liquido: money0(result.liquidoMensal),
                    irs: money0(result.irsRetido),
                    tsu: money0(result.tsuTrabalhador),
                  })}
                />
              </div>
              <div className="border-t border-[var(--lfp-line)] px-5 py-4">
                <WedgeBar
                  streams={flow.streams}
                  baseline={flow.baseline}
                  activeStreamId={active}
                  onStreamHover={setActive}
                  formatAmount={money}
                />
              </div>
            </div>

            {/* The ledger — every figure, as text */}
            <div className="lfp-panel overflow-hidden">
              <table className="w-full text-sm">
                <caption className="border-b border-[var(--lfp-line)] px-5 py-3 text-left text-sm font-semibold">
                  {s.ledger.caption}
                </caption>
                <tbody>
                  <Row label={s.ledger.bruto} value={money(result.brutoMensal)} strong />
                  {subAtivo && (
                    <>
                      <Row
                        label={s.ledger.subIsento}
                        value={`+ ${money(result.subsidioRefeicaoIsento)}`}
                        tone="keep"
                      />
                      {result.subsidioRefeicaoTributado > 0 && (
                        <Row
                          label={s.ledger.subTributado}
                          value={`+ ${money(result.subsidioRefeicaoTributado)}`}
                        />
                      )}
                    </>
                  )}
                  {/* The rate comes from the dataset, not a literal — a
                      hardcoded "11%" would quietly lie the day it changes. */}
                  <Row
                    label={
                      tsuRate !== null
                        ? tr(s.ledger.tsu, { rate: pct(tsuRate, lang, 0) })
                        : s.ledger.tsuPlain
                    }
                    value={`− ${money(result.tsuTrabalhador)}`}
                    tone="state"
                  />
                  <Row
                    label={
                      result.escalaoAplicado
                        ? tr(s.ledger.irs, {
                            rate: pct(result.escalaoAplicado.taxaMarginalMaxima, lang),
                          })
                        : s.ledger.irsPlain
                    }
                    value={`− ${money(result.irsRetido)}`}
                    tone="state"
                  />
                  <Row label={s.ledger.liquido} value={money(result.liquidoMensal)} strong tone="keep" />
                  <Row
                    label={tr(s.ledger.anual, { n: meses })}
                    value={money0(result.liquidoAnual)}
                  />
                </tbody>
              </table>
            </div>

            <Disclaimer notes={s.notes} />

            <div className="space-y-1.5">
              {irsMeta && <SourceBadge meta={irsMeta} />}
              {tsuMeta && <SourceBadge meta={tsuMeta} />}
            </div>

            <p className="text-sm text-[var(--lfp-mist)]">
              {s.readMore}{" "}
              <Link
                href="/lfp/individual/irs"
                className="lfp-focus inline-flex min-h-11 items-center font-medium text-[var(--lfp-cobalt)] underline underline-offset-2"
              >
                {s.readMoreLink}
              </Link>
            </p>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "keep" | "state";
}) {
  const color = tone === "keep" ? "lfp-keep" : tone === "state" ? "lfp-state" : "";
  return (
    <tr className="border-b border-[var(--lfp-line)] last:border-0">
      <th
        scope="row"
        className={`px-5 py-2.5 text-left ${strong ? "font-semibold" : "font-normal text-[var(--lfp-mist)]"}`}
      >
        {label}
      </th>
      {/* Value cells never wrap: the sign must stay with the amount. */}
      <td className={`lfp-num whitespace-nowrap px-5 py-2.5 text-right ${strong ? "font-semibold" : ""} ${color}`}>
        {value}
      </td>
    </tr>
  );
}
