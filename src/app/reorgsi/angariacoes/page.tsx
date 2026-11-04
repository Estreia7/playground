"use client";

import Link from "next/link";
import { useMemo } from "react";
import { DEFAULT_COMMISSION_PCT } from "../core/types.ts";
import { PARTILHA_SHARE, expected, listingRows, listingSaleMix } from "../core/listings.ts";
import { useReorg } from "../ui/App.tsx";
import { PageHeader } from "../ui/Shell.tsx";
import { useUrlState } from "../ui/nav.tsx";
import { Avatar } from "../ui/parts.tsx";
import { Kpi, Mix } from "../ui/stats.tsx";
import { money0, percent } from "../ui/format.ts";

/* Angariações: how many properties each consultant has taken on, at what
   commission, and what they could bring once sold. Still being built: the
   list of listings comes next; for now every consultant starts at zero. */

const NOW = new Date().getFullYear();
const YEARS = [String(NOW - 1), String(NOW)];

type Scenario = "media" | "metade";

export default function ListingsPage() {
  const { db } = useReorg();
  const [scenario, setScenario] = useUrlState<Scenario>("cenario", "media");
  const mix = useMemo(() => listingSaleMix(db, YEARS), [db]);
  const ratio = scenario === "metade" ? 0.5 : mix.plenoRatio;

  const rows = useMemo(() => {
    const name = (id: string) => db.consultants.find((c) => c.id === id)?.name ?? "";
    return listingRows(db).sort((a, b) => b.count - a.count || name(a.consultantId).localeCompare(name(b.consultantId), "pt"));
  }, [db]);

  const totals = rows.reduce(
    (s, r) => ({ count: s.count + r.count, portfolio: s.portfolio + r.portfolio, ifPleno: s.ifPleno + r.ifPleno, ifPartilha: s.ifPartilha + r.ifPartilha }),
    { count: 0, portfolio: 0, ifPleno: 0, ifPartilha: 0 },
  );
  const sold = mix.plenos + mix.partilhas;

  return (
    <>
      <PageHeader
        title="Angariações"
        sub={
          <>
            <span className="rs-pill amber">Em construção</span> {totals.count} angariações ativas · {rows.length} consultores
          </>
        }
      />

      <div className="rs-kpis">
        <Kpi label="Potencial esperado" value={money0(expected(totals, ratio))} count={expected(totals, ratio)} format={money0} hero>
          <span className="text-[12.5px]" style={{ color: "#9fc0b9" }}>
            {scenario === "metade" ? "Metade plenos, metade partilhas" : `Com a média de ${YEARS.join(" e ")}`}
          </span>
        </Kpi>
        <Kpi label="Angariações ativas" value={String(totals.count)} count={totals.count} format={(n) => String(Math.round(n))}>
          <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
            {money0(totals.portfolio)} em carteira
          </span>
        </Kpi>
        <Kpi label="Se forem todas plenos" value={money0(totals.ifPleno)}>
          <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
            Comissão inteira
          </span>
        </Kpi>
        <Kpi label="Se forem todas partilhas" value={money0(totals.ifPartilha)}>
          <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
            {Math.round(PARTILHA_SHARE * 100)}% da comissão
          </span>
        </Kpi>
      </div>

      <section className="rs-card mb-4" aria-labelledby="mix-h">
        <div className="rs-card-head">
          <h2 id="mix-h">Como vendem as nossas angariações</h2>
          <span className="aside">{YEARS.join(" e ")}</span>
        </div>
        <div className="rs-card-body grid grid-cols-[minmax(0,1fr)] items-center gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <p className="m-0 mb-3 text-sm" style={{ color: "var(--ink-2)" }}>
              {sold ? (
                <>
                  Das <strong className="num">{sold}</strong> vendas com angariação da equipa, <strong className="num">{percent(mix.plenoRatio * 100, 0)}</strong> foram plenos e{" "}
                  <strong className="num">{percent((1 - mix.plenoRatio) * 100, 0)}</strong> partilhas.
                </>
              ) : (
                `Ainda sem vendas com angariação da equipa em ${YEARS.join(" e ")}: a média fica em 50/50.`
              )}
            </p>
            <Mix
              parts={[
                { label: "Plenos", value: mix.plenos, color: "#345b63" },
                { label: "Partilhas", value: mix.partilhas, color: "#a9d4bb" },
              ]}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold" style={{ color: "var(--muted)" }}>
              Cenário do potencial
            </span>
            <div className="rs-seg" role="group" aria-label="Cenário do potencial">
              <button type="button" aria-pressed={scenario === "media"} onClick={() => setScenario("media")}>
                Média {YEARS.join("–")}
              </button>
              <button type="button" aria-pressed={scenario === "metade"} onClick={() => setScenario("metade")}>
                50 / 50
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rs-card" aria-labelledby="ls-h">
        <div className="rs-card-head">
          <h2 id="ls-h">Por consultor</h2>
          <span className="aside">Comissão de {DEFAULT_COMMISSION_PCT}% quando a angariação não indica outra</span>
        </div>
        <div className="rs-table-wrap">
          <table className="rs-table">
            <thead>
              <tr>
                <th>Consultor</th>
                <th className="right">Angariações</th>
                <th className="right">Carteira</th>
                <th className="right">% comissão</th>
                <th className="right">Se plenos</th>
                <th className="right">Se partilhas</th>
                <th className="right">Esperado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const c = db.consultants.find((x) => x.id === r.consultantId);
                return (
                  <tr key={r.consultantId} style={r.count === 0 ? { color: "var(--muted)" } : undefined}>
                    <td data-label="Consultor">
                      <div className="flex items-center gap-2.5">
                        <Avatar consultant={c} size={28} />
                        <Link className="row-link" href={`/reorgsi/consultores/${r.consultantId}`}>
                          {c?.name}
                        </Link>
                      </div>
                    </td>
                    <td className="right num" data-label="Angariações">
                      {r.count}
                    </td>
                    <td className="right num" data-label="Carteira">
                      {money0(r.portfolio)}
                    </td>
                    <td className="right num" data-label="% comissão">
                      {percent(r.avgPct)}
                    </td>
                    <td className="right num" data-label="Se plenos">
                      {money0(r.ifPleno)}
                    </td>
                    <td className="right num" data-label="Se partilhas">
                      {money0(r.ifPartilha)}
                    </td>
                    <td className="right num font-semibold" data-label="Esperado">
                      {money0(expected(r, ratio))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="m-0 border-t px-[18px] py-3 text-[12.5px]" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
          Pleno: a equipa traz também o comprador e fica com a comissão inteira. Partilha: o comprador vem de outra agência e fica{" "}
          {Math.round(PARTILHA_SHARE * 100)}% para quem angariou. O esperado pesa os dois pelo cenário escolhido. O registo das angariações
          chega no próximo passo.
        </p>
      </section>
    </>
  );
}
