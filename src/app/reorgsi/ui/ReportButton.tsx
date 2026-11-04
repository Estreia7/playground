"use client";

import { useEffect, useRef, useState } from "react";
import type { Consultant } from "../core/types.ts";
import { billedUpTo } from "../core/billing.ts";
import { buildReport } from "../core/report.ts";
import { useReorg } from "./App.tsx";
import { MONTH_SHORT } from "./format.ts";
import { IconClose, IconFile } from "./Icons.tsx";

/* Generates a consultant's PDF analysis. The button opens a small toast at the
   foot of the page to choose the month the analysis goes up to. */

export function ReportButton({ consultant: c, year }: { consultant: Consultant; year: string }) {
  const { db, notify } = useReorg();
  const [open, setOpen] = useState(false);
  const last = Math.max(0, billedUpTo(c, year));
  const [month, setMonth] = useState(last);
  const [busy, setBusy] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLElement>("[aria-pressed='true']")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function generate() {
    setBusy(true);
    try {
      // pdf-lib is only needed here, so it stays out of the page's bundle.
      const { reportPdf } = await import("./reportPdf.ts");
      const bytes = await reportPdf(buildReport(db, c, year, month), c.status);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `Analise ${c.name} ${year}-${String(month + 1).padStart(2, "0")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
      notify("Análise gerada.");
    } catch {
      notify("Não foi possível gerar o PDF. Tente outra vez.", true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button ref={trigger} type="button" className="rs-btn" aria-expanded={open} onClick={() => { setMonth(last); setOpen(!open); }}>
        <IconFile size={17} />
        Gerar análise PDF
      </button>
      {open && (
        <div ref={box} className="rs-report-toast" role="dialog" aria-label={`Gerar análise de ${c.name}`}>
          <div className="head">
            <strong>Análise até que mês de {year}?</strong>
            <button type="button" className="close" onClick={() => setOpen(false)} aria-label="Fechar">
              <IconClose size={16} />
            </button>
          </div>
          <div className="months" role="group" aria-label="Mês">
            {MONTH_SHORT.map((m, i) => (
              <button key={m} type="button" aria-pressed={month === i} disabled={i > last} onClick={() => setMonth(i)}>
                {m}
              </button>
            ))}
          </div>
          <button type="button" className="go" onClick={generate} disabled={busy}>
            {busy ? "A gerar…" : "Gerar PDF"}
          </button>
        </div>
      )}
    </>
  );
}
