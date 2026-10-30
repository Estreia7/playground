"use client";

import { useState } from "react";
import type { DealSides, DealType, DocRequirement } from "../core/types.ts";
import { SIDES_LABEL } from "../core/types.ts";
import { useReorg } from "../ui/App.tsx";
import { PageHeader } from "../ui/Shell.tsx";
import { Panel, numberText, parseNumber } from "../ui/parts.tsx";
import { MONTH_SHORT, money, percent } from "../ui/format.ts";
import { IconChevronLeft, IconChevronRight, IconPlus } from "../ui/Icons.tsx";

/* The rules the numbers follow: what each kind of deal pays the manager,
   which documents a deal needs, and the targets the dashboard measures
   against. Changing a type's % recalculates every invoice that does not
   carry its own. */

type Tab = "tipos" | "documentos" | "objetivos";

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("tipos");
  return (
    <>
      <PageHeader title="Configuração" sub="Tipos de comissão, documentos obrigatórios e objetivos" />
      <div className="rs-seg mb-4" role="tablist" aria-label="Secções">
        {(
          [
            ["tipos", "Tipos de comissão"],
            ["documentos", "Documentos"],
            ["objetivos", "Objetivos e histórico"],
          ] as const
        ).map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={tab === v} aria-pressed={tab === v} onClick={() => setTab(v)}>
            {l}
          </button>
        ))}
      </div>
      {tab === "tipos" && <DealTypes />}
      {tab === "documentos" && <Documents />}
      {tab === "objetivos" && <Targets />}
    </>
  );
}

function DealTypes() {
  const { db } = useReorg();
  const [editing, setEditing] = useState<DealType | "new" | null>(null);
  const used = (id: string) => db.deals.filter((d) => d.dealTypeId === id).length;
  return (
    <section className="rs-card">
      <div className="rs-card-head">
        <h2>Tipos de comissão</h2>
        <button type="button" className="rs-btn sm ml-auto" onClick={() => setEditing("new")}>
          <IconPlus size={15} />
          Tipo
        </button>
      </div>
      <div className="rs-table-wrap">
        <table className="rs-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Lados da equipa</th>
              <th className="right">% do manager</th>
              <th className="right">Negócios</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {db.dealTypes.map((t) => (
              <tr key={t.id}>
                <td className="font-semibold">{t.name}</td>
                <td>{SIDES_LABEL[t.sides]}</td>
                <td className="right num font-semibold">{percent(t.defaultManagerPct)}</td>
                <td className="right num">{used(t.id)}</td>
                <td>{t.active ? <span className="rs-pill jade">Ativo</span> : <span className="rs-pill">Inativo</span>}</td>
                <td className="right">
                  <button type="button" className="rs-btn ghost sm" onClick={() => setEditing(t)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 px-[18px] py-3 text-sm" style={{ color: "var(--muted)" }}>
        A % aplica-se ao valor sem IVA de cada fatura. Faturas com % própria (acordos especiais) não mudam.
      </p>
      {editing && <DealTypeForm type={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function DealTypeForm({ type, onClose }: { type?: DealType; onClose: () => void }) {
  const { dispatch, notify } = useReorg();
  const [name, setName] = useState(type?.name ?? "");
  const [sides, setSides] = useState<DealSides>(type?.sides ?? "both");
  const [pct, setPct] = useState(numberText(type?.defaultManagerPct ?? 1));
  const [active, setActive] = useState(type?.active ?? true);

  async function save() {
    const p = parseNumber(pct);
    if (!name.trim() || p == null) return notify("Indique o nome e a %.", true);
    if ((await dispatch({ type: "dealType.save", dealType: { id: type?.id, name, sides, defaultManagerPct: p, active } })).ok) {
      notify("Tipo de comissão guardado.");
      onClose();
    }
  }

  async function remove() {
    if (!type || !window.confirm(`Apagar o tipo ${type.name}?`)) return;
    if ((await dispatch({ type: "dealType.delete", id: type.id })).ok) {
      notify("Tipo apagado.");
      onClose();
    }
  }

  return (
    <Panel
      title={type ? type.name : "Novo tipo de comissão"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rs-btn primary" onClick={save}>
            Guardar tipo
          </button>
          <button type="button" className="rs-btn ghost" onClick={onClose}>
            Cancelar
          </button>
          {type && (
            <button type="button" className="rs-btn ghost danger ml-auto" onClick={remove}>
              Apagar
            </button>
          )}
        </>
      }
    >
      <label className="rs-field">
        Nome
        <input className="rs-input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="rs-field">
        Que lados são da equipa
        <select className="rs-select" value={sides} onChange={(e) => setSides(e.target.value as DealSides)}>
          {(Object.keys(SIDES_LABEL) as DealSides[]).map((s) => (
            <option key={s} value={s}>
              {SIDES_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="rs-field">
        % do manager sobre a fatura sem IVA
        <input className="rs-input num" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
        <span className="hint num">
          Numa fatura de 10 000 €, o manager recebe {money(((parseNumber(pct) ?? 0) * 10000) / 100)}.
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ accentColor: "var(--teal)", width: 18, height: 18 }} />
        Disponível em novos negócios
      </label>
    </Panel>
  );
}

function Documents() {
  const { db, dispatch } = useReorg();
  const [editing, setEditing] = useState<DocRequirement | "new" | null>(null);
  const reqs = [...db.docRequirements].sort((a, b) => a.order - b.order);

  const move = (i: number, dir: -1 | 1) => {
    const ids = reqs.map((r) => r.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void dispatch({ type: "docReq.reorder", ids });
  };

  return (
    <section className="rs-card">
      <div className="rs-card-head">
        <h2>Documentos de cada negócio</h2>
        <button type="button" className="rs-btn sm ml-auto" onClick={() => setEditing("new")}>
          <IconPlus size={15} />
          Documento
        </button>
      </div>
      <ul className="m-0 list-none p-0">
        {reqs.map((r, i) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 border-t px-[18px] py-3" style={{ borderColor: "var(--line)" }}>
            <div className="flex flex-col">
              <button type="button" className="rs-btn ghost sm" style={{ minHeight: 22, padding: "0 4px" }} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir ${r.name}`}>
                <IconChevronLeft size={14} className="rotate-90" />
              </button>
              <button type="button" className="rs-btn ghost sm" style={{ minHeight: 22, padding: "0 4px" }} onClick={() => move(i, 1)} disabled={i === reqs.length - 1} aria-label={`Descer ${r.name}`}>
                <IconChevronRight size={14} className="rotate-90" />
              </button>
            </div>
            <div className="min-w-48 flex-1">
              <div className="font-semibold">{r.name}</div>
              <div className="text-[12.5px]" style={{ color: "var(--muted)" }}>
                {r.appliesTo.length === 0
                  ? "Todos os tipos"
                  : r.appliesTo.map((id) => db.dealTypes.find((t) => t.id === id)?.name ?? id).join(", ")}
              </div>
            </div>
            <div className="rs-seg" role="group" aria-label={`${r.name}: obrigatório ou opcional`}>
              <button type="button" aria-pressed={r.required} onClick={() => dispatch({ type: "docReq.save", req: { ...r, required: true } })}>
                Obrigatório
              </button>
              <button type="button" aria-pressed={!r.required} onClick={() => dispatch({ type: "docReq.save", req: { ...r, required: false } })}>
                Opcional
              </button>
            </div>
            <button type="button" className="rs-btn ghost sm" onClick={() => setEditing(r)}>
              Editar
            </button>
          </li>
        ))}
      </ul>
      <p className="m-0 border-t px-[18px] py-3 text-sm" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
        Só os obrigatórios contam para a barra de progresso. Num negócio concreto, um documento pode ser marcado como não aplicável.
      </p>
      {editing && <DocForm req={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function DocForm({ req, onClose }: { req?: DocRequirement; onClose: () => void }) {
  const { db, dispatch, notify } = useReorg();
  const [name, setName] = useState(req?.name ?? "");
  const [required, setRequired] = useState(req?.required ?? true);
  const [appliesTo, setAppliesTo] = useState<string[]>(req?.appliesTo ?? []);

  async function save() {
    if (!name.trim()) return notify("Indique o nome do documento.", true);
    if ((await dispatch({ type: "docReq.save", req: { id: req?.id, name, required, appliesTo, order: req?.order ?? db.docRequirements.length } })).ok) {
      notify("Documento guardado.");
      onClose();
    }
  }

  async function remove() {
    if (!req || !window.confirm(`Deixar de pedir ${req.name}? Os ficheiros já carregados continuam guardados.`)) return;
    if ((await dispatch({ type: "docReq.delete", id: req.id })).ok) {
      notify("Documento removido da lista.");
      onClose();
    }
  }

  const toggle = (id: string) => setAppliesTo((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  return (
    <Panel
      title={req ? req.name : "Novo documento"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rs-btn primary" onClick={save}>
            Guardar documento
          </button>
          <button type="button" className="rs-btn ghost" onClick={onClose}>
            Cancelar
          </button>
          {req && (
            <button type="button" className="rs-btn ghost danger ml-auto" onClick={remove}>
              Remover
            </button>
          )}
        </>
      }
    >
      <label className="rs-field">
        Nome
        <input className="rs-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Licença de utilização" />
      </label>
      <div className="rs-field">
        Importância
        <div className="rs-seg" role="group" aria-label="Importância">
          <button type="button" aria-pressed={required} onClick={() => setRequired(true)}>
            Obrigatório
          </button>
          <button type="button" aria-pressed={!required} onClick={() => setRequired(false)}>
            Opcional
          </button>
        </div>
      </div>
      <fieldset className="rs-field m-0 border-0 p-0">
        <legend className="mb-1.5">Pedido nos tipos</legend>
        {db.dealTypes.map((t) => (
          <label key={t.id} className="flex items-center gap-2 py-1 text-sm font-medium">
            <input type="checkbox" checked={appliesTo.includes(t.id)} onChange={() => toggle(t.id)} style={{ accentColor: "var(--teal)", width: 17, height: 17 }} />
            {t.name}
          </label>
        ))}
        <span className="hint">Sem nenhum marcado, é pedido em todos os tipos.</span>
      </fieldset>
    </Panel>
  );
}

function Targets() {
  const { db, dispatch, notify } = useReorg();
  const years = [...new Set([...Object.keys(db.settings.targets), ...Object.keys(db.settings.dcReport), String(new Date().getFullYear())])].sort().reverse();
  const [year, setYear] = useState(years[0]);
  const [target, setTarget] = useState(numberText(db.settings.targets[year]));
  const [months, setMonths] = useState<string[]>(() => (db.settings.dcReport[year] ?? Array(12).fill(null)).map((v) => numberText(v ?? undefined)));
  const [manager, setManager] = useState(db.settings.managerName);
  const [opening, setOpening] = useState(numberText(db.settings.openingBalance));
  const [openingMonth, setOpeningMonth] = useState(db.settings.openingMonth);

  const pick = (y: string) => {
    setYear(y);
    setTarget(numberText(db.settings.targets[y]));
    setMonths((db.settings.dcReport[y] ?? Array(12).fill(null)).map((v) => numberText(v ?? undefined)));
  };

  async function save() {
    const t = parseNumber(target);
    const res = await dispatch({
      type: "settings.save",
      settings: {
        managerName: manager.trim() || db.settings.managerName,
        openingBalance: parseNumber(opening) ?? 0,
        openingMonth,
        targets: { ...db.settings.targets, ...(t != null ? { [year]: t } : {}) },
        dcReport: { ...db.settings.dcReport, [year]: months.map((m) => parseNumber(m) ?? null) },
      },
    });
    if (res.ok) notify("Objetivos guardados.");
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rs-card">
        <div className="rs-card-head">
          <h2>Faturação Report DC</h2>
          <select className="rs-select ml-auto" style={{ width: "auto", minHeight: 34 }} value={year} onChange={(e) => pick(e.target.value)} aria-label="Ano">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="rs-card-body flex flex-col gap-4">
          <label className="rs-field" style={{ maxWidth: 260 }}>
            Objetivo anual {year}
            <input className="rs-input num" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {MONTH_SHORT.map((m, i) => (
              <label key={m} className="rs-field capitalize">
                {m}
                <input
                  className="rs-input num"
                  inputMode="decimal"
                  value={months[i] ?? ""}
                  onChange={(e) => setMonths((all) => all.map((v, k) => (k === i ? e.target.value : v)))}
                />
              </label>
            ))}
          </div>
          <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
            Valores mensais reportados pela Direção Comercial. Deixe vazio o que ainda não fechou.
          </p>
        </div>
      </section>
      <section className="rs-card">
        <div className="rs-card-head">
          <h2>Conta corrente</h2>
        </div>
        <div className="rs-card-body flex flex-col gap-4">
          <label className="rs-field">
            Manager
            <input className="rs-input" value={manager} onChange={(e) => setManager(e.target.value)} />
          </label>
          <label className="rs-field">
            Saldo transitado
            <input className="rs-input num" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} />
          </label>
          <label className="rs-field">
            Transitado de
            <input className="rs-input" type="month" value={openingMonth} onChange={(e) => setOpeningMonth(e.target.value)} />
          </label>
        </div>
      </section>
      <div className="lg:col-span-2">
        <button type="button" className="rs-btn primary" onClick={save}>
          Guardar objetivos
        </button>
      </div>
    </div>
  );
}
