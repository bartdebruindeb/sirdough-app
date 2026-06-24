"use client";
import { useEffect, useRef, useState } from "react";

const WEEKDAYS = ["","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];

type BreadType = { id: string; name: string; sortOrder: number };
type Address = { id: string; label: string; street: string; postalCode: string; city: string; isDefault: boolean };
type RecurringLine = { breadTypeId: string; quantity: number; breadType: BreadType };
type RecurringOrder = { id: string; weekday: number; lines: RecurringLine[] };
type OneOffOrder = {
  id: string; deliveryDate: string; notes: string | null;
  deliveryAddressId: string | null; deliveryAddress: Address | null;
  lines: { breadTypeId: string; quantity: number; breadType: BreadType }[];
};

const EMAIL_DEBOUNCE_MS = 10 * 60 * 1000; // 10 minutes

function isEditable(deliveryDateStr: string): boolean {
  return new Date() < new Date(deliveryDateStr + "T04:00:00Z");
}

function timeUntilCutoff(deliveryDateStr: string): string {
  const diff = new Date(deliveryDateStr + "T04:00:00Z").getTime() - Date.now();
  if (diff <= 0) return "";
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000);
  if (h > 24) return `nog ${Math.floor(h/24)} dag${Math.floor(h/24) !== 1 ? "en" : ""}`;
  if (h > 0) return `nog ${h}u ${m}m`;
  return `nog ${m} min`;
}

function isRecurringEditable(weekday: number): boolean {
  const now = new Date();
  const diff = (weekday - (now.getDay() || 7) + 7) % 7 || 7;
  const next = new Date(now); next.setDate(now.getDate() + diff);
  return isEditable(next.toISOString().slice(0, 10));
}

function nextDateStr(weekday: number): string {
  const now = new Date();
  const diff = (weekday - (now.getDay() || 7) + 7) % 7 || 7;
  const d = new Date(now); d.setDate(now.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function formatDate(s: string) {
  return new Date(s + "T12:00:00Z").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
}

function shortName(n: string) {
  return n.replace("Boeren ", "B. ").replace("Morning buns", "Buns").replace(" KG", "kg");
}

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 7, padding: "7px 10px",
  fontSize: 13, width: "100%", background: "var(--surface)", color: "var(--text)",
};

function QtyGrid({ qty, onChange, breadTypes }: { qty: Record<string,number>; onChange: (q: Record<string,number>) => void; breadTypes: BreadType[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px,1fr))", gap: 8 }}>
      {breadTypes.map(bt => (
        <div key={bt.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px" }}>
          <label style={{ fontSize: 10, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>{shortName(bt.name)}</label>
          <input type="number" min={0} value={qty[bt.id] || ""} placeholder="0"
            onChange={e => onChange({ ...qty, [bt.id]: parseInt(e.target.value) || 0 })}
            style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 5, padding: "5px 7px", fontSize: 15, fontWeight: 600, background: "var(--surface)", color: "var(--text)", textAlign: "right" }} />
        </div>
      ))}
    </div>
  );
}

function AddressSelect({ value, onChange, addresses }: { value: string; onChange: (v: string) => void; addresses: Address[] }) {
  if (addresses.length === 0) return null;
  return (
    <div>
      <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Bezorgadres</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
        <option value="">-- Geen adres --</option>
        {addresses.map(a => <option key={a.id} value={a.id}>{a.label} — {a.street}, {a.city}</option>)}
      </select>
    </div>
  );
}

export default function MijnBestellingenPage() {
  const [recurring, setRecurring]   = useState<RecurringOrder[]>([]);
  const [upcoming, setUpcoming]     = useState<OneOffOrder[]>([]);
  const [breadTypes, setBreadTypes] = useState<BreadType[]>([]);
  const [addresses, setAddresses]   = useState<Address[]>([]);
  const [loading, setLoading]       = useState(true);

  // Email debounce
  const emailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function scheduleEmail() {
    localStorage.setItem("pendingOrderEmail", "1");
    if (emailTimer.current) clearTimeout(emailTimer.current);
    emailTimer.current = setTimeout(async () => {
      localStorage.removeItem("pendingOrderEmail");
      await fetch("/api/mijn/email-summary", { method: "POST" }).catch(() => {});
    }, EMAIL_DEBOUNCE_MS);
  }

  // Recurring edit
  const [editingRecId, setEditingRecId] = useState<string | null>(null);
  const [editRecQty, setEditRecQty]     = useState<Record<string,number>>({});
  const [savingRec, setSavingRec]       = useState(false);
  const [savedRecId, setSavedRecId]     = useState<string | null>(null);

  // New recurring
  const [showNewRec, setShowNewRec]     = useState(false);
  const [newRecWeekday, setNewRecWeekday] = useState(1);
  const [newRecQty, setNewRecQty]       = useState<Record<string,number>>({});
  const [savingNewRec, setSavingNewRec] = useState(false);

  // One-off edit
  const [editingOOId, setEditingOOId]   = useState<string | null>(null);
  const [editOOQty, setEditOOQty]       = useState<Record<string,number>>({});
  const [editOONotes, setEditOONotes]   = useState("");
  const [editOOAddr, setEditOOAddr]     = useState("");
  const [savingOO, setSavingOO]         = useState(false);

  // New one-off
  const [showNewOO, setShowNewOO]       = useState(false);
  const [newDate, setNewDate]           = useState("");
  const [newQty, setNewQty]             = useState<Record<string,number>>({});
  const [newNotes, setNewNotes]         = useState("");
  const [newAddr, setNewAddr]           = useState("");
  const [savingNew, setSavingNew]       = useState(false);

  function load() {
    fetch(`/api/mijn/bestellingen?from=${new Date().toISOString().slice(0,10)}`).then(r => r.json())
      .then(d => {
        setUpcoming(d.orders ?? []);
        setBreadTypes(d.breadTypes ?? []);
        setRecurring(d.recurring ?? []);
        const addrs = d.addresses ?? [];
        setAddresses(addrs);
        const def = addrs.find((a: Address) => a.isDefault);
        if (def && !newAddr) setNewAddr(def.id);
        setLoading(false);
      });
  }
  useEffect(() => { load(); }, []);

  // Recurring: edit existing
  function startEditRec(o: RecurringOrder) {
    const q: Record<string,number> = {};
    o.lines.forEach(l => { q[l.breadTypeId] = l.quantity; });
    setEditRecQty(q); setEditingRecId(o.id);
  }
  async function saveRec(o: RecurringOrder) {
    setSavingRec(true);
    const res = await fetch("/api/mijn/bestellingen", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recurringOrderId: o.id, lines: breadTypes.map(bt => ({ breadTypeId: bt.id, quantity: editRecQty[bt.id] ?? 0 })) }),
    });
    setSavingRec(false);
    if (res.ok) { setSavedRecId(o.id); setTimeout(() => setSavedRecId(null), 3000); setEditingRecId(null); scheduleEmail(); load(); }
  }
  async function deleteRec(id: string) {
    if (!confirm("Vaste bestelling verwijderen?")) return;
    await fetch(`/api/mijn/bestellingen?id=${id}&type=recurring`, { method: "DELETE" });
    load();
  }

  // Recurring: create new
  async function createRec() {
    setSavingNewRec(true);
    const res = await fetch("/api/mijn/bestellingen", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekday: newRecWeekday, lines: breadTypes.map(bt => ({ breadTypeId: bt.id, quantity: newRecQty[bt.id] ?? 0 })) }),
    });
    setSavingNewRec(false);
    if (res.ok) { setShowNewRec(false); setNewRecQty({}); scheduleEmail(); load(); }
  }

  // One-off: edit
  function startEditOO(o: OneOffOrder) {
    const q: Record<string,number> = {};
    o.lines.forEach(l => { q[l.breadTypeId] = l.quantity; });
    setEditOOQty(q); setEditOONotes(o.notes ?? "");
    setEditOOAddr(o.deliveryAddressId ?? addresses.find(a => a.isDefault)?.id ?? "");
    setEditingOOId(o.id);
  }
  async function saveOO(o: OneOffOrder) {
    setSavingOO(true);
    const res = await fetch("/api/mijn/bestellingen", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: o.id, notes: editOONotes || undefined, deliveryAddressId: editOOAddr || null, lines: breadTypes.map(bt => ({ breadTypeId: bt.id, quantity: editOOQty[bt.id] ?? 0 })).filter(l => l.quantity > 0) }),
    });
    setSavingOO(false);
    if (res.ok) { setEditingOOId(null); scheduleEmail(); load(); }
  }
  async function deleteOO(id: string) {
    if (!confirm("Bestelling annuleren?")) return;
    await fetch(`/api/mijn/bestellingen?id=${id}`, { method: "DELETE" });
    load();
  }

  // One-off: create
  async function createOO() {
    if (!newDate || Object.values(newQty).every(v => v === 0) || !isEditable(newDate)) return;
    setSavingNew(true);
    await fetch("/api/mijn/bestellingen", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryDate: newDate, notes: newNotes || undefined, deliveryAddressId: newAddr || undefined, lines: Object.entries(newQty).filter(([,q]) => q > 0).map(([breadTypeId, quantity]) => ({ breadTypeId, quantity })) }),
    });
    setSavingNew(false); setShowNewOO(false); setNewQty({}); setNewNotes("");
    scheduleEmail(); load();
  }

  const usedWeekdays = new Set(recurring.map(r => r.weekday));
  const availableWeekdays = [1,2,3,4,5,6,7].filter(d => !usedWeekdays.has(d));
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
          {/* Vaste bestellingen */}
          <section style={{ marginBottom: "2rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <h2 style={{ fontSize: 17, margin: 0 }}>Vaste bestellingen</h2>
              {availableWeekdays.length > 0 && (
                <button onClick={() => { setNewRecWeekday(availableWeekdays[0]); setShowNewRec(true); }} className="btn-secondary" style={{ fontSize: 12 }}>
                  + Dag toevoegen
                </button>
              )}
            </div>

            {recurring.length === 0 && !showNewRec && (
              <div className="card" style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-subtle)", fontSize: 13 }}>
                Nog geen vaste bestellingen. Klik op "Dag toevoegen" om te starten.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {recurring.map(order => {
                const isEditing = editingRecId === order.id;
                const editable = isRecurringEditable(order.weekday);
                const timeLeft = timeUntilCutoff(nextDateStr(order.weekday));

                return (
                  <div key={order.id} className="card" style={{ padding: "1rem 1.25rem" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isEditing ? 12 : 0 }}>
                      <div>
                        <span style={{ fontWeight: 500, fontSize: 15 }}>{WEEKDAYS[order.weekday]}</span>
                        {editable && timeLeft && <span style={{ fontSize: 12, color: "var(--success)", marginLeft: 8 }}>Wijzigen mogelijk ({timeLeft})</span>}
                        {!editable && <span style={{ fontSize: 12, color: "var(--text-subtle)", marginLeft: 8 }}>Gesloten voor wijzigingen</span>}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {editable && !isEditing && <button onClick={() => startEditRec(order)} className="btn-secondary" style={{ fontSize: 11, padding: "4px 10px" }}>Wijzigen</button>}
                        {isEditing && <>
                          <button onClick={() => setEditingRecId(null)} className="btn-secondary" style={{ fontSize: 11 }}>Annuleer</button>
                          <button onClick={() => saveRec(order)} disabled={savingRec} className="btn-primary" style={{ fontSize: 11 }}>{savingRec ? "Opslaan..." : "Opslaan"}</button>
                        </>}
                        {!isEditing && <button onClick={() => deleteRec(order.id)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "none", color: "var(--danger)", cursor: "pointer" }}>Verwijder</button>}
                      </div>
                    </div>

                    {savedRecId === order.id && <p style={{ color: "var(--success)", fontSize: 12, marginTop: 4 }}>Opgeslagen</p>}

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
                    {isEditing && <QtyGrid qty={editRecQty} onChange={setEditRecQty} breadTypes={breadTypes} />}
                  </div>
                );
              })}

              {showNewRec && (
                <div className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Dag</label>
                    <select value={newRecWeekday} onChange={e => setNewRecWeekday(Number(e.target.value))} style={inputStyle}>
                      {availableWeekdays.map(d => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
                    </select>
                  </div>
                  <QtyGrid qty={newRecQty} onChange={setNewRecQty} breadTypes={breadTypes} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setShowNewRec(false)} className="btn-secondary" style={{ fontSize: 13 }}>Annuleren</button>
                    <button onClick={createRec} disabled={savingNewRec} className="btn-primary" style={{ fontSize: 13 }}>{savingNewRec ? "Opslaan..." : "Vaste bestelling toevoegen"}</button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Eenmalige bestellingen */}
          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <h2 style={{ fontSize: 17, margin: 0 }}>Eenmalige bestellingen</h2>
              <button onClick={() => setShowNewOO(true)} className="btn-primary" style={{ fontSize: 13 }}>+ Bestelling plaatsen</button>
            </div>

            {showNewOO && (
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
                <AddressSelect value={newAddr} onChange={setNewAddr} addresses={addresses} />
                {newDate && !isEditable(newDate) && (
                  <p style={{ color: "var(--danger)", fontSize: 13 }}>Te laat - bestelling moet voor 4:00 uur worden geplaatst.</p>
                )}
                <QtyGrid qty={newQty} onChange={setNewQty} breadTypes={breadTypes} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setShowNewOO(false)} className="btn-secondary" style={{ fontSize: 13 }}>Annuleren</button>
                  <button onClick={createOO} disabled={savingNew || !newDate || !isEditable(newDate)} className="btn-primary" style={{ fontSize: 13 }}>{savingNew ? "Plaatsen..." : "Bestelling plaatsen"}</button>
                </div>
              </div>
            )}

            {upcoming.length === 0 && !showNewOO && (
              <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--text-subtle)", fontSize: 13 }}>Geen komende eenmalige bestellingen.</div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {upcoming.map(order => {
                const editable = isEditable(order.deliveryDate);
                const timeLeft = timeUntilCutoff(order.deliveryDate);
                const isEditing = editingOOId === order.id;
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
                        {editable && !isEditing && <button onClick={() => startEditOO(order)} className="btn-secondary" style={{ fontSize: 11, padding: "4px 10px" }}>Wijzigen</button>}
                        {isEditing && <>
                          <button onClick={() => setEditingOOId(null)} className="btn-secondary" style={{ fontSize: 11 }}>Annuleer</button>
                          <button onClick={() => saveOO(order)} disabled={savingOO} className="btn-primary" style={{ fontSize: 11 }}>{savingOO ? "Opslaan..." : "Opslaan"}</button>
                        </>}
                        {editable && !isEditing && <button onClick={() => deleteOO(order.id)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", color: "var(--danger)" }}>Annuleren</button>}
                      </div>
                    </div>

                    {isEditing && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div>
                            <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Opmerkingen</label>
                            <input value={editOONotes} onChange={e => setEditOONotes(e.target.value)} style={inputStyle} placeholder="bijv. voor 9:00" />
                          </div>
                        </div>
                        <AddressSelect value={editOOAddr} onChange={setEditOOAddr} addresses={addresses} />
                        <QtyGrid qty={editOOQty} onChange={setEditOOQty} breadTypes={breadTypes} />
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
