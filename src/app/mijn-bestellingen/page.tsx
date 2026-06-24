"use client";
import { useEffect, useState } from "react";

const WEEKDAYS = ["","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];

type BreadType = { id: string; name: string; sortOrder: number };
type Address = { id: string; label: string; street: string; postalCode: string; city: string; isDefault: boolean };
type RecurringLine = { breadTypeId: string; quantity: number; breadType: BreadType };
type RecurringOrder = { id: string; weekday: number; lines: RecurringLine[] };
type OneOffOrder = {
  id: string; deliveryDate: string; notes: string | null;
  deliveryAddressId: string | null;
  deliveryAddress: Address | null;
  lines: { breadTypeId: string; quantity: number; breadType: BreadType }[];
};

function isEditable(deliveryDateStr: string): boolean {
  const cutoff = new Date(deliveryDateStr + "T04:00:00Z");
  return new Date() < cutoff;
}

function timeUntilCutoff(deliveryDateStr: string): string {
  const cutoff = new Date(deliveryDateStr + "T04:00:00Z");
  const diff = cutoff.getTime() - Date.now();
  if (diff <= 0) return "";
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 24) return `nog ${Math.floor(hours/24)} dag${Math.floor(hours/24) !== 1 ? "en" : ""}`;
  if (hours > 0) return `nog ${hours}u ${mins}m`;
  return `nog ${mins} minuten`;
}

function isRecurringEditable(weekday: number): boolean {
  const now = new Date();
  const dayDiff = (weekday - (now.getDay() || 7) + 7) % 7 || 7;
  const nextDate = new Date(now);
  nextDate.setDate(nextDate.getDate() + dayDiff);
  return isEditable(nextDate.toISOString().slice(0, 10));
}

function nextDateForWeekday(weekday: number): string {
  const now = new Date();
  const dayDiff = (weekday - (now.getDay() || 7) + 7) % 7 || 7;
  const d = new Date(now);
  d.setDate(d.getDate() + dayDiff);
  return d.toISOString().slice(0, 10);
}

function shortName(name: string) {
  return name.replace("Boeren ", "B. ").replace("Morning buns", "Buns").replace(" KG", "kg");
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
}

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 7, padding: "7px 10px", fontSize: 13, width: "100%",
  background: "var(--surface)", color: "var(--text)",
};

export default function MijnBestellingenPage() {
  const [recurring, setRecurring]   = useState<RecurringOrder[]>([]);
  const [upcoming, setUpcoming]     = useState<OneOffOrder[]>([]);
  const [breadTypes, setBreadTypes] = useState<BreadType[]>([]);
  const [addresses, setAddresses]   = useState<Address[]>([]);
  const [loading, setLoading]       = useState(true);

  // Recurring edit state
  const [editingRecurringId, setEditingRecurringId] = useState<string | null>(null);
  const [editRecurringQty, setEditRecurringQty]     = useState<Record<string,number>>({});
  const [savingRecurring, setSavingRecurring]       = useState(false);
  const [savedRecurringId, setSavedRecurringId]     = useState<string | null>(null);

  // One-off edit state
  const [editingOneOffId, setEditingOneOffId] = useState<string | null>(null);
  const [editOneOffQty, setEditOneOffQty]     = useState<Record<string,number>>({});
  const [editOneOffNotes, setEditOneOffNotes] = useState("");
  const [editOneOffAddr, setEditOneOffAddr]   = useState<string>("");
  const [savingOneOff, setSavingOneOff]       = useState(false);

  // New order state
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [newDate, setNewDate]           = useState("");
  const [newQty, setNewQty]             = useState<Record<string,number>>({});
  const [newNotes, setNewNotes]         = useState("");
  const [newAddr, setNewAddr]           = useState<string>("");
  const [savingNew, setSavingNew]       = useState(false);

  function load() {
    fetch(`/api/mijn/bestellingen?from=${new Date().toISOString().slice(0,10)}`).then(r => r.json())
      .then(data => {
        setUpcoming(data.orders ?? []);
        setBreadTypes(data.breadTypes ?? []);
        setRecurring(data.recurring ?? []);
        const addrs = data.addresses ?? [];
        setAddresses(addrs);
        const def = addrs.find((a: Address) => a.isDefault);
        if (def) setNewAddr(def.id);
        setLoading(false);
      });
  }
  useEffect(() => { load(); }, []);

  function startEditRecurring(order: RecurringOrder) {
    const q: Record<string,number> = {};
    for (const l of order.lines) q[l.breadTypeId] = l.quantity;
    setEditRecurringQty(q);
    setEditingRecurringId(order.id);
  }

  async function saveRecurring(order: RecurringOrder) {
    setSavingRecurring(true);
    const lines = breadTypes.map(bt => ({ breadTypeId: bt.id, quantity: editRecurringQty[bt.id] ?? 0 }));
    const res = await fetch("/api/mijn/bestellingen", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recurringOrderId: order.id, lines }),
    });
    setSavingRecurring(false);
    if (res.ok) {
      setSavedRecurringId(order.id);
      setTimeout(() => setSavedRecurringId(null), 3000);
      setEditingRecurringId(null);
      load();
    }
  }

  function startEditOneOff(order: OneOffOrder) {
    const q: Record<string,number> = {};
    for (const l of order.lines) q[l.breadTypeId] = l.quantity;
    setEditOneOffQty(q);
    setEditOneOffNotes(order.notes ?? "");
    setEditOneOffAddr(order.deliveryAddressId ?? (addresses.find(a => a.isDefault)?.id ?? ""));
    setEditingOneOffId(order.id);
  }

  async function saveOneOff(order: OneOffOrder) {
    setSavingOneOff(true);
    const lines = breadTypes.map(bt => ({ breadTypeId: bt.id, quantity: editOneOffQty[bt.id] ?? 0 })).filter(l => l.quantity > 0);
    const res = await fetch("/api/mijn/bestellingen", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: order.id,
        notes: editOneOffNotes || undefined,
        deliveryAddressId: editOneOffAddr || null,
        lines,
      }),
    });
    setSavingOneOff(false);
    if (res.ok) {
      setEditingOneOffId(null);
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
        deliveryAddressId: newAddr || undefined,
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

  function AddressSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    if (addresses.length === 0) return null;
    return (
      <div>
        <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Bezorgadres</label>
        <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
          <option value="">-- Geen adres geselecteerd --</option>
          {addresses.map(a => (
            <option key={a.id} value={a.id}>{a.label} — {a.street}, {a.city}</option>
          ))}
        </select>
      </div>
    );
  }

  function QtyGrid({ qty, onChange }: { qty: Record<string,number>; onChange: (q: Record<string,number>) => void }) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px,1fr))", gap: 8 }}>
        {breadTypes.map(bt => (
          <div key={bt.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px" }}>
            <label style={{ fontSize: 10, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
              {shortName(bt.name)}
            </label>
            <input type="number" min={0} value={qty[bt.id] || ""}
              onChange={e => onChange({ ...qty, [bt.id]: parseInt(e.target.value) || 0 })}
              placeholder="0"
              style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 5, padding: "5px 7px", fontSize: 15, fontWeight: 600, background: "var(--surface)", textAlign: "right", color: "var(--text)" }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: 700 }}>
      <h1 style={{ fontSize: 26, marginBottom: "0.25rem" }}>Mijn bestellingen</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: "2rem" }}>
        Wijzigingen zijn mogelijk tot 4:00 uur de ochtend voor bezorging.
      </p>

      {loading && <p style={{ color: "var(--text-subtle)" }}>Laden...</p>}

      {!loading && (
        <>
          {/* Vaste bestellingen */}
          {recurring.length > 0 && (
            <section style={{ marginBottom: "2rem" }}>
              <h2 style={{ fontSize: 17, marginBottom: "0.75rem" }}>Vaste bestellingen</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {recurring.map(order => {
                  const isEditing = editingRecurringId === order.id;
                  const editable = isRecurringEditable(order.weekday);
                  const nextDate = nextDateForWeekday(order.weekday);
                  const timeLeft = timeUntilCutoff(nextDate);

                  return (
                    <div key={order.id} className="card" style={{ padding: "1rem 1.25rem" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isEditing ? 12 : 0 }}>
                        <div>
                          <span style={{ fontWeight: 500, fontSize: 15 }}>{WEEKDAYS[order.weekday]}</span>
                          {editable && timeLeft && (
                            <span style={{ fontSize: 12, color: "var(--success)", marginLeft: 8 }}>Wijzigen mogelijk ({timeLeft})</span>
                          )}
                          {!editable && (
                            <span style={{ fontSize: 12, color: "var(--text-subtle)", marginLeft: 8 }}>Gesloten voor wijzigingen</span>
                          )}
                        </div>
                        {editable && !isEditing && (
                          <button onClick={() => startEditRecurring(order)} className="btn-secondary" style={{ fontSize: 12, padding: "5px 12px" }}>Wijzigen</button>
                        )}
                        {isEditing && (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => setEditingRecurringId(null)} className="btn-secondary" style={{ fontSize: 12 }}>Annuleer</button>
                            <button onClick={() => saveRecurring(order)} disabled={savingRecurring} className="btn-primary" style={{ fontSize: 12 }}>
                              {savingRecurring ? "Opslaan..." : "Opslaan"}
                            </button>
                          </div>
                        )}
                      </div>

                      {savedRecurringId === order.id && (
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

                      {isEditing && <QtyGrid qty={editRecurringQty} onChange={setEditRecurringQty} />}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Eenmalige bestellingen */}
          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <h2 style={{ fontSize: 17, margin: 0 }}>Eenmalige bestellingen</h2>
              <button onClick={() => { setShowNewOrder(true); }} className="btn-primary" style={{ fontSize: 13 }}>
                + Bestelling plaatsen
              </button>
            </div>

            {showNewOrder && (
              <div className="card" style={{ padding: "1.25rem", marginBottom: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Bezorgdatum</label>
                    <input type="date" value={newDate} min={today} onChange={e => setNewDate(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Opmerkingen</label>
                    <input value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="bijv. voor 9:00" style={inputStyle} />
                  </div>
                </div>
                <AddressSelect value={newAddr} onChange={setNewAddr} />
                {newDate && !isEditable(newDate) && (
                  <p style={{ color: "var(--danger)", fontSize: 13 }}>Te laat - de bestelling voor {newDate} moest voor 4:00 uur zijn geplaatst.</p>
                )}
                <QtyGrid qty={newQty} onChange={setNewQty} />
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
                const isEditing = editingOneOffId === order.id;

                return (
                  <div key={order.id} className="card" style={{ padding: "1rem 1.25rem" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: isEditing ? 12 : 0 }}>
                      <div>
                        <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 2px" }}>{formatDate(order.deliveryDate)}</p>
                        {order.deliveryAddress && (
                          <p style={{ fontSize: 12, color: "var(--text-subtle)", margin: "0 0 4px" }}>
                            {order.deliveryAddress.label} - {order.deliveryAddress.street}, {order.deliveryAddress.city}
                          </p>
                        )}
                        {order.notes && <p style={{ fontSize: 12, color: "var(--text-subtle)", margin: "0 0 6px" }}>{order.notes}</p>}
                        {!isEditing && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {order.lines.map(l => (
                              <span key={l.breadTypeId} style={{ fontSize: 12, background: "var(--accent-light)", color: "var(--accent)", padding: "3px 10px", borderRadius: 12 }}>
                                {shortName(l.breadType.name)} x {l.quantity}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0, marginLeft: 12 }}>
                        {editable && timeLeft && <span style={{ fontSize: 11, color: "var(--success)" }}>{timeLeft}</span>}
                        {editable && !isEditing && (
                          <button onClick={() => startEditOneOff(order)} className="btn-secondary" style={{ fontSize: 11, padding: "4px 10px" }}>Wijzigen</button>
                        )}
                        {editable && !isEditing && (
                          <button onClick={() => deleteOneOff(order.id)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", color: "var(--danger)" }}>
                            Annuleren
                          </button>
                        )}
                      </div>
                    </div>

                    {isEditing && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div>
                            <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Opmerkingen</label>
                            <input value={editOneOffNotes} onChange={e => setEditOneOffNotes(e.target.value)} style={inputStyle} placeholder="bijv. voor 9:00" />
                          </div>
                        </div>
                        <AddressSelect value={editOneOffAddr} onChange={setEditOneOffAddr} />
                        <QtyGrid qty={editOneOffQty} onChange={setEditOneOffQty} />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => setEditingOneOffId(null)} className="btn-secondary" style={{ fontSize: 13 }}>Annuleer</button>
                          <button onClick={() => saveOneOff(order)} disabled={savingOneOff} className="btn-primary" style={{ fontSize: 13 }}>
                            {savingOneOff ? "Opslaan..." : "Opslaan"}
                          </button>
                        </div>
                      </div>
                    )}
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
