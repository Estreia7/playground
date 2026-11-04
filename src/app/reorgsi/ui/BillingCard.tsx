"use client";

import { useMemo, useState } from "react";
import type { Consultant } from "../core/types.ts";
import { billedUpTo, goalPace, monthsOf } from "../core/billing.ts";
import { activityYears } from "../core/analytics.ts";
import { useReorg } from "./App.tsx";
import { Bars, LegendToggle, type Series } from "./charts.tsx";
import { MONTH_SHORT, money0, monthName, percent } from "./format.ts";
import { numberText, parseNumber } from "./parts.tsx";
import { IconClose } from "./Icons.tsx";

/* Monthly billing of one consultant: every year side by side, the goal spread
   over the months still to come, and the place where the figures are changed.
   Clicking a year in the legend hides it; clicking a month opens that month
   across the years. */

const GOAL = "objetivo";
const GOAL_COLOR = "#b9771f";
const OLDER = ["#a9d4bb", "#c3d6d0", "#dbe6e2"];

interface Bar extends Series {
  key: string;
  legend: string;
}

/** The years to draw up to `year`, oldest first. A year before it with only a
 *  yearly total is spread evenly and striped, as an estimate. */
function yearBars(c: Consultant, year: string): Bar[] {
  const prev = String(Number(year) - 1);
  const years = Object.keys(c.billingByMonth ?? {}).filter((y) => y < year).sort();
  const older = years.slice(-OLDER.length).reverse().map((y, i): Bar => ({ key: y, legend: y, name: y, color: OLDER[i], values: monthsOf(c, y)! }));
  const annual = c.billingByYear[prev] ?? 0;
  if (!monthsOf(c, prev) && annual > 0) {
    older.unshift({ key: prev, legend: `${prev} (média mensal)`, name: `${prev} (média)`, color: OLDER[0], values: Array(12).fill(annual / 12), hatched: true });
  }
  return [...older.reverse(), { key: year, legend: year, name: year, color: "#345b63", values: monthsOf(c, year) ?? Array(12).fill(0) }];
}

export function BillingCard({ consultant: c, year, id }: { consultant: Consultant; year: string; id: string }) {
  const { db } = useReorg();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [month, setMonth] = useState<number | null>(null);

  const bars = useMemo(() => yearBars(c, year), [c, year]);
  const pace = useMemo(() => goalPace(c, year), [c, year]);
  const upTo = billedUpTo(c, year);
  const showsGoal = Boolean(pace && pace.perMonth > 0);

  const series: Series[] = bars.filter((b) => !hidden.has(b.key));
  if (showsGoal && !hidden.has(GOAL)) {
    series.push({
      name: "Objetivo por mês",
      color: GOAL_COLOR,
      ghost: true,
      overlay: !hidden.has(year),
      values: MONTH_SHORT.map((_, i) => (i > upTo ? pace!.perMonth : null)),
    });
  }

  const toggle = (key: string) => {
    const next = new Set(hidden);
    if (!next.delete(key)) next.add(key);
    setHidden(next);
  };

  // Every year with months on record, for this consultant or anyone else, up to now.
  const editable = useMemo(() => {
    const now = String(new Date().getFullYear());
    return activityYears(db).filter((y) => y <= now);
  }, [db]);

  return (
    <section className="rs-card" aria-labelledby={id}>
      <div className="rs-card-head flex-wrap">
        <h2 id={id}>Faturação mensal</h2>
        <span className="aside">
          <LegendToggle
            items={[
              ...bars.map((b) => ({ key: b.key, color: b.color, label: b.legend, hatched: b.hatched })),
              ...(showsGoal ? [{ key: GOAL, color: GOAL_COLOR, label: "Objetivo", ghost: true }] : []),
            ]}
            hidden={hidden}
            onToggle={toggle}
          />
        </span>
      </div>
      <div className="rs-card-body">
        <GoalLine key={`${c.id}-${year}`} consultant={c} year={year} />
        <Bars
          labels={MONTH_SHORT}
          series={series}
          onPick={(i) => setMonth(month === i ? null : i)}
          picked={month}
          detail={() => <div className="mt-1 border-t pt-1 text-[11.5px]" style={{ borderColor: "rgba(255,255,255,.15)", color: "#9fc0b9" }}>Clique para ver e alterar</div>}
          ariaLabel={`Faturação mensal de ${c.name}. Cada mês abre os valores dos vários anos.`}
        />
        {month != null && <MonthEditor key={month} consultant={c} month={month} years={editable} onClose={() => setMonth(null)} />}
      </div>
    </section>
  );
}

/** The year's goal and what it asks of the months left. */
function GoalLine({ consultant: c, year }: { consultant: Consultant; year: string }) {
  const { dispatch, notify } = useReorg();
  const pace = goalPace(c, year);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(numberText(pace?.goal));
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const value = draft.trim() ? parseNumber(draft) : null;
    if (value === undefined || (value != null && value < 0)) return notify("Indique um valor em euros.", true);
    setSaving(true);
    const res = await dispatch({ type: "consultant.goal", consultantId: c.id, year, value });
    setSaving(false);
    if (res.ok) {
      notify(value ? `Objetivo de ${year} guardado.` : `Objetivo de ${year} removido.`);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <form className="rs-goal-line" onSubmit={save}>
        <label className="rs-goal-edit">
          Objetivo {year}
          <input className="rs-input num" inputMode="decimal" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="0" />
        </label>
        <button type="submit" className="rs-btn primary sm" disabled={saving}>
          {saving ? "A guardar…" : "Guardar"}
        </button>
        <button type="button" className="rs-btn ghost sm" onClick={() => setEditing(false)}>
          Cancelar
        </button>
      </form>
    );
  }

  return (
    <p className="rs-goal-line">
      {pace ? (
        <span>
          <strong className="num">{money0(pace.goal)}</strong> de objetivo em {year}, {percent((pace.billed / pace.goal) * 100, 0)} feito.{" "}
          {pace.reached ? (
            "Objetivo atingido."
          ) : pace.monthsLeft > 0 ? (
            <>
              Faltam <strong className="num">{money0(pace.missing)}</strong>: <strong className="num">{money0(pace.perMonth)}</strong> por mês
              {pace.monthsLeft > 1 ? ` nos ${pace.monthsLeft} meses que restam.` : " no mês que resta."}
            </>
          ) : (
            <>Ficaram a faltar <strong className="num">{money0(pace.missing)}</strong>.</>
          )}
        </span>
      ) : (
        <span>Sem objetivo definido para {year}.</span>
      )}
      <button type="button" className="rs-btn ghost sm" onClick={() => setEditing(true)}>
        {pace ? "Alterar" : "Definir objetivo"}
      </button>
    </p>
  );
}

/** One month across the years, ready to be corrected. */
function MonthEditor({ consultant: c, month, years, onClose }: { consultant: Consultant; month: number; years: string[]; onClose: () => void }) {
  const { dispatch, notify } = useReorg();
  const value = (y: string) => monthsOf(c, y)?.[month] ?? 0;
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(years.map((y) => [y, value(y) ? numberText(value(y)) : ""])));
  const [saving, setSaving] = useState(false);
  const name = monthName(`2000-${String(month + 1).padStart(2, "0")}`).split(" ")[0];
  const yearlyOnly = years.filter((y) => !monthsOf(c, y) && c.billingByYear[y]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const values: Record<string, number> = {};
    for (const y of years) {
      const v = draft[y].trim() ? parseNumber(draft[y]) : 0;
      if (v === undefined) return notify(`O valor de ${y} não é um número.`, true);
      if (v !== value(y)) values[y] = v;
    }
    if (Object.keys(values).length === 0) return onClose();
    setSaving(true);
    const res = await dispatch({ type: "billing.month", consultantId: c.id, month, values });
    setSaving(false);
    if (res.ok) {
      notify(`${name} guardado.`);
      onClose();
    }
  }

  return (
    <form className="rs-month-edit" onSubmit={save} aria-label={`Faturação de ${name}`}>
      <div className="head">
        <h3>{name}</h3>
        <button type="button" className="rs-btn ghost sm" onClick={onClose} aria-label="Fechar">
          <IconClose size={16} />
        </button>
      </div>
      <div className="years">
        {years.map((y, i) => (
          <label key={y}>
            {y}
            <span className="money">
              <input
                className="rs-input num"
                inputMode="decimal"
                autoFocus={i === 0}
                value={draft[y]}
                onChange={(e) => setDraft({ ...draft, [y]: e.target.value })}
                placeholder="0"
              />
              <span aria-hidden="true">€</span>
            </span>
          </label>
        ))}
        <button type="submit" className="rs-btn primary" disabled={saving}>
          {saving ? "A guardar…" : "Guardar"}
        </button>
      </div>
      {yearlyOnly.map((y) => (
        <p key={y} className="rs-form-note warn">
          {y} só tem o total anual ({money0(c.billingByYear[y])}). Ao guardar um mês, o ano passa a contar a soma dos meses.
        </p>
      ))}
    </form>
  );
}
