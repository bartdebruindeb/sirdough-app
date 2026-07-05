"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRole } from "@/lib/role-context";
import { bakeryConfig } from "@/config/bakery.config";

type Batch = {
  id: string; mixerGroup: string; groupLabel: string; batchNumber: number;
  totalLoaves: number; status: "todo" | "in_mixer" | "rijzen" | "voorvormen" | "eindvormen" | "klaar";
  startedAt: string | null; rijzenAt: string | null; voorvormAt: string | null; eindvormAt: string | null; klaarAt: string | null;
};
type BreadLine = { breadTypeId: string; name: string; slug: string; totalQty: number };
type DeliveryStatus = {
  customerId: string; customerName: string; customerCity: string | null;
  inBusAt: string | null; deliveredAt: string | null;
};

function fmtTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

const STATUS_COLOR: Record<string, string> = {
  todo: "var(--text-subtle)", in_mixer: "#b45309", rijzen: "#1d4ed8", voorvormen: "#c2410c", eindvormen: "#7c3aed", klaar: "#16a34a",
};
const STATUS_LABEL: Record<string, string> = {
  todo: "Te doen", in_mixer: "In mixer", rijzen: "Rijzen", voorvormen: "Voorvormen", eindvormen: "Eindvormen", klaar: "Klaar",
};
const STATUS_AT: Record<string, keyof Batch> = {
  in_mixer: "startedAt", rijzen: "rijzenAt", voorvormen: "voorvormAt", eindvormen: "eindvormAt", klaar: "klaarAt",
};

function shortName(n: string) {
  return n.replace("Boeren ","B.").replace(" KG","kg").replace("Morning buns","Buns")
    .replace("Baguette 0.5 kg","Bag.").replace("Baguette Kaas/Peper","B.K/P")
    .replace("Gekiemde Rogge","G.Rogge").replace("Volkoren","Volk.");
}

// ── Combined production widget (totals + batch status side by side) ────────────
function ProductionWidget({ role }: { role: string | null }) {
  const today    = new Date().toISOString().slice(0, 10);
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();

  const [todayLines,    setTodayLines]    = useState<BreadLine[]>([]);
  const [tomorrowLines, setTomorrowLines] = useState<BreadLine[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/production?date=${today}`,    { headers: { "x-role": role ?? "" } }).then(r => r.json()),
      fetch(`/api/production?date=${tomorrow}`, { headers: { "x-role": role ?? "" } }).then(r => r.json()),
      fetch(`/api/production/batches?date=${today}`, { headers: { "x-role": role ?? "" } }).then(r => r.json()),
    ]).then(([t, tm, b]) => {
      if (cancelled) return;
      setTodayLines((t.breadLines ?? []).filter((l: BreadLine) => l.totalQty > 0));
      setTomorrowLines((tm.breadLines ?? []).filter((l: BreadLine) => l.totalQty > 0));
      setBatches(b.batches ?? []);
      setLoaded(true);
    }).catch(() => { if (!cancelled) setLoaded(true); });
    const id = setInterval(() => {
      fetch(`/api/production/batches?date=${today}`, { headers: { "x-role": role ?? "" } })
        .then(r => r.json()).then(d => { if (!cancelled) setBatches(d.batches ?? []); }).catch(() => {});
    }, 30000);
    return () => { cancelled = true; clearInterval(id); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, today, tomorrow]);

  if (!loaded || (todayLines.length === 0 && tomorrowLines.length === 0)) return null;

  const allTypes = [...new Map([...todayLines, ...tomorrowLines].map(l => [l.breadTypeId, l])).values()];
  const todayMap = new Map(todayLines.map(l => [l.breadTypeId, l.totalQty]));
  const tomorrowMap = new Map(tomorrowLines.map(l => [l.breadTypeId, l.totalQty]));
  const todayTotal = todayLines.reduce((s, l) => s + l.totalQty, 0);
  const tomorrowTotal = tomorrowLines.reduce((s, l) => s + l.totalQty, 0);

  const totalBatches = batches.length;
  const done = batches.filter(b => b.status === "klaar").length;
  const allDone = totalBatches > 0 && done === totalBatches;
  const pct = totalBatches > 0 ? Math.round((done / totalBatches) * 100) : 0;

  const thS: React.CSSProperties = { fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-subtle)", padding: "5px 10px", textAlign: "right", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap" };
  const tdS: React.CSSProperties = { fontSize: 13, padding: "5px 10px", textAlign: "right", borderBottom: "1px solid var(--border)" };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: "1.5rem" }}>
      <style>{`@media (max-width: 700px) { .dash-prod-grid { grid-template-columns: 1fr !important; } .dash-prod-left { border-right: none !important; border-bottom: 1px solid var(--border); } }`}</style>
      <div style={{ padding: "0.75rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
        <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-subtle)", margin: 0 }}>Productie</h3>
        <Link href="/productie" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>→ Productie</Link>
      </div>
      <div className="dash-prod-grid" style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 0 }}>
        {/* Left: totals table */}
        <div className="dash-prod-left" style={{ borderRight: "1px solid var(--border)" }}>
          <div style={{ padding: "0.75rem 1.5rem", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: "var(--accent)" }}>{todayTotal}</span>
            <span style={{ fontSize: 13, color: "var(--text-subtle)", marginLeft: 8 }}>stuks vandaag</span>
            {tomorrowTotal > 0 && <span style={{ fontSize: 13, color: "var(--text-subtle)", marginLeft: 12 }}>· morgen: {tomorrowTotal}</span>}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...thS, textAlign: "left" }}>Broodsoort</th>
                  <th style={thS}>Vandaag</th>
                  <th style={thS}>Morgen</th>
                </tr>
              </thead>
              <tbody>
                {allTypes.map(l => (
                  <tr key={l.breadTypeId}>
                    <td style={{ ...tdS, textAlign: "left", color: "var(--text-muted)" }}>{shortName(l.name)}</td>
                    <td style={{ ...tdS, fontWeight: (todayMap.get(l.breadTypeId) ?? 0) > 0 ? 600 : 400, color: (todayMap.get(l.breadTypeId) ?? 0) > 0 ? "var(--text)" : "var(--text-subtle)" }}>
                      {todayMap.get(l.breadTypeId) ?? "—"}
                    </td>
                    <td style={{ ...tdS, fontWeight: (tomorrowMap.get(l.breadTypeId) ?? 0) > 0 ? 600 : 400, color: (tomorrowMap.get(l.breadTypeId) ?? 0) > 0 ? "var(--text)" : "var(--text-subtle)" }}>
                      {tomorrowMap.get(l.breadTypeId) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {/* Right: batch status */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {totalBatches === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-subtle)", margin: "1rem 1.25rem" }}>Geen batches aangemaakt voor vandaag.</p>
          ) : (
            <>
              <div style={{ padding: "0.6rem 1rem 0.5rem", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: allDone ? "#4ade80" : "var(--accent)", borderRadius: 3, transition: "width 0.4s" }} />
                </div>
                <p style={{ fontSize: 12, fontWeight: 600, color: allDone ? "#16a34a" : "var(--text)", margin: 0 }}>
                  {allDone ? "🎉 Alles klaar!" : `${done}/${totalBatches} klaar`}
                </p>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "4px 6px" }}>
                {[...batches].sort((a, b) => {
                  const ord: Record<string, number> = { klaar: 0, eindvormen: 1, voorvormen: 2, rijzen: 3, in_mixer: 4, todo: 5 };
                  return (ord[a.status] ?? 9) - (ord[b.status] ?? 9);
                }).map(b => {
                  const isActive = b.status !== "todo" && b.status !== "klaar";
                  const tsKey = STATUS_AT[b.status] as keyof Batch;
                  const ts = tsKey ? (b[tsKey] as string | null) : null;
                  return (
                    <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 6, borderLeft: `3px solid ${STATUS_COLOR[b.status]}`, borderRadius: 4, padding: "3px 8px", marginBottom: 3, background: b.status === "klaar" ? "#f0fdf4" : b.status === "todo" ? "var(--surface-2)" : "var(--surface)", opacity: b.status === "todo" ? 0.55 : 1 }}>
                      <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.groupLabel} #{b.batchNumber}</span>
                      <span style={{ fontSize: 11, color: STATUS_COLOR[b.status], fontWeight: 600, whiteSpace: "nowrap" }}>{STATUS_LABEL[b.status]}</span>
                      {ts && <span style={{ fontSize: 10, color: "var(--text-subtle)", whiteSpace: "nowrap" }}>{fmtTime(ts)}</span>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Delivery map (owner only) ─────────────────────────────────────────────────
type MapStop = {
  customerId: string; name: string; city: string | null; address: string | null;
  isShop: boolean; lat: number | null; lng: number | null;
  inBusAt: string | null; deliveredAt: string | null;
};

// OSRM road routing with localStorage cache (TTL 7 days)
async function fetchRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<[number, number][] | null> {
  const key = `route:${from.lat.toFixed(5)},${from.lng.toFixed(5)}-${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) { const { coords, ts } = JSON.parse(cached); if (Date.now() - ts < 7 * 24 * 3600 * 1000) return coords; }
  } catch {}
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const r = await fetch(url);
    const d = await r.json();
    const route = d.routes?.[0];
    if (!route) return null;
    const coords: [number, number][] = route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
    try { localStorage.setItem(key, JSON.stringify({ coords, ts: Date.now() })); } catch {}
    return coords;
  } catch { return null; }
}

// Geocode with localStorage cache (TTL 30 days)
async function geocodeStop(address: string, city: string | null): Promise<{ lat: number; lng: number } | null> {
  const key = `geo:${address}|${city ?? ""}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const { lat, lng, ts } = JSON.parse(cached);
      if (Date.now() - ts < 30 * 24 * 3600 * 1000) return { lat, lng };
    }
  } catch {}
  const q = encodeURIComponent(`${address}, ${city ?? ""}, Nederland`);
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
      headers: { "Accept-Language": "nl", "User-Agent": "SirdoughApp/1.0" },
    });
    const d = await r.json();
    if (d[0]) {
      const coord = { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
      try { localStorage.setItem(key, JSON.stringify({ ...coord, ts: Date.now() })); } catch {}
      return coord;
    }
  } catch {}
  return null;
}

function DeliveryMapWidget({ role }: { role: string | null }) {
  const today = new Date().toISOString().slice(0, 10);
  const mapRef     = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null);

  const [stops, setStops]         = useState<MapStop[]>([]);
  const [loaded, setLoaded]       = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [mapReady, setMapReady]   = useState(false);
  // Phase 1: load data
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/bezorgen?date=${today}`, { headers: { "x-role": role ?? "" } }).then(r => r.json()).catch(() => ({})),
      fetch(`/api/delivery-status?date=${today}`, { headers: { "x-role": role ?? "" } }).then(r => r.json()).catch(() => ({})),
    ]).then(([bezorgenRes, statusRes]) => {
      if (cancelled) return;
      const rows: any[] = bezorgenRes.rows ?? [];
      const statuses: DeliveryStatus[] = statusRes.statuses ?? [];
      const statusMap = new Map(statuses.map(s => [s.customerId, s]));
      setStops(rows.map(r => {
        const st = statusMap.get(r.customerId);
        return { customerId: r.customerId, name: r.name, city: r.city, address: r.address, isShop: r.isShop ?? false, lat: r.lat ?? null, lng: r.lng ?? null, inBusAt: st?.inBusAt ?? null, deliveredAt: st?.deliveredAt ?? null };
      }));
      setLoaded(true);
    }).catch(() => { if (!cancelled) setLoaded(true); });
    const interval = setInterval(() => {
      fetch(`/api/delivery-status?date=${today}`, { headers: { "x-role": role ?? "" } })
        .then(r => r.json()).then(d => { if (!cancelled) setStops(prev => prev.map(s => { const st = (d.statuses ?? []).find((x: any) => x.customerId === s.customerId); return st ? { ...s, inBusAt: st.inBusAt, deliveredAt: st.deliveredAt } : s; })); })
        .catch(() => {});
    }, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, today]);

  // Phase 2: init map after data loaded and div mounted
  useEffect(() => {
    if (!loaded || stops.length === 0 || !mapRef.current) return;
    let cancelled = false;

    (async () => {
      const leafletMod = await import("leaflet").catch(() => null);
      const L = leafletMod?.default ?? leafletMod;
      if (!L || cancelled || !mapRef.current) return;

      // @ts-expect-error - leaflet internals
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      if (leafletRef.current) { leafletRef.current.remove(); leafletRef.current = null; }
      const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: true }).setView([51.92, 4.47], 12);
      leafletRef.current = map;
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
        attribution: "© OpenStreetMap contributors, © CartoDB",
        subdomains: "abcd", maxZoom: 19,
      }).addTo(map);
      setMapReady(true);

      setGeocoding(true);
      // Use stored lat/lng from DB when available; fall back to Nominatim geocoding
      const geocoded: { stop: MapStop; coord: { lat: number; lng: number } }[] = [];
      let freshFetched = 0;
      for (const stop of stops) {
        if (cancelled) continue;
        // Prefer stored coordinates from the customer record
        if (stop.lat && stop.lng) { geocoded.push({ stop, coord: { lat: stop.lat, lng: stop.lng } }); continue; }
        if (!stop.address) continue;
        const cacheKey = `geo:${stop.address}|${stop.city ?? ""}`;
        let fromCache = false;
        try {
          const item = localStorage.getItem(cacheKey);
          if (item) { const { lat, lng, ts } = JSON.parse(item); if (Date.now() - ts < 30 * 24 * 3600 * 1000) { geocoded.push({ stop, coord: { lat, lng } }); fromCache = true; } }
        } catch {}
        if (!fromCache) {
          if (freshFetched > 0) await new Promise(r => setTimeout(r, 1100));
          const coord = await geocodeStop(stop.address, stop.city);
          if (coord && !cancelled) { geocoded.push({ stop, coord }); freshFetched++; }
        }
      }
      if (cancelled) return;

      const bounds: [number, number][] = [];

      const BAKERY: [number, number] = [bakeryConfig.bakeryLat, bakeryConfig.bakeryLng];
      bounds.push(BAKERY);
      const bakeryIcon = L.divIcon({
        html: `<div style="width:34px;height:34px;border-radius:50%;background:#92400e;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:15px;">🏠</div>`,
        className: "", iconSize: [34, 34], iconAnchor: [17, 17],
      });
      L.marker(BAKERY, { icon: bakeryIcon }).addTo(map)
        .bindPopup(`<strong>Bakkerij</strong><br/><small>${bakeryConfig.bakeryAddress}</small>`);

      // Draw OSRM roads between: bakery → in-bus stops (in inBusAt order) → delivered stops
      const inBusOrdered = geocoded
        .filter(g => g.stop.inBusAt && !g.stop.deliveredAt)
        .sort((a, b) => (a.stop.inBusAt ?? "").localeCompare(b.stop.inBusAt ?? ""));
      const deliveredOrdered = geocoded
        .filter(g => g.stop.deliveredAt)
        .sort((a, b) => (a.stop.deliveredAt ?? "").localeCompare(b.stop.deliveredAt ?? ""));
      // Stops not yet added to the bus at all have no real driving order yet — sort by
      // city then name just so the "still to drive" line is stable, not a claim of the
      // actual final route.
      const pendingOrdered = geocoded
        .filter(g => !g.stop.inBusAt && !g.stop.deliveredAt)
        .sort((a, b) => (a.stop.city ?? "").localeCompare(b.stop.city ?? "") || a.stop.name.localeCompare(b.stop.name));
      const routePoints: [number, number][] = [
        BAKERY,
        ...deliveredOrdered.map(g => [g.coord.lat, g.coord.lng] as [number, number]),
        ...inBusOrdered.map(g => [g.coord.lat, g.coord.lng] as [number, number]),
        ...pendingOrdered.map(g => [g.coord.lat, g.coord.lng] as [number, number]),
      ];

      // Fetch all route segments in parallel (cached)
      const routeSegments = await Promise.all(
        routePoints.slice(0, -1).map((pt, i) => {
          const from = { lat: pt[0], lng: pt[1] };
          const to   = { lat: routePoints[i + 1][0], lng: routePoints[i + 1][1] };
          return fetchRoute(from, to);
        })
      );
      for (let i = 0; i < routeSegments.length; i++) {
        const seg = routeSegments[i];
        const isDoneSegment    = i < deliveredOrdered.length;
        const isCurrentSegment = i === deliveredOrdered.length;
        // Done = green, next stop to drive = red, everything still further out = grey.
        const color = isDoneSegment ? "#16a34a" : isCurrentSegment ? "#dc2626" : "#9ca3af";
        const weight = isCurrentSegment ? 3.5 : isDoneSegment ? 3 : 2;
        const opacity = isCurrentSegment || isDoneSegment ? 0.8 : 0.6;
        if (seg) {
          L.polyline(seg, { color, weight, opacity, dashArray: isCurrentSegment ? "10 5" : undefined }).addTo(map);
        } else {
          L.polyline([routePoints[i], routePoints[i + 1]], { color, weight: 2, dashArray: "6 4", opacity: opacity * 0.7 }).addTo(map);
        }
      }

      // Determine the next destination: first in-bus stop ordered by inBusAt
      const nextDestId = inBusOrdered[0]?.stop.customerId ?? null;

      // Draw stop markers — shops get 🏪 (teal), delivery customers get 📦 (indigo)
      for (const { stop, coord } of geocoded) {
        bounds.push([coord.lat, coord.lng]);
        const isDone  = !!stop.deliveredAt;
        const isInBus = !!stop.inBusAt && !isDone;
        const isNext  = !isDone && stop.customerId === nextDestId;
        const isShop  = stop.isShop;
        const color   = isDone ? "#16a34a" : isNext ? "#dc2626" : isInBus ? "#7F77DD" : "#6b7280";
        const emoji   = isDone ? "✓" : isShop ? "🏪" : "📦";
        const size    = isNext ? 38 : isInBus ? 34 : isDone ? 30 : 26;
        const fontSize = isNext ? 17 : isInBus ? 15 : isDone ? 13 : 13;
        const icon = L.divIcon({
          html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;color:white;font-weight:700;">${isDone ? emoji : emoji}</div>`,
          className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2],
        });
        const typeLabel = isShop ? "Winkel" : "Bezorging";
        const timeStr = isDone ? `✓ Geleverd ${fmtTime(stop.deliveredAt)}` : isInBus ? `🚐 In bus ${fmtTime(stop.inBusAt)}` : `Te bezorgen (${typeLabel})`;
        L.marker([coord.lat, coord.lng], { icon }).addTo(map)
          .bindPopup(`<strong>${stop.name}</strong><br/><span style="color:${color};font-weight:600">${timeStr}</span>${stop.address ? `<br/><small style="color:#666">${stop.address}</small>` : ""}`);
      }
      if (bounds.length > 0) map.fitBounds(bounds, { padding: [44, 44] });
      setGeocoding(false);
    })();

    return () => { cancelled = true; leafletRef.current?.remove(); leafletRef.current = null; setMapReady(false); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, stops.length]);

  const total     = loaded ? stops.length : 0;
  const delivered = stops.filter(s => s.deliveredAt).length;
  const inBus     = stops.filter(s => s.inBusAt && !s.deliveredAt).length;
  const allDone   = total > 0 && delivered === total;
  const nextDestId = stops
    .filter(s => s.inBusAt && !s.deliveredAt)
    .sort((a, b) => (a.inBusAt ?? "").localeCompare(b.inBusAt ?? ""))[0]?.customerId ?? null;

  // Don't render the widget at all if loaded and no stops
  if (loaded && total === 0) return null;

  return (
    <div style={{ background: allDone ? "#f0fdf4" : "var(--surface)", border: `1px solid ${allDone ? "#4ade80" : "var(--border)"}`, borderRadius: 12, overflow: "hidden", marginBottom: "1.5rem" }}>
      <style>{`
        @import url("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css");
        @media (max-width: 700px) {
          .dash-delivery-grid { grid-template-columns: 1fr !important; }
          .dash-delivery-map { border-right: none !important; border-bottom: 1px solid var(--border); }
          .dash-delivery-list { max-height: none !important; }
        }
      `}</style>
      <div style={{ padding: "0.75rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
        <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: allDone ? "#16a34a" : "var(--text-subtle)", margin: 0 }}>
          Bezorging vandaag
        </h3>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {loaded && (
            <span style={{ fontSize: 13, fontWeight: 600, color: allDone ? "#16a34a" : "var(--accent)" }}>
              {allDone ? "🎉 Alles bezorgd!" : `${delivered}/${total} geleverd${inBus > 0 ? ` · ${inBus} onderweg` : ""}`}
            </span>
          )}
          <Link href="/bezorgen" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>→ Bezorgen</Link>
        </div>
      </div>
      <div className="dash-delivery-grid" style={{ display: "grid", gridTemplateColumns: "3fr 2fr", minHeight: 300 }}>
        {/* Left: map — always rendered so mapRef is available for Leaflet */}
        <div className="dash-delivery-map" style={{ position: "relative", borderRight: "1px solid var(--border)" }}>
          {!loaded && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1, fontSize: 12, color: "var(--text-subtle)" }}>
              Laden…
            </div>
          )}
          {geocoding && (
            <div style={{ position: "absolute", top: 8, left: 8, zIndex: 500, background: "rgba(255,255,255,0.85)", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "var(--text-subtle)" }}>
              Adressen laden…
            </div>
          )}
          <div ref={mapRef} style={{ height: 320, width: "100%" }} />
        </div>
        {/* Right: delivery list */}
        <div className="dash-delivery-list" style={{ overflowY: "auto", maxHeight: 320 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface-2)", position: "sticky", top: 0 }}>
                <th style={{ textAlign: "left", padding: "8px 14px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-subtle)", borderBottom: "1px solid var(--border)" }}>Klant</th>
                <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-subtle)", borderBottom: "1px solid var(--border)" }}>Status</th>
                <th style={{ textAlign: "right", padding: "8px 14px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-subtle)", borderBottom: "1px solid var(--border)" }}>Tijd</th>
              </tr>
            </thead>
            <tbody>
              {[...stops]
                .sort((a, b) => {
                  const rank = (s: MapStop) => s.deliveredAt ? 0 : s.inBusAt ? 1 : 2;
                  const ra = rank(a), rb = rank(b);
                  if (ra !== rb) return ra - rb;
                  if (ra === 0) return (b.deliveredAt ?? "").localeCompare(a.deliveredAt ?? ""); // newest delivered first
                  if (ra === 1) return (a.inBusAt ?? "").localeCompare(b.inBusAt ?? ""); // delivery sheet order
                  return 0;
                })
                .map((s, i) => {
                const isDone  = !!s.deliveredAt;
                const isInBus = !!s.inBusAt && !isDone;
                const isNext  = !isDone && s.customerId === nextDestId;
                const color   = isDone ? "#16a34a" : isNext ? "#dc2626" : isInBus ? "#b45309" : "var(--text-subtle)";
                const statusLabel = isDone ? "Geleverd" : isInBus ? "In de bus" : "Te bezorgen";
                const time = isDone ? fmtTime(s.deliveredAt) : isInBus ? fmtTime(s.inBusAt) : null;
                return (
                  <tr key={s.customerId} style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none", background: isDone ? "#f0fdf4" : isNext ? "#fef2f2" : isInBus ? "#fefce8" : "transparent" }}>
                    <td style={{ padding: "8px 14px", fontWeight: isDone ? 400 : 500 }}>
                      {s.name}
                      {s.city && <span style={{ fontSize: 11, color: "var(--text-subtle)", marginLeft: 4 }}>({s.city})</span>}
                    </td>
                    <td style={{ padding: "8px 10px", color, fontWeight: 600, fontSize: 12 }}>{statusLabel}</td>
                    <td style={{ padding: "8px 14px", textAlign: "right", fontSize: 12, color: "var(--text-subtle)" }}>{time ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


function getGreeting(hour: number) {
  if (hour < 6) return "Goedenacht";
  if (hour < 12) return "Goedemorgen";
  if (hour < 18) return "Goedemiddag";
  return "Goedenavond";
}

function AnnouncementWidget({ role }: { role: string | null }) {
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/announcement", { headers: { "x-role": role ?? "" } })
      .then(r => r.json()).then(d => { setMsg(d.message ?? ""); setSaved(d.message ?? ""); }).catch(() => {});
  }, [role]);

  async function save() {
    setSaving(true);
    await fetch("/api/announcement", { method: "PUT", headers: { "Content-Type": "application/json", "x-role": role ?? "" }, body: JSON.stringify({ message: msg }) }).catch(() => {});
    setSaved(msg); setSaving(false);
  }

  if (role !== "OWNER") return null;

  return (
    <div className="card" style={{ padding: "1rem 1.5rem", marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-subtle)", margin: 0 }}>📢 Bericht voor klanten</h3>
        {saved && <span style={{ fontSize: 11, color: "var(--success)" }}>Zichtbaar in klantportal</span>}
      </div>
      <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={2} placeholder="Laat dit leeg om geen bericht te tonen…"
        style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px", fontSize: 13, background: "var(--surface)", color: "var(--text)", resize: "vertical", fontFamily: "var(--font-body)", boxSizing: "border-box" }} />
      <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
        {msg !== "" && <button onClick={() => { setMsg(""); }} className="btn-secondary" style={{ fontSize: 12 }}>Leegmaken</button>}
        <button onClick={save} disabled={saving || msg === saved} className="btn-primary" style={{ fontSize: 12 }}>
          {saving ? "Opslaan…" : "Opslaan"}
        </button>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { role } = useRole();
  const [today, setToday] = useState("");
  const [greeting, setGreeting] = useState("Goedemorgen");

  useEffect(() => {
    const now = new Date();
    setToday(now.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
    setGreeting(getGreeting(now.getHours()));
  }, []);

  return (
    <div style={{ padding: "1.5rem 1rem", maxWidth: 1200 }} className="home-page">
      <p style={{ color: "var(--text-subtle)", fontSize: 13, margin: "0 0 6px" }}>{today}</p>
      <h1 style={{ fontSize: 34, marginBottom: "0.25rem" }}>{greeting}</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>Wat gaan we vandaag bakken?</p>

      {/* ── Announcement for customers ── */}
      <AnnouncementWidget role={role} />

      {/* ── Production (totals + batch status) ── */}
      <ProductionWidget role={role} />

      {/* ── Delivery map + list — owner only ── */}
      {role === "OWNER" && <DeliveryMapWidget role={role} />}
    </div>
  );
}
