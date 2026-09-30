"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";

/* A card that leans toward the pointer.

   On a phone this is press feedback: the card tips toward the thumb while it is
   down, and settles when it lifts. With a mouse it follows the cursor. The glare
   is a highlight that tracks the same point so the tilt reads as light on a
   surface rather than a skewed box.

   Three things keep it from being a gimmick on a tool used courtside:

   - It only moves in response to the user. Nothing on this component animates
     by itself.
   - Touch scrolling is untouched. A drag that turns into a scroll fires
     pointercancel, which sets the card back at rest.
   - Under reduced motion it is a plain, flat card.

   Children pick a depth with the .pd-z1/.pd-z2/.pd-z3 classes, which is what
   makes the tilt parallax rather than a single flat plane rotating. */

interface Props {
  children: React.ReactNode;
  /** Renders a link when given, a plain block otherwise. */
  href?: string;
  className?: string;
  /** Face styling: background, border, radius. Applied to the clipped layer. */
  faceClassName?: string;
  /** Artwork drawn inside the clipped face, behind the content. */
  backdrop?: React.ReactNode;
  /** Maximum tilt in degrees. Small cards can take more than big ones. */
  max?: number;
  /** How far the card lifts toward the viewer while held. */
  lift?: number;
  onClick?: () => void;
  ariaLabel?: string;
}

export function TiltCard({
  children,
  href,
  className = "",
  faceClassName = "bg-zinc-900",
  backdrop,
  max = 9,
  lift = 1.015,
  onClick,
  ariaLabel,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const enabled = useRef(true);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      enabled.current = !query.matches;
    };
    sync();
    query.addEventListener("change", sync);
    return () => {
      query.removeEventListener("change", sync);
      cancelAnimationFrame(frame.current);
    };
  }, []);

  const rest = useCallback(() => {
    const el = root.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    el.dataset.active = "false";
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--s", "1");
  }, []);

  const follow = useCallback(
    (event: React.PointerEvent) => {
      const el = root.current;
      if (!el || !enabled.current) return;
      const { clientX, clientY } = event;

      // Read the box now, write the styles on the next frame: pointermove can
      // fire faster than the screen refreshes.
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) return;
        const px = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
        const py = Math.min(1, Math.max(0, (clientY - box.top) / box.height));

        el.dataset.active = "true";
        // Tip toward the pointer: pointer near the right edge turns the right
        // edge away, pointer near the top lifts the top away.
        el.style.setProperty("--ry", ((px - 0.5) * 2 * max).toFixed(2) + "deg");
        el.style.setProperty("--rx", ((0.5 - py) * 2 * max).toFixed(2) + "deg");
        el.style.setProperty("--s", String(lift));
        el.style.setProperty("--gx", (px * 100).toFixed(1) + "%");
        el.style.setProperty("--gy", (py * 100).toFixed(1) + "%");
      });
    },
    [max, lift],
  );

  const handlers = {
    onPointerMove: follow,
    onPointerDown: follow,
    onPointerLeave: rest,
    onPointerCancel: rest,
    onPointerUp: (e: React.PointerEvent) => {
      // A mouse is still over the card after the click; a finger is gone.
      if (e.pointerType !== "mouse") rest();
    },
    onBlur: rest,
  };

  const surface = (
    <span className="pd-tilt__surface">
      <span className={"pd-tilt__face " + faceClassName} aria-hidden="true">
        {backdrop}
        <span className="pd-tilt__glare" />
      </span>
      <span className="pd-content">{children}</span>
    </span>
  );

  return (
    <div ref={root} className={"pd-tilt " + className} data-active="false" {...handlers}>
      {href ? (
        <Link
          href={href}
          className="block rounded-[inherit] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
          aria-label={ariaLabel}
        >
          {surface}
        </Link>
      ) : onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="block w-full rounded-[inherit] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
          aria-label={ariaLabel}
        >
          {surface}
        </button>
      ) : (
        surface
      )}
    </div>
  );
}
