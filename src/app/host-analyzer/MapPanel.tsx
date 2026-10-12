"use client";

import { useMemo, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { MapPoint } from "./MapInner";

const MapInner = dynamic(() => import("./MapInner"), {
  ssr: false,
  loading: () => <div className="ha-skeleton h-full w-full" aria-hidden />,
});

export function MapPanel({
  points,
  centroid,
  radiusKm,
  caption,
  footnote,
}: {
  points: MapPoint[];
  centroid: { lat: number; lng: number } | null;
  radiusKm: number | null;
  caption: string | null;
  footnote?: ReactNode;
}) {
  return (
    <div className="ha-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
        <h3 className="ha-display text-sm font-semibold">Operating area</h3>
        {caption && <span className="text-xs text-[var(--mist)]">{caption}</span>}
      </div>
      <div className="h-[340px] w-full">
        {points.length > 0 ? (
          <MapInner points={points} centroid={centroid} radiusKm={radiusKm} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--mist)]">
            Addresses appear here once the registry lookups finish.
          </div>
        )}
      </div>
      {footnote && (
        <div className="px-4 py-2.5 text-xs leading-relaxed text-[var(--mist)]">{footnote}</div>
      )}
    </div>
  );
}

// Single-license locator for the AL drill-down. Zooms close on a street pin,
// stays wider on a town-centre fallback so it doesn't fake precision.
export function MiniMap({ point, className = "" }: { point: MapPoint; className?: string }) {
  // Stable array so FitBounds doesn't re-fly the map on every parent render.
  const { lat, lng, label, sub, tone, pulse, approx } = point;
  const points = useMemo(
    () => [{ lat, lng, label, sub, tone, pulse, approx }],
    [lat, lng, label, sub, tone, pulse, approx]
  );
  return (
    <div className={`overflow-hidden rounded-[10px] border border-[var(--tide)] ${className}`}>
      <MapInner
        points={points}
        centroid={{ lat: point.lat, lng: point.lng }}
        radiusKm={null}
        maxZoom={point.approx ? 13 : 16}
      />
    </div>
  );
}
