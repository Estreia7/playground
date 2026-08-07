"use client";

// Leaflet map body. Loaded only on the client (see MapPanel) because Leaflet
// touches `window` at import time. Markers are divIcons so the insurance
// status color and the sonar pulse come straight from the theme CSS.

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
};

const TONE_COLOR: Record<MapPoint["tone"], string> = {
  ok: "#3ecfb2",
  warn: "#f2a93b",
  alert: "#ff6a55",
  muted: "#8aa6a3",
};

function markerIcon(tone: MapPoint["tone"], pulse: boolean) {
  const color = TONE_COLOR[tone];
  return L.divIcon({
    className: "",
    html: `<div class="ha-marker${pulse ? " ha-sonar" : ""}" style="background:${color};color:${color}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds.pad(0.35), { maxZoom: 13, animate: true });
  }, [map, points]);
  return null;
}

export default function MapInner({
  points,
  centroid,
  radiusKm,
}: {
  points: MapPoint[];
  centroid: { lat: number; lng: number } | null;
  radiusKm: number | null;
}) {
  const center = useMemo<[number, number]>(
    () => (centroid ? [centroid.lat, centroid.lng] : [37.1, -8.1]),
    [centroid]
  );

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
      <FitBounds points={points} />
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
      {points.map((p, i) => (
        <Marker
          key={`${p.lat}-${p.lng}-${i}`}
          position={[p.lat, p.lng]}
          icon={markerIcon(p.tone, !!p.pulse)}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            <span className="text-xs font-medium">{p.label}</span>
            {p.sub && <div className="text-[10px] opacity-70">{p.sub}</div>}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
