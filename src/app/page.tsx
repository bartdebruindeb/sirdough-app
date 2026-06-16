"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRole } from "@/lib/role-context";
import { ALL_NAV } from "@/lib/nav";

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
        <Link href="/digitalbakery/productie" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>→ Productie</Link>
      </div>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <DayColumn label="Vandaag bakken" lines={todayLines} />
        <div style={{ width: 1, background: "var(--border)", flexShrink: 0 }} />
        <DayColumn label="Morgen bakken" lines={tomorrowLines} />
      </div>
    </div>
  );
}

// ── Today's delivery status ────────────────────────────────────────────────────
function DeliveryWidget({ role }: { role: string | null }) {
  const today = new Date().toISOString().slice(0, 10);
  const [statuses, setStatuses]   = useState<DeliveryStatus[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loaded, setLoaded]       = useState(false);

  useEffect(() => {
    fetch(`/digitalbakery/api/delivery-status?date=${today}`, { headers: { "x-role": role ?? "" } })
      .then(r => r.json())
      .then(d => { setStatuses(d.statuses ?? []); setLoaded(true); })
      .catch(() => setLoaded(true));
    fetch(`/digitalbakery/api/bezorgen?date=${today}`, { headers: { "x-role": role ?? "" } })
      .then(r => r.json())
      .then(d => setTotalRows((d.rows ?? []).length))
      .catch(() => {});

    const id = setInterval(() => {
      fetch(`/digitalbakery/api/delivery-status?date=${today}`, { headers: { "x-role": role ?? "" } })
        .then(r => r.json()).then(d => setStatuses(d.statuses ?? [])).catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, [role, today]);

  if (!loaded || (statuses.length === 0 && totalRows === 0)) return null;

  const delivered   = statuses.filter(s => s.deliveredAt);
  const inBus       = statuses.filter(s => s.inBusAt && !s.deliveredAt);
  const allDelivered = totalRows > 0 && delivered.length === totalRows;

  function fmtTime(iso: string | null) {
    if (!iso) return null;
    return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div style={{
      background: allDelivered ? "#f0fdf4" : "var(--surface)",
      border: `1px solid ${allDelivered ? "#4ade80" : "var(--border)"}`,
      borderRadius: 12, padding: "1.25rem 1.5rem", marginBottom: "1.5rem",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: allDelivered ? "#16a34a" : "var(--text-subtle)", margin: 0 }}>
          🚐 Bezorging vandaag
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: allDelivered ? "#16a34a" : "var(--text-muted)" }}>
            {allDelivered ? "🎉 Alles bezorgd!" : `${delivered.length}/${totalRows} geleverd`}
          </span>
          <Link href="/digitalbakery/bezorgen" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>→ Bezorgen</Link>
        </div>
      </div>

      {/* Progress bar */}
      {totalRows > 0 && (
        <div style={{ height: 5, background: "var(--border)", borderRadius: 3, marginBottom: 14, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.round((delivered.length / totalRows) * 100)}%`, background: allDelivered ? "#4ade80" : "#1a73e8", borderRadius: 3, transition: "width 0.4s" }} />
        </div>
      )}

      {inBus.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#b45309", margin: "0 0 5px" }}>In de bus</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {inBus.map(s => (
              <span key={s.customerId} style={{ fontSize: 12, background: "#fefce8", border: "1px solid #fbbf24", borderRadius: 8, padding: "4px 10px", color: "#92400e" }}>
                {s.customerName} <span style={{ color: "#b45309", fontWeight: 500 }}>· {fmtTime(s.inBusAt)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {delivered.length > 0 && (
        <div>
          <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#16a34a", margin: "0 0 5px" }}>Geleverd</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {delivered.map(s => (
              <span key={s.customerId} style={{ fontSize: 12, background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "4px 10px", color: "#166534" }}>
                {s.customerName} <span style={{ color: "#16a34a", fontWeight: 500 }}>· {fmtTime(s.deliveredAt)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {statuses.length === 0 && totalRows > 0 && (
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Bezorging nog niet gestart — {totalRows} stops gepland.</p>
      )}
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
      <Link href="/digitalbakery/productie" style={{ display: "inline-block", marginTop: 6, fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>
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
  const { role, can, canAccess } = useRole();
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

      {/* ── Delivery status widget ── */}
      <DeliveryWidget role={role} />

      {/* ── Production batch progress ── */}
      <ProductionWidget role={role} />

      {/* ── Pages available to this role ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
        {ALL_NAV.filter(item => item.href !== "/" && canAccess(item.href)).map(({ href, label, desc, color }) => (
          <Link key={href} href={href} style={{
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
            padding: "1.25rem", textDecoration: "none", color: "inherit", display: "block",
          }} className="dash-card">
            <div style={{ width: 36, height: 36, background: color, borderRadius: 8, marginBottom: 12 }} />
            <p style={{ fontFamily: "var(--font-display)", fontSize: 17, margin: "0 0 5px" }}>{label}</p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>{desc}</p>
          </Link>
        ))}
      </div>

      <style>{`
        .dash-card:hover { box-shadow: 0 4px 16px rgba(28,16,9,0.08); transform: translateY(-2px); transition: all 0.15s; }
        @media (max-width: 860px) {
          .dash-card { padding: 1rem !important; }
        }
      `}</style>
    </div>
  );
}
