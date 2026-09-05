"use client";

/* A ledger row: label on the left, a figure on the right. The figure never
   wraps, so a minus sign can't be split from its amount on a narrow screen.
   Tone is semantic — "keep" is money that stays, "state" is money that goes
   to the State — never decoration. */

export function LedgerRow({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "keep" | "state";
}) {
  const color = tone === "keep" ? "lfp-keep" : tone === "state" ? "lfp-state" : "";
  return (
    <tr className="border-b border-[var(--lfp-line)] last:border-0">
      <th
        scope="row"
        className={`px-5 py-2.5 text-left ${strong ? "font-semibold" : "font-normal text-[var(--lfp-mist)]"}`}
      >
        {label}
      </th>
      <td
        className={`lfp-num whitespace-nowrap px-5 py-2.5 text-right ${strong ? "font-semibold" : ""} ${color}`}
      >
        {value}
      </td>
    </tr>
  );
}

export function Ledger({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div className="lfp-panel overflow-hidden">
      <table className="w-full text-sm">
        <caption className="border-b border-[var(--lfp-line)] px-5 py-3 text-left text-sm font-semibold">
          {caption}
        </caption>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
