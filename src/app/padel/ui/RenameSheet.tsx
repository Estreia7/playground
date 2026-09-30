"use client";

import { useEffect, useId, useRef, useState } from "react";
import { errorText, usePadel } from "./PadelProvider";
import { Sheet } from "./Sheet";
import { cleanName } from "../core/actions.ts";
import { LIMITS } from "../core/types.ts";

/* Fixing a player's name, in two steps: type the new name, then confirm the
   change with both names side by side — a rename touches every tournament the
   player has ever played, so it is never one tap.

   The player is changed by id, so matches, the ranking and the statistics all
   stay with them. When the new name already belongs to someone else, that is
   almost always the typo case ("Joao" made a second player next to "João"), so
   instead of a dead end the sheet offers to merge the two — unless they played
   in the same tournament, in which case they cannot be one person. */

const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" }) === 0;

type Step = "edit" | "confirm";

export function RenameSheet({
  playerId,
  onClose,
  onRenamed,
}: {
  playerId: string;
  onClose: () => void;
  /** Called with the old and new name once the server has the change. */
  onRenamed?: (from: string, to: string) => void;
}) {
  const { club, t, act, nameOf } = usePadel();
  const current = nameOf(playerId);
  const [draft, setDraft] = useState(current);
  const [step, setStep] = useState<Step>("edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();

  useEffect(() => {
    if (step === "edit") input.current?.select();
  }, [step]);

  const next = cleanName(draft);
  const other = club?.players.find((p) => p.id !== playerId && same(p.name, next));
  const playedIn = (id: string) => club?.tournaments.filter((x) => x.playerIds.includes(id)).length ?? 0;
  const together = !!other && !!club?.tournaments.some((x) => x.playerIds.includes(playerId) && x.playerIds.includes(other.id));
  const canContinue = next.length > 0 && next !== current;

  const tournaments = (n: number) =>
    n === 0 ? t("rename.tournamentsNone") : n === 1 ? t("rename.tournamentsOne") : t("rename.tournaments", { n });

  async function confirm() {
    setSaving(true);
    setError("");
    const r = other
      ? await act({ type: "mergePlayers", fromId: playerId, intoId: other.id })
      : await act({ type: "renamePlayer", playerId, name: next });
    setSaving(false);
    if (!r.ok) {
      setError(errorText(t, r.error));
      return;
    }
    onRenamed?.(current, other ? other.name : next);
    onClose();
  }

  const title =
    step === "edit" ? t("rename.title") : other ? t("rename.mergeTitle", { name: other.name }) : t("rename.confirmTitle");

  return (
    <Sheet title={title} onClose={onClose}>
      {step === "edit" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canContinue) setStep("confirm");
          }}
        >
          <p className="mb-4 text-sm leading-snug text-zinc-400">{t("rename.keeps")}</p>
          <label className="mb-1.5 block text-sm font-semibold text-zinc-400" htmlFor={inputId}>
            {t("rename.label")}
          </label>
          <input
            id={inputId}
            ref={input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={LIMITS.maxNameLength}
            autoFocus
            autoCapitalize="words"
            autoComplete="off"
            enterKeyHint="next"
            className="min-h-14 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-lg text-zinc-100 focus:border-lime-300 focus:outline-none"
          />
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-14 flex-1 rounded-2xl border border-zinc-800 text-base font-semibold text-zinc-300"
            >
              {t("score.cancel")}
            </button>
            <button
              type="submit"
              disabled={!canContinue}
              className="min-h-14 flex-[2] rounded-2xl bg-lime-300 text-lg font-bold text-zinc-950 active:bg-lime-400 disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {t("rename.next")}
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="mb-4 mt-3 overflow-hidden rounded-2xl border border-zinc-800">
            <NameRow label={t("rename.from")} name={current} note={other ? tournaments(playedIn(playerId)) : undefined} muted />
            <div className="flex h-0 items-center justify-center" aria-hidden>
              <span className="z-10 flex h-8 w-8 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 text-lime-300">
                ↓
              </span>
            </div>
            <NameRow
              label={t("rename.to")}
              name={other ? other.name : next}
              note={other ? tournaments(playedIn(other.id)) : undefined}
            />
          </div>

          {other && together ? (
            <p role="alert" className="mb-4 rounded-xl bg-amber-400/10 px-4 py-3 text-sm leading-snug text-amber-200">
              {t("rename.mergeBlocked")}
            </p>
          ) : (
            <p className="mb-4 text-sm leading-snug text-zinc-400">
              {other ? t("rename.mergeBody", { from: current, to: other.name }) : t("rename.confirmBody")}
            </p>
          )}

          {error && (
            <p role="alert" className="mb-3 rounded-xl bg-red-500/10 px-4 py-3 text-red-300">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setError("");
                setStep("edit");
              }}
              className="min-h-14 flex-1 rounded-2xl border border-zinc-800 text-base font-semibold text-zinc-300"
            >
              {t("back")}
            </button>
            {!(other && together) && (
              <button
                type="button"
                onClick={confirm}
                disabled={saving}
                autoFocus
                className="min-h-14 flex-[2] rounded-2xl bg-lime-300 text-lg font-bold text-zinc-950 active:bg-lime-400 disabled:opacity-60"
              >
                {saving ? t("score.saving") : other ? t("rename.mergeYes") : t("rename.yes")}
              </button>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}

function NameRow({ label, name, note, muted = false }: { label: string; name: string; note?: string; muted?: boolean }) {
  return (
    <div className={`flex items-baseline gap-3 px-4 py-4 ${muted ? "bg-zinc-900/40" : "bg-lime-300/[0.06]"}`}>
      <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
      <span className={`min-w-0 flex-1 truncate text-lg ${muted ? "text-zinc-400" : "font-bold text-lime-300"}`}>{name}</span>
      {note && <span className="shrink-0 text-sm tabular-nums text-zinc-500">{note}</span>}
    </div>
  );
}
