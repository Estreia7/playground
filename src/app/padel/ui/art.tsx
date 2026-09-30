"use client";

import { useEffect, useRef } from "react";

/* Everything drawn for the padel screens.

   Icons share one grammar — 24 unit grid, 1.75 round stroke, no fill unless a
   shape is meant to read as solid — so they sit together the way a font's
   glyphs do. They replace the emoji the screens started with, which drew
   differently on every phone and could not be tinted.

   Colours are the logo's: navy ink, lime ball, and the pale tile it sits on. */

const BALL = "#cbed09";
const TILE = "#f3f8e2";
const NAVY = "#0b1823";

type IconProps = { size?: number; className?: string };

function Icon({ size = 24, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** A padel racket, tilted the way it is held. A round head with a short handle
    is a magnifying glass, and crossing the handle with grip lines makes a
    Venus sign, so: a teardrop head with a flat throat, an outlined grip, and
    perforations in a staggered grid rather than a few dots in a row, which
    read as a face. */
export function IconRacket(p: IconProps) {
  return (
    <Icon {...p}>
      <g transform="rotate(38 12 12)">
        <path d="M12 2.3c3.4 0 5.5 2.3 5.5 5.3 0 2.4-1.2 3.9-2.5 5.2l-.9 1.1H9.9l-.9-1.1C7.7 11.5 6.5 10 6.5 7.6c0-3 2.1-5.3 5.5-5.3Z" />
        <rect x="10.6" y="14.2" width="2.8" height="7" rx="1.4" />
        <path d="M10.3 5.6h.01M13.7 5.6h.01M10.3 8.4h.01M13.7 8.4h.01M12 11h.01" strokeWidth="2" />
      </g>
    </Icon>
  );
}

export function IconTrophy(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M8 4h8v5.2a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H5.6A1.6 1.6 0 0 0 4 7.6C4 9.6 5.7 11 7.6 11H8" />
      <path d="M16 6h2.4A1.6 1.6 0 0 1 20 7.6c0 2-1.7 3.4-3.6 3.4H16" />
      <path d="M12 13.2V17M8.6 20h6.8M9.6 17h4.8" />
    </Icon>
  );
}

export function IconBars(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 20h16" />
      <path d="M6.5 20v-6.5M12 20V5M17.5 20v-9.5" />
    </Icon>
  );
}

/** Two links joined: a partner it works with. */
export function IconLink(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="2.6" y="8" width="11" height="8" rx="4" />
      <rect x="10.4" y="8" width="11" height="8" rx="4" />
    </Icon>
  );
}

/** The same links, parted: a partner it struggles with. */
export function IconLinkBroken(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M9.6 8H6.6a4 4 0 0 0 0 8h3" />
      <path d="M14.4 8h3a4 4 0 0 1 0 8h-3" />
      <path d="m11 4.6 1 2.2M13 19.4l-1-2.2" />
    </Icon>
  );
}

export function IconTarget(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </Icon>
  );
}

export function IconFlame(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3c.9 3.2 4.6 4.6 4.6 9a4.6 4.6 0 0 1-9.2 0c0-1.8.8-3 1.8-4 .3 1.3 1 2 1.7 2.1C10.5 7.6 11 5.4 12 3Z" />
    </Icon>
  );
}

export function IconPlus(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function IconPencil(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="m4 20 1-4L16.5 4.5a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8 19l-4 1Z" />
      <path d="m14.5 6.5 3 3" />
    </Icon>
  );
}

/* ── The logo ──────────────────────────────────────────────── */

/** The logo on its pale tile. The mark is dark navy on transparency, so on this
    app's dark background it needs the tile behind it to be seen at all. */
export function LogoTile({
  size = 40,
  className = "",
  float = false,
}: {
  size?: number;
  className?: string;
  float?: boolean;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden ${float ? "pd-float" : ""} ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.26),
        background: TILE,
        boxShadow: "0 1px 0 rgba(255,255,255,0.5) inset, 0 6px 14px -6px rgba(0,0,0,0.7)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/padel-logo-128.png"
        alt=""
        width={Math.round(size * 0.86)}
        height={Math.round(size * 0.86)}
        draggable={false}
      />
    </span>
  );
}

/* ── Medals ────────────────────────────────────────────────── */

const MEDAL: Record<1 | 2 | 3, { hi: string; lo: string; rim: string; ribbon: string }> = {
  1: { hi: "#fde68a", lo: "#d99a06", rim: "#8a5a00", ribbon: "#cbed09" },
  2: { hi: "#f4f4f5", lo: "#a1a1aa", rim: "#52525b", ribbon: "#7dd3fc" },
  3: { hi: "#f3c49b", lo: "#b06a34", rim: "#6b3a17", ribbon: "#fdba74" },
};

/** A ribbon medal with the place on it. */
export function Medal({ place, size = 28 }: { place: 1 | 2 | 3; size?: number }) {
  const m = MEDAL[place];
  const id = `pd-medal-${place}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label={`${place}`}
      className="shrink-0"
    >
      <defs>
        <linearGradient id={id} x1="6" y1="8" x2="26" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={m.hi} />
          <stop offset="1" stopColor={m.lo} />
        </linearGradient>
      </defs>
      <path d="M9 1.5h5.2l3.6 8.4-4.2 1.6L9 1.5Z" fill={m.ribbon} />
      <path d="M23 1.5h-5.2l-3.6 8.4 4.2 1.6L23 1.5Z" fill={m.ribbon} opacity="0.7" />
      <circle cx="16" cy="20" r="10.2" fill={`url(#${id})`} stroke={m.rim} strokeWidth="1.2" />
      <circle cx="16" cy="20" r="7.4" fill="none" stroke={m.rim} strokeOpacity="0.35" strokeWidth="1" />
      <text
        x="16"
        y="24.4"
        textAnchor="middle"
        fontSize="11.5"
        fontWeight="800"
        fill={m.rim}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {place}
      </text>
    </svg>
  );
}

/* ── The rally ─────────────────────────────────────────────── */

/** Pauses an animation while it is offscreen or the tab is hidden. The rally
    is the only loop on these screens, so it is the only thing that needs this. */
function useRallyPause(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let visible = true;
    let shown = !document.hidden;
    const apply = () => {
      el.dataset.rally = visible && shown ? "running" : "paused";
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        apply();
      },
      { threshold: 0.05 },
    );
    observer.observe(el);

    const onVisibility = () => {
      shown = !document.hidden;
      apply();
    };
    document.addEventListener("visibilitychange", onVisibility);
    apply();

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ref]);
}

function Racket({ x, side }: { x: number; side: "l" | "r" }) {
  return (
    <g transform={`translate(${x} 118)`}>
      <g className={side === "l" ? "pd-racket-l" : "pd-racket-r"}>
        {/* grip, throat, head, and the drilled holes of a padel racket */}
        <rect x="-2.4" y="-15" width="4.8" height="15" rx="2.2" fill={NAVY} stroke="#e4e4e7" strokeWidth="1.2" />
        <path
          d="M0 -14C-12.5 -18-12.5 -45 0 -49c12.5 4 12.5 31 0 35Z"
          fill={TILE}
          stroke="#e4e4e7"
          strokeWidth="1.2"
        />
        <g fill={NAVY} opacity="0.75">
          <circle cx="-3.6" cy="-40" r="1.15" />
          <circle cx="3.6" cy="-40" r="1.15" />
          <circle cx="0" cy="-35" r="1.15" />
          <circle cx="-4.6" cy="-30" r="1.15" />
          <circle cx="4.6" cy="-30" r="1.15" />
          <circle cx="0" cy="-25" r="1.15" />
          <circle cx="-3.4" cy="-20" r="1.15" />
          <circle cx="3.4" cy="-20" r="1.15" />
        </g>
      </g>
    </g>
  );
}

const SCENE = "absolute inset-x-0 bottom-0 w-full";
const SCENE_BOX = { aspectRatio: "360 / 150" } as const;
const LAYER = "absolute inset-0 h-full w-full";

/** The still half of the court: floor, service lines and the glass at each end.
    It has no depth of its own, so it can sit inside a clipped, rounded card. */
export function CourtBackdrop({ className = "" }: { className?: string }) {
  return (
    <div className={`${SCENE} ${className}`} style={SCENE_BOX} aria-hidden="true">
      <svg viewBox="0 0 360 150" className={LAYER}>
        <defs>
          <linearGradient id="pd-floor" x1="0" y1="118" x2="0" y2="150" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#1c4a63" />
            <stop offset="1" stopColor={NAVY} />
          </linearGradient>
        </defs>
        <rect y="118" width="360" height="32" fill="url(#pd-floor)" />
        <path d="M0 118.5h360" stroke={BALL} strokeOpacity="0.55" strokeWidth="1.2" />
        <path d="M100 118v7M260 118v7" stroke="#e4e4e7" strokeOpacity="0.5" strokeWidth="1.4" />
        <rect x="3" y="40" width="9" height="78" rx="2" fill={BALL} fillOpacity="0.07" stroke={BALL} strokeOpacity="0.35" />
        <rect x="348" y="40" width="9" height="78" rx="2" fill={BALL} fillOpacity="0.07" stroke={BALL} strokeOpacity="0.35" />
        <path d="M5 46l5 8M5 60l5 8" stroke="#fff" strokeOpacity="0.22" strokeWidth="1.2" />
        <path d="M350 46l5 8M350 60l5 8" stroke="#fff" strokeOpacity="0.22" strokeWidth="1.2" />
      </svg>
    </div>
  );
}

/** The moving half: the net and rackets on one layer, the ball on another, so
    inside a tilt card they slide against each other and against the card.
    This is the one loop on these screens, and it stops when offscreen. */
export function CourtAction({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useRallyPause(ref);

  return (
    <div
      ref={ref}
      className={`${SCENE} pd-3d ${className}`}
      style={SCENE_BOX}
      data-rally="running"
      role="img"
      aria-label="Padel"
    >
      <svg viewBox="0 0 360 150" className={`${LAYER} pd-z1`} aria-hidden="true">
        {/* the net seen edge-on: post, mesh, tape */}
        <rect x="178.6" y="84" width="2.8" height="34" fill="#e4e4e7" />
        <g stroke="#e4e4e7" strokeOpacity="0.35" strokeWidth="0.8">
          <path d="M176 92h8M176 100h8M176 108h8M176 116h8" />
        </g>
        <rect x="176" y="83" width="8" height="3" rx="1" fill="#fff" />
        <Racket x={60} side="l" />
        <g transform="translate(360 0) scale(-1 1)">
          <Racket x={60} side="r" />
        </g>
      </svg>

      <svg viewBox="0 0 360 150" className={`${LAYER} pd-z2`} aria-hidden="true">
        <g className="pd-ballx">
          <ellipse className="pd-shadow" cx="0" cy="118" rx="11" ry="2.8" fill="#000" />
          <g className="pd-bally">
            <circle r="8" fill={BALL} />
            <path d="M-7.2 -2.9Q-2.1 1.9 -1.3 7.6M7.2 2.9Q2.1 -1.9 1.3 -7.6" fill="none" stroke={NAVY} strokeWidth="1.5" strokeLinecap="round" />
          </g>
        </g>
      </svg>
    </div>
  );
}

/* ── Empty states ──────────────────────────────────────────── */

type Kind = "court" | "trophy" | "bars";

/** A small drawing for a screen with nothing on it yet. Each is the same ball,
    resting on the thing the screen is about. */
export function EmptyArt({ kind, className = "" }: { kind: Kind; className?: string }) {
  return (
    <svg
      viewBox="0 0 160 110"
      width="160"
      height="110"
      className={className}
      role="presentation"
      aria-hidden="true"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="80" cy="98" rx="46" ry="6" fill="#000" opacity="0.35" />
      {kind === "court" && (
        <g stroke="#52525b" strokeWidth="2">
          <path d="M28 88 46 42h68l18 46Z" fill="#12283a" />
          <path d="M80 42v46M37 65h86" strokeWidth="1.5" stroke="#71717a" />
          <path d="M46 42h68" stroke="#e4e4e7" />
        </g>
      )}
      {kind === "trophy" && (
        <g stroke="#a1a1aa" strokeWidth="2.2">
          <path d="M60 22h40v24a20 20 0 0 1-40 0V22Z" fill="#12283a" />
          <path d="M60 30H46a6 6 0 0 0-6 6c0 10 8 17 18 17h2M100 30h14a6 6 0 0 1 6 6c0 10-8 17-18 17h-2" />
          <path d="M80 66v16M64 90h32M68 82h24" />
        </g>
      )}
      {kind === "bars" && (
        <g stroke="#52525b" strokeWidth="2" fill="#12283a">
          <rect x="42" y="62" width="22" height="30" rx="3" />
          <rect x="69" y="40" width="22" height="52" rx="3" />
          <rect x="96" y="54" width="22" height="38" rx="3" />
        </g>
      )}
      <g className="pd-float" style={{ transformOrigin: "80px 20px", transformBox: "fill-box" }}>
        <circle cx="80" cy="14" r="9" fill={BALL} stroke="none" />
        <path d="M72 11c4 3 6 6 6 11M88 17c-4-3-6-6-6-11" stroke={NAVY} strokeWidth="1.6" />
      </g>
    </svg>
  );
}
