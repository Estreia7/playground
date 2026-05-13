import type { JobState } from "./types";

export async function exportJobToExcel(job: JobState) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "playground";
  wb.created = new Date();

  const index = wb.addWorksheet("Index");
  index.columns = [
    { header: "URL", key: "url", width: 60 },
    { header: "Status", key: "status", width: 14 },
    { header: "Months done", key: "monthsDone", width: 14 },
    { header: "Avg ADR", key: "avgAdr", width: 12 },
  ];
  index.getRow(1).font = { bold: true };

  for (const url of job.urls) {
    const ls = job.listings[url];
    const adrs = ls?.months?.filter((m) => m.adr !== null).map((m) => m.adr as number) || [];
    const avg = adrs.length ? Math.round((adrs.reduce((a, b) => a + b, 0) / adrs.length) * 100) / 100 : null;
    index.addRow({
      url,
      status: ls?.status || "queued",
      monthsDone: ls?.monthsDone ?? 0,
      avgAdr: avg,
    });
  }

  const usedNames = new Set<string>();
  let sheetIdx = 1;
  for (const url of job.urls) {
    const ls = job.listings[url];
    if (!ls || ls.months.length === 0) continue;

    const m = url.match(/\/rooms\/(\d+)/);
    let name = (m ? `Listing ${m[1]}` : `Listing ${sheetIdx}`).slice(0, 28);
    while (usedNames.has(name)) name = name.slice(0, 26) + `_${sheetIdx}`;
    usedNames.add(name);

    const ws = wb.addWorksheet(name);
    ws.columns = [
      { header: "Month", key: "month", width: 12 },
      { header: "ADR", key: "adr", width: 10 },
      { header: "Samples", key: "samples", width: 10 },
      { header: "Notes", key: "notes", width: 28 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getCell("A2").value = url;
    ws.mergeCells("A2:D2");
    ws.getCell("A2").alignment = { wrapText: true };
    ws.getCell("A2").font = { italic: true, color: { argb: "FF666666" } };

    ws.addRow({});
    for (const row of ls.months) {
      ws.addRow({ month: row.month, adr: row.adr, samples: row.samples, notes: row.notes });
    }
    sheetIdx++;
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `airbnb-adr-${job.id}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
