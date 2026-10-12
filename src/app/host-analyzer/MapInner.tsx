"use client";

// Leaflet map body. Loaded only on the client (see MapPanel) because Leaflet
// touches `window` at import time. Markers are divIcons so the insurance
// status color and the sonar pulse come straight from the theme CSS.
// Listings sharing one coordinate (same building, or the same town-level
// fallback pin) are drawn as a single counted marker — stacked markers read
// as one and silently hide most of a portfolio.

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Circle, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapPoint = {
  lat: number;
  lng: number;
  label: string;
  sub?: string;
  tone: "ok" | "warn" | "alert" | "muted";
  pulse?: boolean;
  // Pinned to a town/parish centre only — the real address is somewhere nearby.
  approx?: boolean;
};

const TONE_COLOR: Record<MapPoint["tone"], string> = {
  ok: "#3ecfb2",
  warn: "#f2a93b",
  alert: "#ff6a55",
  muted: "#8aa6a3",
};

// Worst status wins so a flagged listing is never hidden inside a group.
const TONE_RANK: Record<MapPoint["tone"], number> = { alert: 3, warn: 2, ok: 1, muted: 0 };

const TOOLTIP_MAX = 6;

type PointGroup = {
  lat: number;
  lng: number;
  points: MapPoint[];
  tone: MapPoint["tone"];
  pulse: boolean;
  approx: boolean;
};

function groupPoints(points: MapPoint[]): PointGroup[] {
  const groups = new Map<string, PointGroup>();
  for (const p of points) {
    const key = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        lat: p.lat,
        lng: p.lng,
        points: [p],
        tone: p.tone,
        pulse: !!p.pulse,
        approx: !!p.approx,
      });
      continue;
    }
    g.points.push(p);
    if (TONE_RANK[p.tone] > TONE_RANK[g.tone]) g.tone = p.tone;
    g.pulse ||= !!p.pulse;
    g.approx ||= !!p.approx;
  }
  return Array.from(groups.values());
}

function flaggedCount(g: PointGroup) {
  return g.points.filter((p) => p.tone === "alert" || p.tone === "warn").length;
}

function markerIcon(g: PointGroup) {
  const color = TONE_COLOR[g.tone];
  const count = g.points.length;
  const cls = ["ha-marker", g.pulse && "ha-sonar", g.approx && "ha-marker-approx"]
    .filter(Boolean)
    .join(" ");
  if (count === 1) {
    return L.divIcon({
      className: "",
      html: `<div class="${cls}" style="background:${color};color:${color}"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }
  // Counted marker grows a little with the group so a 98-listing pin reads
  // heavier than a 2-listing building.
  const size = count >= 50 ? 32 : count >= 10 ? 28 : 24;
  return L.divIcon({
    className: "",
    html: `<div class="${cls} ha-marker-group" style="--ha-marker-tone:${color};color:${color};width:${size}px;height:${size}px"><span>${count}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FitBounds({ points, maxZoom }: { points: MapPoint[]; maxZoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds.pad(0.35), { maxZoom, animate: true });
  }, [map, points, maxZoom]);
  return null;
}

export default function MapInner({
  points,
  centroid,
  radiusKm,
  maxZoom = 13,
}: {
  points: MapPoint[];
  centroid: { lat: number; lng: number } | null;
  radiusKm: number | null;
  maxZoom?: number;
}) {
  const center = useMemo<[number, number]>(
    () => (centroid ? [centroid.lat, centroid.lng] : [37.1, -8.1]),
    [centroid]
  );
  const groups = useMemo(() => groupPoints(points), [points]);

  return (
    <MapContainer
      center={center}
      zoom={10}
      className="h-full w-full"
      scrollWheelZoom={false}
      attributionControl={true}
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <FitBounds points={points} maxZoom={maxZoom} />
      {centroid && radiusKm && (
        <Circle
          center={[centroid.lat, centroid.lng]}
          radius={radiusKm * 1000}
          pathOptions={{
            color: "#3ecfb2",
            weight: 1.5,
            dashArray: "6 6",
            fillColor: "#3ecfb2",
            fillOpacity: 0.06,
          }}
        />
      )}
      {groups.map((g) => (
        <Marker
          key={`${g.lat}-${g.lng}`}
          position={[g.lat, g.lng]}
          icon={markerIcon(g)}
          zIndexOffset={g.points.length}
        >
          <Tooltip direction="top" offset={[0, -10]}>
            {g.points.length === 1 ? (
              <>
                <span className="text-xs font-medium">{g.points[0].label}</span>
                {g.points[0].sub && <div className="text-[10px] opacity-70">{g.points[0].sub}</div>}
              </>
            ) : (
              <div className="max-w-[260px]">
                <div className="text-xs font-semibold">
                  {g.points.length} listings here
                  {flaggedCount(g) > 0 && (
                    <span className="font-normal opacity-70"> · {flaggedCount(g)} insurance flagged</span>
                  )}
                </div>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {g.points.slice(0, TOOLTIP_MAX).map((p, i) => (
                    <li key={i} className="truncate text-[11px]">
                      {p.label}
                    </li>
                  ))}
                </ul>
                {g.points.length > TOOLTIP_MAX && (
                  <div className="mt-0.5 text-[10px] opacity-70">
                    +{g.points.length - TOOLTIP_MAX} more
                  </div>
                )}
              </div>
            )}
            {g.approx && (
              <div className="mt-1 text-[10px] opacity-70">Town centre only, exact address not found</div>
            )}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
