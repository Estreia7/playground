"use client";

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
}: {
  points: MapPoint[];
  centroid: { lat: number; lng: number } | null;
  radiusKm: number | null;
  caption: string | null;
}) {
  return (
    <div className="ha-panel overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
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
    </div>
  );
}
