"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { IconCheck, IconChevronLeft, IconSearch } from "./Icons.tsx";

/* The app's dropdown: a button that opens a floating list. Long lists get a
   search field on top. Keyboard: arrows move, Enter picks, Escape closes and
   returns focus to the button, typing a letter jumps to the first match. */

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
  hint?: string;
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function Select({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder = "Escolher…",
  compact = false,
  searchable,
  className = "",
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel?: string;
  placeholder?: string;
  compact?: boolean;
  searchable?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const withSearch = searchable ?? options.length > 8;

  const selected = options.find((o) => o.value === value);
  const shown = useMemo(() => {
    const q = fold(query.trim());
    return q ? options.filter((o) => fold(o.label).includes(q)) : options;
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    (withSearch ? search.current : list.current)?.focus();
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    return () => document.removeEventListener("mousedown", away);
  }, [open, withSearch]);

  const show = () => {
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const choose = (o: SelectOption) => {
    onChange(o.value);
    close();
  };

  const move = (to: number) => {
    if (!shown.length) return;
    const n = (to + shown.length) % shown.length;
    setActive(n);
    list.current?.querySelector<HTMLElement>(`[data-i="${n}"]`)?.scrollIntoView({ block: "nearest" });
  };

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      move(active + (e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      move(e.key === "Home" ? 0 : shown.length - 1);
    } else if (e.key === "Enter" || (e.key === " " && !withSearch)) {
      e.preventDefault();
      if (shown[active]) choose(shown[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      close(false);
    } else if (!withSearch && e.key.length === 1) {
      const k = fold(e.key);
      const from = shown.findIndex((o, i) => i > active && fold(o.label).startsWith(k));
      const at = from >= 0 ? from : shown.findIndex((o) => fold(o.label).startsWith(k));
      if (at >= 0) move(at);
    }
  };

  let lastGroup: string | undefined;
  return (
    // Inside a <label>, a click would otherwise be forwarded to the button and reopen the list.
    <div
      ref={root}
      className={`rs-dd ${compact ? "compact" : ""} ${open ? "open" : ""} ${className}`}
      style={style}
      onClick={(e) => e.preventDefault()}
    >
      <button
        ref={button}
        type="button"
        className="rs-dd-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={ariaLabel ? `${ariaLabel}: ${selected?.label ?? placeholder}` : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            show();
          }
        }}
      >
        <span className={selected ? "" : "placeholder"}>{selected?.label ?? placeholder}</span>
        <IconChevronLeft size={13} className="caret" />
      </button>

      {open && (
        <div className="rs-dd-panel">
          {withSearch && (
            <div className="rs-dd-search">
              <IconSearch size={16} />
              <input
                ref={search}
                placeholder="Pesquisar…"
                value={query}
                aria-label={`Pesquisar ${ariaLabel ?? "opções"}`}
                aria-controls={`${id}-list`}
                aria-activedescendant={shown[active] ? `${id}-${active}` : undefined}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onListKey}
              />
            </div>
          )}
          <ul
            ref={list}
            id={`${id}-list`}
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={withSearch ? -1 : 0}
            aria-activedescendant={!withSearch && shown[active] ? `${id}-${active}` : undefined}
            onKeyDown={withSearch ? undefined : onListKey}
          >
            {shown.length === 0 && <li className="empty">Sem resultados para “{query.trim()}”</li>}
            {shown.map((o, i) => {
              const heading = o.group && o.group !== lastGroup ? o.group : undefined;
              lastGroup = o.group;
              return (
                <li key={o.value || "__none"} role="presentation">
                  {heading && <div className="group">{heading}</div>}
                  <div
                    id={`${id}-${i}`}
                    data-i={i}
                    role="option"
                    aria-selected={o.value === value}
                    className={`opt ${i === active ? "active" : ""}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(o)}
                    onMouseMove={() => i !== active && setActive(i)}
                  >
                    <span className="name">{o.label}</span>
                    {o.hint && <span className="hint">{o.hint}</span>}
                    <span className="tick" aria-hidden="true">
                      {o.value === value && <IconCheck size={15} />}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
