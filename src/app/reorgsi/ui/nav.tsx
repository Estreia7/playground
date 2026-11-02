"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { IconChevronLeft } from "./Icons.tsx";

/* Views live in the address, so the back button, a reload and a shared link
   all land where the person was: filters and tabs replace the current entry,
   a chosen consultant, section or window adds one. */

type Mode = "push" | "replace";

function write(key: string, value: string | null, mode: Mode) {
  const next = new URLSearchParams(window.location.search);
  if (value == null) next.delete(key);
  else next.set(key, value);
  const qs = next.toString();
  const url = window.location.pathname + (qs ? `?${qs}` : "");
  if (url === window.location.pathname + window.location.search) return;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/** A string kept in the query string; the fallback is left out of the URL. */
export function useUrlState<T extends string>(key: string, fallback: T, mode: Mode = "replace"): [T, (value: T) => void] {
  const params = useSearchParams();
  const raw = params.get(key);
  const value = (raw ?? fallback) as T;
  const set = useCallback((v: T) => write(key, v === fallback ? null : v, mode), [key, fallback, mode]);
  return [value, set];
}

/** A window that opens on its own history entry, so back closes it. */
export function useUrlDialog(key: string): [string | null, (id: string) => void, () => void] {
  const params = useSearchParams();
  const value = params.get(key);
  const pushed = useRef(false);
  const open = useCallback(
    (id: string) => {
      pushed.current = true;
      write(key, id, "push");
    },
    [key],
  );
  const close = useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else write(key, null, "replace");
  }, [key]);
  return [value, open, close];
}

// Pages seen since the app loaded; past the first one, "back" stays in the app.
let visited = 0;

export function useTrackVisits() {
  const pathname = usePathname();
  useEffect(() => {
    visited++;
  }, [pathname]);
}

/** "‹ Negócios": steps back through history when there is somewhere in the
 *  app to go back to, otherwise goes to the parent page. */
export function BackLink({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      className="rs-back"
      onClick={(e) => {
        if (visited > 1) {
          e.preventDefault();
          router.back();
        }
      }}
    >
      <IconChevronLeft size={16} />
      {label}
    </Link>
  );
}
