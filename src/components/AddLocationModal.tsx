"use client";
import { useState } from "react";

const FIELDS: [keyof FormState, string][] = [
  ["name", "Naam *"], ["address", "Adres *"], ["postalCode", "Postcode *"],
  ["city", "Plaats *"], ["kvk", "KvK-nummer"], ["phone", "Telefoon"],
];
type FormState = { name: string; address: string; postalCode: string; city: string; kvk: string; phone: string };

const inp: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px",
  fontSize: 13, width: "100%", background: "var(--surface)", color: "var(--text)",
};

export function AddLocationModal({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const [form, setForm]   = useState<FormState>({ name: "", address: "", postalCode: "", city: "", kvk: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  async function submit() {
    if (!form.name || !form.address || !form.postalCode || !form.city) {
      setError("Vul naam, adres, postcode en plaats in."); return;
    }
    setSaving(true); setError("");
    const res = await fetch("/api/mijn/locations", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) onAdded(data.id);
    else setError(data.message ?? "Toevoegen mislukt.");
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,16,9,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 24 }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 460, padding: "1.75rem", display: "flex", flexDirection: "column", gap: 12, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Locatie toevoegen</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--text-subtle)" }}>×</button>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
          Elke locatie krijgt eigen facturen (eigen KvK). Je bestelt voor al je locaties met deze login.
        </p>
        {FIELDS.map(([k, label]) => (
          <div key={k}>
            <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 3 }}>{label}</label>
            <input value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} style={inp} />
          </div>
        ))}
        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 13 }}>Annuleren</button>
          <button onClick={submit} disabled={saving} className="btn-primary" style={{ fontSize: 13 }}>{saving ? "Toevoegen…" : "Toevoegen"}</button>
        </div>
      </div>
    </div>
  );
}
