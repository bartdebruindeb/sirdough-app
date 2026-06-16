"use client";
import { useEffect, useRef, useState } from "react";

type MapRow = { customerId: string; name: string; city: string; address: string };

interface Props {
  rows: MapRow[];
}

type LatLng = { lat: number; lng: number };

async function geocode(address: string, city: string): Promise<LatLng | null> {
  try {
    const q = encodeURIComponent(`${address}, ${city}, Nederland`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { "Accept-Language": "nl", "User-Agent": "SirdoughApp/1.0" } }
    );
    const data = await res.json();
    if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    // Fallback: city only
    const q2 = encodeURIComponent(`${city}, Nederland`);
    const res2 = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q2}&format=json&limit=1`,
      { headers: { "Accept-Language": "nl", "User-Agent": "SirdoughApp/1.0" } }
    );
    const data2 = await res2.json();
    if (data2[0]) return { lat: parseFloat(data2[0].lat), lng: parseFloat(data2[0].lon) };
    return null;
  } catch { return null; }
}

async function getRoute(from: LatLng, to: LatLng): Promise<{ coords: [number,number][]; distanceKm: number; durationMin: number } | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return null;
    const coords: [number,number][] = route.geometry.coordinates.map(([lng, lat]: [number,number]) => [lat, lng]);
    return {
      coords,
      distanceKm: route.distance / 1000,
      durationMin: Math.round(route.duration / 60),
    };
  } catch { return null; }
}

function fmtDuration(min: number): string {
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}u ${min % 60}m`;
}

export default function BezorgenMap({ rows }: Props) {
  const mapRef    = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const [coords, setCoords] = useState<Map<string, LatLng>>(new Map());
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  // Geocode all rows that don't have coordinates yet
  useEffect(() => {
    if (rows.length === 0) return;
    const missing = rows.filter(r => !coords.has(r.customerId) && r.address);
    if (missing.length === 0) return;
    setLoading(true);
    setProgress(0);

    (async () => {
      const newCoords = new Map(coords);
      for (let i = 0; i < missing.length; i++) {
        const r = missing[i];
        const latlng = await geocode(r.address, r.city);
        if (latlng) newCoords.set(r.customerId, latlng);
        setProgress(Math.round((i + 1) / missing.length * 100));
        if (i < missing.length - 1) await new Promise(res => setTimeout(res, 1100));
      }
      setCoords(new Map(newCoords));
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map(r => r.customerId).join(",")]);

  // Draw map whenever coords or row order changes
  useEffect(() => {
    if (!mapRef.current) return;

    (async () => {
      const L = (await import("leaflet")).default;
      // @ts-expect-error - leaflet internals
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      const positioned = rows
        .map((r, i) => ({ row: r, index: i, latlng: coords.get(r.customerId) }))
        .filter(x => x.latlng) as { row: MapRow; index: number; latlng: LatLng }[];

      if (positioned.length === 0) return;

      if (!leafletMap.current) {
        leafletMap.current = L.map(mapRef.current!, { zoomControl: true, scrollWheelZoom: true });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap contributors",
        }).addTo(leafletMap.current);
      }

      const map = leafletMap.current;
      map.eachLayer((layer: any) => { if (!layer._url) map.removeLayer(layer); });

      const bounds: [number, number][] = [];

      // Draw OSRM routes between consecutive stops
      for (let i = 0; i < positioned.length - 1; i++) {
        const a = positioned[i].latlng;
        const b = positioned[i + 1].latlng;

        const route = await getRoute(a, b);

        if (route) {
          L.polyline(route.coords, { color: "#6366f1", weight: 3, opacity: 0.75 }).addTo(map);
          const mid = route.coords[Math.floor(route.coords.length / 2)];
          L.marker(mid, {
            icon: L.divIcon({
              className: "",
              html: `<div style="background:white;border:1px solid #6366f1;border-radius:4px;padding:2px 6px;font-size:10px;color:#6366f1;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.15)">${route.distanceKm.toFixed(1)} km · ${fmtDuration(route.durationMin)}</div>`,
              iconAnchor: [35, 10],
            }),
          }).addTo(map);
        } else {
          // Fallback: straight dashed line
          L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: "#6366f1", weight: 2, dashArray: "6 4", opacity: 0.5 }).addTo(map);
        }
      }

      // Draw numbered stop markers
      for (const { row, index, latlng } of positioned) {
        bounds.push([latlng.lat, latlng.lng]);
        const marker = L.marker([latlng.lat, latlng.lng], {
          icon: L.divIcon({
            className: "",
            html: `<div style="background:#6366f1;color:white;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.25)">${index + 1}</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          }),
        });
        marker.bindPopup(`<strong>${row.name}</strong><br/>${row.address}<br/>${row.city}`);
        marker.addTo(map);
      }

      if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40] });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, rows.map(r => r.customerId).join(",")]);

  useEffect(() => {
    return () => {
      if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; }
    };
  }, []);

  if (rows.length === 0) return null;

  return (
    <div>
      {loading && (
        <div style={{ fontSize: 12, color: "var(--text-subtle)", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <span>Adressen laden… {progress}%</span>
          <div style={{ flex: 1, height: 4, background: "var(--border)", borderRadius: 2 }}>
            <div style={{ width: `${progress}%`, height: "100%", background: "var(--accent)", borderRadius: 2, transition: "width 0.3s" }} />
          </div>
        </div>
      )}
      <div ref={mapRef} style={{ height: 340, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }} />
      <style>{`@import url("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css");`}</style>
    </div>
  );
}
