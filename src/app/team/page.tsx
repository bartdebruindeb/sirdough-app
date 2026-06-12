"use client";
import { useRole, ROLE_LABELS, ROLE_ICONS, AppRole } from "@/lib/role-context";
import { useEffect, useState } from "react";

const STAFF_ROLES: AppRole[] = ["OWNER", "ORDER_TABLET", "BAKKER", "BEZORGER"];

type Worker = { id: string; email: string; name: string | null; role: AppRole; active: boolean; createdAt: string };

export default function TeamPage() {
  const { role: myRole } = useRole();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("BAKKER");
  const [saving, setSaving] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  function load() {
    fetch("/digitalbakery/api/team")
      .then(r => r.json())
      .then(d => { setWorkers(d.users ?? []); setLoading(false); });
  }
  useEffect(() => { load(); }, []);

  async function invite() {
    if (!email) { setError("E-mailadres is verplicht."); return; }
    setSaving(true); setError("");
    const res = await fetch("/digitalbakery/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, role: inviteRole }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) { setInviteUrl(data.inviteUrl); load(); }
    else setError(data.message ?? "Mislukt.");
  }

  async function toggleActive(w: Worker) {
    await fetch("/digitalbakery/api/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: w.id, active: !w.active }),
    });
    load();
  }

  async function changeRole(w: Worker, role: AppRole) {
    await fetch("/digitalbakery/api/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: w.id, role }),
    });
    load();
  }

  function copy() {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const inp: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 7, padding: "7px 10px", fontSize: 13, background: "var(--surface)", width: "100%" };

  return (
    <div style={{ padding: "2rem 2.5rem", maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: 28, marginBottom: 4 }}>Team</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            Wijs per teamlid een rol toe — dit bepaalt wat ze zien en mogen wijzigen na inloggen.
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setShowForm(true); setInviteUrl(""); setEmail(""); setName(""); setInviteRole("BAKKER"); }} style={{ fontSize: 13, whiteSpace: "nowrap" }}>
          + Nieuwe medewerker uitnodigen
        </button>
      </div>

      {/* Invite form */}
      {showForm && (
        <div className="card" style={{ padding: "1.5rem", marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: "1rem" }}>Uitnodiging sturen</h3>
          {!inviteUrl ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>E-mailadres *</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inp} placeholder="naam@bakkerij.nl" />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Naam</label>
                  <input value={name} onChange={e => setName(e.target.value)} style={inp} placeholder="Jan de Bakker" />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Rol</label>
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value as AppRole)} style={inp}>
                    {STAFF_ROLES.map(r => <option key={r} value={r}>{ROLE_ICONS[r]} {ROLE_LABELS[r]}</option>)}
                  </select>
                </div>
              </div>
              {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowForm(false)} className="btn-secondary" style={{ fontSize: 13 }}>Annuleren</button>
                <button onClick={invite} disabled={saving} className="btn-primary" style={{ fontSize: 13 }}>
                  {saving ? "Genereren…" : "Link genereren"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
                ✓ Uitnodigingslink aangemaakt voor <strong>{email}</strong> als <strong>{ROLE_LABELS[inviteRole]}</strong>. Geldig 7 dagen.
              </p>
              <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
                <p style={{ fontSize: 12, wordBreak: "break-all", margin: 0 }}>{inviteUrl}</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={copy} className="btn-primary" style={{ fontSize: 13 }}>
                  {copied ? "✓ Gekopieerd!" : "📋 Kopieer link"}
                </button>
                <a href={`mailto:${email}?subject=Uitnodiging%20Digital%20Bakery&body=Hoi%20${name ? name : ""},%0A%0AKlik%20op%20deze%20link%20om%20je%20account%20in%20te%20stellen:%0A${encodeURIComponent(inviteUrl)}`}
                  className="btn-secondary" style={{ textDecoration: "none", padding: "8px 14px", fontSize: 13 }}>
                  ✉ Stuur e-mail
                </a>
                <button onClick={() => setShowForm(false)} className="btn-secondary" style={{ fontSize: 13, marginLeft: "auto" }}>Sluiten</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Team list */}
      {loading ? (
        <p style={{ color: "var(--text-subtle)", fontSize: 13 }}>Laden…</p>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          {workers.map((w, i) => (
            <div key={w.id} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
              borderTop: i > 0 ? "1px solid var(--border)" : "none",
              background: w.active ? "transparent" : "var(--surface-2)",
              opacity: w.active ? 1 : 0.55,
              flexWrap: "wrap",
            }}>
              {/* Avatar */}
              <div style={{
                width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                background: w.active ? "var(--accent-light)" : "var(--border)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 600, color: "var(--accent)",
              }}>
                {(w.name ?? w.email).charAt(0).toUpperCase()}
              </div>

              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{w.name ?? w.email}</span>
                  {!w.active && <span style={{ fontSize: 10, color: "var(--danger)", background: "var(--danger-bg)", padding: "2px 8px", borderRadius: 10 }}>Inactief</span>}
                </div>
                <p style={{ fontSize: 12, color: "var(--text-subtle)", margin: "2px 0 0" }}>{w.email}</p>
              </div>

              {/* Role selector */}
              <select
                value={w.role}
                onChange={e => changeRole(w, e.target.value as AppRole)}
                style={{
                  fontSize: 12, padding: "5px 8px", borderRadius: 7, border: "1px solid var(--border)",
                  background: "var(--surface)", color: "var(--text)", cursor: "pointer",
                }}
              >
                {STAFF_ROLES.map(r => <option key={r} value={r}>{ROLE_ICONS[r]} {ROLE_LABELS[r]}</option>)}
              </select>

              <button onClick={() => toggleActive(w)} className="btn-secondary" style={{ fontSize: 12, padding: "5px 12px" }}>
                {w.active ? "Deactiveer" : "Activeer"}
              </button>
              <button onClick={async () => {
                if (!confirm(`${w.name ?? w.email} definitief verwijderen?`)) return;
                await fetch(`/digitalbakery/api/team?id=${w.id}`, { method: "DELETE" });
                load();
              }} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 7, border: "1px solid #fca5a5", background: "none", cursor: "pointer", color: "var(--danger)" }}>
                Verwijder
              </button>
            </div>
          ))}
          {workers.length === 0 && (
            <p style={{ padding: "2rem", textAlign: "center", color: "var(--text-subtle)", fontSize: 13 }}>
              Nog geen teamleden.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
