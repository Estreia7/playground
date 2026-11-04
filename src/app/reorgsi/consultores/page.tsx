"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Consultant, ConsultantStatus } from "../core/types.ts";
import { STATUS_LABEL, prizesOf } from "../core/types.ts";
import { billedIn } from "../core/billing.ts";
import { billingByConsultant, dealCountByConsultant, dealMixByConsultant, growth } from "../core/commission.ts";
import { useReorg } from "../ui/App.tsx";
import { PageHeader } from "../ui/Shell.tsx";
import { useUrlState } from "../ui/nav.tsx";
import { Avatar, PrizeChip } from "../ui/parts.tsx";
import { date, money, percent } from "../ui/format.ts";
import { IconPlus } from "../ui/Icons.tsx";
import { ConsultantForm } from "../ui/ConsultantForm.tsx";

/* The team: who is in it, in which stage, and what they billed. This year's
   billing comes from the deals; earlier years from the team sheet. */

const YEAR = String(new Date().getFullYear());
const PREV = String(Number(YEAR) - 1);

function StatusPill({ status }: { status: ConsultantStatus }) {
  const tone = status === "experiente" ? "jade" : status === "rookie" ? "teal" : "";
  return <span className={`rs-pill ${tone}`}>{STATUS_LABEL[status]}</span>;
}

export default function ConsultantsPage() {
  const { db } = useReorg();
  const [filter, setFilter] = useUrlState<"" | ConsultantStatus>("estado", "");
  const [editing, setEditing] = useState<Consultant | "new" | null>(null);

  const billing = useMemo(() => billingByConsultant(db, YEAR), [db]);
  const deals = useMemo(() => dealCountByConsultant(db), [db]);
  const mix = useMemo(() => dealMixByConsultant(db), [db]);

  const rows = db.consultants
    .filter((c) => (filter ? c.status === filter : c.status !== "inativo"))
    .map((c) => {
      const now = billing.get(c.id) ?? 0;
      const prev = billedIn(c, PREV);
      return { c, now, prev, g: growth(now, prev) };
    })
    .sort((a, b) => b.now - a.now || a.c.name.localeCompare(b.c.name, "pt"));

  const counts = {
    rookie: db.consultants.filter((c) => c.status === "rookie").length,
    experiente: db.consultants.filter((c) => c.status === "experiente").length,
    inativo: db.consultants.filter((c) => c.status === "inativo").length,
  };

  return (
    <>
      <PageHeader
        title="Consultores"
        sub={`${counts.experiente} experientes · ${counts.rookie} rookies · ${counts.inativo} inativos`}
        actions={
          <button type="button" className="rs-btn primary" onClick={() => setEditing("new")}>
            <IconPlus size={17} />
            Novo consultor
          </button>
        }
      />
      <section className="rs-card">
        <div className="rs-filters">
          <div className="rs-seg" role="group" aria-label="Estado">
            {(
              [
                ["", "Ativos"],
                ["experiente", "Experientes"],
                ["rookie", "Rookies"],
                ["inativo", "Inativos"],
              ] as const
            ).map(([v, l]) => (
              <button key={l} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="rs-table-wrap">
          <table className="rs-table">
            <thead>
              <tr>
                <th>Consultor</th>
                <th>Estado</th>
                <th>Entrada</th>
                <th className="right">Negócios</th>
                <th className="right" title="Plenos: as duas partes do negócio. Partilhas: só uma parte. CB: processos bancários.">
                  Plenos / Partilhas
                </th>
                <th className="right">Faturação {PREV}</th>
                <th className="right">Faturação {YEAR}</th>
                <th className="right">Crescimento</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, now, prev, g }) => (
                <tr key={c.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <Avatar consultant={c} size={32} />
                      <Link className="row-link" href={`/reorgsi/consultores/${c.id}`}>
                        {c.name}
                      </Link>
                      {prizesOf(c).map((p) => (
                        <PrizeChip key={p.name + p.year} prize={p} />
                      ))}
                    </div>
                  </td>
                  <td>
                    <StatusPill status={c.status} />
                  </td>
                  <td className="num">{date(c.joinedAt)}</td>
                  <td className="right num">
                    {deals.get(c.id) ? (
                      <Link className="rs-link" href={`/reorgsi/negocios?mes=&consultor=${c.id}`}>
                        {deals.get(c.id)}
                      </Link>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="right num">
                    {mixLabel(mix.get(c.id))}
                  </td>
                  <td className="right num">{prev ? money(prev, 0) : "—"}</td>
                  <td className="right num font-semibold">{now ? money(now, 0) : "—"}</td>
                  <td className="right num" style={{ color: g == null ? "var(--faint)" : g >= 0 ? "#2f7a57" : "var(--amber)" }}>
                    {g == null ? "—" : (g >= 0 ? "+" : "") + percent(g * 100, 0)}
                  </td>
                  <td className="right">
                    <button type="button" className="rs-btn ghost sm" onClick={() => setEditing(c)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="rs-empty">Ninguém com este estado.</div>}
        </div>
      </section>
      {editing && <ConsultantForm consultant={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function mixLabel(m: { plenos: number; partilhas: number; bancarios: number } | undefined): string {
  if (!m) return "—";
  return `${m.plenos} / ${m.partilhas}${m.bancarios ? ` · ${m.bancarios} CB` : ""}`;
}
