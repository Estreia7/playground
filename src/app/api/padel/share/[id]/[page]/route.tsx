import { ImageResponse } from "next/og";
import { promises as fs } from "fs";
import path from "path";
import { readClub } from "../../../store.ts";
import { IMAGE_WIDTH, PAD, SIZE, paginate, type RoundBlock, type SharePage } from "../../../../../padel/share/paginate.ts";
import { translate, type Key, type Lang } from "../../../../../padel/ui/i18n.ts";
import type { Club, Match, Tournament } from "../../../../../padel/core/types.ts";

export const dynamic = "force-dynamic";

/* One image of a tournament's matches.

   GET /api/padel/share/<tournament>/<n>.png?lang=pt

   This is a real URL for each image, which is the point: it can be copied to the
   clipboard as a picture, shared as a file, saved, or pasted as a link, and it
   always shows the tournament as it is now, scores included once they exist.

   Layout comes from padel/share/paginate.ts, so the heights drawn here are the
   heights the pagination promised. The image is built of single-line rows: a
   name too long for its space is cut with an ellipsis rather than wrapped,
   because a wrapped line would push the rows below it out of the image. */

const NAVY = "#0b1823";
const SURFACE = "#12283a";
const BALL = "#cbed09";
const MUTED = "#9fb0bf";
const TILE = "#f3f8e2";

/* The card, from the outside in. These add up to the page width, which is what
   fixes how much room a name has. */
const CARD_W = IMAGE_WIDTH - PAD * 2; // 968
const CARD_PAD = 22;
const GAP = 18;
const PILL = 88;
const CENTER = 110;
const TEAM_W = (CARD_W - CARD_PAD * 2 - PILL - CENTER - GAP * 3) / 2; // 336

interface Assets {
  semiBold: ArrayBuffer;
  extraBold: ArrayBuffer;
  logo: string;
}

let assets: Promise<Assets> | null = null;

/** Fonts and the logo, read once. Reading a 130 KB font on every request would
    be most of the time this route spends. */
function loadAssets(): Promise<Assets> {
  if (!assets) {
    assets = (async () => {
      const dir = path.join(process.cwd(), "src", "app", "padel", "share", "fonts");
      const toBuffer = (b: Buffer): ArrayBuffer =>
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
      const [semi, extra, logo] = await Promise.all([
        fs.readFile(path.join(dir, "Geist-SemiBold.ttf")),
        fs.readFile(path.join(dir, "Geist-ExtraBold.ttf")),
        fs.readFile(path.join(process.cwd(), "public", "padel-logo-128.png")),
      ]);
      return {
        semiBold: toBuffer(semi),
        extraBold: toBuffer(extra),
        logo: "data:image/png;base64," + logo.toString("base64"),
      };
    })().catch((error) => {
      // A failed read must not be remembered, or one bad moment would break
      // every image until the server restarts.
      assets = null;
      throw error;
    });
  }
  return assets;
}

type Ctx = { params: Promise<{ id: string; page: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { id, page } = await ctx.params;
  const url = new URL(request.url);
  const lang: Lang = url.searchParams.get("lang") === "en" ? "en" : "pt";

  // "2.png" and "2" both mean the second image.
  const number = Number(page.replace(/\.png$/i, ""));
  if (!Number.isInteger(number) || number < 1) {
    return Response.json({ error: "badRequest" }, { status: 400 });
  }

  const club = await readClub();
  const tournament = club.tournaments.find((t) => t.id === id);
  if (!tournament) return Response.json({ error: "notFound" }, { status: 404 });

  const pages = paginate(tournament);
  const current = pages[number - 1];
  if (!current) return Response.json({ error: "notFound" }, { status: 404 });

  const a = await loadAssets();
  const t = (key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const nameOf = (pid: string) => club.players.find((p) => p.id === pid)?.name ?? "?";

  return new ImageResponse(<Sheet club={club} tournament={tournament} page={current} assets={a} t={t} nameOf={nameOf} />, {
    width: IMAGE_WIDTH,
    height: current.height,
    fonts: [
      { name: "Geist", data: a.semiBold, weight: 600, style: "normal" },
      { name: "Geist", data: a.extraBold, weight: 800, style: "normal" },
    ],
    headers: {
      // The tournament changes as scores come in, and the URL is stable, so
      // nothing may be cached under it. The app adds a revision to the address
      // it asks for.
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename="padel-jogos-${number}.png"`,
    },
  });
}

/* ── the image ─────────────────────────────────────────────── */

type T = (key: Key, vars?: Record<string, string | number>) => string;

interface SheetProps {
  club: Club;
  tournament: Tournament;
  page: SharePage;
  assets: Assets;
  t: T;
  nameOf: (id: string) => string;
}

function Sheet({ tournament, page, assets, t, nameOf }: SheetProps) {
  const title = tournament.name || t(`format.${tournament.format}` as Key);
  const meta = t("share.meta", {
    format: t(`format.${tournament.format}` as Key),
    players: tournament.playerIds.length,
    rounds: Math.max(tournament.plannedRounds, tournament.rounds.length),
  });

  return (
    <div
      style={{
        width: IMAGE_WIDTH,
        height: page.height,
        display: "flex",
        flexDirection: "column",
        padding: `0 ${PAD}px`,
        background: `linear-gradient(180deg, ${SURFACE} 0%, ${NAVY} 38%, #08121b 100%)`,
        color: "#ffffff",
        fontFamily: "Geist",
      }}
    >
      {page.first ? (
        <Header logo={assets.logo} title={title} meta={meta} />
      ) : (
        <SlimHeader logo={assets.logo} title={title} label={roundsLabel(page, t)} />
      )}

      {page.blocks.map((block) => (
        <Round key={block.roundN + (block.continued ? "c" : "")} block={block} t={t} nameOf={nameOf} />
      ))}

      <Footer number={page.number} total={page.total} />
    </div>
  );
}

function roundsLabel(page: SharePage, t: T): string {
  return page.fromRound === page.toRound
    ? t("share.round", { n: page.fromRound })
    : t("share.rounds", { from: page.fromRound, to: page.toRound });
}

function Logo({ src, size }: { src: string; size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.26),
        background: TILE,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img src={src} width={Math.round(size * 0.86)} height={Math.round(size * 0.86)} alt="" />
    </div>
  );
}

function Header({ logo, title, meta }: { logo: string; title: string; meta: string }) {
  return (
    <div style={{ height: SIZE.header, display: "flex", alignItems: "center", gap: 32 }}>
      <Logo src={logo} size={132} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 760 }}>
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: -1.5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 32, fontWeight: 600, color: MUTED, whiteSpace: "nowrap" }}>{meta}</div>
      </div>
    </div>
  );
}

function SlimHeader({ logo, title, label }: { logo: string; title: string; label: string }) {
  return (
    <div style={{ height: SIZE.slimHeader, display: "flex", alignItems: "center", gap: 22 }}>
      <Logo src={logo} size={68} />
      <div
        style={{
          width: 600,
          fontSize: 42,
          fontWeight: 800,
          letterSpacing: -1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </div>
      <div style={{ marginLeft: "auto", fontSize: 34, fontWeight: 800, color: BALL }}>{label}</div>
    </div>
  );
}

function Round({ block, t, nameOf }: { block: RoundBlock; t: T; nameOf: (id: string) => string }) {
  // Who is sitting out goes on the heading row, so it costs no height of its own.
  const showByes = block.byes.length > 0 && !block.continued;
  const heading =
    t("share.round", { n: block.roundN }) + (block.continued ? " · " + t("share.continued") : "");
  const resting = t("t.resting") + ": " + block.byes.map(nameOf).join(", ");
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ height: SIZE.roundHeading, display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ fontSize: 44, fontWeight: 800, color: BALL, letterSpacing: -0.5 }}>
          {heading}
        </div>
        <div style={{ flex: 1, height: 2, background: "rgba(203,237,9,0.2)" }} />
        {showByes && (
          <div
            style={{
              maxWidth: 470,
              fontSize: 27,
              fontWeight: 600,
              color: MUTED,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {resting}
          </div>
        )}
      </div>

      {block.matches.map((m) => (
        <MatchRow key={m.id} match={m} nameOf={nameOf} />
      ))}

      <div style={{ height: SIZE.roundGap }} />
    </div>
  );
}

function MatchRow({ match, nameOf }: { match: Match; nameOf: (id: string) => string }) {
  const scored = match.scoreA !== null && match.scoreB !== null;
  return (
    <div
      style={{
        height: SIZE.match,
        marginBottom: SIZE.matchGap,
        display: "flex",
        alignItems: "center",
        gap: GAP,
        padding: `0 ${CARD_PAD}px`,
        borderRadius: 28,
        background: "rgba(255,255,255,0.055)",
        border: "2px solid rgba(203,237,9,0.16)",
      }}
    >
      <div
        style={{
          width: PILL,
          height: 60,
          borderRadius: 18,
          background: BALL,
          color: NAVY,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 32,
          fontWeight: 800,
        }}
      >
        {"C" + match.court}
      </div>

      <Team names={match.a.map(nameOf)} align="flex-start" />

      <div
        style={{
          width: CENTER,
          display: "flex",
          justifyContent: "center",
          fontSize: scored ? 38 : 30,
          fontWeight: scored ? 800 : 600,
          color: scored ? BALL : "#6f8598",
          whiteSpace: "nowrap",
        }}
      >
        {scored ? `${match.scoreA}–${match.scoreB}` : "vs"}
      </div>

      <Team names={match.b.map(nameOf)} align="flex-end" />
    </div>
  );
}

function Team({ names, align }: { names: string[]; align: "flex-start" | "flex-end" }) {
  return (
    <div style={{ width: TEAM_W, display: "flex", flexDirection: "column", alignItems: align }}>
      {names.map((name, i) => (
        <div
          key={i}
          style={{
            maxWidth: TEAM_W,
            fontSize: 38,
            fontWeight: 600,
            lineHeight: 1.18,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </div>
      ))}
    </div>
  );
}

function Footer({ number, total }: { number: number; total: number }) {
  return (
    <div
      style={{
        marginTop: "auto",
        height: SIZE.footer,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderTop: "2px solid rgba(255,255,255,0.08)",
        fontSize: 30,
        fontWeight: 600,
        color: MUTED,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 18, height: 18, borderRadius: 9, background: BALL }} />
        <div style={{ color: "#ffffff", fontWeight: 800 }}>Bora Padel</div>
      </div>
      {total > 1 ? <div>{`${number}/${total}`}</div> : <div />}
    </div>
  );
}
