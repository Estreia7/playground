"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { DocState, Invoice } from "../../core/types.ts";
import { DOC_STATE_LABEL, PHASE_LABEL, SIDES_LABEL, TRANSACTION_LABEL } from "../../core/types.ts";
import { dealBilled, dealShare, docProgress, invoicesOf, managerPct, managerShare, requirementsFor } from "../../core/commission.ts";
import { useReorg } from "../../ui/App.tsx";
import { PageHeader } from "../../ui/Shell.tsx";
import { DealForm, InvoiceForm } from "../../ui/forms.tsx";
import { DealStatusPill, DocBar, InvoiceStatusPill, PartyLabel, dealFiles } from "../../ui/parts.tsx";
import { DropSlot, FileThumb } from "../../ui/files/Files.tsx";
import { date, money, monthName, percent } from "../../ui/format.ts";
import { IconExternal, IconPlus, IconTrash } from "../../ui/Icons.tsx";
import { BackLink } from "../../ui/nav.tsx";

/* One deal: the documents it still needs, the money it produced, and every
   file attached to it. */

const STATES: DocState[] = ["confirmado", "em_falta", "na"];

export default function DealPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { db, dispatch, upload, notify } = useReorg();
  const [editing, setEditing] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState<{ invoice?: Invoice } | null>(null);

  const deal = db.deals.find((d) => d.id === id);
  // The tab and the history list name the deal, not just "Negócio".
  const ref = deal ? deal.ref || deal.address : "";
  useEffect(() => {
    if (ref) document.title = `${ref} · ReorgSI`;
  }, [ref]);
  if (!deal) {
    return (
      <>
        <PageHeader title="Negócio não encontrado" />
        <div className="rs-card rs-empty">
          Este negócio foi apagado ou o link está errado.{" "}
          <Link className="rs-link" href="/reorgsi/negocios">
            Ver todos os negócios
          </Link>
        </div>
      </>
    );
  }

  const type = db.dealTypes.find((t) => t.id === deal.dealTypeId);
  const reqs = requirementsFor(deal, db.docRequirements);
  const progress = docProgress(deal, db.docRequirements);
  const invoices = invoicesOf(db, deal.id);
  const files = dealFiles(db, deal);
  const label = deal.ref || deal.address;
  const totalCommission = deal.price != null && deal.commissionPct != null ? (deal.price * deal.commissionPct) / 100 : undefined;
  const pending = invoices.filter((i) => i.status === "emitida").reduce((s, i) => s + managerShare(i, deal, db.dealTypes), 0);

  async function setDoc(reqId: string, state: DocState | null) {
    const current = deal!.documents[reqId];
    // Changing the state keeps any file; clearing removes the entry.
    await dispatch({ type: "deal.doc", dealId: deal!.id, reqId, entry: state ? { state, file: current?.file } : null });
  }

  async function attachDoc(reqId: string, name: string, file: File) {
    const ref = await upload(file);
    if (ref && (await dispatch({ type: "deal.doc", dealId: deal!.id, reqId, entry: { state: "ficheiro", file: ref } })).ok)
      notify(`${name} guardado.`);
  }

  async function removeDocFile(reqId: string) {
    await dispatch({ type: "deal.doc", dealId: deal!.id, reqId, entry: { state: "confirmado" } });
  }

  async function attachShot(file: File) {
    const ref = await upload(file);
    if (ref && (await dispatch({ type: "deal.shot", dealId: deal!.id, file: ref })).ok) notify("Captura do anúncio guardada.");
  }

  async function attachInvoice(inv: Invoice, file: File) {
    const ref = await upload(file);
    if (ref && (await dispatch({ type: "invoice.save", invoice: { ...inv, file: ref } })).ok) notify(`PDF da fatura ${inv.number} guardado.`);
  }

  async function removeDeal() {
    if (!window.confirm(`Apagar o negócio ${label} e as suas ${invoices.length} faturas? Isto não se pode desfazer.`)) return;
    if ((await dispatch({ type: "deal.delete", id: deal!.id })).ok) {
      notify("Negócio apagado.");
      router.replace("/reorgsi/negocios");
    }
  }

  return (
    <>
      <BackLink href="/reorgsi/negocios" label="Negócios" />
      <PageHeader
        title={deal.ref || (deal.transaction === "credito" ? "Processo bancário" : "Negócio sem referência")}
        sub={
          <>
            {deal.address} · {TRANSACTION_LABEL[deal.transaction]} · <DealStatusPill status={deal.status} />
          </>
        }
        actions={
          <>
            {deal.listingUrl && (
              <a className="rs-btn" href={deal.listingUrl} target="_blank" rel="noopener noreferrer">
                <IconExternal size={16} />
                Ver anúncio
              </a>
            )}
            <button type="button" className="rs-btn" onClick={() => setEditing(true)}>
              Editar
            </button>
            <button type="button" className="rs-btn ghost danger" onClick={removeDeal} aria-label="Apagar negócio">
              <IconTrash size={17} />
            </button>
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Documents */}
          <section className="rs-card" aria-labelledby="docs-h">
            <div className="rs-card-head">
              <h2 id="docs-h">Documentos</h2>
              <span className="aside num">
                {progress.total ? `${Math.round(progress.ratio * 100)}% dos obrigatórios` : "Nenhum obrigatório"}
              </span>
            </div>
            <div className="rs-card-body">
              <DocBar db={db} deal={deal} large />
              <ul className="m-0 mt-4 flex list-none flex-col p-0">
                {reqs.map((r) => {
                  const entry = deal.documents[r.id];
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 border-t py-3" style={{ borderColor: "var(--line)" }}>
                      <div className="min-w-44 flex-1">
                        <div className="font-semibold">{r.name}</div>
                        <div className="text-[12.5px]" style={{ color: "var(--muted)" }}>
                          {r.required ? "Obrigatório" : "Opcional"}
                          {entry ? ` · ${DOC_STATE_LABEL[entry.state]}` : " · por tratar"}
                        </div>
                      </div>
                      {entry?.file ? (
                        <div className="flex items-center gap-1">
                          <FileThumb file={entry.file} label={`${r.name} · ${label}`} set={files} />
                          <button type="button" className="rs-btn ghost sm" onClick={() => removeDocFile(r.id)} aria-label={`Remover ficheiro de ${r.name}`}>
                            <IconTrash size={15} />
                          </button>
                        </div>
                      ) : (
                        <DropSlot label={r.name} onFile={(f) => attachDoc(r.id, r.name, f)} text="Carregar" />
                      )}
                      <div className="rs-seg" role="group" aria-label={`Estado de ${r.name}`}>
                        {STATES.map((s) => (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={entry?.state === s || (s === "confirmado" && entry?.state === "ficheiro")}
                            onClick={() => setDoc(r.id, entry?.state === s ? null : s)}
                          >
                            {s === "confirmado" ? "Ok" : s === "em_falta" ? "Em falta" : "N/A"}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          {/* Invoices */}
          <section className="rs-card" aria-labelledby="inv-h">
            <div className="rs-card-head">
              <h2 id="inv-h">Faturas</h2>
              <button type="button" className="rs-btn sm ml-auto" onClick={() => setInvoiceForm({})}>
                <IconPlus size={15} />
                Fatura
              </button>
            </div>
            <div className="rs-table-wrap">
              <table className="rs-table">
                <thead>
                  <tr>
                    <th>Fase</th>
                    <th>N.º</th>
                    <th>Emissão</th>
                    <th>Pagamento</th>
                    <th className="right">Valor s/IVA</th>
                    <th className="right">% manager</th>
                    <th className="right">Saldo</th>
                    <th>Estado</th>
                    <th>PDF</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="whitespace-nowrap">
                        {PHASE_LABEL[inv.phase]}
                        <span className="rs-sub">{monthName(inv.settlementMonth)}</span>
                        {inv.flag && <span className="rs-flag block">{inv.flag}</span>}
                      </td>
                      <td className="num">{inv.number || "—"}</td>
                      <td className="num">{date(inv.issuedAt)}</td>
                      <td className="num">{date(inv.paidAt)}</td>
                      <td className="right num">{money(inv.valueNoVat)}</td>
                      <td className="right num">
                        {percent(managerPct(inv, deal, db.dealTypes), 3)}
                        {inv.managerPctOverride != null && <span className="rs-sub">própria</span>}
                      </td>
                      <td className="right num font-semibold">{money(managerShare(inv, deal, db.dealTypes))}</td>
                      <td>
                        <InvoiceStatusPill status={inv.status} />
                      </td>
                      <td>
                        {inv.file ? (
                          <FileThumb file={inv.file} label={`Fatura ${inv.number} · ${PHASE_LABEL[inv.phase]}`} set={files} />
                        ) : (
                          <DropSlot label={`Fatura ${inv.number}`} onFile={(f) => attachInvoice(inv, f)} text="Anexar" />
                        )}
                      </td>
                      <td className="right">
                        <button type="button" className="rs-btn ghost sm" onClick={() => setInvoiceForm({ invoice: inv })}>
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {invoices.length === 0 && <div className="rs-empty">Ainda sem faturas. Adicione a primeira quando for emitida.</div>}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rs-card" aria-labelledby="ad-h">
            <div className="rs-card-head">
              <h2 id="ad-h">Anúncio</h2>
              {deal.listingShot && (
                <button type="button" className="rs-btn ghost sm ml-auto" onClick={() => dispatch({ type: "deal.shot", dealId: deal.id, file: null })}>
                  Remover
                </button>
              )}
            </div>
            <div className="rs-card-body">
              {deal.listingShot ? (
                <FileThumb file={deal.listingShot} label={`Anúncio · ${label}`} set={files} large />
              ) : (
                <DropSlot label="Captura do anúncio" onFile={attachShot} large />
              )}
              {deal.listingUrl ? (
                <a className="rs-link mt-3 flex items-center gap-1 truncate text-sm" href={deal.listingUrl} target="_blank" rel="noopener noreferrer">
                  <IconExternal size={14} />
                  <span className="truncate">{deal.listingUrl.replace(/^https?:\/\/(www\.)?/, "")}</span>
                </a>
              ) : (
                <button type="button" className="rs-link mt-3 text-sm" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => setEditing(true)}>
                  Adicionar link do anúncio
                </button>
              )}
            </div>
          </section>

          <section className="rs-card" aria-labelledby="com-h">
            <div className="rs-card-head">
              <h2 id="com-h">Comissão</h2>
            </div>
            <dl className="rs-card-body m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
              <dt style={{ color: "var(--muted)" }}>Tipo</dt>
              <dd className="m-0 text-right">
                {type?.name ?? "—"}
                <span className="rs-sub ml-auto">{type ? `${SIDES_LABEL[type.sides]} · ${percent(type.defaultManagerPct)}` : ""}</span>
              </dd>
              <dt style={{ color: "var(--muted)" }}>{type?.sides === "bank" ? "Consultor" : "Angariação"}</dt>
              <dd className="m-0 text-right">
                <PartyLabel db={db} party={deal.angariacao} />
              </dd>
              {type?.sides !== "bank" && (
                <>
                  <dt style={{ color: "var(--muted)" }}>Compradores</dt>
                  <dd className="m-0 text-right">
                    <PartyLabel db={db} party={deal.compradores} />
                  </dd>
                </>
              )}
              <dt style={{ color: "var(--muted)" }}>Preço</dt>
              <dd className="num m-0 text-right">{money(deal.price)}</dd>
              <dt style={{ color: "var(--muted)" }}>% comissão</dt>
              <dd className="num m-0 text-right">{percent(deal.commissionPct)}</dd>
              {totalCommission != null && type?.sides !== "bank" && (
                <>
                  <dt style={{ color: "var(--muted)" }}>Angariação ({deal.listingSplitPct}%)</dt>
                  <dd className="num m-0 text-right">{money((totalCommission * deal.listingSplitPct) / 100)}</dd>
                  <dt style={{ color: "var(--muted)" }}>Compradores ({100 - deal.listingSplitPct}%)</dt>
                  <dd className="num m-0 text-right">{money((totalCommission * (100 - deal.listingSplitPct)) / 100)}</dd>
                </>
              )}
              <dt className="border-t pt-2.5" style={{ color: "var(--muted)", borderColor: "var(--line)" }}>
                Faturado s/IVA
              </dt>
              <dd className="num m-0 border-t pt-2.5 text-right" style={{ borderColor: "var(--line)" }}>
                {money(dealBilled(db, deal))}
              </dd>
              <dt className="font-semibold">Saldo do manager</dt>
              <dd className="num m-0 text-right text-base font-bold">{money(dealShare(db, deal))}</dd>
              {pending > 0 && (
                <>
                  <dt style={{ color: "var(--muted)" }}>Dos quais por pagar</dt>
                  <dd className="num m-0 text-right" style={{ color: "var(--amber)" }}>
                    {money(pending)}
                  </dd>
                </>
              )}
            </dl>
            {deal.notes && (
              <p className="m-0 border-t px-[18px] py-3 text-sm" style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}>
                {deal.notes}
              </p>
            )}
          </section>
        </aside>
      </div>

      {editing && <DealForm deal={deal} onClose={() => setEditing(false)} />}
      {invoiceForm && (
        <InvoiceForm
          dealId={deal.id}
          invoice={invoiceForm.invoice}
          defaultPct={type?.defaultManagerPct ?? 0}
          onClose={() => setInvoiceForm(null)}
        />
      )}
    </>
  );
}
