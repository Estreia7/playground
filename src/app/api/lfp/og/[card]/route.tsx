import { ImageResponse } from "next/og";
import { salarioLiquido } from "@/app/lfp/calc";
import { adjustForInflation, daysOfWork } from "@/app/lfp/econ";
import { eur0, num, pct } from "@/app/lfp/format";
import { dictionaries, isLang, tr, type Lang } from "@/app/lfp/i18n";
import { bandFor, type QuizMode } from "@/app/lfp/quiz/engine";
import { readEcon } from "../../econ/read";
import { readDataset } from "../../storage";
import { loadFonts } from "../fonts";

/* Share cards — 1200×630 PNGs for WhatsApp and friends.

   Only INPUTS are read from the URL (a salary, a year, a price, a score).
   Every figure on the card is recomputed here from the same pure functions
   and the same datasets the page uses, so a card can never disagree with
   the site and a URL cannot be edited into a false claim. Every card carries
   the source, the data year and "sem valor legal" — a screenshot travelling
   without context is exactly how misinformation starts. */

export const dynamic = "force-dynamic";

const CAL = "#F5F2E9";
const TILE = "#FBFAF6";
const COBALT = "#1B4E8C";
const DEEP = "#0E2E57";
const MIST = "#5A6B80";
const VERDE = "#1B7A4B";
const VERMELHO = "#B02A26";
const LINE = "rgba(14,46,87,0.16)";

type Ctx = { params: Promise<{ card: string }> };

const MODES: QuizMode[] = ["geral", "irs", "tsu", "iva", "irc", "economia"];

function numParam(sp: URLSearchParams, key: string, fallback: number, min: number, max: number): number {
  const n = Number(sp.get(key));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

interface CardModel {
  eyebrow: string;
  figure: string;
  figureColor: string;
  sub: string;
  detail?: { label: string; value: string; color?: string }[];
  bar?: { keep: number; state: number };
  source: string;
  year: number;
}

async function buildCard(card: string, sp: URLSearchParams, lang: Lang): Promise<CardModel | null> {
  const d = dictionaries[lang];
  const s = d.chrome.share;
  const money = (n: number) => eur0(n, lang);

  if (card === "salario") {
    const irs = await readDataset("irs");
    const tsu = await readDataset("tsu");
    if (!irs || !tsu) return null;
    const bruto = numParam(sp, "bruto", 1500, 0, 100000);
    const r = salarioLiquido(
      { brutoMensal: bruto, meses: 14, situacao: "nao_casado", dependentes: 0, regiao: "continente", subsidioRefeicao: { ativo: false, valorDiario: 0, meio: "cartao", diasMes: 22 } },
      { irs, tsu }
    );
    return {
      eyebrow: tr(s.cards.salarioEyebrow, { bruto: money(bruto) }),
      figure: money(r.liquidoMensal),
      figureColor: VERDE,
      sub: s.cards.salarioSub,
      detail: [
        { label: d.chrome.flow.irs, value: money(r.irsRetido), color: VERMELHO },
        { label: d.chrome.flow.tsu, value: money(r.tsuTrabalhador), color: VERMELHO },
        { label: s.cards.effective, value: pct(r.taxaEfetivaIrs, lang) },
      ],
      bar: { keep: r.liquidoMensal, state: r.totalEntregueAoEstado },
      source: irs.meta.label,
      year: irs.meta.year,
    };
  }

  if (card === "inflacao") {
    const infl = await readEcon("inflation");
    if (!infl) return null;
    const amount = numParam(sp, "amount", 1000, 0, 100000000);
    const from = Math.round(numParam(sp, "from", 1999, infl.firstYear, infl.lastYear));
    const to = Math.round(numParam(sp, "to", infl.lastYear, infl.firstYear, infl.lastYear));
    const adjusted = adjustForInflation(amount, infl.values, from, to);
    if (adjusted === null) return null;
    const factor = adjusted / (amount || 1);
    return {
      eyebrow: tr(s.cards.inflacaoEyebrow, { amount: money(amount), from }),
      figure: money(adjusted),
      figureColor: DEEP,
      sub: tr(s.cards.inflacaoSub, { to }),
      detail: [
        { label: s.cards.priceRise, value: `+${pct(factor - 1, lang)}`, color: VERMELHO },
        { label: s.cards.multiplier, value: `×${num(factor, lang, 2)}` },
      ],
      source: infl.meta.label,
      year: infl.meta.year,
    };
  }

  if (card === "dias") {
    const wages = await readEcon("wages");
    if (!wages) return null;
    const price = numParam(sp, "price", 1000, 0, 100000000);
    const unit = sp.get("unit") === "eur" ? "eur" : "pps";
    const pt = wages.countries.find((c) => c.code === "PT");
    const wage = unit === "pps" ? pt?.value : pt?.valueEur;
    if (!pt || !wage) return null;
    const days = daysOfWork(price, wage, 220);
    if (days === null) return null;
    return {
      eyebrow: tr(s.cards.diasEyebrow, { price: money(price) }),
      figure: `${num(days, lang, 1)} ${days >= 1.95 ? s.cards.days : s.cards.day}`,
      figureColor: DEEP,
      sub: unit === "pps" ? s.cards.diasSubPps : s.cards.diasSubEur,
      detail: [{ label: s.cards.daily, value: money(wage / 220) }],
      source: wages.meta.label,
      year: pt.year,
    };
  }

  if (card === "quiz") {
    const modeRaw = sp.get("mode") ?? "geral";
    const mode = (MODES as string[]).includes(modeRaw) ? (modeRaw as QuizMode) : "geral";
    const t = Math.round(numParam(sp, "t", 0, 1, 100));
    const c = Math.round(numParam(sp, "c", 0, 0, t));
    const band = bandFor(t ? c / t : 0);
    const q = d.quiz.quiz;
    return {
      eyebrow: tr(s.cards.quizEyebrow, { mode: q.modes[mode] }),
      figure: q.result.bands[band],
      figureColor: c / t >= 0.6 ? VERDE : DEEP,
      sub: tr(q.result.score, { n: c, total: t }),
      detail: [{ label: s.cards.score, value: pct(t ? c / t : 0, lang, 0) }],
      source: s.cards.quizSource,
      year: 2026,
    };
  }

  return null;
}

export async function GET(request: Request, ctx: Ctx) {
  const { card } = await ctx.params;
  const sp = new URL(request.url).searchParams;
  const langRaw = sp.get("lang");
  const lang: Lang = isLang(langRaw) ? langRaw : "pt";
  const s = dictionaries[lang].chrome.share;

  const model = await buildCard(card, sp, lang);
  if (!model) return new Response("Unknown card", { status: 404 });

  const fonts = await loadFonts();
  const display = fonts.some((f) => f.name === "Fraunces") ? "Fraunces" : "sans-serif";
  const mono = fonts.some((f) => f.name === "IBM Plex Mono") ? "IBM Plex Mono" : "monospace";

  const total = model.bar ? model.bar.keep + model.bar.state : 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          background: CAL,
          color: DEEP,
          fontFamily: mono,
          position: "relative",
        }}
      >
        {/* cobalt rule along the top — the azulejo edge */}
        <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 10, background: COBALT, display: "flex" }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "56px 72px 0 72px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <span style={{ fontFamily: display, fontSize: 44, fontWeight: 600, color: DEEP }}>LFP</span>
            <span style={{ fontSize: 20, color: MIST, letterSpacing: 2 }}>{s.siteName}</span>
          </div>
          <span style={{ fontSize: 18, color: MIST, letterSpacing: 3, textTransform: "uppercase" }}>{s.legalShort}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", padding: "40px 72px 0 72px", flexGrow: 1 }}>
          <span style={{ fontSize: 24, color: MIST, letterSpacing: 3, textTransform: "uppercase" }}>{model.eyebrow}</span>
          <span style={{ fontFamily: display, fontSize: model.figure.length > 14 ? 88 : 128, fontWeight: 600, color: model.figureColor, lineHeight: 1.05, marginTop: 12 }}>
            {model.figure}
          </span>
          <span style={{ fontSize: 30, color: DEEP, marginTop: 12 }}>{model.sub}</span>

          {model.bar && total > 0 && (
            <div style={{ display: "flex", width: 1056, height: 26, marginTop: 36, borderRadius: 8, overflow: "hidden", border: `1px solid ${LINE}` }}>
              <div style={{ display: "flex", width: `${(model.bar.keep / total) * 100}%`, background: VERDE }} />
              <div style={{ display: "flex", width: `${(model.bar.state / total) * 100}%`, background: VERMELHO }} />
            </div>
          )}

          {model.detail && (
            <div style={{ display: "flex", gap: 48, marginTop: 32 }}>
              {model.detail.map((it) => (
                <div key={it.label} style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 18, color: MIST }}>{it.label}</span>
                  <span style={{ fontSize: 32, fontWeight: 500, color: it.color ?? DEEP }}>{it.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Satori truncates only inside a FIXED width, and a flex sibling
            will wrap unless told not to shrink. */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px 72px 40px 72px", borderTop: `1px solid ${LINE}`, marginTop: 24, background: TILE }}>
          <span style={{ fontSize: 18, color: MIST, width: 700, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
            {s.sourceLabel} {model.source}
          </span>
          <span style={{ fontSize: 18, color: MIST, whiteSpace: "nowrap", flexShrink: 0 }}>
            {tr(s.legalYear, { year: model.year })}
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      // An explicit empty list disables Satori's bundled fallback and throws
      // "No fonts are loaded" — so the option is only passed when a font was
      // actually fetched. Without it the card renders in the default sans.
      ...(fonts.length > 0 ? { fonts } : {}),
      headers: { "cache-control": "public, max-age=86400, s-maxage=86400" },
    }
  );
}
