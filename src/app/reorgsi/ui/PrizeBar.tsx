"use client";

import { PRIZE_LEVELS, prizeIcon, prizeProgress } from "../core/prizes.ts";
import { money0 } from "./format.ts";

/* The recognition programme as an experience bar: it fills with the year's
   billing, and each level lights up as it is passed. Levels sit at equal
   distances, so the bar moves between them rather than on a straight scale. */

const short = (n: number) => `${Math.round(n / 1000)}k`;

export function PrizeBar({ billed, year }: { billed: number; year: string }) {
  const { current, next, missing, position } = prizeProgress(billed);
  const status = !next
    ? `${current?.label}: o nível mais alto do programa.`
    : `Faltam ${money0(missing)} para ${next.label}.`;

  return (
    <section className="rs-xp mb-4" aria-labelledby="xp-h">
      <div className="head">
        <h2 id="xp-h">Prémios {year}</h2>
        <p>
          <strong className="num">{money0(billed)}</strong>
          {current ? ` · ${current.label}` : ""} · {status}
        </p>
      </div>
      <div className="stage">
        <div
          className="track"
          role="progressbar"
          aria-label={`Progresso no programa de reconhecimento de ${year}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position * 100)}
          aria-valuetext={`${current ? `${current.label}. ` : ""}${status}`}
        >
          <div style={{ transform: `scaleX(${position})` }} />
        </div>
        <ol>
          {PRIZE_LEVELS.map((l) => (
            <li key={l.key} data-reached={billed >= l.min || undefined} data-next={l === next || undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a small static drawing */}
              <img src={prizeIcon(l)} alt="" />
              <span className="name">{l.label}</span>
              <span className="min num">
                <span className="full">{money0(l.min)}</span>
                <span className="brief">{short(l.min)}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
