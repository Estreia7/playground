import type { InsightsPayload } from "./types";

// Export the cross-host insights (emails, owners, host NIFs) to a workbook —
// same client-side exceljs pattern as the ADR export.
export async function exportInsightsToExcel(insights: InsightsPayload) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "playground";
  wb.created = new Date();

  // --- Emails ---------------------------------------------------------------
  const emails = wb.addWorksheet("Emails");
  emails.columns = [
    { header: "Email", key: "email", width: 34 },
    { header: "Type", key: "kind", width: 12 },
    { header: "Owner name(s)", key: "names", width: 30 },
    { header: "NIF(s)", key: "nifs", width: 22 },
    { header: "Hosts", key: "hosts", width: 30 },
    { header: "Listings", key: "listings", width: 10 },
  ];
  emails.getRow(1).font = { bold: true };
  for (const e of insights.emails) {
    emails.addRow({
      email: e.email,
      kind: e.kind,
      names: e.names.join(", "),
      nifs: e.nifs.join(", "),
      hosts: e.hosts.join(", "),
      listings: e.listings,
    });
  }

  // --- Owners ---------------------------------------------------------------
  const owners = wb.addWorksheet("Owners");
  owners.columns = [
    { header: "NIF", key: "nif", width: 16 },
    { header: "Name", key: "name", width: 30 },
    { header: "Company", key: "company", width: 10 },
    { header: "Hosts", key: "hosts", width: 34 },
    { header: "Listings", key: "listings", width: 10 },
  ];
  owners.getRow(1).font = { bold: true };
  for (const o of insights.owners) {
    owners.addRow({
      nif: o.nif,
      name: o.name || "",
      company: o.isCompany ? "Yes" : "No",
      hosts: o.hosts.join(", "),
      listings: o.listings,
    });
  }

  // --- Host NIF -------------------------------------------------------------
  const hostNifs = wb.addWorksheet("Host NIF");
  hostNifs.columns = [
    { header: "Host", key: "host", width: 26 },
    { header: "Manual NIF", key: "nif", width: 16 },
    { header: "Owner name", key: "owner", width: 30 },
    { header: "Properties under NIF", key: "under", width: 20 },
    { header: "Portfolio listings", key: "portfolio", width: 18 },
  ];
  hostNifs.getRow(1).font = { bold: true };
  for (const h of insights.hostNifs) {
    hostNifs.addRow({
      host: h.hostName || h.hostId,
      nif: h.manualNif,
      owner: h.ownerName || "",
      under: h.propertiesUnderNif,
      portfolio: h.portfolioListings ?? "",
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  a.download = `host-insights-${date}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
