"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Db, Deal, Invoice } from "../core/types.ts";
import { PHASE_LABEL, STATUS_LABEL } from "../core/types.ts";
import { dealBilled, dealShare, invoicesOf } from "../core/commission.ts";
import { useReorg } from "../ui/App.tsx";
import { PageHeader } from "../ui/Shell.tsx";
import { DealForm } from "../ui/forms.tsx";
import { DealStatusPill, DocRing, PartyLabel, dealFiles } from "../ui/parts.tsx";
import { DropSlot, FileThumb, type LabelledFile } from "../ui/files/Files.tsx";
import { DocsDialog } from "../ui/files/DocsDialog.tsx";
import { useUrlDialog, useUrlState } from "../ui/nav.tsx";
import { money, money0, monthName } from "../ui/format.ts";
import { PersonPicker } from "../ui/PersonPicker.tsx";
import { Select } from "../ui/Select.tsx";
import { IconClose, IconExternal, IconPlus, IconSearch } from "../ui/Icons.tsx";

/* All deals, laid out like the spreadsheet the team already knows, with the
   files one hover away and every empty slot ready for a paste. */

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function search(db: Db, d: Deal): string {
  const names = [d.angariacao, d.compradores]
    .map((p) => (!p ? "" : p.kind === "team" ? (db.consultants.find((c) => c.id === p.consultantId)?.name ?? "") : p.name))
    .join(" ");
  return fold(`${d.ref} ${d.address} ${names} ${invoicesOf(db, d.id).map((i) => i.number).join(" ")}`);
}

/** The month the page opens on: this calendar month, or the latest month with
 *  invoices while this one has none yet. */
function currentMonth(db: Db): string {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (db.invoices.some((i) => i.settlementMonth === ym)) return ym;
  return db.invoices.map((i) => i.settlementMonth).sort().pop() ?? ym;
}

export default function DealsPage() {
  const { db } = useReorg();
  // Filters live in the address, so coming back from a deal finds them as they were.
  const [q, setQ] = useUrlState<string>("q", "");
  const [status, setStatus] = useUrlState<"" | Deal["status"]>("estado", "");
  const [type, setType] = useUrlState<string>("tipo", "");
  const [person, setPerson] = useUrlState<string>("consultor", "");
  const [month, setMonth] = useUrlState<string>("mes", currentMonth(db));
  const [creating, setCreating] = useState(false);
  const [docsFor, openDocs, closeDocs] = useUrlDialog("documentos");
  const docsDeal = docsFor ? db.deals.find((d) => d.id === docsFor) : undefined;

  const months = useMemo(
    () => [...new Set([...db.invoices.map((i) => i.settlementMonth), currentMonth(db)])].sort().reverse(),
    [db],
  );

  const filtered = Boolean(status || type || person);
  const clearFilters = () => {
    setQ("");
    setStatus("");
    setType("");
    setPerson("");
    setMonth(currentMonth(db));
  };

  const rows = useMemo(() => {
    const needle = fold(q.trim());
    return db.deals
      .filter((d) => !status || d.status === status)
      .filter((d) => !type || d.dealTypeId === type)
      .filter(
        (d) =>
          !person ||
          (d.angariacao.kind === "team" && d.angariacao.consultantId === person) ||
          (d.compradores?.kind === "team" && d.compradores.consultantId === person),
      )
      .filter((d) => {
        if (!month) return true;
        const own = db.invoices.filter((i) => i.dealId === d.id);
        // A new deal has no invoice yet: it belongs to the month it was created.
        return own.length ? own.some((i) => i.settlementMonth === month) : d.createdAt.startsWith(month);
      })
      .filter((d) => !needle || search(db, d).includes(needle))
      .map((d) => ({ deal: d, invoices: invoicesOf(db, d.id) }))
      .sort((a, b) => lastDate(b.invoices, b.deal).localeCompare(lastDate(a.invoices, a.deal)));
  }, [db, q, status, type, person, month]);

  const totals = rows.reduce(
    (s, r) => ({ billed: s.billed + dealBilled(db, r.deal), share: s.share + dealShare(db, r.deal) }),
    { billed: 0, share: 0 },
  );

  return (
    <>
      <PageHeader
        title="Negócios"
        sub={`${rows.length} de ${db.deals.length} negócios · ${money(totals.billed)} faturados · ${money(totals.share)} para o manager`}
        actions={
          <button type="button" className="rs-btn primary" onClick={() => setCreating(true)}>
            <IconPlus size={17} />
            Novo negócio
          </button>
        }
      />

      <section className="rs-card">
        <div className="rs-filters">
          <label className="rs-f-search relative flex items-center">
            <span className="pointer-events-none absolute left-2.5" style={{ color: "var(--faint)" }}>
              <IconSearch size={16} />
            </span>
            <input
              className="rs-input"
              style={{ paddingLeft: 32, minWidth: 220 }}
              placeholder="Ref, morada, consultor, n.º fatura"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Pesquisar negócios"
            />
          </label>
          <div className="rs-seg" role="group" aria-label="Estado">
            {(
              [
                ["", "Todos"],
                ["aberto", "Em curso"],
                ["concluido", "Concluídos"],
                ["anulado", "Anulados"],
              ] as const
            ).map(([v, l]) => (
              <button key={l} type="button" aria-pressed={status === v} onClick={() => setStatus(v)}>
                {l}
              </button>
            ))}
          </div>
          <div className="rs-seg" role="group" aria-label="Tipo de negócio">
            <button type="button" aria-pressed={type === ""} onClick={() => setType("")}>
              Todos os tipos
            </button>
            {db.dealTypes
              .filter((t) => t.active || t.id === type)
              .map((t) => (
                <button key={t.id} type="button" aria-pressed={type === t.id} onClick={() => setType(t.id)}>
                  {t.name}
                </button>
              ))}
          </div>
          <div className="rs-f-person">
            <PersonPicker
              compact
              value={person}
              onChange={setPerson}
              ariaLabel="Consultor"
              options={[
                { value: "", label: "Toda a equipa", person: false },
                ...db.consultants.map((c) => ({ value: c.id, label: c.name, hint: STATUS_LABEL[c.status] })),
              ]}
            />
          </div>
          <Select
            compact
            className="rs-f-month"
            value={month}
            onChange={setMonth}
            ariaLabel="Mês da conta corrente"
            options={[{ value: "", label: "Todos os meses" }, ...months.map((m) => ({ value: m, label: monthName(m) }))]}
          />
          {filtered && (
            <button type="button" className="rs-clear" onClick={clearFilters}>
              <span className="dot" aria-hidden="true" />
              Limpar filtros
              <IconClose size={14} />
            </button>
          )}
        </div>

        <div className="rs-table-wrap">
          <table className="rs-table rs-deals">
            <thead>
              <tr>
                <th>Ref. do imóvel</th>
                <th>Fase</th>
                <th>Tipo</th>
                <th>Angariação · Compradores</th>
                <th className="right">Preço</th>
                <th className="right wrap">Faturado s/IVA</th>
                <th className="right wrap">Saldo manager</th>
                <th>Documentos</th>
                <th>Faturas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ deal, invoices }) => (
                <DealRow key={deal.id} db={db} deal={deal} invoices={invoices} onDocs={() => openDocs(deal.id)} />
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="rs-empty">
              Nenhum negócio com estes filtros.{" "}
              <button type="button" className="rs-link" style={{ background: "none", border: 0, cursor: "pointer", font: "inherit" }} onClick={clearFilters}>
                Limpar filtros
              </button>
            </div>
          )}
        </div>
      </section>

      {creating && <DealForm onClose={() => setCreating(false)} />}
      {docsDeal && <DocsDialog deal={docsDeal} onClose={closeDocs} />}
    </>
  );
}

function lastDate(invoices: Invoice[], deal: Deal): string {
  const last = invoices[invoices.length - 1];
  return last?.issuedAt ?? last?.settlementMonth ?? deal.createdAt;
}

function DealRow({ db, deal, invoices, onDocs }: { db: Db; deal: Deal; invoices: Invoice[]; onDocs: () => void }) {
  const { dispatch, upload, notify } = useReorg();
  const files = dealFiles(db, deal);
  const last = invoices[invoices.length - 1];
  const flagged = invoices.some((i) => i.flag);
  const invoiceNeedingFile = invoices.find((i) => !i.file && i.status !== "anulada");

  async function attachShot(file: File) {
    const ref = await upload(file);
    if (ref && (await dispatch({ type: "deal.shot", dealId: deal.id, file: ref })).ok) notify("Captura do anúncio guardada.");
  }

  async function attachInvoice(inv: Invoice, file: File) {
    const ref = await upload(file);
    if (ref && (await dispatch({ type: "invoice.save", invoice: { ...inv, file: ref } })).ok) notify(`PDF da fatura ${inv.number} guardado.`);
  }

  return (
    <tr>
      <td className="c-ref" data-label="Ref. do imóvel">
        <Link className="row-link" href={`/reorgsi/negocios/${deal.id}`}>
          {deal.ref || (deal.transaction === "credito" ? "Crédito" : "Sem ref.")}
        </Link>
        <span className="rs-sub" title={deal.address}>
          {deal.address}
        </span>
        <div className="mt-1.5 flex items-center gap-1">
          {deal.listingShot ? (
            <FileThumb file={deal.listingShot} label={`Anúncio · ${deal.ref || deal.address}`} set={files} />
          ) : deal.transaction !== "credito" ? (
            <DropSlot label="Captura do anúncio" onFile={attachShot} text="Anúncio" />
          ) : null}
          {deal.listingUrl && (
            <a className="rs-btn ghost sm" href={deal.listingUrl} target="_blank" rel="noopener noreferrer" aria-label={`Abrir anúncio de ${deal.ref}`}>
              <IconExternal size={15} />
            </a>
          )}
        </div>
      </td>
      <td className="c-phase" data-label="Fase">
        <div className="flex flex-col items-start gap-1">
          {last ? <span className="text-[12.5px]">{PHASE_LABEL[last.phase]}</span> : <span style={{ color: "var(--faint)" }}>Sem fatura</span>}
          <DealStatusPill status={deal.status} />
        </div>
      </td>
      <td className="c-type" data-label="Tipo">
        <span className="rs-pill teal">{db.dealTypes.find((t) => t.id === deal.dealTypeId)?.name ?? "—"}</span>
      </td>
      <td className="c-sides" data-label="Angariação · Compradores">
        <div className="side">
          <span className="k" title="Angariação">Ang.</span>
          <PartyLabel db={db} party={deal.angariacao} />
        </div>
        <div className="side">
          <span className="k" title="Compradores">Comp.</span>
          <PartyLabel db={db} party={deal.compradores} />
        </div>
      </td>
      <td className="right num c-price" data-label="Preço">{money0(deal.price)}</td>
      <td className="right num c-billed" data-label="Faturado s/IVA">{money(dealBilled(db, deal))}</td>
      <td className="right num font-semibold c-share" data-label="Saldo manager">
        {money(dealShare(db, deal))}
        {flagged && (
          <span className="rs-flag block" title={invoices.find((i) => i.flag)?.flag}>
            Rever duplicado
          </span>
        )}
      </td>
      <td className="c-docs" data-label="Documentos">
        <DocRing db={db} deal={deal} onOpen={onDocs} />
      </td>
      <td className="c-inv" data-label="Faturas">
        <div className="flex flex-wrap items-center gap-1">
          {invoices
            .filter((i) => i.file)
            .map((i) => (
              <FileThumb key={i.id} file={i.file!} label={`Fatura ${i.number} · ${PHASE_LABEL[i.phase]}`} set={files as LabelledFile[]} />
            ))}
          {invoiceNeedingFile && (
            <DropSlot label={`Fatura ${invoiceNeedingFile.number}`} onFile={(f) => attachInvoice(invoiceNeedingFile, f)} text={`N.º ${invoiceNeedingFile.number || "?"}`} />
          )}
        </div>
      </td>
    </tr>
  );
}
