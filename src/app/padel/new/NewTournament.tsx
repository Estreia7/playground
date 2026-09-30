"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { errorText, usePadel } from "../ui/PadelProvider";
import { Page, Section, Stepper, TopBar } from "../ui/parts";
import { CreatingOverlay } from "../ui/CreatingOverlay";
import { maxCourts, suggestedRounds, teamRounds } from "../core/schedule.ts";
import { LIMITS, type Format } from "../core/types.ts";

const POINT_PRESETS = [16, 21, 24, 32];
const FORMATS: Format[] = ["americano", "mexicano", "teams"];

const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" }) === 0;

export function NewTournament() {
  const { club, t, act } = usePadel();
  const router = useRouter();

  const [name, setName] = useState("");
  const [format, setFormat] = useState<Format>("americano");
  const [players, setPlayers] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [courtsChoice, setCourts] = useState<number | null>(null);
  const [roundsChoice, setRounds] = useState<number | null>(null);
  const [scoring, setScoring] = useState<"points" | "games">("points");
  const [total, setTotal] = useState(24);
  const [saving, setSaving] = useState(false);
  // Set once the server has the tournament. The loader waits for both this and
  // its own minimum time before opening it.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const n = players.length;
  const courtsMax = Math.max(1, maxCourts(n, format));
  // Until the organiser touches them, courts and rounds follow the field size.
  const courts = Math.min(courtsChoice ?? courtsMax, courtsMax);
  const autoRounds = suggestedRounds(n, courts);
  const rounds = roundsChoice ?? autoRounds;

  const known = useMemo(() => {
    const recent = new Map<string, number>();
    club?.tournaments.forEach((x, i) => x.playerIds.forEach((id) => !recent.has(id) && recent.set(id, i)));
    return (club?.players ?? [])
      .slice()
      .sort((a, b) => (recent.get(a.id) ?? 1e9) - (recent.get(b.id) ?? 1e9) || a.name.localeCompare(b.name));
  }, [club]);

  function add(raw: string) {
    const names = raw
      .split(/[,;\n]/)
      .map((s) => s.replace(/\s+/g, " ").trim().slice(0, LIMITS.maxNameLength))
      .filter(Boolean);
    setPlayers((prev) => {
      const next = prev.slice();
      for (const nm of names) if (!next.some((p) => same(p, nm)) && next.length < LIMITS.maxPlayers) next.push(nm);
      return next;
    });
    setRounds(null);
  }

  function toggle(nm: string) {
    setPlayers((prev) => (prev.some((p) => same(p, nm)) ? prev.filter((p) => !same(p, nm)) : [...prev, nm]));
    setRounds(null);
  }

  function shuffleTeams() {
    setPlayers((prev) => {
      const out = prev.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    });
  }

  const blocker =
    n < LIMITS.minPlayers
      ? t("new.needMore", { n: LIMITS.minPlayers - n })
      : format === "teams" && n % 2 === 1
        ? t("new.needEven")
        : "";

  async function create() {
    if (blocker || saving) return;
    setSaving(true);
    setError("");
    const r = await act({
      type: "createTournament",
      name,
      format,
      scoring: scoring === "points" ? { kind: "points", total } : { kind: "games" },
      courts,
      rounds,
      players,
    });
    if (r.ok && r.id) {
      setCreatedId(r.id);
    } else {
      setSaving(false);
      setError(errorText(t, r.ok ? "server" : r.error));
    }
  }

  const openCreated = useCallback(() => {
    // ?share=1 opens the "send the matches" sheet on arrival: the whole point of
    // creating a tournament is to tell the group who plays whom.
    if (createdId) router.push(`/padel/t/${createdId}?share=1`);
  }, [createdId, router]);

  // What the choices add up to, in one line.
  let summary = "";
  if (n >= LIMITS.minPlayers) {
    if (format === "teams") {
      if (n % 2 === 0) summary = t("new.teamsSummary", { rounds: teamRounds(n / 2, courts) });
    } else if (format === "mexicano") {
      summary = t("new.mexicanoSummary");
    } else {
      const rest = n - courts * 4;
      const slots = rounds * courts * 4;
      const games = Math.floor(slots / n);
      summary = rest > 0 ? t("new.summary", { games: slots % n ? `${games}–${games + 1}` : games, rest }) : t("new.summaryNoRest", { games });
      if (slots % n) summary += " " + t("new.summaryUneven");
    }
  }

  const input =
    "min-h-12 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-lime-300 focus:outline-none";

  return (
    <>
      {saving && (
        <CreatingOverlay
          names={players}
          subtitle={t(`format.${format}`) + " · " + t("home.players", { n })}
          ready={createdId !== null}
          onDone={openCreated}
        />
      )}
      <TopBar title={t("new.title")} back="/padel" />
      <Page nav={false}>
        <Section title={t("new.format")}>
          <div className="space-y-2">
            {FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFormat(f);
                  setRounds(null);
                }}
                aria-pressed={format === f}
                className={`block w-full rounded-2xl border p-4 text-left ${
                  format === f ? "border-lime-300 bg-lime-300/10" : "border-zinc-800 bg-zinc-900/60"
                }`}
              >
                <span className={`block text-lg font-bold ${format === f ? "text-lime-300" : ""}`}>{t(`format.${f}`)}</span>
                <span className="mt-0.5 block text-sm leading-snug text-zinc-400">{t(`format.${f}.desc`)}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section title={t("new.players")} aside={t("new.playersCount", { n })}>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add(draft);
              setDraft("");
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("new.addPlaceholder")}
              aria-label={t("new.addPlaceholder")}
              autoCapitalize="words"
              autoComplete="off"
              enterKeyHint="done"
              className={input}
            />
            <button type="submit" className="min-h-12 shrink-0 rounded-xl bg-zinc-800 px-4 font-semibold active:bg-zinc-700">
              {t("new.add")}
            </button>
          </form>

          {known.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-sm text-zinc-500">{t("new.known")}</p>
              <div className="flex flex-wrap gap-2">
                {known.map((p) => {
                  const on = players.some((x) => same(x, p.name));
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggle(p.name)}
                      aria-pressed={on}
                      className={`min-h-11 rounded-full border px-4 text-base ${
                        on ? "border-lime-300 bg-lime-300 font-semibold text-zinc-950" : "border-zinc-700 text-zinc-300"
                      }`}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {n === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">{t("new.noneYet")}</p>
          ) : (
            <div className="mt-4">
              {format === "teams" && (
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm text-zinc-500">{t("new.teamsHint")}</p>
                  <button type="button" onClick={shuffleTeams} className="min-h-10 shrink-0 rounded-lg bg-zinc-800 px-3 text-sm font-semibold">
                    🔀 {t("new.shuffleTeams")}
                  </button>
                </div>
              )}
              <ol className="divide-y divide-zinc-900 overflow-hidden rounded-2xl border border-zinc-800">
                {players.map((p, i) => (
                  <li
                    key={p}
                    className={`flex min-h-12 items-center gap-3 pl-4 ${
                      format === "teams" && Math.floor(i / 2) % 2 === 1 ? "bg-zinc-900/70" : "bg-zinc-900/30"
                    }`}
                  >
                    <span className="w-14 shrink-0 text-sm tabular-nums text-zinc-500">
                      {format === "teams" ? (i % 2 === 0 ? t("new.team", { n: i / 2 + 1 }) : "") : i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-base">{p}</span>
                    <button
                      type="button"
                      onClick={() => toggle(p)}
                      aria-label={t("new.remove", { name: p })}
                      className="flex h-12 w-12 items-center justify-center text-xl text-zinc-500 active:text-red-400"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Section>

        {n >= LIMITS.minPlayers && (
          <>
            <div className="mb-6 grid grid-cols-1 gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-base font-semibold">{t("new.courts")}</span>
                <Stepper
                  label={t("new.courts")}
                  value={courts}
                  min={1}
                  max={courtsMax}
                  onChange={(v) => {
                    setCourts(v);
                    setRounds(null);
                  }}
                />
              </div>
              {format !== "teams" && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-base font-semibold">{t("new.rounds")}</span>
                  <Stepper label={t("new.rounds")} value={rounds} min={1} max={LIMITS.maxRounds} onChange={setRounds} />
                </div>
              )}
              {summary && <p className="text-sm leading-snug text-zinc-400 sm:col-span-2">{summary}</p>}
            </div>

            <Section title={t("new.scoring")}>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-zinc-900 p-1">
                {(["points", "games"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setScoring(k)}
                    aria-pressed={scoring === k}
                    className={`min-h-11 rounded-lg font-semibold ${scoring === k ? "bg-zinc-700 text-white" : "text-zinc-400"}`}
                  >
                    {t(k === "points" ? "new.points" : "new.games")}
                  </button>
                ))}
              </div>
              {scoring === "points" ? (
                <div className="mt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {POINT_PRESETS.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setTotal(v)}
                        aria-pressed={total === v}
                        className={`min-h-11 min-w-14 rounded-xl border text-lg font-bold tabular-nums ${
                          total === v ? "border-lime-300 bg-lime-300 text-zinc-950" : "border-zinc-700 text-zinc-300"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                    <div className="ml-auto">
                      <Stepper
                        label={t("new.points")}
                        value={total}
                        min={LIMITS.minPointsTotal}
                        max={LIMITS.maxPointsTotal}
                        onChange={setTotal}
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-zinc-500">{t("new.pointsDesc", { n: total })}</p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">{t("new.gamesDesc")}</p>
              )}
            </Section>

            <Section title={t("new.name")}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("new.namePlaceholder")}
                aria-label={t("new.name")}
                maxLength={LIMITS.maxNameLength}
                className={input}
              />
            </Section>
          </>
        )}

        {error && (
          <p role="alert" className="mb-3 rounded-xl bg-red-500/10 px-4 py-3 text-red-300">
            {error}
          </p>
        )}

        <div className="sticky bottom-0 -mx-4 bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          <button
            type="button"
            onClick={create}
            disabled={!!blocker || saving}
            className="min-h-14 w-full rounded-2xl bg-lime-300 text-lg font-bold text-zinc-950 active:bg-lime-400 disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {saving ? t("new.creating") : blocker || t("new.create")}
          </button>
        </div>
      </Page>
    </>
  );
}
