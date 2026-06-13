"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRole } from "@/lib/role-context";
import { ALL_NAV } from "@/lib/nav";

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
    setSaving(true);
    const res = await fetch("/digitalbakery/api/announcement", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify({ message: draft }),
    });
    setSaving(false);
    if (res.ok) { setAnnouncement(draft); setEditing(false); }
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
