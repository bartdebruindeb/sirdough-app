"use client";
import { useEffect, useState } from "react";

// ⚠️ PHASE 2 / NOT YET ACTIVE: this customer portal prototype calls the staff
// /api/bestellingen endpoints with a mock role. With real login now enforced
// (see src/middleware.ts), a CUSTOMER session gets 403 from those endpoints
// (correctly — they're tenant-wide, not scoped to one customer). Before this
// page goes live, it needs its own customer-scoped API routes that resolve
// customerId from the session and only return/modify that customer's orders.
const MOCK_CUSTOMER_ID = ""; // filled from session
const MOCK_ROLE = "CUSTOMER";

const WEEKDAYS = ["","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];

type BreadType = { id: string; slug: string; name: string; sortOrder: number };
type RecurringLine = { breadTypeId: string; quantity: number; breadType: BreadType };
type RecurringOrder = { id: string; weekday: number; active: boolean; notes: string | null; lines: RecurringLine[] };
type OneOffOrder = {
  id: string; deliveryDate: string; notes: string | null;
  lines: { breadTypeId: string; quantity: number; breadType: BreadType }[];
};

// Check if an order for deliveryDate can still be edited (cutoff = 4:00 AM day before)
function isEditable(deliveryDateStr: string): boolean {
  const delivery = new Date(deliveryDateStr + "T00:00:00");
  const cutoff = new Date(delivery);
  cutoff.setDate(cutoff.getDate() - 1);
  cutoff.setHours(4, 0, 0, 0);
  return new Date() < cutoff;
}

function timeUntilCutoff(deliveryDateStr: string): string {
  const delivery = new Date(deliveryDateStr + "T00:00:00");
  const cutoff = new Date(delivery);
  cutoff.setDate(cutoff.getDate() - 1);
  cutoff.setHours(4, 0, 0, 0);
  const diff = cutoff.getTime() - Date.now();
  if (diff <= 0) return "";
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 24) return `nog ${Math.floor(hours/24)} dag${Math.floor(hours/24) !== 1 ? "en" : ""}`;
  if (hours > 0) return `nog ${hours}u ${mins}m`;
  return `nog ${mins} minuten`;
}

function shortName(name: string) {
  return name.replace("Boeren ", "B. ").replace("Morning buns", "Buns").replace(" KG", "kg");
}

export default function MijnBestellingenPage() {
  const [recurring, setRecurring] = useState<RecurringOrder[]>([]);
  const [upcoming, setUpcoming]   = useState<OneOffOrder[]>([]);
  const [breadTypes, setBreadTypes] = useState<BreadType[]>([]);
  const [loading, setLoading]     = useState(true);
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [editQty, setEditQty]     = useState<Record<string,number>>({});
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState<number | null>(null);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [newDate, setNewDate]     = useState("");
  const [newQty, setNewQty]       = useState<Record<string,number>>({});
  const [newNotes, setNewNotes]   = useState("");
  const [savingNew, setSavingNew] = useState(false);

  function load() {
    Promise.all([
      fetch("/digitalbakery/api/bestellingen/recurring", { headers: { "x-role": MOCK_ROLE } }).then(r => r.json()),
      fetch(`/digitalbakery/api/bestellingen?from=${new Date().toISOString().slice(0,10)}`, { headers: { "x-role": MOCK_ROLE } }).then(r => r.json()),
    ]).then(([rec, oo]) => {
      setRecurring(rec.orders ?? []);
      setUpcoming(oo.orders ?? []);
      setBreadTypes(oo.breadTypes ?? []);
      setLoading(false);
    });
  }
  useEffect(() => { load(); }, []);

  function startEdit(order: RecurringOrder) {
    const q: Record<string,number> = {};
    for (const l of order.lines) q[l.breadTypeId] = l.quantity;
    setEditQty(q);
    setEditingDay(order.weekday);
  }

  async function saveRecurring(order: RecurringOrder) {
    setSaving(true);
    await fetch("/digitalbakery/api/bestellingen/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": MOCK_ROLE },
      body: JSON.stringify({
        customerId: order.lines[0]?.breadTypeId ? "" : "", // will be resolved server-side from session
        weekday: order.weekday,
        lines: Object.entries(editQty).filter(([,q]) => q > 0).map(([breadTypeId, quantity]) => ({ breadTypeId, quantity })),
      }),
    });
    setSaving(false);
    setSaved(order.weekday);
    setEditingDay(null);
    setTimeout(() => setSaved(null), 2000);
    load();
  }

  async function placeOneOff() {
    if (!newDate || Object.values(newQty).every(v => v === 0)) return;
    if (!isEditable(newDate)) return;
    setSavingNew(true);
    await fetch("/digitalbakery/api/bestellingen", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": MOCK_ROLE },
      body: JSON.stringify({
        customerId: "", // resolved from session server-side
        deliveryDate: newDate,
        notes: newNotes || undefined,
        lines: Object.entries(newQty).filter(([,q]) => q > 0).map(([breadTypeId, quantity]) => ({ breadTypeId, quantity })),
      }),
    });
    setSavingNew(false);
    setShowNewOrder(false);
    setNewQty({});
    setNewNotes("");
    load();
  }

  async function deleteOneOff(id: string) {
    if (!confirm("Bestelling annuleren?")) return;
    await fetch(`/digitalbakery/api/bestellingen?id=${id}`, { method: "DELETE", headers: { "x-role": MOCK_ROLE } });
    load();
  }

  const today = new Date().toISOString().slice(0,10);
  const activeBT = breadTypes.filter(bt =>
    recurring.some(r => r.lines.some(l => l.breadTypeId === bt.id)) ||
    upcoming.some(o => o.lines.some(l => l.breadTypeId === bt.id))
  );

  return (
    <div style={{ padding: "1.5rem", maxWidth: 700 }}>
      <h1 style={{ fontSize: 26, marginBottom: "0.25rem" }}>Mijn bestellingen</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: "2rem" }}>
        Wijzigingen zijn mogelijk tot 4:00 uur de ochtend vóór bezorging.
      </p>

      {loading && <p style={{ color: "var(--text-subtle)" }}>Laden…</p>}

      {/* ── Vaste bestellingen ── */}
      {!loading && recurring.length > 0 && (
        <section style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: 17, marginBottom: "0.75rem" }}>Vaste bestellingen</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recurring.map(order => {
              const isEditing = editingDay === order.weekday;
              // Next occurrence of this weekday
              const nextDate = (() => {
                const d = new Date();
                const diff = (order.weekday - (d.getDay() || 7) + 7) % 7 || 7;
                d.setDate(d.getDate() + diff);
                return d.toISOString().slice(0,10);
              })();
              const editable = isEditable(nextDate);
              const timeLeft = timeUntilCutoff(nextDate);

              return (
                <div key={order.id} className="card" style={{ padding: "1rem 1.25rem" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isEditing ? 12 : 0 }}>
                    <div>
                      <span style={{ fontWeight: 500, fontSize: 15 }}>{WEEKDAYS[order.weekday]}</span>
                      {editable && timeLeft && (
                        <span style={{ fontSize: 12, color: "var(--success)", marginLeft: 8 }}>
                          ✏ Wijzigen mogelijk ({timeLeft})
                        </span>
                      )}
                      {!editable && (
                        <span style={{ fontSize: 12, color: "var(--text-subtle)", marginLeft: 8 }}>
                          Gesloten voor wijzigingen
                        </span>
                      )}
                    </div>
                    {editable && !isEditing && (
                      <button onClick={() => startEdit(order)} className="btn-secondary" style={{ fontSize: 12, padding: "5px 12px" }}>
                        Wijzigen
                      </button>
                    )}
                    {isEditing && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => setEditingDay(null)} className="btn-secondary" style={{ fontSize: 12 }}>Annuleer</button>
                        <button onClick={() => saveRecurring(order)} disabled={saving} className="btn-primary" style={{ fontSize: 12 }}>
                          {saving ? "Opslaan…" : "Opslaan"}
                        </button>
                      </div>
                    )}
                  </div>

                  {saved === order.weekday && (
                    <p style={{ color: "var(--success)", fontSize: 13, margin: "4px 0 0" }}>✓ Opgeslagen</p>
                  )}

                  {!isEditing && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {order.lines.filter(l => l.quantity > 0).map(l => (
                        <span key={l.breadTypeId} style={{ fontSize: 12, background: "var(--accent-light)", color: "var(--accent)", padding: "3px 10px", borderRadius: 12 }}>
                          {shortName(l.breadType.name)} × {l.quantity}
                        </span>
                      ))}
                      {order.lines.length === 0 && <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>Geen producten</span>}
                    </div>
                  )}

                  {isEditing && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px,1fr))", gap: 8 }}>
                      {activeBT.map(bt => (
                        <div key={bt.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px" }}>
                          <label style={{ fontSize: 10, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                            {shortName(bt.name)}
                          </label>
                          <input type="number" min={0} value={editQty[bt.id] || ""}
                            onChange={e => setEditQty(q => ({ ...q, [bt.id]: parseInt(e.target.value) || 0 }))}
                            placeholder="0"
                            style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 5, padding: "5px 7px", fontSize: 15, fontWeight: 600, background: "var(--surface)", textAlign: "right" }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Komende eenmalige bestellingen ── */}
      <section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>Eenmalige bestellingen</h2>
          <button onClick={() => setShowNewOrder(true)} className="btn-primary" style={{ fontSize: 13 }}>
            + Bestelling plaatsen
          </button>
        </div>

        {showNewOrder && (
          <div className="card" style={{ padding: "1.25rem", marginBottom: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Bezorgdatum</label>
                <input type="date" value={newDate} min={today}
                  onChange={e => setNewDate(e.target.value)}
                  style={{ border: "1px solid var(--border)", borderRadius: 7, padding: "7px 10px", fontSize: 13, width: "100%" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Opmerkingen</label>
                <input value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="bijv. voor 9:00"
                  style={{ border: "1px solid var(--border)", borderRadius: 7, padding: "7px 10px", fontSize: 13, width: "100%" }} />
              </div>
            </div>
            {newDate && !isEditable(newDate) && (
              <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 8 }}>
                ⚠ Te laat — de bestelling voor {newDate} moest voor 4:00 uur zijn geplaatst.
              </p>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px,1fr))", gap: 8, marginBottom: 12 }}>
              {breadTypes.map(bt => (
                <div key={bt.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px" }}>
                  <label style={{ fontSize: 10, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                    {shortName(bt.name)}
                  </label>
                  <input type="number" min={0} value={newQty[bt.id] || ""}
                    onChange={e => setNewQty(q => ({ ...q, [bt.id]: parseInt(e.target.value) || 0 }))}
                    placeholder="0"
                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 5, padding: "5px 7px", fontSize: 15, fontWeight: 600, background: "var(--surface)", textAlign: "right" }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowNewOrder(false)} className="btn-secondary" style={{ fontSize: 13 }}>Annuleren</button>
              <button onClick={placeOneOff} disabled={savingNew || !newDate || !isEditable(newDate)} className="btn-primary" style={{ fontSize: 13 }}>
                {savingNew ? "Plaatsen…" : "Bestelling plaatsen"}
              </button>
            </div>
          </div>
        )}

        {upcoming.length === 0 && !showNewOrder && (
          <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--text-subtle)", fontSize: 13 }}>
            Geen komende eenmalige bestellingen.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {upcoming.map(order => {
            const editable = isEditable(order.deliveryDate);
            const timeLeft = timeUntilCutoff(order.deliveryDate);
            const d = new Date(order.deliveryDate + "T12:00:00Z");
            const dateLabel = d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
            return (
              <div key={order.id} className="card" style={{ padding: "1rem 1.25rem" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div>
                    <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 4px" }}>{dateLabel}</p>
                    {order.notes && <p style={{ fontSize: 12, color: "var(--text-subtle)", margin: "0 0 6px" }}>{order.notes}</p>}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {order.lines.map(l => (
                        <span key={l.breadTypeId} style={{ fontSize: 12, background: "var(--accent-light)", color: "var(--accent)", padding: "3px 10px", borderRadius: 12 }}>
                          {shortName(l.breadType.name)} × {l.quantity}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    {editable && timeLeft && (
                      <span style={{ fontSize: 11, color: "var(--success)" }}>✏ {timeLeft}</span>
                    )}
                    {editable && (
                      <button onClick={() => deleteOneOff(order.id)} style={{
                        background: "none", border: "1px solid var(--border)", borderRadius: 6,
                        padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "var(--danger)",
                      }}>
                        Annuleren
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
