"use client";
import { useRole, ROLE_LABELS, ROLE_ICONS, AppRole } from "@/lib/role-context";
import { useEffect, useState } from "react";

const STAFF_ROLES: AppRole[] = ["OWNER", "ORDER_TABLET", "BAKKER"];

type Worker = { id: string; email: string; name: string | null; role: AppRole; active: boolean; createdAt: string; isProtectedAdmin?: boolean };

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
  const [regenFor, setRegenFor] = useState<Worker | null>(null);
  const [regenUrl, setRegenUrl] = useState("");
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenCopied, setRegenCopied] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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
    setError("");
    const res = await fetch("/digitalbakery/api/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: w.id, active: !w.active }),
    });
    if (!res.ok) { const d = await res.json().catch(()=>({})); setError(d.message ?? "Mislukt."); return; }
    load();
  }

  async function changeRole(w: Worker, role: AppRole) {
    setError("");
    const res = await fetch("/digitalbakery/api/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: w.id, role }),
    });
    if (!res.ok) { const d = await res.json().catch(()=>({})); setError(d.message ?? "Mislukt."); return; }
    load();
  }

  async function regenerateLink(w: Worker) {
    setRegenFor(w); setRegenUrl(""); setRegenLoading(true); setRegenCopied(false);
    const res = await fetch("/digitalbakery/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: w.id, email: w.email, name: w.name ?? undefined, role: w.role }),
    });
    const data = await res.json();
    setRegenLoading(false);
    if (res.ok) setRegenUrl(data.inviteUrl);
    else setError(data.message ?? "Mislukt.");
  }

  function copyRegen() {
    navigator.clipboard.writeText(regenUrl);
    setRegenCopied(true);
    setTimeout(() => setRegenCopied(false), 2000);
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
                ✓ Uitnodigingslink aangemaakt voor <strong>{email}</strong> als <strong>{ROLE_LABELS[inviteRole]}</strong>. Geldig 48 uur.
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
          {error && (
            <p style={{ color: "var(--danger)", fontSize: 13, margin: "0 0 10px" }}>{error}</p>
          )}
          {workers.map((w, i) => {
            const activeOwnerCount = workers.filter(x => x.role === "OWNER" && x.active).length;
            const isLastOwner = w.role === "OWNER" && w.active && activeOwnerCount <= 1;
            const isProtectedAdmin = !!w.isProtectedAdmin;
            const isLocked = isLastOwner || isProtectedAdmin;
            const lockReason = isProtectedAdmin
              ? "Dit beheerdersaccount kan niet worden gewijzigd of verwijderd."
              : "Er moet altijd minstens één actieve eigenaar zijn.";
            return (
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
                  {isProtectedAdmin && <span title={lockReason} style={{ fontSize: 10, color: "var(--accent)", background: "var(--accent-light)", padding: "2px 8px", borderRadius: 10 }}>🔒 Beheerder</span>}
                  {isLastOwner && !isProtectedAdmin && <span title={lockReason} style={{ fontSize: 10, color: "var(--accent)", background: "var(--accent-light)", padding: "2px 8px", borderRadius: 10 }}>🔒 Laatste eigenaar</span>}
                </div>
                {!isProtectedAdmin && <p style={{ fontSize: 12, color: "var(--text-subtle)", margin: "2px 0 0" }}>{w.email}</p>}
              </div>

              {/* Role selector */}
              <select
                value={w.role}
                onChange={e => changeRole(w, e.target.value as AppRole)}
                disabled={isLocked}
                title={isLocked ? lockReason : undefined}
                style={{
                  fontSize: 12, padding: "5px 8px", borderRadius: 7, border: "1px solid var(--border)",
                  background: "var(--surface)", color: "var(--text)", cursor: isLocked ? "not-allowed" : "pointer",
                  opacity: isLocked ? 0.6 : 1,
                }}
              >
                {STAFF_ROLES.map(r => <option key={r} value={r}>{ROLE_ICONS[r]} {ROLE_LABELS[r]}</option>)}
              </select>

              <button onClick={() => regenerateLink(w)} className="btn-secondary" style={{ fontSize: 12, padding: "5px 12px" }}>
                🔗 Nieuwe link
              </button>
              <button onClick={() => toggleActive(w)} disabled={isLocked}
                title={isLocked ? lockReason : undefined}
                className="btn-secondary" style={{ fontSize: 12, padding: "5px 12px", cursor: isLocked ? "not-allowed" : "pointer", opacity: isLocked ? 0.6 : 1 }}>
                {w.active ? "Deactiveer" : "Activeer"}
              </button>
              {confirmDeleteId === w.id ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--danger)" }}>Zeker weten?</span>
                  <button onClick={async () => {
                    setConfirmDeleteId(null); setError("");
                    const res = await fetch(`/digitalbakery/api/team?id=${w.id}`, { method: "DELETE" });
                    if (!res.ok) { const d = await res.json().catch(()=>({})); setError(d.message ?? "Mislukt."); return; }
                    load();
                  }} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 7, border: "1px solid #fca5a5", background: "#fee2e2", cursor: "pointer", color: "var(--danger)", fontWeight: 600 }}>
                    Ja, verwijder
                  </button>
                  <button onClick={() => setConfirmDeleteId(null)} className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }}>Nee</button>
                </div>
              ) : (
                <button onClick={() => !isLocked && setConfirmDeleteId(w.id)} disabled={isLocked} title={isLocked ? lockReason : undefined} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 7, border: "1px solid #fca5a5", background: "none", cursor: isLocked ? "not-allowed" : "pointer", color: isLocked ? "var(--text-subtle)" : "var(--danger)", opacity: isLocked ? 0.5 : 1 }}>
                  Verwijder
                </button>
              )}
            </div>
          );
          })}
          {workers.length === 0 && (
            <p style={{ padding: "2rem", textAlign: "center", color: "var(--text-subtle)", fontSize: 13 }}>
              Nog geen teamleden.
            </p>
          )}
        </div>
      )}

      {/* ── Regenerate link modal ── */}
      {regenFor && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(28,16,9,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "1rem",
        }} onClick={() => setRegenFor(null)}>
          <div className="card" style={{ padding: "1.5rem", maxWidth: 480, width: "100%" }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 15, marginBottom: "0.75rem" }}>
              Nieuwe link voor {regenFor.name ?? regenFor.email}
            </h3>
            {regenLoading ? (
              <p style={{ fontSize: 13, color: "var(--text-subtle)" }}>Genereren…</p>
            ) : regenUrl ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
                  ✓ Nieuwe link aangemaakt — de oude link werkt niet meer. Geldig 48 uur.
                </p>
                <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
                  <p style={{ fontSize: 12, wordBreak: "break-all", margin: 0 }}>{regenUrl}</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={copyRegen} className="btn-primary" style={{ fontSize: 13 }}>
                    {regenCopied ? "✓ Gekopieerd!" : "📋 Kopieer link"}
                  </button>
                  <a href={`mailto:${regenFor.email}?subject=Nieuwe%20link%20Digital%20Bakery&body=${encodeURIComponent(regenUrl)}`}
                    className="btn-secondary" style={{ textDecoration: "none", padding: "8px 14px", fontSize: 13 }}>
                    ✉ Stuur e-mail
                  </a>
                  <button onClick={() => setRegenFor(null)} className="btn-secondary" style={{ fontSize: 13, marginLeft: "auto" }}>Sluiten</button>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "var(--danger)" }}>{error || "Mislukt."}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
