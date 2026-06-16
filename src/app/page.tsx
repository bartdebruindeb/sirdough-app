"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRole } from "@/lib/role-context";

type Batch = {
  id: string; mixerGroup: string; groupLabel: string; batchNumber: number;
  totalLoaves: number; status: "todo" | "in_mixer" | "rijzen" | "klaar";
  startedAt: string | null; rijzenAt: string | null; klaarAt: string | null;
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
  todo: "var(--text-subtle)", in_mixer: "#b45309", rijzen: "#1d4ed8", klaar: "#16a34a",
};
const STATUS_LABEL: Record<string, string> = {
  todo: "Te doen", in_mixer: "In mixer", rijzen: "Rijzen", klaar: "Klaar",
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
      fetch(`/digitalbakery/api/production?date=${today}`,    { headers: { "x-role": role ?? "" } }).then(r => r.json()),
      fetch(`/digitalbakery/api/production?date=${tomorrow}`, { headers: { "x-role": role ?? "" } }).then(r => r.json()),
      fetch(`/digitalbakery/api/production/batches?date=${today}`, { headers: { "x-role": role ?? "" } }).then(r => r.json()),
    ]).then(([t, tm, b]) => {
      if (cancelled) return;
      setTodayLines((t.breadLines ?? []).filter((l: BreadLine) => l.totalQty > 0));
      setTomorrowLines((tm.breadLines ?? []).filter((l: BreadLine) => l.totalQty > 0));
      setBatches(b.batches ?? []);
      setLoaded(true);
    }).catch(() => { if (!cancelled) setLoaded(true); });
    const id = setInterval(() => {
      fetch(`/digitalbakery/api/production/batches?date=${today}`, { headers: { "x-role": role ?? "" } })
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
  const inMixer = batches.filter(b => b.status === "in_mixer").length;
  const rijzen = batches.filter(b => b.status === "rijzen").length;
  const todo = batches.filter(b => b.status === "todo").length;
  const allDone = totalBatches > 0 && done === totalBatches;
  const pct = totalBatches > 0 ? Math.round((done / totalBatches) * 100) : 0;

  const thS: React.CSSProperties = { fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-subtle)", padding: "5px 10px", textAlign: "right", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap" };
  const tdS: React.CSSProperties = { fontSize: 13, padding: "5px 10px", textAlign: "right", borderBottom: "1px solid var(--border)" };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: "1.5rem" }}>
      <div style={{ padding: "0.75rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
        <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-subtle)", margin: 0 }}>Productie</h3>
        <Link href="/productie" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>→ Productie</Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 0 }}>
        {/* Left: totals table */}
        <div style={{ borderRight: "1px solid var(--border)" }}>
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
        <div style={{ padding: "1rem 1.25rem" }}>
          {totalBatches === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-subtle)", margin: 0 }}>Geen batches aangemaakt voor vandaag.</p>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 12, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 4px" }}>Voortgang</p>
                <div style={{ height: 8, background: "var(--border)", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: allDone ? "#4ade80" : "var(--accent)", borderRadius: 4, transition: "width 0.4s" }} />
                </div>
                <p style={{ fontSize: 13, fontWeight: 600, color: allDone ? "#16a34a" : "var(--text)", margin: 0 }}>
                  {allDone ? "🎉 Alles klaar!" : `${done}/${totalBatches} klaar`}
                </p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { label: "Te doen",  count: todo,    color: "var(--text-subtle)", bg: "var(--surface-2)" },
                  { label: "In mixer", count: inMixer, color: "#b45309",            bg: "#fefce8" },
                  { label: "Rijzen",   count: rijzen,  color: "#1d4ed8",            bg: "#eff6ff" },
                  { label: "Klaar",    count: done,    color: "#16a34a",            bg: "#f0fdf4" },
                ].map(({ label, count, color, bg }) => (
                  <div key={label} style={{ background: bg, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px" }}>
                    <p style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", margin: "0 0 2px" }}>{label}</p>
                    <p style={{ fontSize: 22, fontWeight: 700, color, margin: 0 }}>{count}</p>
                  </div>
                ))}
              </div>
              {batches.filter(b => b.status === "in_mixer" || b.status === "rijzen").map(b => (
                <div key={b.id} style={{ marginTop: 6, fontSize: 12, color: b.status === "in_mixer" ? "#b45309" : "#1d4ed8" }}>
                  {b.groupLabel} #{b.batchNumber} — {STATUS_LABEL[b.status]}
                  {b.status === "in_mixer" && b.startedAt ? ` ${fmtTime(b.startedAt)}` : ""}
                  {b.status === "rijzen"   && b.rijzenAt  ? ` ${fmtTime(b.rijzenAt)}` : ""}
                </div>
              ))}
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
  inBusAt: string | null; deliveredAt: string | null;
};

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
      fetch(`/digitalbakery/api/bezorgen?date=${today}`, { headers: { "x-role": role ?? "" } }).then(r => r.json()).catch(() => ({})),
      fetch(`/digitalbakery/api/delivery-status?date=${today}`, { headers: { "x-role": role ?? "" } }).then(r => r.json()).catch(() => ({})),
    ]).then(([bezorgenRes, statusRes]) => {
      if (cancelled) return;
      const rows: any[] = bezorgenRes.rows ?? [];
      const statuses: DeliveryStatus[] = statusRes.statuses ?? [];
      const statusMap = new Map(statuses.map(s => [s.customerId, s]));
      setStops(rows.map(r => {
        const st = statusMap.get(r.customerId);
        return { customerId: r.customerId, name: r.name, city: r.city, address: r.address, inBusAt: st?.inBusAt ?? null, deliveredAt: st?.deliveredAt ?? null };
      }));
      setLoaded(true);
    }).catch(() => { if (!cancelled) setLoaded(true); });
    const interval = setInterval(() => {
      fetch(`/digitalbakery/api/delivery-status?date=${today}`, { headers: { "x-role": role ?? "" } })
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
      const map = L.map(mapRef.current, { zoomControl: false, scrollWheelZoom: false }).setView([52.01, 4.36], 12);
      leafletRef.current = map;
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
        attribution: "© OpenStreetMap contributors, © CartoDB",
        subdomains: "abcd", maxZoom: 19,
      }).addTo(map);
      setMapReady(true);

      setGeocoding(true);
      const bounds: [number, number][] = [];
      for (const stop of stops) {
        if (!stop.address || cancelled) continue;
        const coord = await geocodeStop(stop.address, stop.city);
        if (!coord || cancelled) continue;
        // Only delay if not cached (fresh fetch)
        bounds.push([coord.lat, coord.lng]);
        const isDone  = !!stop.deliveredAt;
        const isInBus = !!stop.inBusAt && !isDone;
        const color   = isDone ? "#16a34a" : isInBus ? "#b45309" : "#6b7280";
        const label   = isDone ? "✓" : isInBus ? "🚐" : "·";
        const icon = L.divIcon({
          html: `<div style="width:30px;height:30px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:13px;color:white;font-weight:700;">${label}</div>`,
          className: "", iconSize: [30, 30], iconAnchor: [15, 15],
        });
        const timeStr = isDone ? `✓ Geleverd ${fmtTime(stop.deliveredAt)}` : isInBus ? `🚐 In bus ${fmtTime(stop.inBusAt)}` : "Te bezorgen";
        L.marker([coord.lat, coord.lng], { icon }).addTo(map)
          .bindPopup(`<strong>${stop.name}</strong><br/><span style="color:${color};font-weight:600">${timeStr}</span>${stop.address ? `<br/><small style="color:#666">${stop.address}</small>` : ""}`);
        await new Promise(r => setTimeout(r, 1100)); // Nominatim rate limit
      }
      if (!cancelled && bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40] });
      if (!cancelled) setGeocoding(false);
    })();

    return () => { cancelled = true; leafletRef.current?.remove(); leafletRef.current = null; setMapReady(false); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, stops.length]);

  if (!loaded) return null;
  const total     = stops.length;
  const delivered = stops.filter(s => s.deliveredAt).length;
  const inBus     = stops.filter(s => s.inBusAt && !s.deliveredAt).length;
  if (total === 0) return null;
  const allDone = delivered === total;

  return (
    <div style={{ background: allDone ? "#f0fdf4" : "var(--surface)", border: `1px solid ${allDone ? "#4ade80" : "var(--border)"}`, borderRadius: 12, overflow: "hidden", marginBottom: "1.5rem" }}>
      <style>{`@import url("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css");`}</style>
      <div style={{ padding: "0.75rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
        <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: allDone ? "#16a34a" : "var(--text-subtle)", margin: 0 }}>
          Bezorging vandaag
        </h3>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: allDone ? "#16a34a" : "var(--accent)" }}>
            {allDone ? "🎉 Alles bezorgd!" : `${delivered}/${total} geleverd${inBus > 0 ? ` · ${inBus} onderweg` : ""}`}
          </span>
          <Link href="/bezorgen" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>→ Bezorgen</Link>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", minHeight: 300 }}>
        {/* Left: map */}
        <div style={{ position: "relative", borderRight: "1px solid var(--border)" }}>
          {geocoding && (
            <div style={{ position: "absolute", top: 8, left: 8, zIndex: 500, background: "rgba(255,255,255,0.85)", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "var(--text-subtle)" }}>
              Adressen laden…
            </div>
          )}
          <div ref={mapRef} style={{ height: 320, width: "100%" }} />
        </div>
        {/* Right: delivery list */}
        <div style={{ overflowY: "auto", maxHeight: 320 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface-2)", position: "sticky", top: 0 }}>
                <th style={{ textAlign: "left", padding: "8px 14px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-subtle)", borderBottom: "1px solid var(--border)" }}>Klant</th>
                <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-subtle)", borderBottom: "1px solid var(--border)" }}>Status</th>
                <th style={{ textAlign: "right", padding: "8px 14px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-subtle)", borderBottom: "1px solid var(--border)" }}>Tijd</th>
              </tr>
            </thead>
            <tbody>
              {stops.map((s, i) => {
                const isDone  = !!s.deliveredAt;
                const isInBus = !!s.inBusAt && !isDone;
                const color   = isDone ? "#16a34a" : isInBus ? "#b45309" : "var(--text-subtle)";
                const statusLabel = isDone ? "Geleverd" : isInBus ? "In de bus" : "Te bezorgen";
                const time = isDone ? fmtTime(s.deliveredAt) : isInBus ? fmtTime(s.inBusAt) : null;
                return (
                  <tr key={s.customerId} style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none", background: isDone ? "#f0fdf4" : isInBus ? "#fefce8" : "transparent" }}>
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
    <div style={{ padding: "2.5rem 3rem", maxWidth: 1200 }}>
      <p style={{ color: "var(--text-subtle)", fontSize: 13, margin: "0 0 6px" }}>{today}</p>
      <h1 style={{ fontSize: 34, marginBottom: "0.25rem" }}>{greeting}</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>Wat gaan we vandaag bakken?</p>

      {/* ── Production (totals + batch status) ── */}
      <ProductionWidget role={role} />

      {/* ── Delivery map + list — owner only ── */}
      {role === "OWNER" && <DeliveryMapWidget role={role} />}
    </div>
  );
}
