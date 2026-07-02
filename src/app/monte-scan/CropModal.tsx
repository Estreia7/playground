"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  applyCrop,
  type BaseImage,
  type EnhanceMode,
  type ProcessedPage,
  type Rect,
} from "./imaging";

type Handle = "move" | "nw" | "ne" | "sw" | "se" | null;

export function CropModal({
  base,
  suggested,
  mode,
  onModeChange,
  onCancel,
  onAccept,
  busy,
}: {
  base: BaseImage;
  suggested: Rect;
  mode: EnhanceMode;
  onModeChange: (m: EnhanceMode) => void;
  onCancel: () => void;
  onAccept: (page: ProcessedPage) => void;
  busy: boolean;
}) {
  const [rect, setRect] = useState<Rect>(suggested);
  const [applying, setApplying] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: Handle; startX: number; startY: number; orig: Rect } | null>(null);

  // Scale factor from displayed pixels to base-image pixels.
  function scaleFactor() {
    const el = frameRef.current;
    if (!el) return 1;
    return base.width / el.clientWidth;
  }

  function clientPoint(e: React.PointerEvent) {
    return { x: e.clientX, y: e.clientY };
  }

  function onPointerDown(handle: Handle, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = clientPoint(e);
    drag.current = { handle, startX: p.x, startY: p.y, orig: { ...rect } };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const f = scaleFactor();
    const dx = (e.clientX - drag.current.startX) * f;
    const dy = (e.clientY - drag.current.startY) * f;
    const o = drag.current.orig;
    const MIN = Math.min(base.width, base.height) * 0.1;

    let next: Rect = { ...o };
    switch (drag.current.handle) {
      case "move":
        next.x = clampX(o.x + dx, o.w);
        next.y = clampY(o.y + dy, o.h);
        break;
      case "nw": {
        const nx = clamp(o.x + dx, 0, o.x + o.w - MIN);
        const ny = clamp(o.y + dy, 0, o.y + o.h - MIN);
        next = { x: nx, y: ny, w: o.x + o.w - nx, h: o.y + o.h - ny };
        break;
      }
      case "ne": {
        const ny = clamp(o.y + dy, 0, o.y + o.h - MIN);
        const nw = clamp(o.w + dx, MIN, base.width - o.x);
        next = { x: o.x, y: ny, w: nw, h: o.y + o.h - ny };
        break;
      }
      case "sw": {
        const nx = clamp(o.x + dx, 0, o.x + o.w - MIN);
        const nh = clamp(o.h + dy, MIN, base.height - o.y);
        next = { x: nx, y: o.y, w: o.x + o.w - nx, h: nh };
        break;
      }
      case "se": {
        const nw = clamp(o.w + dx, MIN, base.width - o.x);
        const nh = clamp(o.h + dy, MIN, base.height - o.y);
        next = { x: o.x, y: o.y, w: nw, h: nh };
        break;
      }
    }
    setRect(next);
  }

  function onPointerUp() {
    drag.current = null;
  }

  function clamp(v: number, lo: number, hi: number) {
    return v < lo ? lo : v > hi ? hi : v;
  }
  function clampX(x: number, w: number) {
    return clamp(x, 0, base.width - w);
  }
  function clampY(y: number, h: number) {
    return clamp(y, 0, base.height - h);
  }

  function resetFull() {
    setRect({ x: 0, y: 0, w: base.width, h: base.height });
  }

  async function accept() {
    setApplying(true);
    const page = await applyCrop(base, rect, mode);
    setApplying(false);
    onAccept(page);
  }

  // Percentages for overlay positioning (relative to displayed image).
  const pct = {
    left: (rect.x / base.width) * 100,
    top: (rect.y / base.height) * 100,
    width: (rect.w / base.width) * 100,
    height: (rect.h / base.height) * 100,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h3 className="font-semibold text-zinc-100">Adjust crop</h3>
          <button
            onClick={onCancel}
            className="text-zinc-500 hover:text-zinc-300"
            aria-label="Cancel"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div
            ref={frameRef}
            className="relative mx-auto touch-none select-none"
            style={{ maxWidth: 420 }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <img
              src={base.dataUrl}
              alt="Captured"
              className="block w-full rounded-lg"
              draggable={false}
            />
            {/* dim outside crop */}
            <div className="pointer-events-none absolute inset-0 rounded-lg bg-black/50" />
            {/* crop window (clear) */}
            <div
              className="absolute cursor-move border-2 border-orange-500 shadow-[0_0_0_9999px_rgba(0,0,0,0)]"
              style={{
                left: `${pct.left}%`,
                top: `${pct.top}%`,
                width: `${pct.width}%`,
                height: `${pct.height}%`,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
              }}
              onPointerDown={(e) => onPointerDown("move", e)}
            >
              {(["nw", "ne", "sw", "se"] as const).map((h) => (
                <span
                  key={h}
                  onPointerDown={(e) => onPointerDown(h, e)}
                  className={`absolute h-6 w-6 rounded-full border-2 border-orange-500 bg-zinc-900 ${
                    h === "nw"
                      ? "-left-3 -top-3 cursor-nwse-resize"
                      : h === "ne"
                      ? "-right-3 -top-3 cursor-nesw-resize"
                      : h === "sw"
                      ? "-bottom-3 -left-3 cursor-nesw-resize"
                      : "-bottom-3 -right-3 cursor-nwse-resize"
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-zinc-800 p-1">
              {(["auto", "color", "grayscale", "bw"] as EnhanceMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => onModeChange(m)}
                  className={`rounded px-2.5 py-1 text-xs capitalize transition-colors ${
                    mode === m
                      ? "bg-zinc-700 text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {m === "bw" ? "B&W" : m}
                </button>
              ))}
            </div>
            <button
              onClick={resetFull}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Full page
            </button>
          </div>
        </div>

        <div className="flex gap-2 border-t border-zinc-800 p-4">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-300 hover:border-zinc-500"
          >
            Retake
          </button>
          <button
            onClick={accept}
            disabled={applying || busy}
            className="flex-1 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50"
          >
            {applying || busy ? "Working…" : "Accept crop"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
