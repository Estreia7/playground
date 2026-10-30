"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import type { Payout } from "../core/types.ts";
import { PHASE_LABEL } from "../core/types.ts";
import { account, managerShare } from "../core/commission.ts";
import { useReorg } from "../ui/App.tsx";
import { PageHeader } from "../ui/Shell.tsx";
import { Panel, PartyLabel, numberText, parseNumber } from "../ui/parts.tsx";
import { DropSlot, FileThumb } from "../ui/files/Files.tsx";
import { date, money, monthName, today } from "../ui/format.ts";
import { IconPlus } from "../ui/Icons.tsx";

/* The manager's current account, as the "Resumo" sheet kept it: what was
   carried over, what each month's paid invoices added, what was paid out,
   and what is still owed. A month opens to show the invoices behind it. */

export default function AccountPage() {
  const { db, dispatch, upload, notify } = useReorg();
  const [open, setOpen] = useState<string | null>(null);
  const [payout, setPayout] = useState<Payout | "new" | null>(null);
  const acc = account(db);
  const deals = useMemo(() => new Map(db.deals.map((d) => [d.id, d])), [db.deals]);

  // Ledger lines: one per month of earnings, one per payout, in date order.
  const lines = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const inv of db.invoices) {
      if (inv.status !== "paga") continue;
      byMonth.set(inv.settlementMonth, (byMonth.get(inv.settlementMonth) ?? 0) + managerShare(inv, deals.get(inv.dealId), db.dealTypes));
    }
    type Line = { key: string; sort: string; kind: "month"; month: string; amount: number } | { key: string; sort: string; kind: "payout"; payout: Payout; amount: number };
    const out: Line[] = [
      ...[...byMonth].map(([m, v]) => ({ key: "m" + m, sort: m + "-99", kind: "month" as const, month: m, amount: v })),
      ...db.payouts.map((p) => ({ key: "p" + p.id, sort: p.date, kind: "payout" as const, payout: p, amount: -p.amount })),
    ].sort((a, b) => a.sort.localeCompare(b.sort));
    let run = acc.opening;
    return out.map((l) => ({ ...l, balance: (run += l.amount) }));
  }, [db, deals, acc.opening]);

  async function attachPayout(p: Payout, file: File) {
    const ref = await upload(file);
    if (ref && (await dispatch({ type: "payout.save", payout: { ...p, file: ref } })).ok) notify("Comprovativo guardado.");
  }

  return (
    <>
      <PageHeader
        title="Conta corrente"
        sub={db.settings.managerName}
        actions={
          <button type="button" className="rs-btn primary" onClick={() => setPayout("new")}>
            <IconPlus size={17} />
            Registar pagamento
          </button>
        }
      />

      <div className="rs-kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <div className="rs-card rs-kpi hero">
          <span className="label">Saldo a receber</span>
          <span className="value num">{money(acc.balance)}</span>
          {acc.pending > 0 && (
            <span className="text-[13px]" style={{ color: "#9fc0b9" }}>
              + {money(acc.pending)} em faturas por pagar
            </span>
          )}
        </div>
        <div className="rs-card rs-kpi">
          <span className="label">Transitado {db.settings.openingMonth ? monthName(db.settings.openingMonth).toLowerCase() : ""}</span>
          <span className="value num">{money(acc.opening)}</span>
        </div>
        <div className="rs-card rs-kpi">
          <span className="label">Ganho no ano</span>
          <span className="value num">{money(acc.earned)}</span>
        </div>
        <div className="rs-card rs-kpi">
          <span className="label">Já pago</span>
          <span className="value num">{money(acc.paid)}</span>
        </div>
      </div>

      <section className="rs-card">
        <div className="rs-table-wrap">
          <table className="rs-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Movimento</th>
                <th className="right">Entrada</th>
                <th className="right">Saída</th>
                <th className="right">Saldo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="num">{db.settings.openingMonth ? monthName(db.settings.openingMonth) : "—"}</td>
                <td>Saldo transitado</td>
                <td className="right num">{money(acc.opening)}</td>
                <td />
                <td className="right num font-semibold">{money(acc.opening)}</td>
                <td />
              </tr>
              {lines.map((l) =>
                l.kind === "month" ? (
                  <Fragment key={l.key}>{monthRows(l.month, l.amount, l.balance, open === l.month, () => setOpen(open === l.month ? null : l.month))}</Fragment>
                ) : (
                  <tr key={l.key}>
                    <td className="num">{date(l.payout.date)}</td>
                    <td>
                      <span className="font-semibold">{l.payout.reference}</span>
                    </td>
                    <td />
                    <td className="right num">{money(l.payout.amount)}</td>
                    <td className="right num font-semibold">{money(l.balance)}</td>
                    <td className="right">
                      <div className="flex items-center justify-end gap-1">
                        {l.payout.file ? (
                          <FileThumb file={l.payout.file} label={l.payout.reference} />
                        ) : (
                          <DropSlot label={l.payout.reference} onFile={(f) => attachPayout(l.payout, f)} text="Fatura" />
                        )}
                        <button type="button" className="rs-btn ghost sm" onClick={() => setPayout(l.payout)}>
                          Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="font-semibold" style={{ padding: "12px" }}>
                  Saldo a receber
                </td>
                <td className="right num text-base font-bold" style={{ padding: "12px" }}>
                  {money(acc.balance)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {payout && <PayoutForm payout={payout === "new" ? undefined : payout} onClose={() => setPayout(null)} />}
    </>
  );

  function monthRows(month: string, amount: number, balance: number, open: boolean, onToggle: () => void) {
    const invs = db.invoices.filter((i) => i.settlementMonth === month && i.status === "paga");
    return (
      <>
        <tr>
          <td className="num">{monthName(month)}</td>
          <td>
            <button
              type="button"
              className="rs-link"
              style={{ background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit" }}
              aria-expanded={open}
              onClick={onToggle}
            >
              Comissões do mês · {invs.length} faturas
            </button>
          </td>
          <td className="right num">{money(amount)}</td>
          <td />
          <td className="right num font-semibold">{money(balance)}</td>
          <td />
        </tr>
        {open &&
          invs.map((inv) => {
            const deal = deals.get(inv.dealId);
            return (
              <tr key={inv.id} style={{ background: "#fafdfc" }}>
                <td />
                <td className="text-[13px]">
                  {deal ? (
                    <Link className="rs-link" href={`/reorgsi/negocios/${deal.id}`}>
                      {deal.ref || deal.address}
                    </Link>
                  ) : (
                    "—"
                  )}{" "}
                  · {PHASE_LABEL[inv.phase]} · fatura {inv.number}
                  {deal && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px]">
                      <PartyLabel db={db} party={deal.angariacao} />
                      {deal.compradores && (
                        <>
                          <span style={{ color: "var(--faint)" }} aria-hidden="true">/</span>
                          <PartyLabel db={db} party={deal.compradores} />
                        </>
                      )}
                    </div>
                  )}
                </td>
                <td className="right num text-[13px]">{money(managerShare(inv, deal, db.dealTypes))}</td>
                <td colSpan={3} />
              </tr>
            );
          })}
      </>
    );
  }
}

function PayoutForm({ payout, onClose }: { payout?: Payout; onClose: () => void }) {
  const { dispatch, notify } = useReorg();
  const [dateValue, setDate] = useState(payout?.date ?? today());
  const [reference, setReference] = useState(payout?.reference ?? "Brain Power Fat ");
  const [amount, setAmount] = useState(numberText(payout?.amount));

  async function save() {
    const a = parseNumber(amount);
    if (a == null) return notify("Indique o valor pago.", true);
    const res = await dispatch({ type: "payout.save", payout: { ...payout, id: payout?.id, date: dateValue, reference: reference.trim(), amount: a } });
    if (res.ok) {
      notify(payout ? "Pagamento guardado." : "Pagamento registado.");
      onClose();
    }
  }

  async function remove() {
    if (!payout || !window.confirm(`Apagar o pagamento ${payout.reference}?`)) return;
    if ((await dispatch({ type: "payout.delete", id: payout.id })).ok) {
      notify("Pagamento apagado.");
      onClose();
    }
  }

  return (
    <Panel
      title={payout ? "Editar pagamento" : "Registar pagamento"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rs-btn primary" onClick={save}>
            {payout ? "Guardar" : "Registar pagamento"}
          </button>
          <button type="button" className="rs-btn ghost" onClick={onClose}>
            Cancelar
          </button>
          {payout && (
            <button type="button" className="rs-btn ghost danger ml-auto" onClick={remove}>
              Apagar
            </button>
          )}
        </>
      }
    >
      <label className="rs-field">
        Data
        <input className="rs-input" type="date" value={dateValue} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="rs-field">
        Referência
        <input className="rs-input" value={reference} onChange={(e) => setReference(e.target.value)} />
      </label>
      <label className="rs-field">
        Valor pago
        <input className="rs-input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
      </label>
    </Panel>
  );
}
