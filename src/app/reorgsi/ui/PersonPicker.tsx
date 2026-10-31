"use client";

import { useId, useMemo, useRef, useState } from "react";
import { initials } from "./format.ts";
import { IconChevronLeft, IconSearch } from "./Icons.tsx";

/* A searchable picker for people: type part of a name, accents and case
   ignored, then pick with the mouse or the arrow keys and Enter. It follows
   the ARIA combobox pattern so screen readers announce the list as it filters.

   Options that are not people ("Toda a equipa", "Outra agência…") pass
   `person: false` and show without an avatar. */

export interface PickOption {
  value: string;
  label: string;
  group?: string;
  hint?: string;
  person?: boolean;
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function PersonPicker({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder = "Escrever um nome…",
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: PickOption[];
  ariaLabel?: string;
  placeholder?: string;
  compact?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selected = options.find((o) => o.value === value);
  const shown = useMemo(() => {
    const q = fold(query.trim());
    return q ? options.filter((o) => fold(o.label).includes(q)) : options;
  }, [options, query]);

  const show = () => {
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const choose = (o: PickOption) => {
    onChange(o.value);
    close();
  };

  const move = (to: number) => {
    const n = (to + shown.length) % shown.length;
    setActive(n);
    list.current?.querySelector<HTMLElement>(`[data-i="${n}"]`)?.scrollIntoView({ block: "nearest" });
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return show();
      if (shown.length) move(active + (e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Enter") {
      if (open && shown[active]) {
        e.preventDefault();
        choose(shown[active]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        close();
      }
    } else if (e.key === "Tab") {
      close();
    }
  };

  const avatar = selected?.person !== false && selected;

  let lastGroup: string | undefined;
  return (
    // Inside a <label>, a click would otherwise be forwarded to the input and reopen the list.
    <div className={`rs-combo ${compact ? "compact" : ""} ${open ? "open" : ""}`} onClick={(e) => e.preventDefault()}>
      <span className="lead" aria-hidden="true">
        {!open && avatar ? <span className="av">{initials(selected.label)}</span> : <IconSearch size={16} />}
      </span>
      <input
        ref={input}
        className="rs-input"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? `${id}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder={open ? placeholder : selected ? undefined : placeholder}
        value={open ? query : (selected?.label ?? "")}
        onFocus={show}
        // Still focused after a pick, so focus will not fire again: a click reopens.
        onMouseDown={() => !open && show()}
        onBlur={close}
        onChange={(e) => {
          let typed = e.target.value;
          // Typing straight after a pick: the box still shows the chosen name,
          // and the new letters are a fresh search, not an addition to it.
          if (!open && selected && typed.startsWith(selected.label)) typed = typed.slice(selected.label.length);
          setQuery(typed);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKey}
      />
      <button
        type="button"
        className="caret"
        tabIndex={-1}
        aria-hidden="true"
        onMouseDown={(e) => {
          e.preventDefault();
          if (open) close();
          else input.current?.focus();
        }}
      >
        <IconChevronLeft size={14} className="-rotate-90" />
      </button>

      {open && (
        <ul ref={list} id={`${id}-list`} className="rs-combo-list" role="listbox" aria-label={ariaLabel}>
          {shown.length === 0 && <li className="empty">Nenhum nome com “{query.trim()}”</li>}
          {shown.map((o, i) => {
            const heading = o.group && o.group !== lastGroup ? o.group : undefined;
            lastGroup = o.group;
            return (
              <li key={o.value || "__none"} role="presentation">
                {heading && (
                  <div className="group" role="presentation">
                    {heading}
                  </div>
                )}
                <div
                  id={`${id}-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={o.value === value}
                  className={`opt ${i === active ? "active" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(o);
                  }}
                  onMouseMove={() => i !== active && setActive(i)}
                >
                  {o.person !== false ? (
                    <span className="av" aria-hidden="true">
                      {initials(o.label)}
                    </span>
                  ) : (
                    <span className="av blank" aria-hidden="true" />
                  )}
                  <span className="name">
                    <Highlight text={o.label} query={query} />
                  </span>
                  {o.hint && <span className="hint">{o.hint}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Bolds the part of the name that matches what was typed. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = fold(query.trim());
  if (!q) return <>{text}</>;
  // Folding keeps one character per character for Latin names, so indexes line up.
  const at = fold(text).indexOf(q);
  if (at < 0 || fold(text).length !== text.length) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}
