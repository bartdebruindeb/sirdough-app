"use client";
import { useEffect, useState } from "react";

type Address = { id: string; label: string; street: string; postalCode: string; city: string; isDefault: boolean };

const inp: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px",
  fontSize: 14, background: "var(--surface)", width: "100%", color: "var(--text)",
};

export default function MijnAccountPage() {
  const [name, setName]   = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [showAddAddr, setShowAddAddr] = useState(false);
  const [newAddr, setNewAddr] = useState({ label: "", street: "", postalCode: "", city: "", isDefault: false });
  const [savingAddr, setSavingAddr] = useState(false);
  const [editAddrId, setEditAddrId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/mijn/account").then(r => r.json()).then(d => {
      setName(d.name ?? "");
      setPhone(d.phone ?? "");
      setEmail(d.email ?? "");
      setAddresses(d.addresses ?? []);
    });
  }, []);

  async function saveProfile() {
    setSaving(true);
    await fetch("/api/mijn/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, phone }) });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function addAddress() {
    if (!newAddr.street || !newAddr.postalCode || !newAddr.city) return;
    setSavingAddr(true);
    const res = await fetch("/api/mijn/adressen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...newAddr, label: newAddr.label || "Locatie" }) });
    const addr = await res.json();
    setAddresses(prev => newAddr.isDefault ? prev.map(a => ({ ...a, isDefault: false })).concat(addr) : [...prev, addr]);
    setNewAddr({ label: "", street: "", postalCode: "", city: "", isDefault: false });
    setShowAddAddr(false); setSavingAddr(false);
  }

  async function deleteAddress(id: string) {
    await fetch(`/api/mijn/adressen?id=${id}`, { method: "DELETE" });
    setAddresses(prev => prev.filter(a => a.id !== id));
  }

  async function setDefault(id: string) {
    await fetch(`/api/mijn/adressen?id=${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isDefault: true }) });
    setAddresses(prev => prev.map(a => ({ ...a, isDefault: a.id === id })));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <h1 style={{ fontSize: 26, margin: 0 }}>Mijn account</h1>

      {/* Profile */}
      <div className="card" style={{ padding: "1.5rem" }}>
        <h2 style={{ fontSize: 16, margin: "0 0 1rem" }}>Gegevens</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Bedrijfsnaam</label>
            <input value={name} onChange={e => setName(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 5 }}>E-mailadres</label>
            <input value={email} disabled style={{ ...inp, opacity: 0.6 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Telefoonnummer</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} style={inp} placeholder="+31 6 ..." />
          </div>
        </div>
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={saveProfile} disabled={saving} className="btn-primary" style={{ fontSize: 13 }}>
            {saving ? "Opslaan…" : "Opslaan"}
          </button>
          {saved && <span style={{ fontSize: 13, color: "var(--success)" }}>✓ Opgeslagen</span>}
        </div>
      </div>

      {/* Addresses */}
      <div className="card" style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Bezorgadressen</h2>
          <button onClick={() => setShowAddAddr(v => !v)} className="btn-secondary" style={{ fontSize: 12 }}>
            + Adres toevoegen
          </button>
        </div>

        {addresses.length === 0 && !showAddAddr && (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Nog geen adressen toegevoegd.</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {addresses.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: a.isDefault ? "var(--surface-2)" : "var(--surface)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{a.label}</span>
                  {a.isDefault && <span style={{ fontSize: 10, background: "var(--accent)", color: "white", borderRadius: 4, padding: "1px 6px" }}>Standaard</span>}
                </div>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{a.street}, {a.postalCode} {a.city}</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {!a.isDefault && (
                  <button onClick={() => setDefault(a.id)} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "none", cursor: "pointer", color: "var(--text-subtle)" }}>
                    Standaard
                  </button>
                )}
                {addresses.length > 1 && (
                  <button onClick={() => deleteAddress(a.id)} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid #fca5a5", background: "none", cursor: "pointer", color: "var(--danger)" }}>
                    Verwijder
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {showAddAddr && (
          <div style={{ marginTop: 14, padding: "14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Label (bijv. Filiaal Den Haag)</label>
                <input value={newAddr.label} onChange={e => setNewAddr(v => ({ ...v, label: e.target.value }))} style={inp} placeholder="Hoofdlocatie" />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Straat + huisnummer</label>
                <input value={newAddr.street} onChange={e => setNewAddr(v => ({ ...v, street: e.target.value }))} style={inp} placeholder="Denneweg 69 A" />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Postcode</label>
                <input value={newAddr.postalCode} onChange={e => setNewAddr(v => ({ ...v, postalCode: e.target.value }))} style={inp} placeholder="2514 CE" />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Stad</label>
                <input value={newAddr.city} onChange={e => setNewAddr(v => ({ ...v, city: e.target.value }))} style={inp} placeholder="Den Haag" />
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={newAddr.isDefault} onChange={e => setNewAddr(v => ({ ...v, isDefault: e.target.checked }))} />
              Instellen als standaardadres
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addAddress} disabled={savingAddr} className="btn-primary" style={{ fontSize: 13 }}>
                {savingAddr ? "Opslaan…" : "Adres opslaan"}
              </button>
              <button onClick={() => setShowAddAddr(false)} className="btn-secondary" style={{ fontSize: 13 }}>Annuleren</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
