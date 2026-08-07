"use client";

// Signature element: the target-lock ring. A circular reticle that draws in
// around a vulnerability score, ticks rotating like a sonar bezel. Color
// walks verdigris → amber → coral as the target gets more approachable.

import { motion, useReducedMotion } from "framer-motion";

export function scoreColor(score: number | null): string {
  if (score === null) return "var(--mist)";
  if (score >= 60) return "var(--coral)";
  if (score >= 35) return "var(--amber)";
  return "var(--verdi)";
}

export function TargetRing({
  score,
  size = 96,
  label,
}: {
  score: number | null;
  size?: number;
  label?: string;
}) {
  const reduce = useReducedMotion();
  const stroke = Math.max(3, size / 24);
  const r = size / 2 - stroke * 2;
  const c = 2 * Math.PI * r;
  const frac = score === null ? 0 : Math.max(0.02, score / 100);
  const color = scoreColor(score);

  const ticks = Array.from({ length: 24 }, (_, i) => (i * 360) / 24);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        score === null
          ? `${label || "Vulnerability"}: no data yet`
          : `${label || "Vulnerability"}: ${score} out of 100`
      }
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
        {/* rotating bezel ticks */}
        <g className={reduce ? undefined : "ha-ring-ticks"} opacity={0.35}>
          {ticks.map((deg) => (
            <line
              key={deg}
              x1={size / 2}
              y1={stroke * 0.6}
              x2={size / 2}
              y2={stroke * 1.5}
              stroke={color}
              strokeWidth={1}
              transform={`rotate(${deg} ${size / 2} ${size / 2})`}
            />
          ))}
        </g>
        {/* track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--tide)"
          strokeWidth={stroke}
        />
        {/* value arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - frac) }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        />
        {/* crosshair notches */}
        {[0, 90, 180, 270].map((deg) => (
          <line
            key={deg}
            x1={size / 2}
            y1={0}
            x2={size / 2}
            y2={stroke * 0.9}
            stroke={color}
            strokeWidth={1.5}
            opacity={0.8}
            transform={`rotate(${deg} ${size / 2} ${size / 2})`}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="ha-mono font-semibold leading-none"
          style={{ fontSize: size / 3.4, color }}
          initial={reduce ? false : { opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.35, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          {score === null ? "--" : score}
        </motion.span>
        {label && size >= 88 && (
          <span className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-[var(--mist)]">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
