import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { ConsultantStatus } from "../core/types.ts";
import { STATUS_LABEL } from "../core/types.ts";
import { PRIZE_LEVELS, prizeIcon } from "../core/prizes.ts";
import type { Report } from "../core/report.ts";
import { MONTH_SHORT, date, money0, monthName, percent, today } from "./format.ts";

/* Draws a consultant's analysis on one A4 page, in the browser. */

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const INK = hex("#112031");
const TEAL = hex("#345b63");
const JADE = hex("#a9d4bb");
const PALE = hex("#eef5f3");
const LINE = hex("#dce8e4");
const MUTED = hex("#5b7176");
const AMBER = hex("#b9771f");
const GREEN = hex("#2f7a57");

const W = 595;
const H = 842;
const M = 40;
const INNER = W - M * 2;

/** The built-in PDF fonts only know Latin-1 and a few extras. */
const clean = (s: string) => s.replace(/[   ]/g, " ").replace(/−/g, "-");

const signed = (g: number) => (g >= 0 ? "+" : "-") + percent(Math.abs(g) * 100, 1);

async function iconPng(doc: PDFDocument, url: string): Promise<PDFImage> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth * 2;
  canvas.height = img.naturalHeight * 2;
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return doc.embedPng(canvas.toDataURL("image/png"));
}

export async function reportPdf(r: Report, status: ConsultantStatus): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const period = r.month === 0 ? `janeiro de ${r.year}` : `janeiro a ${monthName(`${r.year}-${String(r.month + 1).padStart(2, "0")}`).split(" ")[0].toLowerCase()} de ${r.year}`;
  doc.setTitle(clean(`Análise de ${r.name} · ${period}`));
  doc.setAuthor("ReorgSI");

  const page = doc.addPage([W, H]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [logo, ...icons] = await Promise.all([
    fetch("/reorgsi/mark.png").then((x) => x.arrayBuffer()).then((b) => doc.embedPng(b)),
    ...PRIZE_LEVELS.map((l) => iconPng(doc, prizeIcon(l))),
  ]);

  const text = (s: string, x: number, y: number, size = 10, font: PDFFont = regular, color = INK) => page.drawText(clean(s), { x, y, size, font, color });
  const right = (s: string, x: number, y: number, size = 10, font: PDFFont = regular, color = INK) =>
    text(s, x - font.widthOfTextAtSize(clean(s), size), y, size, font, color);
  const heading = (s: string, x: number, y: number) => text(s, x, y, 11, bold);
  const rule = (x1: number, x2: number, y: number) => page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color: LINE });

  /* Header */
  let y = H - M;
  page.drawImage(logo, { x: M, y: y - 38, width: 38, height: 38 });
  text("Análise de desempenho", M + 50, y - 12, 9.5, regular, MUTED);
  text(r.name, M + 50, y - 34, 20, bold);
  right(period[0].toUpperCase() + period.slice(1), W - M, y - 12, 9.5, bold, TEAL);
  right(STATUS_LABEL[status], W - M, y - 26, 9.5, regular, MUTED);
  y -= 54;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: INK });

  /* Key figures */
  y -= 14;
  const tiles: [string, string, string][] = [
    [`Faturação ${r.year}`, money0(r.billed), `até ${MONTH_SHORT[r.month]}`],
    [
      `Mesmo período ${r.prevYear}`,
      r.prevToDate == null ? "—" : money0(r.prevToDate),
      r.growth == null ? "sem meses para comparar" : `${signed(r.growth)} face a ${r.prevYear}`,
    ],
    ["Média mensal", money0(r.monthlyAverage), "nos meses em atividade"],
    ["Projeção do ano", money0(r.projection), r.monthsLeft ? "ao ritmo atual" : "ano fechado"],
  ];
  const gap = 8;
  const tw = (INNER - gap * 3) / 4;
  tiles.forEach(([label, value, note], i) => {
    const x = M + i * (tw + gap);
    const hero = i === 3;
    page.drawRectangle({ x, y: y - 64, width: tw, height: 64, color: hero ? INK : PALE });
    text(label, x + 9, y - 16, 8.5, regular, hero ? JADE : MUTED);
    text(value, x + 9, y - 37, 15, bold, hero ? rgb(1, 1, 1) : INK);
    text(note, x + 9, y - 53, 7.8, regular, hero ? JADE : MUTED);
  });
  y -= 64;

  /* Monthly chart */
  y -= 26;
  heading("Faturação mensal", M, y);
  const legend: [string, typeof INK, boolean][] = [
    ...(r.prevMonths ? ([[r.prevYear, JADE, false]] as [string, typeof INK, boolean][]) : []),
    [r.year, TEAL, false],
    ...(r.goalPerMonth ? ([["Objetivo por mês em falta", AMBER, true]] as [string, typeof INK, boolean][]) : []),
  ];
  let lx = W - M;
  for (const [label, color, ghost] of [...legend].reverse()) {
    lx -= regular.widthOfTextAtSize(label, 8);
    text(label, lx, y, 8, regular, MUTED);
    lx -= 12;
    page.drawRectangle({ x: lx, y: y - 0.5, width: 8, height: 8, color: ghost ? undefined : color, borderColor: ghost ? color : undefined, borderWidth: ghost ? 0.8 : 0 });
    lx -= 12;
  }
  const chartH = 120;
  const base = y - 14 - chartH;
  const prev = r.prevMonths ?? [];
  const top = Math.max(1, ...r.months, ...prev, r.goalPerMonth ?? 0);
  const step = Math.pow(10, Math.floor(Math.log10(top))) * (top / Math.pow(10, Math.floor(Math.log10(top))) > 5 ? 2 : top / Math.pow(10, Math.floor(Math.log10(top))) > 2 ? 1 : 0.5);
  const scale = Math.ceil(top / step) * step;
  const axis = 34;
  for (let t = 0; t <= scale + 1e-6; t += step) {
    const ty = base + (t / scale) * chartH;
    rule(M + axis, W - M, ty);
    right(t >= 1000 ? `${Math.round(t / 100) / 10}k`.replace(".", ",") : String(Math.round(t)), M + axis - 5, ty - 2.5, 7.5, regular, MUTED);
  }
  const gw = (INNER - axis) / 12;
  const bw = Math.min(14, gw * 0.34);
  MONTH_SHORT.forEach((m, i) => {
    const cx = M + axis + gw * i + gw / 2;
    const bar = (v: number, x: number, color: typeof INK) => v > 0 && page.drawRectangle({ x, y: base, width: bw, height: (v / scale) * chartH, color });
    bar(prev[i] ?? 0, cx - bw - 1, JADE);
    if (i <= r.month) bar(r.months[i], cx + 1, TEAL);
    else if (r.goalPerMonth) {
      page.drawRectangle({ x: cx + 1, y: base, width: bw, height: (r.goalPerMonth / scale) * chartH, borderColor: AMBER, borderWidth: 0.8, borderDashArray: [2, 2] });
    }
    const w = regular.widthOfTextAtSize(m, 8);
    text(m, cx - w / 2, base - 11, 8, regular, MUTED);
  });
  y = base - 14;

  /* How the year is going, and what is left to reach */
  y -= 22;
  const colGap = 24;
  const leftW = 200;
  const rightX = M + leftW + colGap;
  heading("Como está a sair o ano", M, y);
  heading("Valores a atingir", rightX, y);
  const rows: [string, string, typeof INK?][] = [
    [`Faturado até ${MONTH_SHORT[r.month]}`, money0(r.billed)],
    ["Projeção ao ritmo atual", money0(r.projection)],
    [`Total de ${r.prevYear}`, r.prevFull ? money0(r.prevFull) : "—"],
  ];
  if (r.prevFull) {
    const diff = r.projection - r.prevFull;
    rows.push([`Projeção face a ${r.prevYear}`, `${diff >= 0 ? "+" : "-"}${money0(Math.abs(diff))}`, diff >= 0 ? GREEN : AMBER]);
  }
  if (r.goal) {
    const diff = r.projection - r.goal;
    rows.push(["Projeção face ao objetivo", `${diff >= 0 ? "+" : "-"}${money0(Math.abs(diff))}`, diff >= 0 ? GREEN : AMBER]);
  }
  if (r.backlog) rows.push(["Por faturar em negócios", money0(r.backlog)]);
  let ry = y - 18;
  for (const [label, value, color] of rows) {
    text(label, M, ry, 9, regular, MUTED);
    right(value, M + leftW, ry, 9, bold, color ?? INK);
    rule(M, M + leftW, ry - 5);
    ry -= 17;
  }

  const cols = [rightX + 150, rightX + 221, W - M];
  let ty = y - 18;
  right("Valor", cols[0], ty, 7.8, regular, MUTED);
  right("Falta", cols[1], ty, 7.8, regular, MUTED);
  right(r.monthsLeft ? "Por mês" : "", cols[2], ty, 7.8, regular, MUTED);
  ty -= 15;
  if (!r.goal) {
    text(`Sem objetivo definido para ${r.year}.`, rightX, ty, 9, regular, MUTED);
    ty -= 17;
  }
  for (const t of r.targets) {
    if (t.level) page.drawImage(icons[PRIZE_LEVELS.indexOf(t.level)], { x: rightX, y: ty - 2, height: 11, width: t.level.icon === "double-centurion" ? 16.5 : 11 });
    text(t.label, rightX + (t.level ? 19 : 0), ty, 9, t.level ? regular : bold);
    right(money0(t.value), cols[0], ty, 9);
    right(t.reached ? "Atingido" : money0(t.missing), cols[1], ty, 9, bold, t.reached ? GREEN : INK);
    if (t.perMonth != null) right(t.reached ? "—" : money0(t.perMonth), cols[2], ty, 9, bold, t.reached ? MUTED : INK);
    rule(rightX, W - M, ty - 5);
    ty -= 17;
  }
  y = Math.min(ry, ty) + 6;

  /* Prizes */
  y -= 24;
  heading(`Programa de reconhecimento ${r.year}`, M, y);
  right(
    r.prize.next ? `${r.prize.current ? `${r.prize.current.label} · ` : ""}faltam ${money0(r.prize.missing)} para ${r.prize.next.label}` : `${r.prize.current?.label}: nível mais alto`,
    W - M,
    y,
    9,
    bold,
    TEAL,
  );
  y -= 44;
  const seg = INNER / PRIZE_LEVELS.length;
  PRIZE_LEVELS.forEach((l, i) => {
    const xr = M + seg * (i + 1);
    const w = l.icon === "double-centurion" ? 36 : 24;
    const reached = r.billed >= l.min;
    page.drawImage(icons[i], { x: xr - w, y: y + 2, width: w, height: 24, opacity: reached ? 1 : 0.28 });
    right(l.label, xr, y - 20, 7.8, reached ? bold : regular, reached ? INK : MUTED);
    right(money0(l.min), xr, y - 30, 7.5, regular, MUTED);
  });
  page.drawRectangle({ x: M, y: y - 10, width: INNER, height: 7, color: PALE });
  if (r.prize.position > 0) page.drawRectangle({ x: M, y: y - 10, width: INNER * r.prize.position, height: 7, color: TEAL });
  y -= 30;
  if (r.monthsLeft) {
    y -= 14;
    text(
      r.projectedLevel ? `Ao ritmo atual, termina o ano em ${r.projectedLevel.label}.` : `Ao ritmo atual, termina o ano abaixo de ${PRIZE_LEVELS[0].label}.`,
      M,
      y,
      9,
      regular,
      MUTED,
    );
  }

  /* Activity */
  y -= 26;
  heading("Negócios e angariações", M, y);
  const facts: [string, string][] = [
    [`Negócios ${r.year}`, String(r.deals.total)],
    ["Plenos", String(r.deals.plenos)],
    ["Partilhas", String(r.deals.partilhas)],
    ["Processos bancários", String(r.deals.bank)],
    ["Angariações ativas", String(r.listings.count)],
    ["Potencial de comissão", money0(r.listings.potential)],
    ["Esperado pela média", money0(r.listings.expected)],
    ["Se forem partilhas", money0(r.listings.ifPartilha)],
  ];
  y -= 16;
  const fw = INNER / 4;
  facts.forEach(([label, value], i) => {
    const x = M + (i % 4) * fw;
    const fy = y - Math.floor(i / 4) * 30;
    text(label, x, fy, 8, regular, MUTED);
    text(value, x, fy - 13, 11, bold);
  });

  /* Footer */
  drawFooter(page, regular, r);
  return doc.save();
}

function drawFooter(page: PDFPage, font: PDFFont, r: Report) {
  const note = r.monthsLeft
    ? `Projeção: faturação até ${MONTH_SHORT[r.month]} mais a média mensal em cada mês que falta. Gerado a ${date(today())}.`
    : `Gerado a ${date(today())}.`;
  page.drawLine({ start: { x: M, y: 40 }, end: { x: W - M, y: 40 }, thickness: 0.6, color: LINE });
  page.drawText(clean(note), { x: M, y: 28, size: 7.5, font, color: MUTED });
}
