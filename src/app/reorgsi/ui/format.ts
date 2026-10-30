/* pt-PT formatting, done by hand so server and browser always agree and the
   figures read like the spreadsheets: "2 595,37 €". Groups use a narrow
   no-break space and the euro sign never wraps away from its number. */

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export function money(n: number | undefined | null, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const [int, dec] = Math.abs(n).toFixed(decimals).split(".");
  return (n < 0 ? "−" : "") + group(int) + (dec ? "," + dec : "") + " €";
}

export const money0 = (n: number | undefined | null) => money(n, 0);

export function percent(n: number | undefined | null, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  // Trim trailing decimal zeros only ("1.50" → "1.5"), never the integer's ("70" stays).
  const s = decimals > 0 ? n.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "") : n.toFixed(0);
  return s.replace(".", ",") + " %";
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function monthName(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const name = MONTHS[m - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} ${y}`;
}

export function date(iso: string | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
