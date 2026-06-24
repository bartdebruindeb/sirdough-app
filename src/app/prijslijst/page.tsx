"use client";
import { useEffect, useState } from "react";

type BreadTypePrice = { id: string; name: string; sortOrder: number; price: number | null };

const inp: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 7, padding: "7px 10px",
  fontSize: 14, background: "var(--surface)", color: "var(--text)", width: "100%",
};

export default function PrijslijstPage() {
  const [breadTypes, setBreadTypes]           = useState<BreadTypePrice[]>([]);
  const [prices, setPrices]                   = useState<Record<string,string>>({});
  const [minDelivery, setMinDelivery]         = useState<string>("");
  const [loading, setLoading]                 = useState(true);
  const [saving, setSaving]                   = useState(false);
  const [saved, setSaved]                     = useState(false);

  useEffect(() => {
    fetch("/api/prijslijst").then(r => r.json()).then(d => {
      setBreadTypes(d.breadTypes ?? []);
      const p: Record<string,string> = {};
      (d.breadTypes ?? []).forEach((b: BreadTypePrice) => {
        p[b.id] = b.price != null ? String(b.price) : "";
      });
      setPrices(p);
      setMinDelivery(d.minDeliveryAmount != null ? String(d.minDeliveryAmount) : "");
      setLoading(false);
    });
  }, []);

  async function save() {
    setSaving(true);
    await fetch("/api/prijslijst", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prices: breadTypes.map(b => ({
          id: b.id,
          price: prices[b.id] !== "" && prices[b.id] != null ? parseFloat(prices[b.id]) : null,
        })),
        minDeliveryAmount: minDelivery !== "" ? parseFloat(minDelivery) : null,
      }),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div style={{ padding: "2rem", maxWidth: 680 }}>
      <h1 style={{ fontSize: 26, marginBottom: "0.25rem" }}>Prijslijst</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: "2rem" }}>
        Prijzen zijn excl. BTW. Klanten zien hun persoonlijke prijs na eventuele korting.
      </p>

      {loading && <p>Laden...</p>}

      {!loading && (
        <>
          {/* Minimum delivery */}
          <div className="card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: 16, margin: "0 0 0.75rem" }}>Minimale bestelwaarde (bezorging)</h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: "0.75rem" }}>
              Klanten moeten dit bedrag bereiken voor bezorging. Afhalen bij een winkel is altijd mogelijk zonder minimum.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, maxWidth: 220 }}>
              <span style={{ fontSize: 14 }}>€</span>
              <input
                type="number" min={0} step={0.01} value={minDelivery}
                onChange={e => setMinDelivery(e.target.value)}
                placeholder="bijv. 25.00"
                style={inp}
              />
            </div>
          </div>

          {/* Prices per bread */}
          <div className="card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: 16, margin: "0 0 0.75rem" }}>Broodprijzen (excl. BTW)</h2>
            {breadTypes.length === 0 && (
              <p style={{ color: "var(--text-subtle)", fontSize: 14 }}>
                Geen broodsoorten beschikbaar voor klanten. Zet eerst broodsoorten op "Klantbestelbaar" via Recepten.
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {breadTypes.map(b => (
                <div key={b.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 14 }}>{b.name}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, width: 140 }}>
                    <span style={{ fontSize: 13, color: "var(--text-subtle)" }}>€</span>
                    <input
                      type="number" min={0} step={0.01} value={prices[b.id] ?? ""}
                      onChange={e => setPrices(p => ({ ...p, [b.id]: e.target.value }))}
                      placeholder="—"
                      style={{ ...inp, textAlign: "right" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? "Opslaan..." : "Opslaan"}
            </button>
            {saved && <span style={{ fontSize: 13, color: "var(--success)" }}>Opgeslagen</span>}
          </div>
        </>
      )}
    </div>
  );
}
