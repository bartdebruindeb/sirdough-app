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

// ── Production totals for today + tomorrow ────────────────────────────────────
function ProductionSummaryWidget({ role }: { role: string | null }) {
  const today    = new Date().toISOString().slice(0, 10);
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();

  const [todayLines,    setTodayLines]    = useState<BreadLine[]>([]);
  const [tomorrowLines, setTomorrowLines] = useState<BreadLine[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/digitalbakery/api/production?date=${today}`,    { headers: { "x-role": role ?? "" } }).then(r => r.json()),
      fetch(`/digitalbakery/api/production?date=${tomorrow}`, { headers: { "x-role": role ?? "" } }).then(r => r.json()),
    ]).then(([t, tm]) => {
      setTodayLines((t.breadLines ?? []).filter((l: BreadLine) => l.totalQty > 0));
      setTomorrowLines((tm.breadLines ?? []).filter((l: BreadLine) => l.totalQty > 0));
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [role, today, tomorrow]);

  if (!loaded || (todayLines.length === 0 && tomorrowLines.length === 0)) return null;

  const allTypes = [...new Map([...todayLines, ...tomorrowLines].map(l => [l.breadTypeId, l])).values()];
  const todayMap = new Map(todayLines.map(l => [l.breadTypeId, l.totalQty]));
  const tomorrowMap = new Map(tomorrowLines.map(l => [l.breadTypeId, l.totalQty]));
  const todayTotal = todayLines.reduce((s, l) => s + l.totalQty, 0);
  const tomorrowTotal = tomorrowLines.reduce((s, l) => s + l.totalQty, 0);

  const thS: React.CSSProperties = { fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-subtle)", padding: "5px 10px", textAlign: "right", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap" };
  const tdS: React.CSSProperties = { fontSize: 13, padding: "5px 10px", textAlign: "right", borderBottom: "1px solid var(--border)" };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: "1.5rem" }}>
      <div style={{ padding: "1rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-subtle)", margin: 0 }}>
          🍞 Productie aantallen
        </h3>
        <Link href="/productie" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>→ Productie</Link>
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
            <tr style={{ background: "var(--surface-2)" }}>
              <td style={{ ...tdS, fontWeight: 700, textAlign: "left" }}>Totaal</td>
              <td style={{ ...tdS, fontWeight: 700 }}>{todayTotal || "—"}</td>
              <td style={{ ...tdS, fontWeight: 700 }}>{tomorrowTotal || "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Delivery map (owner only) ─────────────────────────────────────────────────
type MapStop = {
  customerId: string; name: string; city: string | null; address: string | null;
  inBusAt: string | null; deliveredAt: string | null;
};

async function geocodeStop(address: string, city: string | null): Promise<{ lat: number; lng: number } | null> {
  const q = encodeURIComponent(`${address}, ${city ?? ""}, Nederland`);
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
      headers: { "Accept-Language": "nl", "User-Agent": "SirdoughApp/1.0" },
    });
    const d = await r.json();
    if (d[0]) return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
  } catch {}
  return null;
}

function DeliveryMapWidget({ role }: { role: string | null }) {
  const today = new Date().toISOString().slice(0, 10);
  const mapRef     = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null);

  const [stops, setStops]     = useState<MapStop[]>([]);
  const [loaded, setLoaded]   = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const [bezorgenRes, statusRes] = await Promise.all([
        fetch(`/digitalbakery/api/bezorgen?date=${today}`, { headers: { "x-role": role ?? "" } }).then(r => r.json()).catch(() => ({})),
        fetch(`/digitalbakery/api/delivery-status?date=${today}`, { headers: { "x-role": role ?? "" } }).then(r => r.json()).catch(() => ({})),
      ]);
      if (cancelled) return;

      const rows: any[] = bezorgenRes.rows ?? [];
      const statuses: DeliveryStatus[] = statusRes.statuses ?? [];
      const statusMap = new Map(statuses.map(s => [s.customerId, s]));

      const mapped: MapStop[] = rows.map(r => {
        const st = statusMap.get(r.customerId);
        return { customerId: r.customerId, name: r.name, city: r.city, address: r.address, inBusAt: st?.inBusAt ?? null, deliveredAt: st?.deliveredAt ?? null };
      });
      setStops(mapped);
      setLoaded(true);

      if (!mapRef.current || mapped.length === 0 || cancelled) return;

      const L = await import("leaflet").catch(() => null);
      if (!L || cancelled) return;

      // @ts-expect-error - leaflet internals
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      if (leafletRef.current) leafletRef.current.remove();
      const map = L.map(mapRef.current, { zoomControl: true }).setView([52.01, 4.36], 12);
      leafletRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);

      setGeocoding(true);
      const bounds: [number, number][] = [];
      for (const stop of mapped) {
        if (!stop.address || cancelled) continue;
        await new Promise(r => setTimeout(r, 1100));
        const coord = await geocodeStop(stop.address, stop.city);
        if (!coord || cancelled) continue;
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
        L.marker([coord.lat, coord.lng], { icon })
          .addTo(map)
          .bindPopup(`<strong>${stop.name}</strong><br/><span style="color:${color};font-weight:600">${timeStr}</span>${stop.address ? `<br/><small style="color:#666">${stop.address}</small>` : ""}`);
      }
      if (!cancelled && bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40] });
      if (!cancelled) setGeocoding(false);
    }

    init();
    const interval = setInterval(() => {
      fetch(`/digitalbakery/api/delivery-status?date=${today}`, { headers: { "x-role": role ?? "" } })
        .then(r => r.json()).then(d => { if (!cancelled) setStops(prev => prev.map(s => { const st = (d.statuses ?? []).find((x: any) => x.customerId === s.customerId); return st ? { ...s, inBusAt: st.inBusAt, deliveredAt: st.deliveredAt } : s; })); })
        .catch(() => {});
    }, 30000);

    return () => { cancelled = true; clearInterval(interval); leafletRef.current?.remove(); leafletRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, today]);

  if (!loaded) return null;
  const total     = stops.length;
  const delivered = stops.filter(s => s.deliveredAt).length;
  const inBus     = stops.filter(s => s.inBusAt && !s.deliveredAt).length;
  if (total === 0) return null;
  const allDone = delivered === total;

  return (
    <div style={{ background: allDone ? "#f0fdf4" : "var(--surface)", border: `1px solid ${allDone ? "#4ade80" : "var(--border)"}`, borderRadius: 12, overflow: "hidden", marginBottom: "1.5rem" }}>
      <style>{`@import url("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css");`}</style>
      <div style={{ padding: "1rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: allDone ? "#16a34a" : "var(--text-subtle)", margin: 0 }}>
          🚐 Bezorging vandaag
        </h3>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#6b7280" }}>⬤ Te bezorgen</span>
          <span style={{ fontSize: 12, color: "#b45309" }}>⬤ In de bus</span>
          <span style={{ fontSize: 12, color: "#16a34a" }}>⬤ Geleverd</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: allDone ? "#16a34a" : "var(--accent)" }}>
            {allDone ? "🎉 Alles bezorgd!" : `${delivered}/${total} geleverd${inBus > 0 ? ` · ${inBus} onderweg` : ""}`}
          </span>
          <Link href="/bezorgen" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>→ Bezorgen</Link>
        </div>
      </div>
      {geocoding && <p style={{ fontSize: 12, color: "var(--text-subtle)", padding: "0 1.5rem 8px", margin: 0 }}>Adressen laden…</p>}
      <div ref={mapRef} style={{ height: 360, width: "100%" }} />
      <div style={{ borderTop: "1px solid var(--border)", padding: "10px 16px", display: "flex", flexWrap: "wrap", gap: 6 }}>
        {stops.map(s => {
          const isDone  = !!s.deliveredAt;
          const isInBus = !!s.inBusAt && !isDone;
          const color   = isDone ? "#16a34a" : isInBus ? "#b45309" : "var(--text-subtle)";
          const time    = isDone ? fmtTime(s.deliveredAt) : isInBus ? fmtTime(s.inBusAt) : null;
          return (
            <span key={s.customerId} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 8, background: isDone ? "#f0fdf4" : isInBus ? "#fefce8" : "var(--surface-2)", border: `1px solid ${isDone ? "#86efac" : isInBus ? "#fbbf24" : "var(--border)"}`, color }}>
              {s.name}{time ? ` · ${time}` : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ProductionWidget({ role }: { role: string | null }) {
  const today = new Date().toISOString().slice(0, 10);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/digitalbakery/api/production/batches?date=${today}`, { headers: { "x-role": role ?? "" } })
      .then(r => r.json())
      .then(d => { setBatches(d.batches ?? []); setLoaded(true); })
      .catch(() => setLoaded(true));
    const id = setInterval(() => {
      fetch(`/digitalbakery/api/production/batches?date=${today}`, { headers: { "x-role": role ?? "" } })
        .then(r => r.json()).then(d => setBatches(d.batches ?? [])).catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, [role, today]);

  if (!loaded || batches.length === 0) return null;

  const done  = batches.filter(b => b.status === "klaar").length;
  const total = batches.length;
  const pct   = Math.round((done / total) * 100);
  const allDone = done === total;

  const groups: Record<string, Batch[]> = {};
  for (const b of batches) (groups[b.mixerGroup] ??= []).push(b);

  return (
    <div style={{ background: allDone ? "#f0fdf4" : "var(--surface)", border: `1px solid ${allDone ? "#4ade80" : "var(--border)"}`, borderRadius: 12, padding: "1.25rem 1.5rem", marginBottom: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: allDone ? "#16a34a" : "var(--text-subtle)", margin: 0 }}>⚙️ Productie vandaag</h3>
        <span style={{ fontSize: 13, fontWeight: 600, color: allDone ? "#16a34a" : "var(--accent)" }}>
          {allDone ? "🎉 Alles klaar!" : `${done}/${total} klaar`}
        </span>
      </div>
      <div style={{ height: 6, background: "var(--border)", borderRadius: 3, marginBottom: 14, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: allDone ? "#4ade80" : "var(--accent)", borderRadius: 3, transition: "width 0.4s" }} />
      </div>
      {Object.entries(groups).map(([, bs]) => (
        <div key={bs[0].mixerGroup} style={{ marginBottom: 8 }}>
          <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-subtle)", margin: "0 0 5px" }}>{bs[0].groupLabel}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {bs.map(b => (
              <div key={b.id} style={{ background: b.status==="klaar"?"#f0fdf4":b.status==="in_mixer"?"#fefce8":b.status==="rijzen"?"#eff6ff":"var(--surface-2)", border:`1px solid ${b.status==="klaar"?"#4ade80":b.status==="in_mixer"?"#fbbf24":b.status==="rijzen"?"#93c5fd":"var(--border)"}`, borderRadius:8, padding:"6px 12px", minWidth:110 }}>
                <p style={{ fontSize:12, margin:"0 0 2px", color:"var(--text-subtle)" }}>mixer {b.batchNumber} — {b.totalLoaves} st.</p>
                <p style={{ fontSize:13, fontWeight:600, margin:0, color:STATUS_COLOR[b.status] }}>
                  {STATUS_LABEL[b.status]}
                  {b.status==="klaar"&&b.klaarAt?` ${fmtTime(b.klaarAt)}`:""}
                  {b.status==="in_mixer"&&b.startedAt?` ${fmtTime(b.startedAt)}`:""}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
      <Link href="/productie" style={{ display:"inline-block", marginTop:6, fontSize:12, color:"var(--accent)", textDecoration:"none" }}>→ Ga naar productiepagina</Link>
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
    <div style={{ padding: "2.5rem 3rem", maxWidth: 860 }}>
      <p style={{ color: "var(--text-subtle)", fontSize: 13, margin: "0 0 6px" }}>{today}</p>
      <h1 style={{ fontSize: 34, marginBottom: "0.25rem" }}>{greeting}</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>Wat gaan we vandaag bakken?</p>

      {/* ── Production totals: today + tomorrow ── */}
      <ProductionSummaryWidget role={role} />

      {/* ── Delivery map — owner only ── */}
      {role === "OWNER" && <DeliveryMapWidget role={role} />}

      {/* ── Production batch progress ── */}
      <ProductionWidget role={role} />
    </div>
  );
}
