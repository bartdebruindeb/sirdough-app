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

// ── Production totals for today + tomorrow ────────────────────────────────────
function ProductionSummaryWidget({ role }: { role: string | null }) {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();

  const [todayLines, setTodayLines]       = useState<BreadLine[]>([]);
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

  function DayColumn({ label, lines }: { label: string; lines: BreadLine[] }) {
    if (lines.length === 0) return (
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 12, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>{label}</p>
        <p style={{ fontSize: 13, color: "var(--text-subtle)", margin: 0 }}>Geen bestellingen</p>
      </div>
    );
    return (
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 12, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>{label}</p>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {lines.map(l => (
            <span key={l.breadTypeId} style={{ fontSize: 12, background: "var(--accent-light)", color: "var(--accent)", padding: "3px 8px", borderRadius: 10, whiteSpace: "nowrap" }}>
              {l.name.replace("Boeren ","B.").replace(" KG","kg")} <strong>{l.totalQty}</strong>
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.25rem 1.5rem", marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-subtle)", margin: 0 }}>
          🍞 Productie aantallen
        </h3>
        <Link href="/productie" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>→ Productie</Link>
      </div>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <DayColumn label="Vandaag bakken" lines={todayLines} />
        <div style={{ width: 1, background: "var(--border)", flexShrink: 0 }} />
        <DayColumn label="Morgen bakken" lines={tomorrowLines} />
      </div>
    </div>
  );
}

// ── Delivery map (owner only) ─────────────────────────────────────────────────
type MapStop = {
  customerId: string; name: string; city: string | null; address: string | null;
  inBusAt: string | null; deliveredAt: string | null;
  lat?: number; lng?: number;
};

async function geocode(address: string, city: string | null): Promise<{ lat: number; lng: number } | null> {
  const q = encodeURIComponent(`${address}, ${city ?? ""}, Netherlands`);
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
  const mapRef    = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null);

  const [stops, setStops]   = useState<MapStop[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  async function loadData() {
    const [bezorgenRes, statusRes] = await Promise.all([
      fetch(`/digitalbakery/api/bezorgen?date=${today}`, { headers: { "x-role": role ?? "" } }).then(r => r.json()),
      fetch(`/digitalbakery/api/delivery-status?date=${today}`, { headers: { "x-role": role ?? "" } }).then(r => r.json()),
    ]);
    const rows: any[] = bezorgenRes.rows ?? [];
    const statuses: DeliveryStatus[] = statusRes.statuses ?? [];
    const statusMap = new Map(statuses.map((s: DeliveryStatus) => [s.customerId, s]));

    const mapped: MapStop[] = rows.map((r: any) => {
      const st = statusMap.get(r.customerId);
      return { customerId: r.customerId, name: r.name, city: r.city, address: r.address, inBusAt: st?.inBusAt ?? null, deliveredAt: st?.deliveredAt ?? null };
    });
    setStops(mapped);
    setLoaded(true);
    return mapped;
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const mapped = await loadData();
      if (cancelled || !mapRef.current || mapped.length === 0) return;

      // Dynamically load Leaflet CSS + JS
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css"; link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }
      const L = await import("leaflet" as any).catch(() => null);
      if (!L || cancelled) return;

      // Fix default icon paths broken by webpack
      (L as any).Icon.Default.mergeOptions({ iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png", iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png", shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png" });

      if (leafletRef.current) { leafletRef.current.remove(); }
      const map = (L as any).map(mapRef.current, { zoomControl: true }).setView([52.01, 4.36], 12);
      leafletRef.current = map;
      (L as any).tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);

      // Geocode and add markers
      setGeocoding(true);
      const bounds: [number, number][] = [];
      for (const stop of mapped) {
        if (!stop.address) continue;
        await new Promise(r => setTimeout(r, 300)); // respect Nominatim rate limit
        const coord = await geocode(stop.address, stop.city);
        if (!coord || cancelled) continue;
        bounds.push([coord.lat, coord.lng]);

        const isDone  = !!stop.deliveredAt;
        const isInBus = !!stop.inBusAt && !isDone;
        const color   = isDone ? "#16a34a" : isInBus ? "#b45309" : "#6b7280";
        const label   = isDone ? "✓" : isInBus ? "🚐" : "·";
        const icon = (L as any).divIcon({
          html: `<div style="width:32px;height:32px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:14px;color:white;font-weight:700;">${label}</div>`,
          className: "", iconSize: [32, 32], iconAnchor: [16, 16],
        });
        const timeStr = isDone ? `✓ Geleverd ${fmtTime(stop.deliveredAt)}` : isInBus ? `🚐 In bus ${fmtTime(stop.inBusAt)}` : "Nog te bezorgen";
        (L as any).marker([coord.lat, coord.lng], { icon })
          .addTo(map)
          .bindPopup(`<strong>${stop.name}</strong><br/><span style="color:${color};font-weight:600">${timeStr}</span>${stop.address ? `<br/><span style="font-size:12px;color:#666">${stop.address}</span>` : ""}`);
      }
      if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40] });
      setGeocoding(false);
    }
    init();
    const interval = setInterval(() => { loadData().then(s => setStops(s)); }, 30000);
    return () => { cancelled = true; clearInterval(interval); leafletRef.current?.remove(); };
  }, [role, today]);

  if (!loaded) return null;
  const total     = stops.length;
  const delivered = stops.filter(s => s.deliveredAt).length;
  const inBus     = stops.filter(s => s.inBusAt && !s.deliveredAt).length;
  if (total === 0) return null;
  const allDone   = delivered === total;

  return (
    <div style={{ background: allDone ? "#f0fdf4" : "var(--surface)", border: `1px solid ${allDone ? "#4ade80" : "var(--border)"}`, borderRadius: 12, overflow: "hidden", marginBottom: "1.5rem" }}>
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
      {geocoding && <p style={{ fontSize: 12, color: "var(--text-subtle)", padding: "0 1.5rem 8px", margin: 0 }}>Adressen laden op kaart…</p>}
      <div ref={mapRef} style={{ height: 380, width: "100%" }} />
      {/* Stop list below map */}
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
    <div style={{
      background: allDone ? "#f0fdf4" : "var(--surface)",
      border: `1px solid ${allDone ? "#4ade80" : "var(--border)"}`,
      borderRadius: 12, padding: "1.25rem 1.5rem", marginBottom: "2rem",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: allDone ? "#16a34a" : "var(--text-subtle)", margin: 0 }}>
          ⚙️ Productie vandaag
        </h3>
        <span style={{ fontSize: 13, fontWeight: 600, color: allDone ? "#16a34a" : "var(--accent)" }}>
          {allDone ? "🎉 Alles klaar!" : `${done}/${total} klaar`}
        </span>
      </div>
      {/* Progress bar */}
      <div style={{ height: 6, background: "var(--border)", borderRadius: 3, marginBottom: 14, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: allDone ? "#4ade80" : "var(--accent)", borderRadius: 3, transition: "width 0.4s" }} />
      </div>
      {/* Groups */}
      {Object.entries(groups).map(([, bs]) => (
        <div key={bs[0].mixerGroup} style={{ marginBottom: 8 }}>
          <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-subtle)", margin: "0 0 5px" }}>
            {bs[0].groupLabel}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {bs.map(b => (
              <div key={b.id} style={{
                background: b.status === "klaar" ? "#f0fdf4" : b.status === "in_mixer" ? "#fefce8" : b.status === "rijzen" ? "#eff6ff" : "var(--surface-2)",
                border: `1px solid ${b.status === "klaar" ? "#4ade80" : b.status === "in_mixer" ? "#fbbf24" : b.status === "rijzen" ? "#93c5fd" : "var(--border)"}`,
                borderRadius: 8, padding: "6px 12px", minWidth: 110,
              }}>
                <p style={{ fontSize: 12, margin: "0 0 2px", color: "var(--text-subtle)" }}>mixer {b.batchNumber} — {b.totalLoaves} st.</p>
                <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: STATUS_COLOR[b.status] }}>
                  {STATUS_LABEL[b.status]}
                  {b.status === "klaar" && b.klaarAt ? ` ${fmtTime(b.klaarAt)}` : ""}
                  {b.status === "in_mixer" && b.startedAt ? ` ${fmtTime(b.startedAt)}` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
      <Link href="/productie" style={{ display: "inline-block", marginTop: 6, fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>
        → Ga naar productiepagina
      </Link>
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
  const { role, can } = useRole();
  const [today, setToday] = useState("");
  const [greeting, setGreeting] = useState("Goedemorgen");

  const [announcement, setAnnouncement] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [loadingAnnouncement, setLoadingAnnouncement] = useState(true);

  useEffect(() => {
    const now = new Date();
    setToday(now.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
    setGreeting(getGreeting(now.getHours()));
  }, []);

  useEffect(() => {
    fetch("/digitalbakery/api/announcement", { headers: { "x-role": role ?? "" } })
      .then(r => r.json())
      .then(d => { setAnnouncement(d.message ?? ""); setDraft(d.message ?? ""); setLoadingAnnouncement(false); })
      .catch(() => setLoadingAnnouncement(false));
  }, [role]);

  async function saveAnnouncement() {
    setSaving(true); setSaveError("");
    try {
      const res = await fetch("/digitalbakery/api/announcement", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-role": role ?? "" },
        body: JSON.stringify({ message: draft }),
      });
      if (res.ok) { setAnnouncement(draft); setEditing(false); }
      else {
        const d = await res.json().catch(() => ({}));
        setSaveError(d.message ?? d.error ?? `Opslaan mislukt (${res.status})`);
      }
    } catch (e) {
      setSaveError(String(e));
    }
    setSaving(false);
  }

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 860 }}>
      <p style={{ color: "var(--text-subtle)", fontSize: 13, margin: "0 0 6px" }}>{today}</p>
      <h1 style={{ fontSize: 34, marginBottom: "0.25rem" }}>{greeting}</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>Wat gaan we vandaag bakken?</p>

      {/* ── Announcement ── */}
      {(can("announcement:write") || announcement || loadingAnnouncement) && (
        <div style={{
          background: "var(--accent-light)", border: "1px solid var(--accent)", borderRadius: 12,
          padding: "1.25rem 1.5rem", marginBottom: "2rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: editing || announcement ? 8 : 0 }}>
            <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--accent)", margin: 0 }}>
              📌 Mededeling
            </h3>
            {can("announcement:write") && !editing && (
              <button onClick={() => { setDraft(announcement); setEditing(true); }} className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }}>
                {announcement ? "Bewerken" : "+ Mededeling toevoegen"}
              </button>
            )}
          </div>

          {editing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3}
                placeholder="Bijv. 'Vrijdag extra bestellingen voor het weekend, check de planning!'"
                style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 14, fontFamily: "var(--font-body)", resize: "vertical" }} />
              {saveError && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{saveError}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={saveAnnouncement} disabled={saving} className="btn-primary" style={{ fontSize: 13 }}>
                  {saving ? "Opslaan…" : "Opslaan"}
                </button>
                <button onClick={() => setEditing(false)} className="btn-secondary" style={{ fontSize: 13 }}>Annuleren</button>
                {announcement && (
                  <button onClick={async () => {
                    setDraft(""); setSaving(true);
                    const res = await fetch("/digitalbakery/api/announcement", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json", "x-role": role ?? "" },
                      body: JSON.stringify({ message: "" }),
                    });
                    setSaving(false);
                    if (res.ok) { setAnnouncement(""); setEditing(false); }
                  }} className="btn-secondary" style={{ fontSize: 13, marginLeft: "auto", color: "var(--danger)" }}>
                    Verwijderen
                  </button>
                )}
              </div>
            </div>
          ) : announcement ? (
            <p style={{ fontSize: 14, color: "var(--text)", margin: 0, whiteSpace: "pre-wrap" }}>{announcement}</p>
          ) : !loadingAnnouncement && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Geen mededelingen.</p>
          )}
        </div>
      )}

      {/* ── Production totals: today + tomorrow ── */}
      <ProductionSummaryWidget role={role} />

      {/* ── Delivery map — owner only ── */}
      {role === "OWNER" && <DeliveryMapWidget role={role} />}

      {/* ── Production batch progress ── */}
      <ProductionWidget role={role} />
    </div>
  );
}
