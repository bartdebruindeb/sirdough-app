"use client";
import { useEffect, useState } from "react";

const WEEKDAYS = ["","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];

type BreadType = { id: string; slug: string; name: string; sortOrder: number };
type RecurringLine = { breadTypeId: string; quantity: number; breadType: BreadType };
type RecurringOrder = { id: string; weekday: number; active: boolean; notes: string | null; lines: RecurringLine[] };
type OneOffOrder = {
  id: string; deliveryDate: string; notes: string | null;
  lines: { breadTypeId: string; quantity: number; breadType: BreadType }[];
};

function isEditable(deliveryDateStr: string): boolean {
  const delivery = new Date(deliveryDateStr + "T00:00:00");
  const cutoff = new Date(delivery);
  cutoff.setDate(cutoff.getDate() - 1);
  cutoff.setHours(4, 0, 0, 0);
  return new Date() < cutoff;
}

function isRecurringEditable(weekday: number): boolean {
  const now = new Date();
  const dayDiff = (weekday - (now.getDay() || 7) + 7) % 7 || 7;
  const nextDate = new Date(now);
  nextDate.setDate(nextDate.getDate() + dayDiff);
  const cutoff = new Date(nextDate);
  cutoff.setDate(cutoff.getDate() - 1);
  cutoff.setHours(4, 0, 0, 0);
  return now < cutoff;
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
  const [recurring, setRecurring]   = useState<RecurringOrder[]>([]);
  const [upcoming, setUpcoming]     = useState<OneOffOrder[]>([]);
  const [breadTypes, setBreadTypes] = useState<BreadType[]>([]);
  const [loading, setLoading]       = useState(true);

  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [editQty, setEditQty]       = useState<Record<string,number>>({});
  const [saving, setSaving]         = useState(false);
  const [savedDay, setSavedDay]     = useState<string | null>(null);

  const [showNewOrder, setShowNewOrder] = useState(false);
  const [newDate, setNewDate]       = useState("");
  const [newQty, setNewQty]         = useState<Record<string,number>>({});
  const [newNotes, setNewNotes]     = useState("");
  const [savingNew, setSavingNew]   = useState(false);

  function load() {
    fetch(`/api/mijn/bestellingen?from=${new Date().toISOString().slice(0,10)}`).then(r => r.json())
      .then(data => {
        setUpcoming(data.orders ?? []);
        setBreadTypes(data.breadTypes ?? []);
        setRecurring(data.recurring ?? []);
        setLoading(false);
      });
  }
  useEffect(() => { load(); }, []);

  function startEdit(order: RecurringOrder) {
    const q: Record<string,number> = {};
    for (const l of order.lines) q[l.breadTypeId] = l.quantity;
    setEditQty(q);
    setEditingDay(order.id);
  }

  async function saveRecurring(order: RecurringOrder) {
    setSaving(true);
    const lines = breadTypes.map(bt => ({ breadTypeId: bt.id, quantity: editQty[bt.id] ?? 0 }));
    const res = await fetch("/api/mijn/bestellingen", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recurringOrderId: order.id, lines }),
    });
    setSaving(false);
    if (res.ok) {
      setSavedDay(order.id);
      setTimeout(() => setSavedDay(null), 3000);
      setEditingDay(null);
      load();
    }
  }

  async function placeOneOff() {
    if (!newDate || Object.values(newQty).every(v => v === 0)) return;
    if (!isEditable(newDate)) return;
    setSavingNew(true);
    await fetch("/api/mijn/bestellingen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
    await fetch(`/api/mijn/bestellingen?id=${id}`, { method: "DELETE" });
    load();
  }

  const today = new Date().toISOString().slice(0,10);

  return (
    <div style={{ padding: "1.5rem", maxWidth: 700 }}>
      <h1 style={{ fontSize: 26, marginBottom: "0.25rem" }}>Mijn bestellingen</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: "2rem" }}>
        Wijzigingen zijn mogelijk tot 4:00 uur de ochtend voor bezorging.
      </p>

      {loading && <p style={{ color: "var(--text-subtle)" }}>Laden...</p>}

      {!loading && (
        <>
          {recurring.length > 0 && (
            <section style={{ marginBottom: "2rem" }}>
              <h2 style={{ fontSize: 17, marginBottom: "0.75rem" }}>Vaste bestellingen</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {recurring.map(order => {
                  const isEditing = editingDay === order.id;
                  const editable = isRecurringEditable(order.weekday);
                  const nextDayDiff = (order.weekday - (new Date().getDay() || 7) + 7) % 7 || 7;
                  const nextDateStr = (() => { const d = new Date(); d.setDate(d.getDate() + nextDayDiff); return d.toISOString().slice(0,10); })();
                  const timeLeft = timeUntilCutoff(nextDateStr);

                  return (
                    <div key={order.id} className="card" style={{ padding: "1rem 1.25rem" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isEditing ? 12 : 0 }}>
                        <div>
                          <span style={{ fontWeight: 500, fontSize: 15 }}>{WEEKDAYS[order.weekday]}</span>
                          {editable && timeLeft && (
                            <span style={{ fontSize: 12, color: "var(--success)", marginLeft: 8 }}>
                              Wijzigen mogelijk ({timeLeft})
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
                              {saving ? "Opslaan..." : "Opslaan"}
                            </button>
                          </div>
                        )}
                      </div>

                      {savedDay === order.id && (
                        <p style={{ color: "var(--success)", fontSize: 13, margin: "4px 0 0" }}>Opgeslagen - bevestiging verstuurd</p>
                      )}

                      {!isEditing && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                          {order.lines.filter(l => l.quantity > 0).map(l => (
                            <span key={l.breadTypeId} style={{ fontSize: 12, background: "var(--accent-light)", color: "var(--accent)", padding: "3px 10px", borderRadius: 12 }}>
                              {shortName(l.breadType.name)} x {l.quantity}
                            </span>
                          ))}
                          {order.lines.length === 0 && <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>Geen producten</span>}
                        </div>
                      )}

                      {isEditing && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px,1fr))", gap: 8 }}>
                          {breadTypes.map(bt => (
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
                    Te laat - de bestelling voor {newDate} moest voor 4:00 uur zijn geplaatst.
                  </p>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px,1fr))", gap: 8, marginBottom: 12 }}>
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
                    {savingNew ? "Plaatsen..." : "Bestelling plaatsen"}
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
                              {shortName(l.breadType.name)} x {l.quantity}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                        {editable && timeLeft && (
                          <span style={{ fontSize: 11, color: "var(--success)" }}>{timeLeft}</span>
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
        </>
      )}
    </div>
  );
}
