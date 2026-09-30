import type { Round } from "../core/types.ts";
import type { Key } from "./i18n.ts";

/* Names for the stages of a tournament. A knockout round is called by what it
   is — "Semi-finals", "Final" — rather than by its number, everywhere it shows:
   the round pills, the score sheet, the images sent to the group. */

type T = (key: Key, vars?: Record<string, string | number>) => string;

export const koKey = (ko: number, suffix: "" | ".short" = "") => `ko.${ko}${suffix}` as Key;

export function roundTitle(t: T, r: Pick<Round, "n" | "ko">): string {
  return r.ko ? t(koKey(r.ko)) : t("t.round", { n: r.n });
}

export const groupName = (t: T, g: number) => t("t.group", { g: String.fromCharCode(65 + g) });
