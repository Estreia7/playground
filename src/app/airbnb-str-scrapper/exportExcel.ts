import type { JobState } from "./types";
import { buildSummary, MONTH_LABELS } from "./helpers";

export async function exportJobToExcel(job: JobState) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "playground";
  wb.created = new Date();

  const { rows, monthAverages, overallAvg, avgReviewsScore } = buildSummary(job);

  // --- Summary sheet: the matrix shown in the UI -----------------------
  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { header: "Listing", key: "title", width: 34 },
    { header: "Reviews", key: "reviews", width: 10 },
    { header: "Score", key: "score", width: 8 },
    { header: "Recent on market", key: "recent", width: 16 },
    ...MONTH_LABELS.map((m) => ({ header: m, key: m, width: 8 })),
    { header: "Avg", key: "avg", width: 10 },
  ];
  summary.getRow(1).font = { bold: true };

  const tag = [job.name, job.location].filter(Boolean).join(" — ");
  if (tag) {
    summary.spliceRows(1, 0, [tag]);
    summary.getRow(1).font = { italic: true, color: { argb: "FF666666" } };
  }

  for (const r of rows) {
    const row: Record<string, unknown> = {
      title: r.title,
      reviews: r.reviewsCount,
      score: r.reviewsScore,
      recent: r.recent ? "Yes" : "No",
      avg: r.avgAdr,
    };
    // Excluded (manually hidden) cells are left blank so they don't skew a
    // reader's eye or any downstream formula.
    r.adrByMonth.forEach((v, i) => {
      row[MONTH_LABELS[i]] = r.excludedByMonth[i] ? null : v;
    });
    summary.addRow(row);
  }

  const recentTally = `${rows.filter((r) => r.recent).length} yes · ${
    rows.filter((r) => !r.recent).length
  } no`;

  // Trailing "Average / month" row.
  const avgRow: Record<string, unknown> = {
    title: "Average / month",
    score: avgReviewsScore,
    recent: recentTally,
    avg: overallAvg,
  };
  monthAverages.forEach((v, i) => {
    avgRow[MONTH_LABELS[i]] = v;
  });
  const added = summary.addRow(avgRow);
  added.font = { bold: true };

  // --- Per-listing detail sheets (month, ADR, samples, notes) ----------
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

    const title = ls.meta?.title || url;
    const reviewLine = [
      ls.meta?.reviewsScore != null ? `★ ${ls.meta.reviewsScore}` : null,
      ls.meta?.reviewsCount != null ? `${ls.meta.reviewsCount} reviews` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const header = [title, reviewLine, url].filter(Boolean).join("\n");
    ws.getCell("A2").value = header;
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
  const safeName =
    (job.name || job.id)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || job.id;
  a.download = `airbnb-adr-${safeName}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
