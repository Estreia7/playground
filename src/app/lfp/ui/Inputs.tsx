"use client";

/* Form primitives. No form library, per repo convention.

   Every control keeps a visible label (never placeholder-only), a 44px
   minimum hit area, and a real focus ring. Numeric fields hold their raw
   string while being typed so "1.5" or a half-deleted value doesn't get
   rewritten under the cursor. */

import { useId, useState } from "react";
import { parseNumber } from "../format";
import { tr } from "../i18n";
import { useLfpLang } from "../useLfpLang";

export function NumberField({
  label,
  value,
  onChange,
  suffix = "€",
  min = 0,
  max,
  step = 1,
  hint,
  id: idProp,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  id?: string;
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const hintId = hint ? `${id}-hint` : undefined;

  // While focused the field is uncontrolled-ish: it shows exactly what was
  // typed. On blur it snaps back to the canonical value.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          aria-describedby={hintId}
          value={draft ?? String(value)}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = parseNumber(e.target.value);
            if (n !== null) {
              const clamped = Math.min(max ?? Infinity, Math.max(min, n));
              onChange(clamped);
            }
          }}
          onBlur={() => setDraft(null)}
          className="lfp-input h-11 w-full px-3 pr-9 text-base"
        />
        <span
          aria-hidden="true"
          className="lfp-num pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[var(--lfp-mist)]"
        >
          {suffix}
        </span>
      </div>
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-[var(--lfp-mist)]">
          {hint}
        </p>
      )}
    </div>
  );
}

export interface Choice<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
}

/** Segmented control. Uses real radios so keyboard and screen readers get
 *  group semantics for free. */
export function ChoiceGroup<T extends string | number>({
  label,
  value,
  choices,
  onChange,
  columns,
}: {
  label: string;
  value: T;
  choices: Choice<T>[];
  onChange: (v: T) => void;
  columns?: number;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="text-sm font-medium">{label}</legend>
      <div
        className="mt-1.5 grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${columns ?? choices.length}, minmax(0,1fr))` }}
      >
        {choices.map((c) => {
          const selected = c.value === value;
          return (
            <label
              key={String(c.value)}
              className={`lfp-press flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-2 text-center text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--lfp-cobalt)] ${
                selected
                  ? "border-[var(--lfp-cobalt)] bg-[var(--lfp-cobalt)] font-medium text-[var(--lfp-cal-tile)]"
                  : "border-[var(--lfp-line)] text-[var(--lfp-mist)] hover:border-[var(--lfp-cobalt)]"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={String(c.value)}
                checked={selected}
                onChange={() => onChange(c.value)}
                className="sr-only"
              />
              {c.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 12,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  hint?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const { t } = useLfpLang();
  const set = (n: number) => onChange(Math.min(max, Math.max(min, n)));

  return (
    <div>
      <span id={id} className="block text-sm font-medium">
        {label}
      </span>
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => set(value - 1)}
          disabled={value <= min}
          aria-label={tr(t.chrome.inputs.less, { label })}
          className="lfp-focus lfp-press h-11 w-11 rounded-lg border border-[var(--lfp-line)] text-lg text-[var(--lfp-cobalt)] transition-colors hover:border-[var(--lfp-cobalt)] disabled:opacity-40"
        >
          −
        </button>
        <output
          aria-labelledby={id}
          className="lfp-num lfp-sunk flex h-11 min-w-14 flex-1 items-center justify-center text-base font-semibold"
        >
          {value}
        </output>
        <button
          type="button"
          onClick={() => set(value + 1)}
          disabled={value >= max}
          aria-label={tr(t.chrome.inputs.more, { label })}
          className="lfp-focus lfp-press h-11 w-11 rounded-lg border border-[var(--lfp-line)] text-lg text-[var(--lfp-cobalt)] transition-colors hover:border-[var(--lfp-cobalt)] disabled:opacity-40"
        >
          +
        </button>
      </div>
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-[var(--lfp-mist)]">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label
        htmlFor={id}
        className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium"
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          aria-describedby={hintId}
          onChange={(e) => onChange(e.target.checked)}
          className="lfp-focus h-5 w-5 shrink-0 accent-[var(--lfp-cobalt)]"
        />
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-[var(--lfp-mist)]">
          {hint}
        </p>
      )}
    </div>
  );
}
