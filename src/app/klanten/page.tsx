"use client";
import { useRole } from "@/lib/role-context";
import { useEffect, useState } from "react";


type User = { id: string; email: string; active: boolean } | null;
type Customer = {
  id: string; name: string; city: string | null; address: string | null;
  email: string | null; phone: string | null; notes: string | null;
  preferredBread: string | null;
  active: boolean; userId: string | null; user: User;
};

const inp: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 7, padding: "7px 10px",
  fontSize: 13, background: "var(--surface)", width: "100%",
};

function CustomerForm({ initial, onSave, onCancel }: {
  initial?: Partial<Customer>;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName]       = useState(initial?.name ?? "");
  const [city, setCity]       = useState(initial?.city ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [email, setEmail]     = useState(initial?.email ?? "");
  const [phone, setPhone]     = useState(initial?.phone ?? "");
  const [notes, setNotes]     = useState(initial?.notes ?? "");
  const [preferredBread, setPreferredBread] = useState(initial?.preferredBread ?? "");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  async function submit() {
    if (!name.trim()) { setError("Naam is verplicht."); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("E-mailadres is niet geldig (bijv. naam@domein.nl)."); return;
    }
    if (phone && !/^[\d\s+\-().]{6,20}$/.test(phone)) {
      setError("Telefoonnummer bevat ongeldige tekens."); return;
    }
    setSaving(true); setError("");
    try {
      await onSave({ name: name.trim(), city, address, email, phone, notes, preferredBread });
    } catch (e: any) {
      setError(e.message ?? "Opslaan mislukt.");
    }
    setSaving(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Naam *</label>
          <input value={name} onChange={e => setName(e.target.value)} style={inp} placeholder="Café Johannes" />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Stad</label>
          <input value={city} onChange={e => setCity(e.target.value)} style={inp} placeholder="Delft" />
        </div>
      </div>
      <div>
        <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Adres (voor bezorgroute)</label>
        <input value={address} onChange={e => setAddress(e.target.value)} style={inp} placeholder="Brabantse Turfmarkt 25, 2611 CG Delft" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>E-mail (voor inloggen)</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inp} placeholder="contact@cafe.nl" />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Telefoon</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} style={inp} placeholder="+31 6 12345678" />
        </div>
      </div>
      <div>
        <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Opmerkingen</label>
        <input value={notes} onChange={e => setNotes(e.target.value)} style={inp} placeholder="bijv. gesneden, pakbon mee" />
      </div>
      <div>
        <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Voorkeur brood</label>
        <input value={preferredBread} onChange={e => setPreferredBread(e.target.value)} style={inp} placeholder="bijv. 1,5kg, sesam & zaden" />
      </div>
      {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel} className="btn-secondary" style={{ fontSize: 13 }}>Annuleren</button>
        <button onClick={submit} disabled={saving} className="btn-primary" style={{ fontSize: 13 }}>
          {saving ? "Opslaan…" : "Opslaan"}
        </button>
      </div>
    </div>
  );
}

function InviteModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { role } = useRole();
  const [loading, setLoading]   = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied]     = useState(false);
  const [error, setError]       = useState("");

  async function generate() {
    setLoading(true); setError("");
    const res = await fetch("/digitalbakery/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify({ customerId: customer.id }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) setInviteUrl(data.inviteUrl);
    else setError(data.message ?? "Mislukt.");
  }

  function copy() {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,16,9,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 460, padding: "1.75rem", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Uitnodiging sturen</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--text-subtle)" }}>×</button>
        </div>

        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
          Genereer een uitnodigingslink voor <strong>{customer.name}</strong> ({customer.email}).
          De klant klikt op de link en kiest zelf een wachtwoord.
        </p>

        {!inviteUrl && (
          <>
            {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
            <button onClick={generate} disabled={loading} className="btn-primary">
              {loading ? "Genereren…" : "Link genereren"}
            </button>
          </>
        )}

        {inviteUrl && (
          <>
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
              <p style={{ fontSize: 11, color: "var(--text-subtle)", margin: "0 0 6px", textTransform: "uppercase" }}>Uitnodigingslink (7 dagen geldig)</p>
              <p style={{ fontSize: 12, wordBreak: "break-all", margin: 0, color: "var(--text)" }}>{inviteUrl}</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={copy} className="btn-primary" style={{ flex: 1 }}>
                {copied ? "✓ Gekopieerd!" : "📋 Kopieer link"}
              </button>
              <a href={`mailto:${customer.email}?subject=Uitnodiging%20Digital%20Bakery&body=Beste%20${customer.name},%0A%0AKlik%20op%20deze%20link%20om%20uw%20account%20te%20activeren:%0A${encodeURIComponent(inviteUrl)}`}
                className="btn-secondary" style={{ textDecoration: "none", padding: "9px 14px", fontSize: 13 }}>
                ✉ Stuur e-mail
              </a>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-subtle)", margin: 0 }}>
              Stuur deze link naar {customer.email}. Ze kunnen hem maar één keer gebruiken.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function KlantenPage() {
  const { role } = useRole();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showNew, setShowNew]     = useState(false);
  const [editing, setEditing]     = useState<string | null>(null);
  const [accountModal, setAccountModal] = useState<Customer | null>(null);
  const [search, setSearch]       = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [sortBy, setSortBy]       = useState<"name"|"city">("name");

  function load() {
    setLoading(true);
    fetch(`/digitalbakery/api/customers?sort=${sortBy}`, { headers: { "x-role": role ?? "" } })
      .then(r => r.json())
      .then(d => { setCustomers(d.customers ?? []); setLoading(false); });
  }

  useEffect(() => { load(); }, [sortBy]);

  const [toast, setToast] = useState("");
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 3500); }

  async function createCustomer(data: any) {
    const res = await fetch("/digitalbakery/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify(data),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
    setShowNew(false);
    load();
    showToast(`✓ ${data.name} toegevoegd.`);
  }

  async function updateCustomer(id: string, data: any) {
    const res = await fetch("/digitalbakery/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify({ id, ...data }),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
    setEditing(null);
    load();
    showToast(`✓ ${data.name ?? "Klant"} bijgewerkt.`);
  }

  async function deleteCustomer(c: Customer) {
    const msg = `${c.name} verwijderen?${c.active ? "\n\nDeze klant heeft bestellingen en wordt gedeactiveerd." : ""}`;
    if (!confirm(msg)) return;
    const res = await fetch(`/digitalbakery/api/customers?id=${c.id}`, { method: "DELETE", headers: { "x-role": role ?? "" } });
    const data = await res.json();
    if (data.deactivated) alert(`${c.name} is gedeactiveerd omdat er nog bestellingen zijn.`);
    load();
  }

  async function toggleActive(c: Customer) {
    await fetch("/digitalbakery/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify({ id: c.id, active: !c.active }),
    });
    load();
  }

  const cities = ["all", ...Array.from(new Set(customers.map(c => c.city).filter(Boolean) as string[])).sort()];
  const filtered = customers.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.city?.toLowerCase().includes(search.toLowerCase());
    const matchCity = cityFilter === "all" || c.city === cityFilter;
    return matchSearch && matchCity;
  });
  const activeCount = filtered.filter(c => c.active).length;

  return (
    <div style={{ padding: "2rem 2.5rem", maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: 28, marginBottom: 4 }}>Klanten</h1>
          {toast && <p style={{ color: "var(--success)", fontSize: 13, fontWeight: 500, margin: "4px 0 0" }}>{toast}</p>}
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
            {activeCount} actief · {filtered.length} totaal
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowNew(true)} style={{ fontSize: 13 }}>
          + Nieuwe klant
        </button>
      </div>

      {/* New customer form */}
      {showNew && (
        <div className="card" style={{ padding: "1.5rem", marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: "1rem" }}>Nieuwe klant</h3>
          <CustomerForm onSave={createCustomer} onCancel={() => setShowNew(false)} />
        </div>
      )}

      {/* Search + filter + sort */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Zoek op naam of stad…"
          style={{ ...inp, width: 220 }}
        />
        <select value={cityFilter} onChange={e => setCityFilter(e.target.value)} style={{ ...inp, width: 160 }}>
          <option value="all">Alle steden</option>
          {cities.filter(c => c !== "all").map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          <span style={{ fontSize: 12, color: "var(--text-subtle)", alignSelf: "center" }}>Sorteren:</span>
          {(["name","city"] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)} style={{
              padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)", fontSize: 12, cursor: "pointer",
              background: sortBy === s ? "var(--accent)" : "var(--surface)",
              color: sortBy === s ? "white" : "var(--text-muted)",
            }}>{s === "name" ? "Naam" : "Stad"}</button>
          ))}
        </div>
      </div>

      {loading && <p style={{ color: "var(--text-subtle)", fontSize: 13 }}>Laden…</p>}

      {!loading && filtered.length === 0 && (
        <div className="card" style={{ padding: "3rem", textAlign: "center", color: "var(--text-subtle)" }}>
          Geen klanten gevonden.
        </div>
      )}

      {/* Customer list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map(c => (
          <div key={c.id} className="card" style={{ overflow: "hidden", opacity: c.active ? 1 : 0.55 }}>
            {editing === c.id ? (
              <div style={{ padding: "1.25rem 1.5rem" }}>
                <h3 style={{ fontSize: 14, marginBottom: "1rem" }}>Bewerken: {c.name}</h3>
                <CustomerForm
                  initial={c}
                  onSave={data => updateCustomer(c.id, data)}
                  onCancel={() => setEditing(null)}
                />
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", flexWrap: "wrap" }}>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>{c.name}</span>
                    {c.city && <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>{c.city}</span>}
                    {!c.active && <span style={{ fontSize: 11, color: "var(--danger)", background: "var(--danger-bg)", padding: "1px 7px", borderRadius: 10 }}>Inactief</span>}
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 3, flexWrap: "wrap" }}>
                    {c.address && <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>📍 {c.address}</span>}
                    {c.email && <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>✉ {c.email}</span>}
                    {c.phone && <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>📞 {c.phone}</span>}
                    {c.notes && <span style={{ fontSize: 11, color: "var(--text-subtle)", fontStyle: "italic" }}>{c.notes}</span>}
                    {c.preferredBread && <span style={{ fontSize: 11, color: "var(--accent)", background: "var(--accent-light)", padding: "1px 7px", borderRadius: 8 }}>🍞 {c.preferredBread}</span>}
                  </div>
                </div>

                {/* Account status */}
                <div style={{ fontSize: 12, textAlign: "center", minWidth: 80 }}>
                  {c.user ? (
                    <span style={{ color: "var(--success)", display: "flex", alignItems: "center", gap: 4 }}>
                      <span>✓</span> Account actief
                    </span>
                  ) : c.email ? (
                    <button
                      onClick={() => setAccountModal(c)}
                      style={{ fontSize: 11, color: "var(--accent)", background: "var(--accent-light)", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}
                    >
                      ✉ Stuur uitnodiging
                    </button>
                  ) : (
                    <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>Geen e-mail</span>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setEditing(c.id)} className="btn-secondary" style={{ fontSize: 12, padding: "5px 12px" }}>
                    Bewerken
                  </button>
                  <button onClick={() => toggleActive(c)} className="btn-secondary" style={{ fontSize: 12, padding: "5px 12px" }}>
                    {c.active ? "Deactiveer" : "Activeer"}
                  </button>
                  <button onClick={() => deleteCustomer(c)} style={{
                    fontSize: 12, padding: "5px 12px", borderRadius: 7,
                    border: "1px solid #fca5a5", background: "none", cursor: "pointer", color: "var(--danger)",
                  }}>
                    Verwijder
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {accountModal && (
        <InviteModal
          customer={accountModal}
          onClose={() => setAccountModal(null)}
        />
      )}
    </div>
  );
}
