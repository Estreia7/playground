"use client";

import Link from "next/link";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
  type SpringOptions,
} from "framer-motion";
import { createContext, useContext, useMemo, useRef, useState } from "react";

/* The desktop dock: the app's navigation as a row of round buttons floating
   at the bottom of the screen, which swell under the pointer like a magnifier.

   Built from the magnifying dock pattern (a spring on each button's width,
   driven by how far the pointer is from its centre, and a panel that grows
   to make room). Differences from the snippet it came from:
   - items are real links and buttons, so keyboard and screen readers work;
   - children read the pointer and size from context, not cloned props;
   - clientX, not pageX: the dock is fixed, its rects are in viewport space;
   - with reduced motion nothing swells, labels still show.

   Colours come from the .rs-dock rules in theme.css, in a light and a dark
   variant chosen by data-theme. */

const BASE = 44;
const MAGNIFY = 76;
const DISTANCE = 150;
const PANEL = 64;
const SPRING: SpringOptions = { mass: 0.1, stiffness: 150, damping: 12 };

interface DockCtx {
  mouseX: MotionValue<number>;
  still: boolean;
}

const Ctx = createContext<DockCtx | null>(null);
const ItemCtx = createContext<{ width: MotionValue<number>; hovered: MotionValue<number> } | null>(null);

export function Dock({ theme, label, children }: { theme: "light" | "dark"; label: string; children: React.ReactNode }) {
  const mouseX = useMotionValue(Infinity);
  const hovered = useMotionValue(0);
  const still = Boolean(useReducedMotion());
  const max = MAGNIFY + MAGNIFY / 2 + 4;
  const height = useSpring(useTransform(hovered, [0, 1], [PANEL, still ? PANEL : max]), SPRING);
  const value = useMemo(() => ({ mouseX, still }), [mouseX, still]);

  return (
    <motion.div
      className="rs-dock-wrap"
      data-theme={theme}
      initial={{ y: 40, opacity: 0, filter: "blur(6px)" }}
      animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      style={{ height }}
    >
      <nav
        className="rs-dock"
        aria-label={label}
        style={{ height: PANEL }}
        onMouseMove={(e) => {
          hovered.set(1);
          mouseX.set(e.clientX);
        }}
        onMouseLeave={() => {
          hovered.set(0);
          mouseX.set(Infinity);
        }}
      >
        <Ctx.Provider value={value}>{children}</Ctx.Provider>
      </nav>
    </motion.div>
  );
}

type ItemProps = {
  label: string;
  icon: React.ReactNode;
  current?: boolean;
} & ({ href: string; onClick?: never; pressed?: never } | { href?: never; onClick: () => void; pressed?: boolean });

export function DockItem({ label, icon, current, href, onClick, pressed }: ItemProps) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("DockItem outside <Dock>");
  const { mouseX, still } = ctx;
  const ref = useRef<HTMLDivElement>(null);
  const hovered = useMotionValue(0);

  const distance = useTransform(mouseX, (x) => {
    const r = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return x - r.x - r.width / 2;
  });
  const target = useTransform(distance, [-DISTANCE, 0, DISTANCE], [BASE, still ? BASE : MAGNIFY, BASE]);
  const width = useSpring(target, SPRING);

  const on = {
    onMouseEnter: () => hovered.set(1),
    onMouseLeave: () => hovered.set(0),
    onFocus: () => hovered.set(1),
    onBlur: () => hovered.set(0),
  };

  const body = (
    <ItemCtx.Provider value={{ width, hovered }}>
      <DockLabel>{label}</DockLabel>
      <DockIcon>{icon}</DockIcon>
    </ItemCtx.Provider>
  );

  return (
    <motion.div ref={ref} className="rs-dock-item" data-current={current || pressed || undefined} style={{ width }}>
      {href ? (
        <Link href={href} aria-label={label} aria-current={current ? "page" : undefined} {...on}>
          {body}
        </Link>
      ) : (
        <button type="button" aria-label={label} aria-pressed={pressed} onClick={onClick} {...on}>
          {body}
        </button>
      )}
      {current && <span className="rs-dock-dot" aria-hidden="true" />}
    </motion.div>
  );
}

function DockLabel({ children }: { children: React.ReactNode }) {
  const item = useContext(ItemCtx)!;
  const [visible, setVisible] = useState(false);
  useMotionValueEvent(item.hovered, "change", (v) => setVisible(v === 1));
  return (
    <AnimatePresence>
      {visible && (
        <motion.span
          className="rs-dock-label"
          role="tooltip"
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: 1, y: -10 }}
          exit={{ opacity: 0, y: 0 }}
          transition={{ duration: 0.18 }}
          style={{ x: "-50%" }}
          aria-hidden="true"
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function DockIcon({ children }: { children: React.ReactNode }) {
  const item = useContext(ItemCtx)!;
  const width = useTransform(item.width, (w) => w / 2);
  return (
    <motion.span className="rs-dock-icon" style={{ width, height: width }}>
      {children}
    </motion.span>
  );
}

export function DockDivider() {
  return <span className="rs-dock-divider" aria-hidden="true" />;
}
