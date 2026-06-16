"use client";
import { useEffect, useRef, useState } from "react";

export type MapRow = {
  customerId: string;
  name: string;
  city: string;
  address: string;
  busIndex: number | null;   // null = not in bus
  delivered: boolean;
  deliveredAt: string | null;
};

interface Props {
  rows: MapRow[];
}

type LatLng = { lat: number; lng: number };

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
}

async function geocode(address: string, city: string): Promise<LatLng | null> {
  const key = `geo:${address}|${city}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const { lat, lng, ts } = JSON.parse(cached);
      if (Date.now() - ts < 30 * 24 * 3600 * 1000) return { lat, lng };
    }
  } catch {}
  try {
    const q = encodeURIComponent(`${address}, ${city}, Nederland`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { "Accept-Language": "nl", "User-Agent": "SirdoughApp/1.0" } }
    );
    const data = await res.json();
    const hit = data[0] ?? null;
    if (hit) {
      const coord = { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) };
      try { localStorage.setItem(key, JSON.stringify({ ...coord, ts: Date.now() })); } catch {}
      return coord;
    }
    // Fallback: city only
    const q2 = encodeURIComponent(`${city}, Nederland`);
    const res2 = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q2}&format=json&limit=1`,
      { headers: { "Accept-Language": "nl", "User-Agent": "SirdoughApp/1.0" } }
    );
    const data2 = await res2.json();
    if (data2[0]) {
      const coord = { lat: parseFloat(data2[0].lat), lng: parseFloat(data2[0].lon) };
      try { localStorage.setItem(key, JSON.stringify({ ...coord, ts: Date.now() })); } catch {}
      return coord;
    }
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
    return { coords, distanceKm: route.distance / 1000, durationMin: Math.round(route.duration / 60) };
  } catch { return null; }
}

function fmtDuration(min: number): string {
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}u ${min % 60}m`;
}

export default function BezorgenMap({ rows }: Props) {
  const mapRef     = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const [coords, setCoords] = useState<Map<string, LatLng>>(new Map());
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  // Geocode all rows that don't have coordinates yet
  const rowKey = rows.map(r => r.customerId).join(",");
  useEffect(() => {
    if (rows.length === 0) return;
    const missing = rows.filter(r => !coords.has(r.customerId) && r.address);
    if (missing.length === 0) return;
    setLoading(true);
    setProgress(0);

    (async () => {
      const newCoords = new Map(coords);
      let fetched = 0;
      for (let i = 0; i < missing.length; i++) {
        const r = missing[i];
        // Check cache first (no delay needed for cached items)
        const cacheKey = `geo:${r.address}|${r.city}`;
        let cached = false;
        try {
          const item = localStorage.getItem(cacheKey);
          if (item) {
            const { lat, lng, ts } = JSON.parse(item);
            if (Date.now() - ts < 30 * 24 * 3600 * 1000) {
              newCoords.set(r.customerId, { lat, lng });
              cached = true;
            }
          }
        } catch {}

        if (!cached) {
          if (fetched > 0) await new Promise(res => setTimeout(res, 1100));
          const latlng = await geocode(r.address, r.city);
          if (latlng) newCoords.set(r.customerId, latlng);
          fetched++;
        }
        setProgress(Math.round((i + 1) / missing.length * 100));
      }
      setCoords(new Map(newCoords));
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowKey]);

  // Redraw map whenever coords or status changes
  const statusKey = rows.map(r => `${r.customerId}:${r.busIndex}:${r.delivered}`).join(",");
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

      if (!leafletMap.current) {
        leafletMap.current = L.map(mapRef.current!, { zoomControl: true, scrollWheelZoom: true });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
          attribution: "© OpenStreetMap contributors, © CartoDB",
          subdomains: "abcd", maxZoom: 19,
        }).addTo(leafletMap.current);
      }

      const map = leafletMap.current;
      // Clear non-tile layers
      map.eachLayer((layer: any) => { if (!layer._url) map.removeLayer(layer); });

      // Build positioned list for all rows
      const positioned = rows
        .map(r => ({ row: r, latlng: coords.get(r.customerId) }))
        .filter(x => x.latlng) as { row: MapRow; latlng: LatLng }[];

      if (positioned.length === 0) return;

      // Draw OSRM route only through in-bus stops (in order)
      const inBusPositioned = positioned
        .filter(x => x.row.busIndex !== null)
        .sort((a, b) => (a.row.busIndex ?? 0) - (b.row.busIndex ?? 0));

      for (let i = 0; i < inBusPositioned.length - 1; i++) {
        const a = inBusPositioned[i].latlng;
        const b = inBusPositioned[i + 1].latlng;
        const route = await getRoute(a, b);
        if (route) {
          const line = L.polyline(route.coords, { color: "#6366f1", weight: 4, opacity: 0.8 }).addTo(map);
          line.bindPopup(`${route.distanceKm.toFixed(1)} km · ${fmtDuration(route.durationMin)}`);
        } else {
          L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: "#6366f1", weight: 2, dashArray: "6 4", opacity: 0.5 }).addTo(map);
        }
      }

      // Draw markers for all stops
      const bounds: [number, number][] = [];
      for (const { row, latlng } of positioned) {
        bounds.push([latlng.lat, latlng.lng]);

        let html: string;
        if (row.delivered) {
          // Green checkmark
          html = `<div style="width:32px;height:32px;border-radius:50%;background:#16a34a;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:14px;color:white;font-weight:700;">✓</div>`;
        } else if (row.busIndex !== null) {
          // Numbered purple (in bus)
          html = `<div style="width:32px;height:32px;border-radius:50%;background:#6366f1;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:12px;color:white;font-weight:700;">${row.busIndex + 1}</div>`;
        } else {
          // Gray pending
          html = `<div style="width:24px;height:24px;border-radius:50%;background:#9ca3af;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;font-size:10px;color:white;font-weight:700;">·</div>`;
        }

        const icon = L.divIcon({ html, className: "", iconSize: row.delivered || row.busIndex !== null ? [32, 32] : [24, 24], iconAnchor: row.delivered || row.busIndex !== null ? [16, 16] : [12, 12] });

        let popupHtml = `<strong>${row.name}</strong><br/><small style="color:#666">${row.address}, ${row.city}</small>`;
        if (row.delivered && row.deliveredAt) {
          popupHtml += `<br/><span style="color:#16a34a;font-weight:600">✓ Geleverd om ${fmtTime(row.deliveredAt)}</span>`;
        } else if (row.busIndex !== null) {
          popupHtml += `<br/><span style="color:#6366f1;font-weight:600">🚐 Stop ${row.busIndex + 1}</span>`;
        } else {
          popupHtml += `<br/><span style="color:#6b7280">Nog niet ingepland</span>`;
        }

        L.marker([latlng.lat, latlng.lng], { icon }).addTo(map).bindPopup(popupHtml);
      }

      if (bounds.length > 0) map.fitBounds(bounds, { padding: [44, 44] });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, statusKey]);

  useEffect(() => {
    return () => { if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; } };
  }, []);

  const anyCoords = rows.some(r => coords.has(r.customerId));

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <style>{`@import url("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css");`}</style>
      {loading && (
        <div style={{
          position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)",
          background: "white", border: "1px solid var(--border)", borderRadius: 20,
          padding: "4px 14px", fontSize: 12, color: "var(--text-subtle)", zIndex: 1000,
          display: "flex", alignItems: "center", gap: 8, boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
        }}>
          <div style={{ width: 80, height: 4, background: "var(--border)", borderRadius: 2 }}>
            <div style={{ width: `${progress}%`, height: "100%", background: "var(--accent)", borderRadius: 2, transition: "width 0.3s" }} />
          </div>
          <span>Adressen {progress}%</span>
        </div>
      )}
      {!anyCoords && !loading && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--text-subtle)", fontSize: 13, zIndex: 1,
        }}>
          Adressen laden…
        </div>
      )}
      <div ref={mapRef} style={{ height: "100%", width: "100%", borderRadius: 12, overflow: "hidden" }} />
    </div>
  );
}
