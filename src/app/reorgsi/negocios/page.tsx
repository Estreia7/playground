"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Db, Deal, FileRef, Invoice } from "../core/types.ts";
import { PHASE_LABEL } from "../core/types.ts";
import { dealBilled, dealShare, invoicesOf, requirementsFor } from "../core/commission.ts";
import { useReorg } from "../ui/App.tsx";
import { PageHeader } from "../ui/Shell.tsx";
import { DealForm } from "../ui/forms.tsx";
import { DealStatusPill, DocBar, PartyLabel, dealFiles } from "../ui/parts.tsx";
import { DropSlot, FileThumb, type LabelledFile } from "../ui/files/Files.tsx";
import { money, monthName } from "../ui/format.ts";
import { IconExternal, IconPlus, IconSearch } from "../ui/Icons.tsx";

/* All deals, laid out like the spreadsheet the team already knows, with the
   files one hover away and every empty slot ready for a paste. */

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function search(db: Db, d: Deal): string {
  const names = [d.angariacao, d.compradores]
    .map((p) => (!p ? "" : p.kind === "team" ? (db.consultants.find((c) => c.id === p.consultantId)?.name ?? "") : p.name))
    .join(" ");
  return fold(`${d.ref} ${d.address} ${names} ${invoicesOf(db, d.id).map((i) => i.number).join(" ")}`);
}

export default function DealsPage() {
  const { db } = useReorg();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | Deal["status"]>("aberto");
  const [type, setType] = useState("");
  const [person, setPerson] = useState("");
  const [month, setMonth] = useState("");
  const [creating, setCreating] = useState(false);

  // Arriving from a consultant's row: show all of that person's deals.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("consultor");
    if (id) {
      setPerson(id);
      setStatus("");
    }
  }, []);

  const months = useMemo(
    () => [...new Set(db.invoices.map((i) => i.settlementMonth))].sort().reverse(),
    [db.invoices],
  );

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
      .filter((d) => !month || db.invoices.some((i) => i.dealId === d.id && i.settlementMonth === month))
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
          <label className="relative flex items-center">
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
                ["aberto", "Em curso"],
                ["concluido", "Concluídos"],
                ["anulado", "Anulados"],
                ["", "Todos"],
              ] as const
            ).map(([v, l]) => (
              <button key={l} type="button" aria-pressed={status === v} onClick={() => setStatus(v)}>
                {l}
              </button>
            ))}
          </div>
          <select className="rs-select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo de comissão">
            <option value="">Todos os tipos</option>
            {db.dealTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select className="rs-select" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Consultor">
            <option value="">Toda a equipa</option>
            {db.consultants.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="rs-select" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mês da conta corrente">
            <option value="">Todos os meses</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthName(m)}
              </option>
            ))}
          </select>
        </div>

        <div className="rs-table-wrap">
          <table className="rs-table">
            <thead>
              <tr>
                <th>Ref. do imóvel</th>
                <th>Anúncio</th>
                <th>Fase</th>
                <th>Angariação</th>
                <th>Compradores</th>
                <th className="right">Preço</th>
                <th className="right">Faturado s/IVA</th>
                <th className="right">Saldo manager</th>
                <th>Documentos</th>
                <th>Faturas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ deal, invoices }) => (
                <DealRow key={deal.id} db={db} deal={deal} invoices={invoices} />
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="rs-empty">
              Nenhum negócio com estes filtros.{" "}
              <button type="button" className="rs-link" style={{ background: "none", border: 0, cursor: "pointer", font: "inherit" }} onClick={() => { setQ(""); setStatus(""); setType(""); setPerson(""); setMonth(""); }}>
                Limpar filtros
              </button>
            </div>
          )}
        </div>
      </section>

      {creating && <DealForm onClose={() => setCreating(false)} />}
    </>
  );
}

function lastDate(invoices: Invoice[], deal: Deal): string {
  const last = invoices[invoices.length - 1];
  return last?.issuedAt ?? last?.settlementMonth ?? deal.createdAt;
}

function DealRow({ db, deal, invoices }: { db: Db; deal: Deal; invoices: Invoice[] }) {
  const { dispatch, upload, notify } = useReorg();
  const files = dealFiles(db, deal);
  const last = invoices[invoices.length - 1];
  const flagged = invoices.some((i) => i.flag);
  const docsWithFiles = requirementsFor(deal, db.docRequirements)
    .map((r) => ({ r, f: deal.documents[r.id]?.file }))
    .filter((x): x is { r: typeof x.r; f: FileRef } => Boolean(x.f));
  const invoiceNeedingFile = invoices.find((i) => !i.file && i.status !== "anulada");
  // Required documents first, then optional ones, skipping what is filed or not applicable.
  const nextDoc = requirementsFor(deal, db.docRequirements)
    .sort((a, b) => Number(b.required) - Number(a.required))
    .find((r) => !["ficheiro", "na"].includes(deal.documents[r.id]?.state ?? ""));

  async function attachDoc(reqId: string, name: string, file: File) {
    const ref = await upload(file);
    if (ref && (await dispatch({ type: "deal.doc", dealId: deal.id, reqId, entry: { state: "ficheiro", file: ref } })).ok)
      notify(`${name} guardado.`);
  }

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
      <td>
        <Link className="row-link" href={`/reorgsi/negocios/${deal.id}`}>
          {deal.ref || (deal.transaction === "credito" ? "Crédito" : "Sem ref.")}
        </Link>
        <span className="rs-sub" title={deal.address}>
          {deal.address}
        </span>
      </td>
      <td>
        <div className="flex items-center gap-1.5">
          {deal.listingShot ? (
            <FileThumb file={deal.listingShot} label={`Anúncio · ${deal.ref || deal.address}`} set={files} />
          ) : deal.transaction !== "credito" ? (
            <DropSlot label="Captura do anúncio" onFile={attachShot} text="Captura" />
          ) : null}
          {deal.listingUrl && (
            <a className="rs-btn ghost sm" href={deal.listingUrl} target="_blank" rel="noopener noreferrer" aria-label={`Abrir anúncio de ${deal.ref}`}>
              <IconExternal size={15} />
            </a>
          )}
        </div>
      </td>
      <td>
        <div className="flex flex-col items-start gap-1">
          {last ? <span className="text-[13px] whitespace-nowrap">{PHASE_LABEL[last.phase]}</span> : <span style={{ color: "var(--faint)" }}>Sem fatura</span>}
          <DealStatusPill status={deal.status} />
        </div>
      </td>
      <td>
        <PartyLabel db={db} party={deal.angariacao} />
      </td>
      <td>
        <PartyLabel db={db} party={deal.compradores} />
      </td>
      <td className="right num">{money(deal.price)}</td>
      <td className="right num">{money(dealBilled(db, deal))}</td>
      <td className="right num font-semibold">
        {money(dealShare(db, deal))}
        {flagged && (
          <span className="rs-flag block" title={invoices.find((i) => i.flag)?.flag}>
            Rever duplicado
          </span>
        )}
      </td>
      <td>
        <DocBar db={db} deal={deal} />
        {(docsWithFiles.length > 0 || nextDoc) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {docsWithFiles.map(({ r, f }) => (
              <FileThumb key={r.id} file={f} label={`${r.name} · ${deal.ref || deal.address}`} set={files} />
            ))}
            {nextDoc && (
              <DropSlot label={nextDoc.name} onFile={(f) => attachDoc(nextDoc.id, nextDoc.name, f)} text={nextDoc.name} />
            )}
          </div>
        )}
      </td>
      <td>
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
