"use client";
import { useEffect, useRef, useState } from "react";
import { bakeryConfig } from "@/config/bakery.config";

const WEEKDAYS = ["","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];
const EMAIL_DEBOUNCE_MS = 10 * 60 * 1000;

const PICKUP_LOCATIONS = bakeryConfig.shops.map(s => ({ id: s.name, label: s.name.replace("Winkel ", "") }));

type BreadType = { id: string; name: string; sortOrder: number; price: number | null; availableWeekdays: string | null };
type RecurringException = { date: string; active: boolean };
type RecurringLine = { breadTypeId: string; quantity: number; breadType: BreadType };
type RecurringOrder = { id: string; weekday: number; active: boolean; lines: RecurringLine[]; exceptions: RecurringException[] };
type OneOffOrder = {
  id: string; deliveryDate: string; notes: string | null;
  lines: { breadTypeId: string; quantity: number; breadType: BreadType }[];
};

function calcBasketTotal(qty: Record<string,number>, breadTypes: BreadType[], discountPercent: number): number {
  return breadTypes.reduce((sum, bt) => {
    const q = qty[bt.id] ?? 0;
    if (!q || !bt.price) return sum;
    return sum + bt.price * q * (1 - discountPercent / 100);
  }, 0);
}

// Cutoff = orderCutoffHour UTC on the day BEFORE delivery
function cutoffDate(deliveryDateStr: string): Date {
  const d = new Date(deliveryDateStr + `T${String(bakeryConfig.orderCutoffHour).padStart(2,"0")}:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}
function isEditable(deliveryDateStr: string): boolean {
  return new Date() < cutoffDate(deliveryDateStr);
}
function timeUntilCutoff(deliveryDateStr: string): string {
  const diff = cutoffDate(deliveryDateStr).getTime() - Date.now();
  if (diff <= 0) return "";
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000);
  if (h > 24) return `nog ${Math.floor(h / 24)}d`;
  if (h > 0) return `nog ${h}u ${m}m`;
  return `nog ${m} min`;
}
function nextOccurrence(weekday: number): string {
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

// Map bread name → image in /brood/. Strip weight suffixes to find base name.
const BREAD_IMAGES: Record<string, string> = {
  "Baguette Kaas Peper": "Baguette Kaas Peper.jpg",
  "Baguette":            "Baquette.jpg",
  "Boeren":              "Boeren 1kg.jpg",
  "Choco koek":          "Choco koek.jpg",
  "Gekiemde Rogge":      "Gekiemde Rogge.jpg",
  "Kaneel Bun":          "Kaneel Bun.jpg",
  "Kardemon Bun":        "Kardemon Bun.jpg",
  "Morning Buns":        "Morning Buns.jpg",
  "Morning buns":        "Morning Buns.jpg",
  "Olijf":               "Olijf.jpg",
  "Rozijn":              "Rozijn.jpg",
  "Sesam":               "Sesam.jpg",
  "Spelt":               "Spelt.jpg",
  "Volkoren":            "Volkoren.jpg",
  "Zaden":               "Zaden.jpg",
};

function breadImage(name: string): string | null {
  // Try exact match first
  if (BREAD_IMAGES[name]) return `/brood/${encodeURIComponent(BREAD_IMAGES[name])}`;
  // Strip weight suffix: "Sesam 1,5 KG" → "Sesam", "Boeren 1KG" → "Boeren"
  const base = name.replace(/\s*(1[,.]?5?\s*KG|1\s*KG|750\s*g?r?|0[,.]?75\s*KG)\s*$/i, "").trim();
  if (BREAD_IMAGES[base]) return `/brood/${encodeURIComponent(BREAD_IMAGES[base])}`;
  return null;
}
// weekday from JS Date: 0=Sun,1=Mon...6=Sat → convert to 1=Mon...7=Sun
function jsWeekdayToISO(d: Date): number { return d.getDay() === 0 ? 7 : d.getDay(); }

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 7, padding: "7px 10px",
  fontSize: 13, width: "100%", background: "var(--surface)", color: "var(--text)",
};

function isAvailableOnDate(bt: BreadType, dateStr: string): boolean {
  if (!bt.availableWeekdays || !dateStr) return true;
  const d = new Date(dateStr + "T12:00:00Z");
  const isoDay = d.getDay() === 0 ? 7 : d.getDay();
  return bt.availableWeekdays.split(",").map(Number).includes(isoDay);
}

function QtyGrid({ qty, onChange, breadTypes, discountPercent = 0, deliveryDate = "" }: { qty: Record<string,number>; onChange: (q: Record<string,number>) => void; breadTypes: BreadType[]; discountPercent?: number; deliveryDate?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 10 }}>
      {breadTypes.map(bt => {
        const available = isAvailableOnDate(bt, deliveryDate);
        const unitPrice = bt.price != null ? bt.price * (1 - discountPercent / 100) : null;
        const img = breadImage(bt.name);
        return (
          <div key={bt.id} style={{
            background: "var(--surface-2)", border: `1px solid ${qty[bt.id] ? "var(--accent)" : "var(--border)"}`,
            borderRadius: 10, overflow: "hidden", opacity: available ? 1 : 0.4,
            display: "flex", flexDirection: "column",
          }}>
            {img && (
              <img src={img} alt={bt.name}
                style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }} />
            )}
            <div style={{ padding: "8px 10px", flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
              <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text)", lineHeight: 1.2 }}>{shortName(bt.name)}</label>
              {!available && <span style={{ fontSize: 9, color: "var(--danger)" }}>niet op deze dag</span>}
              {unitPrice != null && available && (
                <span style={{ fontSize: 11, color: "var(--accent)" }}>€ {unitPrice.toFixed(2)}</span>
              )}
              <input type="number" min={0} value={qty[bt.id] || ""} placeholder="0"
                disabled={!available}
                onChange={e => onChange({ ...qty, [bt.id]: parseInt(e.target.value) || 0 })}
                style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 5, padding: "5px 7px", fontSize: 16, fontWeight: 700, background: "var(--surface)", color: "var(--text)", textAlign: "right", marginTop: "auto" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MijnBestellingenPage() {
  const [recurring, setRecurring]         = useState<RecurringOrder[]>([]);
  const [upcoming, setUpcoming]           = useState<OneOffOrder[]>([]);
  const [pastOrders, setPastOrders]       = useState<OneOffOrder[]>([]);
  const [breadTypes, setBreadTypes]       = useState<BreadType[]>([]);
  const [closedWeekdays, setClosedWeekdays] = useState<number[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [minDeliveryAmount, setMinDeliveryAmount] = useState<number | null>(null);
  const [loading, setLoading]             = useState(true);

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

  // New recurring
  const [showNewRec, setShowNewRec]     = useState(false);
  const [newRecWeekday, setNewRecWeekday] = useState(1);
  const [newRecQty, setNewRecQty]       = useState<Record<string,number>>({});
  const [savingNewRec, setSavingNewRec] = useState(false);

  // One-off edit
  const [editingOOId, setEditingOOId]   = useState<string | null>(null);
  const [editOOQty, setEditOOQty]       = useState<Record<string,number>>({});
  const [editOONotes, setEditOONotes]   = useState("");
  const [savingOO, setSavingOO]         = useState(false);

  // New one-off
  const [showNewOO, setShowNewOO]       = useState(false);
  const [newDate, setNewDate]           = useState("");
  const [newQty, setNewQty]             = useState<Record<string,number>>({});
  const [newNotes, setNewNotes]         = useState("");
  const [savingNew, setSavingNew]       = useState(false);
  const [dateError, setDateError]       = useState("");

  // New one-off: pickup
  const [newPickup, setNewPickup]       = useState<string>(""); // "" = delivery, else location id

  // Past log
  const [showLog, setShowLog]           = useState(false);

  function load() {
    fetch(`/api/mijn/bestellingen?from=${new Date().toISOString().slice(0,10)}`).then(r => r.json())
      .then(d => {
        setUpcoming(d.orders ?? []);
        setBreadTypes(d.breadTypes ?? []);
        setRecurring(d.recurring ?? []);
        setPastOrders(d.pastOrders ?? []);
        setClosedWeekdays(d.closedWeekdays ?? []);
        setDiscountPercent(d.discountPercent ?? 0);
        setMinDeliveryAmount(d.minDeliveryAmount ?? null);
        setLoading(false);
      });
  }
  useEffect(() => { load(); }, []);

  function validateDate(dateStr: string): string {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T12:00:00Z");
    const isoDay = jsWeekdayToISO(d);
    if (closedWeekdays.includes(isoDay)) return "De bakkerij is op deze dag gesloten.";
    if (!isEditable(dateStr)) return "De besteldeadline is verstreken (4:00u de dag voor bezorging).";
    return "";
  }

  // Recurring
  function startEditRec(o: RecurringOrder) {
    const q: Record<string,number> = {};
    o.lines.forEach(l => { q[l.breadTypeId] = l.quantity; });
    setEditRecQty(q); setEditingRecId(o.id);
  }
  async function saveRec(o: RecurringOrder) {
    setSavingRec(true);
    await fetch("/api/mijn/bestellingen", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recurringOrderId: o.id, lines: breadTypes.map(bt => ({ breadTypeId: bt.id, quantity: editRecQty[bt.id] ?? 0 })) }),
    });
    setSavingRec(false); setEditingRecId(null); scheduleEmail(); load();
  }
  async function toggleRecActive(o: RecurringOrder) {
    await fetch("/api/mijn/bestellingen", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recurringOrderId: o.id, active: !o.active }),
    });
    load();
  }
  async function toggleSkip(recurringOrderId: string, dateStr: string, currentlySkipped: boolean) {
    await fetch("/api/mijn/bestellingen", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recurringOrderId, skipDate: dateStr, unskip: currentlySkipped }),
    });
    load();
  }
  async function deleteRec(id: string) {
    if (!confirm("Vaste bestelling definitief verwijderen?")) return;
    await fetch(`/api/mijn/bestellingen?id=${id}&type=recurring`, { method: "DELETE" });
    load();
  }
  async function createRec() {
    setSavingNewRec(true);
    await fetch("/api/mijn/bestellingen", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekday: newRecWeekday, lines: breadTypes.map(bt => ({ breadTypeId: bt.id, quantity: newRecQty[bt.id] ?? 0 })) }),
    });
    setSavingNewRec(false); setShowNewRec(false); setNewRecQty({}); scheduleEmail(); load();
  }

  // One-off
  function startEditOO(o: OneOffOrder) {
    const q: Record<string,number> = {};
    o.lines.forEach(l => { q[l.breadTypeId] = l.quantity; });
    setEditOOQty(q); setEditOONotes(o.notes ?? ""); setEditingOOId(o.id);
  }
  async function saveOO(o: OneOffOrder) {
    setSavingOO(true);
    await fetch("/api/mijn/bestellingen", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: o.id, notes: editOONotes || undefined, lines: breadTypes.map(bt => ({ breadTypeId: bt.id, quantity: editOOQty[bt.id] ?? 0 })).filter(l => l.quantity > 0) }),
    });
    setSavingOO(false); setEditingOOId(null); scheduleEmail(); load();
  }
  async function deleteOO(id: string) {
    if (!confirm("Bestelling annuleren?")) return;
    await fetch(`/api/mijn/bestellingen?id=${id}`, { method: "DELETE" });
    load();
  }
  async function createOO() {
    const err = validateDate(newDate);
    if (err || !newDate || Object.values(newQty).every(v => v === 0)) return;
    const isPickup = !!newPickup;
    const total = calcBasketTotal(newQty, breadTypes, discountPercent);
    if (!isPickup && minDeliveryAmount !== null && total < minDeliveryAmount) return;
    setSavingNew(true);
    await fetch("/api/mijn/bestellingen", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deliveryDate: newDate,
        notes: newNotes || undefined,
        pickupLocation: newPickup || undefined,
        lines: Object.entries(newQty).filter(([,q]) => q > 0).map(([breadTypeId, quantity]) => ({ breadTypeId, quantity: quantity as number })),
      }),
    });
    setSavingNew(false); setShowNewOO(false); setNewQty({}); setNewNotes(""); setNewPickup(""); setDateError(""); scheduleEmail(); load();
  }

  const usedWeekdays = new Set(recurring.map(r => r.weekday));
  const validDeliveryWeekdays = [1,2,3,4,5,6,7].filter(d => !closedWeekdays.includes(d));
  const availableWeekdays = validDeliveryWeekdays.filter(d => !usedWeekdays.has(d));
  const today = new Date().toISOString().slice(0,10);

  // Next 2 weeks dates for skip planning
  function getUpcomingDates(weekday: number): string[] {
    const dates: string[] = [];
    const now = new Date();
    for (let i = 0; i < 56; i++) {
      const d = new Date(now); d.setDate(now.getDate() + i);
      if (jsWeekdayToISO(d) === weekday) dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: 700 }}>
      <h1 style={{ fontSize: 26, marginBottom: "0.25rem" }}>Mijn bestellingen</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: "2rem" }}>
        Wijzigingen mogelijk tot 4:00u de ochtend voor bezorging.
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
                const next = nextOccurrence(order.weekday);
                const editable = isEditable(next);
                const isEditing = editingRecId === order.id;
                const upcomingDates = getUpcomingDates(order.weekday);
                const skippedDates = new Set(order.exceptions.filter(e => !e.active).map(e => e.date));

                // Find next editable occurrence (may be next week if this week is locked)
                const nextEditable = upcomingDates.find(d => isEditable(d)) ?? null;
                const thisWeekLocked = !editable && order.active;

                return (
                  <div key={order.id} className="card" style={{ padding: "1rem 1.25rem", opacity: order.active ? 1 : 0.65 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isEditing ? 12 : 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontWeight: 500, fontSize: 15 }}>{WEEKDAYS[order.weekday]}</span>
                        {!order.active && <span style={{ fontSize: 11, background: "var(--danger-bg)", color: "var(--danger)", padding: "2px 8px", borderRadius: 8 }}>Gepauzeerd</span>}
                        {order.active && editable && <span style={{ fontSize: 11, color: "var(--success)" }}>{timeUntilCutoff(next)}</span>}
                        {order.active && !editable && <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>Vandaag gesloten</span>}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {order.active && !isEditing && (
                          <button onClick={() => startEditRec(order)} className="btn-secondary" style={{ fontSize: 11, padding: "4px 10px" }}>Wijzigen</button>
                        )}
                        {isEditing && (
                          <>
                            {thisWeekLocked && nextEditable && (
                              <span style={{ fontSize: 10, color: "var(--text-subtle)", alignSelf: "center" }}>
                                geldt vanaf {new Date(nextEditable+"T12:00:00Z").toLocaleDateString("nl-NL",{day:"numeric",month:"short"})}
                              </span>
                            )}
                            <button onClick={() => setEditingRecId(null)} className="btn-secondary" style={{ fontSize: 11 }}>Annuleer</button>
                            <button onClick={() => saveRec(order)} disabled={savingRec} className="btn-primary" style={{ fontSize: 11 }}>{savingRec ? "..." : "Opslaan"}</button>
                          </>
                        )}
                        <button onClick={() => toggleRecActive(order)} className="btn-secondary" style={{ fontSize: 11, padding: "4px 10px", color: order.active ? "var(--text-subtle)" : "var(--success)" }}>
                          {order.active ? "Pauzeer" : "Hervatten"}
                        </button>
                        <button onClick={() => deleteRec(order.id)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "none", color: "var(--danger)", cursor: "pointer" }}>
                          Verwijder
                        </button>
                      </div>
                    </div>

                    {!isEditing && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                        {order.lines.filter(l => l.quantity > 0).map(l => (
                          <span key={l.breadTypeId} style={{ fontSize: 12, background: "var(--accent-light)", color: "var(--accent)", padding: "3px 10px", borderRadius: 12 }}>
                            {shortName(l.breadType.name)} x {l.quantity}
                          </span>
                        ))}
                        {order.lines.length === 0 && <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>Geen producten</span>}
                      </div>
                    )}

                    {isEditing && <QtyGrid qty={editRecQty} onChange={setEditRecQty} breadTypes={breadTypes} discountPercent={discountPercent} />}

                    {/* Upcoming 2 weeks skip planning */}
                    {order.active && upcomingDates.length > 0 && !isEditing && (
                      <div style={{ borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 8 }}>
                        <p style={{ fontSize: 11, color: "var(--text-subtle)", margin: "0 0 6px" }}>Komende bezorgingen:</p>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {upcomingDates.map(date => {
                            const skipped = skippedDates.has(date);
                            const editable = isEditable(date);
                            return (
                              <button key={date} onClick={() => editable && toggleSkip(order.id, date, skipped)}
                                disabled={!editable}
                                style={{
                                  fontSize: 11, padding: "3px 10px", borderRadius: 8, cursor: editable ? "pointer" : "default",
                                  border: `1px solid ${skipped ? "var(--danger)" : "var(--border)"}`,
                                  background: skipped ? "var(--danger-bg)" : "var(--surface-2)",
                                  color: skipped ? "var(--danger)" : editable ? "var(--text)" : "var(--text-subtle)",
                                  textDecoration: skipped ? "line-through" : "none",
                                }}>
                                {new Date(date + "T12:00:00Z").toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                                {skipped ? " (overgeslagen)" : ""}
                              </button>
                            );
                          })}
                        </div>
                        <p style={{ fontSize: 10, color: "var(--text-subtle)", marginTop: 4 }}>Klik op een datum om over te slaan of te hervatten.</p>
                      </div>
                    )}
                  </div>
                );
              })}

              {showNewRec && (
                <div className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Bezorgdag</label>
                    <select value={newRecWeekday} onChange={e => setNewRecWeekday(Number(e.target.value))} style={inputStyle}>
                      {availableWeekdays.map(d => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
                    </select>
                  </div>
                  <QtyGrid qty={newRecQty} onChange={setNewRecQty} breadTypes={breadTypes} discountPercent={discountPercent} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setShowNewRec(false)} className="btn-secondary" style={{ fontSize: 13 }}>Annuleren</button>
                    <button onClick={createRec} disabled={savingNewRec} className="btn-primary" style={{ fontSize: 13 }}>{savingNewRec ? "Opslaan..." : "Vaste bestelling toevoegen"}</button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Eenmalige bestellingen */}
          <section style={{ marginBottom: "2rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <h2 style={{ fontSize: 17, margin: 0 }}>Eenmalige bestellingen</h2>
              <button onClick={() => setShowNewOO(true)} className="btn-primary" style={{ fontSize: 13 }}>+ Bestelling plaatsen</button>
            </div>

            {showNewOO && (
              <div className="card" style={{ padding: "1.25rem", marginBottom: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Bezorgdatum</label>
                    <input type="date" value={newDate} min={today}
                      onChange={e => { setNewDate(e.target.value); setDateError(validateDate(e.target.value)); }}
                      style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Opmerkingen</label>
                    <input value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="bijv. voor 9:00" style={inputStyle} />
                  </div>
                </div>
                {/* Pickup / delivery toggle */}
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Bezorging of afhalen?</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[{ id: "", label: "Bezorgen" }, ...PICKUP_LOCATIONS].map(loc => (
                      <button key={loc.id} type="button"
                        onClick={() => setNewPickup(loc.id)}
                        style={{
                          fontSize: 12, padding: "5px 12px", borderRadius: 7, cursor: "pointer",
                          border: `1px solid ${newPickup === loc.id ? "var(--accent)" : "var(--border)"}`,
                          background: newPickup === loc.id ? "var(--accent-light)" : "var(--surface)",
                          color: newPickup === loc.id ? "var(--accent)" : "var(--text)",
                          fontWeight: newPickup === loc.id ? 600 : 400,
                        }}>
                        {loc.id === "" ? "🚚 Bezorgen" : `🏪 ${loc.label}`}
                      </button>
                    ))}
                  </div>
                </div>

                {dateError && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{dateError}</p>}
                <QtyGrid qty={newQty} onChange={setNewQty} breadTypes={breadTypes} discountPercent={discountPercent} deliveryDate={newDate} />

                {/* Basket total + min delivery warning */}
                {(() => {
                  const total = calcBasketTotal(newQty, breadTypes, discountPercent);
                  const isPickup = !!newPickup;
                  const belowMin = !isPickup && minDeliveryAmount !== null && total < minDeliveryAmount && total > 0;
                  const hasPrices = breadTypes.some(b => b.price != null);
                  // ponytail: belowMin used here AND in disabled prop below — keep in sync
                  return hasPrices ? (
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span style={{ fontSize: 13, color: "var(--text-subtle)" }}>Totaal (excl. BTW)</span>
                        <span style={{ fontSize: 16, fontWeight: 600 }}>€ {total.toFixed(2)}</span>
                      </div>
                      {discountPercent > 0 && (
                        <p style={{ fontSize: 11, color: "var(--success)", margin: "3px 0 0" }}>{discountPercent}% korting verwerkt</p>
                      )}
                      {belowMin && (
                        <p style={{ fontSize: 12, color: "var(--danger)", margin: "4px 0 0" }}>
                          Minimale bestelwaarde voor bezorging is € {minDeliveryAmount!.toFixed(2)}. Voeg meer toe of kies afhalen.
                        </p>
                      )}
                      {isPickup && minDeliveryAmount !== null && (
                        <p style={{ fontSize: 11, color: "var(--text-subtle)", margin: "3px 0 0" }}>Geen minimale bestelwaarde bij afhalen.</p>
                      )}
                    </div>
                  ) : null;
                })()}

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setShowNewOO(false); setDateError(""); setNewPickup(""); }} className="btn-secondary" style={{ fontSize: 13 }}>Annuleren</button>
                  <button onClick={createOO}
                    disabled={savingNew || !!dateError || !newDate || Object.values(newQty).every(v => v === 0) || (!newPickup && minDeliveryAmount !== null && calcBasketTotal(newQty, breadTypes, discountPercent) < minDeliveryAmount && calcBasketTotal(newQty, breadTypes, discountPercent) > 0)}
                    className="btn-primary" style={{ fontSize: 13 }}>
                    {savingNew ? "Plaatsen..." : "Bestelling plaatsen"}
                  </button>
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
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0, marginLeft: 12 }}>
                        {editable && timeLeft && <span style={{ fontSize: 11, color: "var(--success)" }}>{timeLeft}</span>}
                        {!editable && <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>Gesloten</span>}
                        {editable && !isEditing && (
                          <button onClick={() => startEditOO(order)} className="btn-secondary" style={{ fontSize: 11, padding: "4px 10px" }}>Wijzigen</button>
                        )}
                        {isEditing && (
                          <>
                            <button onClick={() => setEditingOOId(null)} className="btn-secondary" style={{ fontSize: 11 }}>Annuleer</button>
                            <button onClick={() => saveOO(order)} disabled={savingOO} className="btn-primary" style={{ fontSize: 11 }}>{savingOO ? "..." : "Opslaan"}</button>
                          </>
                        )}
                        {editable && !isEditing && (
                          <button onClick={() => deleteOO(order.id)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", color: "var(--danger)" }}>
                            Annuleren
                          </button>
                        )}
                      </div>
                    </div>
                    {isEditing && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Opmerkingen</label>
                          <input value={editOONotes} onChange={e => setEditOONotes(e.target.value)} style={inputStyle} placeholder="bijv. voor 9:00" />
                        </div>
                        <QtyGrid qty={editOOQty} onChange={setEditOOQty} breadTypes={breadTypes} discountPercent={discountPercent} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Deze week overzicht */}
          {(() => {
            const now = new Date();
            // Monday of current week
            const mon = new Date(now);
            mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
            mon.setHours(0,0,0,0);
            const sun = new Date(mon); sun.setDate(mon.getDate() + 6);

            // Collect items for each day this week
            const weekItems: { date: string; lines: { name: string; quantity: number }[]; source: "vast"|"eenmalig"; locked: boolean }[] = [];

            // Recurring orders active this week
            recurring.filter(o => o.active).forEach(o => {
              // Find the date this weekday falls in current week
              const d = new Date(mon); d.setDate(mon.getDate() + ((o.weekday - 1 + 7) % 7));
              const dateStr = d.toISOString().slice(0,10);
              // Only include if it's within this week
              if (d >= mon && d <= sun) {
                const skipped = o.exceptions.some(e => e.date === dateStr && !e.active);
                if (!skipped && o.lines.some(l => l.quantity > 0)) {
                  weekItems.push({
                    date: dateStr,
                    lines: o.lines.filter(l => l.quantity > 0).map(l => ({ name: l.breadType.name, quantity: l.quantity })),
                    source: "vast",
                    locked: !isEditable(dateStr),
                  });
                }
              }
            });

            // One-off orders this week
            upcoming.forEach(o => {
              const d = new Date(o.deliveryDate + "T12:00:00Z");
              if (d >= mon && d <= sun) {
                weekItems.push({
                  date: o.deliveryDate,
                  lines: o.lines.map(l => ({ name: l.breadType.name, quantity: l.quantity })),
                  source: "eenmalig",
                  locked: !isEditable(o.deliveryDate),
                });
              }
            });

            weekItems.sort((a,b) => a.date.localeCompare(b.date));
            if (weekItems.length === 0) return null;

            return (
              <section style={{ marginBottom: "2rem" }}>
                <h2 style={{ fontSize: 17, marginBottom: "0.75rem" }}>Deze week</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {weekItems.map((item, i) => (
                    <div key={i} className="card" style={{ padding: "0.75rem 1.25rem", display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ minWidth: 80 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>
                          {new Date(item.date+"T12:00:00Z").toLocaleDateString("nl-NL",{weekday:"short",day:"numeric",month:"short"})}
                        </p>
                        <span style={{ fontSize: 10, color: item.locked ? "var(--text-subtle)" : "var(--success)" }}>
                          {item.locked ? "gesloten" : timeUntilCutoff(item.date)}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", flex: 1 }}>
                        {item.lines.map((l,j) => (
                          <span key={j} style={{ fontSize: 12, background: "var(--accent-light)", color: "var(--accent)", padding: "2px 9px", borderRadius: 12 }}>
                            {shortName(l.name)} ×{l.quantity}
                          </span>
                        ))}
                      </div>
                      <span style={{ fontSize: 10, color: "var(--text-subtle)", flexShrink: 0 }}>
                        {item.source === "vast" ? "vast" : "eenmalig"}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })()}

          {/* Bestelhistorie */}
          {pastOrders.length > 0 && (
            <section>
              <button onClick={() => setShowLog(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 500, color: "var(--text)", padding: 0, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 8 }}>
                {showLog ? "▾" : "▸"} Bestelhistorie ({pastOrders.length})
              </button>
              {showLog && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {pastOrders.map(order => (
                    <div key={order.id} className="card" style={{ padding: "0.75rem 1rem", opacity: 0.8 }}>
                      <p style={{ fontWeight: 500, fontSize: 13, margin: "0 0 4px" }}>{formatDate(order.deliveryDate)}</p>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {order.lines.map(l => (
                          <span key={l.breadTypeId} style={{ fontSize: 11, background: "var(--surface-2)", color: "var(--text-subtle)", padding: "2px 8px", borderRadius: 10 }}>
                            {shortName(l.breadType.name)} x {l.quantity}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
