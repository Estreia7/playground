"use client";

import { useMemo, useState } from "react";
import { irc } from "../../calc";
import { fromIrc } from "../../flow/adapters";
import { MoneyFlow } from "../../flow/MoneyFlow";
import { WedgeBar } from "../../flow/WedgeBar";
import { eur, eur0, pct } from "../../format";
import { tr } from "../../i18n";
import { Disclaimer, SourceBadge, UnverifiedBanner, YearChip } from "../../ui/DataHonesty";
import { NumberField, Toggle } from "../../ui/Inputs";
import { Ledger, LedgerRow } from "../../ui/Ledger";
import { PageIntro, Shell } from "../../ui/Shell";
import { useLfpData } from "../../useLfpData";
import { useLfpLang } from "../../useLfpLang";
import type { IrcInput } from "../../types";

export default function IrcTool() {
  const { data, meta, loading, error } = useLfpData();
  const { t, lang } = useLfpLang();
  const r = t.empresarial.irc;

  const [lucro, setLucro] = useState(100000);
  const [isPme, setIsPme] = useState(true);
  // Percent in the UI, fraction in the maths. null = dataset default.
  const [derramaPct, setDerramaPct] = useState<number | null>(null);
  const [aplicarEstadual, setAplicarEstadual] = useState(true);
  const [active, setActive] = useState<string | null>(null);

  const ircData = data?.irc;
  const derramaDefault = ircData ? ircData.derramaMunicipal.default * 100 : 1.5;
  const derramaMax = ircData ? ircData.derramaMunicipal.max * 100 : 1.5;
  const derramaEffective = derramaPct ?? derramaDefault;

  const input = useMemo<IrcInput>(
    () => ({
      lucroTributavel: lucro,
      isPme,
      derramaMunicipalRate: derramaEffective / 100,
      aplicarDerramaEstadual: aplicarEstadual,
    }),
    [lucro, isPme, derramaEffective, aplicarEstadual]
  );

  const result = useMemo(() => (ircData ? irc(input, { irc: ircData }) : null), [ircData, input]);
  const flow = useMemo(() => (result ? fromIrc(result, r.flowLabels) : null), [result, r]);

  const money = (n: number) => eur(n, lang);
  const money0 = (n: number) => eur0(n, lang);
  const line = (key: string) => result?.breakdown.find((b) => b.key === key);

  const threshold = ircData?.derramaEstadual[0]?.from ?? 0;

  return (
    <Shell crumbs={[{ href: "/lfp/empresarial", label: t.empresarial.hub.crumb }, { label: r.crumb }]}>
      <PageIntro eyebrow={r.eyebrow} title={r.title} lede={r.lede} />

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

      {result && flow && ircData && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:items-start">
          <form
            onSubmit={(e) => e.preventDefault()}
            className="lfp-panel space-y-5 p-5 lg:sticky lg:top-6"
            aria-label={r.formAria}
          >
            <NumberField
              label={r.fields.lucro}
              value={lucro}
              onChange={setLucro}
              min={0}
              max={1000000000}
              hint={r.fields.lucroHint}
            />

            <Toggle label={r.fields.pme} checked={isPme} onChange={setIsPme} hint={r.fields.pmeHint} />

            <NumberField
              label={r.fields.derramaMunicipal}
              value={derramaEffective}
              onChange={setDerramaPct}
              suffix="%"
              min={0}
              max={derramaMax}
              step={0.1}
              hint={tr(r.fields.derramaMunicipalHint, {
                max: pct(ircData.derramaMunicipal.max, lang),
              })}
            />

            <Toggle
              label={r.fields.derramaEstadual}
              checked={aplicarEstadual}
              onChange={setAplicarEstadual}
              hint={tr(r.fields.derramaEstadualHint, { threshold: money0(threshold) })}
            />
          </form>

          <div className="space-y-6">
            <div className="lfp-panel px-5 py-5 sm:px-6">
              <p className="lfp-eyebrow">
                {r.headline.eyebrow}
                <YearChip year={ircData.meta.year} />
              </p>
              <p className="lfp-display lfp-state mt-2 text-5xl font-semibold sm:text-6xl">
                <span className="lfp-num">{money(result.totalImposto)}</span>
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-[var(--lfp-mist)]">{r.headline.efetiva}</dt>
                  <dd className="lfp-num font-semibold">{pct(result.taxaEfetiva, lang)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{r.headline.liquido}</dt>
                  <dd className="lfp-num lfp-keep font-semibold">{money(result.lucroLiquido)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{r.headline.geral}</dt>
                  <dd className="lfp-num font-semibold">{pct(ircData.taxaGeral, lang, 0)}</dd>
                </div>
              </dl>
            </div>

            <div className="lfp-panel overflow-hidden">
              <div className="border-b border-[var(--lfp-line)] px-5 py-3">
                <h2 className="text-sm font-semibold">{r.flowTitle}</h2>
              </div>
              <div className="px-2 py-3 sm:px-5 sm:py-5">
                <MoneyFlow
                  hubLabel={t.chrome.flow.lucroTributavel}
                  origin={flow.origin}
                  destination={flow.destination}
                  streams={flow.streams}
                  baseline={flow.baseline}
                  activeStreamId={active}
                  onStreamHover={setActive}
                  formatAmount={money0}
                  ariaLabel={tr(r.flowAria, {
                    lucro: money0(result.lucroTributavel),
                    liquido: money0(result.lucroLiquido),
                    irc: money0(result.coletaIrc),
                    derrama: money0(result.derramaMunicipal + result.derramaEstadual),
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

            <Ledger caption={r.ledger.caption}>
              <LedgerRow label={r.ledger.lucro} value={money(result.lucroTributavel)} strong />
              {isPme && (line("irc_tranche_reduzida")?.amount ?? 0) > 0 && (
                <LedgerRow
                  label={tr(r.ledger.trancheReduzida, {
                    rate: pct(line("irc_tranche_reduzida")!.rate, lang, 0),
                    base: money0(line("irc_tranche_reduzida")!.base),
                  })}
                  value={`− ${money(result.coletaTrancheReduzida)}`}
                  tone="state"
                />
              )}
              {(line("irc_geral")?.base ?? 0) > 0 && (
                <LedgerRow
                  label={tr(r.ledger.geral, {
                    rate: pct(line("irc_geral")!.rate, lang, 0),
                    base: money0(line("irc_geral")!.base),
                  })}
                  value={`− ${money(result.coletaRestante)}`}
                  tone="state"
                />
              )}
              <LedgerRow
                label={tr(r.ledger.derramaMunicipal, {
                  rate: pct(line("derrama_municipal")?.rate ?? 0, lang),
                })}
                value={`− ${money(result.derramaMunicipal)}`}
                tone="state"
              />
              {aplicarEstadual && (
                <LedgerRow
                  label={r.ledger.derramaEstadual}
                  value={`− ${money(result.derramaEstadual)}`}
                  tone="state"
                />
              )}
              <LedgerRow label={r.ledger.total} value={money(result.totalImposto)} strong tone="state" />
              <LedgerRow label={r.ledger.liquido} value={money(result.lucroLiquido)} strong tone="keep" />
            </Ledger>

            <Disclaimer notes={r.notes} />
            <SourceBadge meta={ircData.meta} />
          </div>
        </div>
      )}
    </Shell>
  );
}
