"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { MoneyFlow } from "./flow/MoneyFlow";
import { fromSalarioLiquido } from "./flow/adapters";
import { salarioLiquido } from "./calc";
import { eur0, pct } from "./format";
import { tr } from "./i18n";
import { useLfpData } from "./useLfpData";
import { useLfpLang } from "./useLfpLang";
import { UnverifiedBanner, YearChip } from "./ui/DataHonesty";
import { LangToggle } from "./ui/LangToggle";
import type { SalarioLiquidoInput } from "./types";

/** Preset salaries: minimum wage, roughly the national median, and two above.
 *  Concrete anchors beat an empty input box on a landing page. */
const PRESETS = [920, 1200, 1500, 2500];

const NO_SUB = {
  ativo: false,
  valorDiario: 0,
  meio: "cartao" as const,
  diasMes: 22,
};

/* Keyed by route rather than added to the dictionary: the illustration is
   decoration, and copy files should hold copy. Decorative, so alt="" —
   the door's own heading already names it. */
const DOOR_IMAGE: Record<string, string> = {
  "/lfp/individual": "/lfp/door-individual.webp",
  "/lfp/empresarial": "/lfp/door-empresarial.webp",
  "/lfp/economia": "/lfp/door-economia.webp",
};

export default function HomeView() {
  const { data, meta, loading, error } = useLfpData();
  const { t, lang } = useLfpLang();
  const h = t.chrome.home;
  const [bruto, setBruto] = useState(1500);
  const [active, setActive] = useState<string | null>(null);

  const result = useMemo(() => {
    if (!data?.irs || !data?.tsu) return null;
    const input: SalarioLiquidoInput = {
      brutoMensal: bruto,
      meses: 14,
      situacao: "nao_casado",
      dependentes: 0,
      regiao: "continente",
      subsidioRefeicao: NO_SUB,
    };
    return salarioLiquido(input, { irs: data.irs, tsu: data.tsu });
  }, [data, bruto]);

  const flow = useMemo(
    () => (result ? fromSalarioLiquido(result, t.chrome.flow) : null),
    [result, t]
  );

  const year = data?.irs?.meta.year;
  const money = (n: number) => eur0(n, lang);

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--lfp-line)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Link
            href="/lfp"
            className="lfp-focus -mx-2 inline-flex min-h-11 items-center gap-2 px-2"
          >
            <Image src="/lfp-icon-512.png" alt="" width={28} height={28} priority className="h-7 w-7 shrink-0" />
            <span className="lfp-display text-base font-semibold">LFP</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="lfp-eyebrow hidden md:inline">{t.chrome.nav.eyebrow}</span>
            <LangToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        {/* The one place the full logo has room to be itself. It sits beside
            the hero on wide screens and is dropped below `lg`, where the
            headline needs the whole width — decorative, so nothing is lost. */}
        <section className="grid items-center gap-8 pt-14 pb-4 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <p className="lfp-eyebrow mb-4">{h.eyebrow}</p>
            <h1 className="lfp-display max-w-3xl text-[2.5rem] font-semibold sm:text-6xl">
              {h.title}
            </h1>
            <p className="mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-[var(--lfp-mist)]">
              {h.lede}
            </p>
          </div>
          <Image
            src="/lfp-logo-600.png"
            alt=""
            width={220}
            height={220}
            priority
            className="hidden h-[220px] w-[220px] shrink-0 lg:block"
          />
        </section>

        {meta && (
          <div className="mt-6">
            <UnverifiedBanner datasets={meta.datasets} missing={meta.missing} />
          </div>
        )}

        {/* The signature: real money, from the real tables. */}
        <section className="mt-8" aria-labelledby="lfp-fluxo">
          <div className="lfp-panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--lfp-line)] px-5 py-3">
              <h2 id="lfp-fluxo" className="text-sm font-semibold">
                {tr(h.flowTitle, { amount: money(bruto) })}
                {year && <YearChip year={year} />}
              </h2>

              <div className="flex flex-wrap gap-1.5" role="group" aria-label={h.presetsLabel}>
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setBruto(p)}
                    aria-pressed={bruto === p}
                    className={`lfp-num lfp-focus lfp-press min-h-11 rounded-lg border px-3 text-sm transition-colors ${
                      bruto === p
                        ? "border-[var(--lfp-cobalt)] bg-[var(--lfp-cobalt)] text-[var(--lfp-cal-tile)]"
                        : "border-[var(--lfp-line)] text-[var(--lfp-mist)] hover:border-[var(--lfp-cobalt)]"
                    }`}
                  >
                    {money(p)}
                  </button>
                ))}
              </div>
            </div>

            {loading && (
              <p className="px-5 py-16 text-center text-sm text-[var(--lfp-mist)]">
                {t.chrome.loading}
              </p>
            )}

            {error && (
              <p className="px-5 py-16 text-center text-sm text-[var(--lfp-vermelho)]">
                {t.chrome.loadError}
              </p>
            )}

            {result && flow && (
              <>
                <div className="px-2 py-3 sm:px-5 sm:py-5">
                  <MoneyFlow
                    origin={flow.origin}
                    destination={flow.destination}
                    streams={flow.streams}
                    baseline={flow.baseline}
                    activeStreamId={active}
                    onStreamHover={setActive}
                    formatAmount={money}
                    ariaLabel={tr(h.flowAria, {
                      bruto: money(bruto),
                      liquido: money(result.liquidoMensal),
                      irs: money(result.irsRetido),
                      tsu: money(result.tsuTrabalhador),
                    })}
                  />
                </div>

                {/* The same figures as text — identical data for screen-reader
                    and sighted users, and it survives with motion disabled. */}
                <table className="w-full border-t border-[var(--lfp-line)] text-sm">
                  <caption className="sr-only">
                    {tr(h.tableCaption, { amount: money(bruto) })}
                  </caption>
                  <thead>
                    <tr className="border-b border-[var(--lfp-line)]">
                      <th scope="col" className="lfp-eyebrow px-5 py-2 text-left font-normal">
                        {h.colDestino}
                      </th>
                      <th scope="col" className="lfp-eyebrow px-5 py-2 text-right font-normal">
                        {h.colValor}
                      </th>
                      <th
                        scope="col"
                        className="lfp-eyebrow w-20 px-5 py-2 text-right font-normal"
                      >
                        {h.colPeso}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {flow.streams.map((s) => (
                      <tr
                        key={s.id}
                        onPointerEnter={() => setActive(s.id)}
                        onPointerLeave={() => setActive(null)}
                        className="border-b border-[var(--lfp-line)] transition-colors last:border-0 hover:bg-[var(--lfp-cobalt-faint)]"
                      >
                        <th scope="row" className="px-5 py-2.5 text-left font-medium">
                          <span
                            aria-hidden="true"
                            className="mr-2.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
                            style={{ background: `var(--lfp-tone-${s.tone})` }}
                          />
                          {s.label}
                        </th>
                        <td className="lfp-num whitespace-nowrap px-5 py-2.5 text-right font-semibold">
                          {money(s.amount)}
                        </td>
                        <td className="lfp-num w-20 px-5 py-2.5 text-right text-[var(--lfp-mist)]">
                          {pct(s.amount / flow.baseline, lang, 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <p className="border-t border-[var(--lfp-line)] px-5 py-3 text-xs leading-relaxed text-[var(--lfp-mist)]">
                  {h.assumptions}{" "}
                  <Link
                    href="/lfp/individual/salario-liquido"
                    className="lfp-focus inline-flex min-h-11 items-center font-medium text-[var(--lfp-cobalt)] underline underline-offset-2"
                  >
                    {h.calcYours}
                  </Link>
                </p>
              </>
            )}
          </div>
        </section>

        <section className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {h.doors.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              className="lfp-tile lfp-focus lfp-press group overflow-hidden transition-colors hover:border-[var(--lfp-cobalt)]"
            >
              {DOOR_IMAGE[d.href] && (
                <Image
                  src={DOOR_IMAGE[d.href]}
                  alt=""
                  width={1200}
                  height={800}
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="h-44 w-full border-b border-[var(--lfp-line)] object-cover object-[center_35%] transition-transform duration-500 group-hover:scale-[1.03]"
                />
              )}
              <div className="p-6">
              <p className="lfp-eyebrow">{d.eyebrow}</p>
              <h2 className="lfp-display mt-2 text-2xl font-semibold">{d.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--lfp-mist)]">{d.body}</p>
              <ul className="mt-4 space-y-1.5">
                {d.items.map((it) => (
                  <li key={it} className="flex items-center gap-2 text-sm">
                    <span
                      aria-hidden="true"
                      className="h-1 w-1 rounded-full bg-[var(--lfp-cobalt)]"
                    />
                    {it}
                  </li>
                ))}
              </ul>
              </div>
            </Link>
          ))}
        </section>

        <section className="mt-4 mb-16">
          <Link
            href="/lfp/quiz"
            className="lfp-tile lfp-focus lfp-press group flex flex-wrap items-center justify-between gap-4 overflow-hidden p-6 transition-colors hover:border-[var(--lfp-cobalt)] sm:flex-nowrap sm:py-0 sm:pr-0"
          >
            <div className="sm:py-6">
              <p className="lfp-eyebrow">{h.quizEyebrow}</p>
              <h2 className="lfp-display mt-1 text-2xl font-semibold">{h.quizTitle}</h2>
              <p className="mt-1.5 text-sm text-[var(--lfp-mist)]">{h.quizBody}</p>
            </div>
            <span className="lfp-num shrink-0 rounded-full border border-[var(--lfp-cobalt)] px-4 py-2 text-sm font-semibold text-[var(--lfp-cobalt)] sm:ml-auto">
              {h.quizCta}
            </span>
            {/* Hidden on small screens: below `sm` the card stacks and the
                illustration would push the call to action off the fold. */}
            <Image
              src="/lfp/quiz.webp"
              alt=""
              width={1200}
              height={800}
              sizes="240px"
              className="hidden h-32 w-60 shrink-0 self-stretch border-l border-[var(--lfp-line)] object-cover transition-transform duration-500 group-hover:scale-[1.03] sm:block sm:h-auto"
            />
          </Link>
        </section>
      </main>

      <footer className="border-t border-[var(--lfp-line)]">
        <div className="mx-auto max-w-6xl px-6 py-5 text-xs leading-relaxed text-[var(--lfp-mist)]">
          {t.chrome.footer.lead}{" "}
          <strong className="font-semibold">{t.chrome.footer.noLegal}</strong>{" "}
          {t.chrome.footer.tail}{" "}
          <Link
            href="/lfp/sobre"
            className="lfp-focus inline-flex min-h-11 items-center font-medium text-[var(--lfp-cobalt)] underline underline-offset-2"
          >
            {t.chrome.footer.sources}
          </Link>
        </div>
      </footer>
    </div>
  );
}
