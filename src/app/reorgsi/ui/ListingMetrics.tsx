"use client";

import Link from "next/link";
import { useMemo } from "react";
import { goalCoverage, idleListers, listingConversion, listingTrend, planPace } from "../core/listings.ts";
import { useReorg } from "./App.tsx";
import { Bars, Legend } from "./charts.tsx";
import { MONTH_SHORT, money0, monthName, percent } from "./format.ts";
import { Avatar } from "./parts.tsx";
import { signed } from "./stats.tsx";

/* How the team is taking listings: the year against the last, each person
   against their Business Plan, who has stopped, how many turn into sales, and
   whether the portfolio covers what is left of the goals. */

const count = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 1 });

export function ListingMetrics({ year, plenoRatio }: { year: string; plenoRatio: number }) {
  const { db } = useReorg();
  const prevYear = String(Number(year) - 1);
  const trend = useMemo(() => listingTrend(db, year), [db, year]);
  const pace = useMemo(() => planPace(db, year), [db, year]);
  const idle = useMemo(() => idleListers(db, year), [db, year]);
  const conversion = useMemo(() => listingConversion(db, year), [db, year]);
  const coverage = useMemo(() => goalCoverage(db, year, plenoRatio), [db, year, plenoRatio]);
  const through = trend.upTo >= 0 ? MONTH_SHORT[trend.upTo] : null;

  return (
    <>
      <div className="mb-4 grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="rs-card" aria-labelledby="lt-h">
          <div className="rs-card-head flex-wrap">
            <h2 id="lt-h">Angariações por mês</h2>
            <span className="aside">
              <Legend
                items={[
                  { color: "#a9d4bb", label: prevYear },
                  { color: "#345b63", label: year },
                ]}
              />
            </span>
          </div>
          <div className="rs-card-body">
            {through && (
              <p className="m-0 mb-2 text-sm">
                <strong className="num">{trend.toDate}</strong> até {through}, contra <strong className="num">{trend.prevToDate}</strong> em {prevYear}
                {trend.change != null && (
                  <span className="num font-bold" style={{ color: trend.change >= 0 ? "#2f7a57" : "var(--amber)" }}>
                    {" "}
                    ({signed(trend.change)})
                  </span>
                )}
              </p>
            )}
            <Bars
              labels={MONTH_SHORT}
              series={[
                { name: prevYear, color: "#a9d4bb", values: trend.prevMonths },
                { name: year, color: "#345b63", values: trend.months },
              ]}
              plain
              ariaLabel={`Angariações da equipa por mês em ${year}, com ${prevYear} ao lado`}
            />
          </div>
        </section>
        <div className="flex flex-col gap-4">
          <section className="rs-card flex-1" aria-labelledby="lc-h">
            <div className="rs-card-head">
              <h2 id="lc-h">Conversão em vendas</h2>
              <span className="aside">{year}</span>
            </div>
            <div className="rs-card-body">
              <p className="rs-figure num">{conversion.rate == null ? "—" : percent(conversion.rate * 100, 0)}</p>
              <p className="m-0 mt-1 text-sm">
                {conversion.sold} vendas para {conversion.listed} angariações
              </p>
              <p className="m-0 mt-2 text-[12.5px]" style={{ color: "var(--muted)" }}>
                Indicativo: uma venda pode vir de uma angariação de um ano anterior.
              </p>
            </div>
          </section>
          <section className="rs-card flex-1" aria-labelledby="lg-h">
            <div className="rs-card-head">
              <h2 id="lg-h">Cobertura do objetivo</h2>
              <span className="aside">{year}</span>
            </div>
            <div className="rs-card-body">
              <p className="rs-figure num">{coverage.ratio == null ? "—" : percent(coverage.ratio * 100, 0)}</p>
              <p className="m-0 mt-1 text-sm">
                <span className="num">{money0(coverage.expected)}</span> esperados de <span className="num">{money0(coverage.missing)}</span> em falta
              </p>
              <p className="m-0 mt-2 text-[12.5px]" style={{ color: "var(--muted)" }}>
                {coverage.expected
                  ? `Comissão esperada da carteira ativa, face ao que falta a ${coverage.people} ${coverage.people === 1 ? "consultor" : "consultores"} para o objetivo.`
                  : "Sobe à medida que se registam angariações com valor."}
              </p>
            </div>
          </section>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="rs-card" aria-labelledby="lp-h">
          <div className="rs-card-head flex-wrap">
            <h2 id="lp-h">Ritmo do Business Plan</h2>
            <span className="aside num">
              {pace.done} de {pace.target}
            </span>
          </div>
          <div className="rs-card-body">
            {pace.rows.length ? (
              <>
                <p className="m-0 mb-3 text-[12.5px]" style={{ color: "var(--muted)" }}>
                  {through ? `A marca é onde devia estar um ritmo constante até ${through}: ${count(pace.due)} no total.` : "Objetivos de angariações do ano."}
                </p>
                <ol className="rs-pace">
                  {pace.rows.map((r) => {
                    const gap = r.done - r.due;
                    const scale = Math.max(r.target, r.done);
                    return (
                      <li key={r.consultant.id}>
                        <Link className="row-link truncate" href={`/reorgsi/consultores/${r.consultant.id}`}>
                          {r.consultant.name}
                        </Link>
                        <span className="fig num">
                          <strong>{r.done}</strong> de {r.target} ·{" "}
                          <span className={gap >= 0 ? "ahead" : "behind"}>{gap >= 0 ? "no ritmo" : `faltam ${count(-gap)}`}</span>
                        </span>
                        <span className="track" aria-hidden="true">
                          <span style={{ width: `${(r.done / scale) * 100}%` }} />
                          <span className="due" style={{ left: `${(r.due / scale) * 100}%` }} />
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </>
            ) : (
              <p className="rs-empty m-0">Sem objetivos de angariações para {year}.</p>
            )}
          </div>
        </section>
        <section className="rs-card" aria-labelledby="li-h">
          <div className="rs-card-head">
            <h2 id="li-h">Sem angariar há 3 meses</h2>
            <span className="aside num">{idle.length}</span>
          </div>
          <div className="rs-card-body">
            {idle.length ? (
              <ul className="rs-idle">
                {idle.map(({ consultant: c, last }) => (
                  <li key={c.id}>
                    <Link href={`/reorgsi/consultores/${c.id}`}>
                      <Avatar consultant={c} size={28} />
                      <span className="min-w-0">
                        <span className="block truncate">{c.name}</span>
                        <span className="when">{last ? `Última em ${monthName(last).toLowerCase()}` : `Sem angariações desde ${prevYear}`}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rs-empty m-0">Todos angariaram nos últimos 3 meses.</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
