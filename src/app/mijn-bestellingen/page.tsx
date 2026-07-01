"use client";
import { useEffect, useRef, useState } from "react";
import { bakeryConfig } from "@/config/bakery.config";

const WEEKDAYS = ["","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];
const EMAIL_DEBOUNCE_MS = 10 * 60 * 1000;

const PICKUP_LOCATIONS = [
  ...bakeryConfig.shops.map(s => ({ id: s.name, label: s.name.replace("Winkel ", "") })),
  { id: "Ophalen Rotterdam", label: "Rotterdam (bakkerij)" },
];

type BreadType = { id: string; name: string; sortOrder: number; price: number | null; availableWeekdays: string | null; imageFile?: string | null };
type RecurringException = { date: string; active: boolean };
type RecurringLine = { breadTypeId: string; quantity: number; breadType: BreadType };
type RecurringOrder = { id: string; weekday: number; active: boolean; pickupLocation?: string | null; lines: RecurringLine[]; exceptions: RecurringException[] };
type OneOffOrder = {
  id: string; deliveryDate: string; notes: string | null; pickupLocation?: string | null;
  lines: { breadTypeId: string; quantity: number; breadType: BreadType }[];
};

function calcBasketTotal(qty: Record<string,number>, breadTypes: BreadType[], discountPercent: number): number {
  return breadTypes.reduce((sum, bt) => {
    const q = qty[bt.id] ?? 0;
    if (!q || !bt.price) return sum;
    return sum + bt.price * q * (1 - discountPercent / 100);
  }, 0);
}
function calcOrderTotal(order: OneOffOrder, discountPercent: number): number | null {
  const lines = order.lines;
  let total = 0, hasPrice = false;
  for (const l of lines) {
    if (l.breadType.price == null) continue;
    hasPrice = true;
    total += l.breadType.price * l.quantity * (1 - discountPercent / 100);
  }
  return hasPrice ? total : null;
}

// Cutoff = orderCutoffHour Amsterdam time on the day BEFORE delivery (DST-safe)
function cutoffDate(deliveryDateStr: string): Date {
  const prev = new Date(deliveryDateStr + "T12:00:00Z");
  prev.setUTCDate(prev.getUTCDate() - 1);
  const fmt = (tz: string) => parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(prev));
  const offsetHours = fmt("Europe/Amsterdam") - fmt("UTC");
  const d = new Date(prev);
  d.setUTCHours(bakeryConfig.orderCutoffHour - offsetHours, 0, 0, 0);
  return d;
}
function isEditable(deliveryDateStr: string): boolean {
  return new Date() < cutoffDate(deliveryDateStr);
}
function timeUntilCutoff(deliveryDateStr: string): string {
  const diff = cutoffDate(deliveryDateStr).getTime() - Date.now();
  if (diff <= 0) return "";
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000);
  if (h > 24) return `Aanpassen kan nog ${Math.floor(h / 24)} dag${Math.floor(h/24)>1?"en":""}`;
  if (h > 0) return `Aanpassen kan nog ${h}u ${m}m`;
  return `Aanpassen kan nog ${m} min`;
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
  "Baguette Kaas Peper": "Baguette-Kaas-Peper.jpg",
  "Baguette":            "Baquette.jpg",
  "Boeren":              "Boeren-1kg.jpg",
  "Choco koek":          "Choco-koek.jpg",
  "Gekiemde Rogge":      "Gekiemde-Rogge.jpg",
  "Kaneel Bun":          "Kaneel-Bun.jpg",
  "Kardemon Bun":        "Kardemon-Bun.jpg",
  "Morning Buns":        "Morning-Buns.jpg",
  "Morning buns":        "Morning-Buns.jpg",
  "Olijf":               "Olijf.jpg",
  "Rozijn":              "Rozijn.jpg",
  "Sesam":               "Sesam.jpg",
  "Spelt":               "Spelt.jpg",
  "Volkoren":            "Volkoren.jpg",
  "Zaden":               "Zaden.jpg",
};

// Returns [primaryUrl, fallbackUrl|null]. Primary = uploaded file by ID, fallback = name-map.
function breadImageUrls(bt: BreadType): [string, string | null] {
  const uploaded = `/brood/${bt.imageFile ?? (bt.id + ".jpg")}`;
  const name = bt.name;
  const fallback = BREAD_IMAGES[name]
    ?? BREAD_IMAGES[name.replace(/\s*\d[,.\d]*\s*(kg|KG|g|gr)\s*$/i, "").trim()]
    ?? null;
  return [uploaded, fallback ? `/brood/${fallback}` : null];
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
        const [imgPrimary, imgFallback] = breadImageUrls(bt);
        return (
          <div key={bt.id} style={{
            background: "var(--surface-2)", border: `1px solid ${qty[bt.id] ? "var(--accent)" : "var(--border)"}`,
            borderRadius: 10, overflow: "hidden", opacity: available ? 1 : 0.4,
            display: "flex", flexDirection: "column",
          }}>
            <img src={imgPrimary} alt={bt.name}
              style={{ width: "100%", height: 100, objectFit: "contain", background: "#f5f0eb", display: "block" }}
              onError={e => {
                const el = e.target as HTMLImageElement;
                if (imgFallback && el.src !== window.location.origin + imgFallback) { el.src = imgFallback; }
                else { el.style.display = "none"; }
              }}
            />
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
  const [editRecPickup, setEditRecPickup] = useState<string>("");
  const [savingRec, setSavingRec]       = useState(false);
  const [savedRecAppliesFrom, setSavedRecAppliesFrom] = useState<string | null>(null);

  // New recurring
  const [showNewRec, setShowNewRec]     = useState(false);
  const [newRecWeekday, setNewRecWeekday] = useState(1);
  const [newRecQty, setNewRecQty]       = useState<Record<string,number>>({});
  const [newRecPickup, setNewRecPickup] = useState<string>("");
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
  // Section toggle
  const [activeSection, setActiveSection] = useState<"eenmalig"|"vast"|null>(null);
  const [deliveryTimeMap, setDeliveryTimeMap] = useState<Record<string,string>>({});
  const [invoiceNumberMap, setInvoiceNumberMap] = useState<Record<string,string>>({});

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
        setDeliveryTimeMap(d.deliveryTimeMap ?? {});
        setInvoiceNumberMap(d.invoiceNumberMap ?? {});
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
    setEditRecQty(q); setEditRecPickup(o.pickupLocation ?? ""); setEditingRecId(o.id);
  }
  async function saveRec(o: RecurringOrder) {
    setSavingRec(true);
    const res = await fetch("/api/mijn/bestellingen", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recurringOrderId: o.id,
        lines: breadTypes.map(bt => ({ breadTypeId: bt.id, quantity: editRecQty[bt.id] ?? 0 })),
        pickupLocation: editRecPickup || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingRec(false); setEditingRecId(null); scheduleEmail(); load();
    if (data.appliesFrom) {
      setSavedRecAppliesFrom(data.appliesFrom);
      setTimeout(() => setSavedRecAppliesFrom(null), 8000);
    }
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
      body: JSON.stringify({
        weekday: newRecWeekday,
        lines: breadTypes.map(bt => ({ breadTypeId: bt.id, quantity: newRecQty[bt.id] ?? 0 })),
        pickupLocation: newRecPickup || undefined,
      }),
    });
    setSavingNewRec(false); setShowNewRec(false); setNewRecQty({}); setNewRecPickup(""); scheduleEmail(); load();
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
        Wijzigingen mogelijk tot 4:00 am de dag vóór bezorging.
      </p>

      {loading && <p style={{ color: "var(--text-subtle)" }}>Laden...</p>}

      {!loading && (
        <>
          {/* ── Deze week ── */}
          {(() => {
            const todayUTC = new Date().toISOString().slice(0,10);
            const isoDay = jsWeekdayToISO(new Date());
            const monStr = (() => { const d = new Date(todayUTC+"T12:00:00Z"); d.setUTCDate(d.getUTCDate() - (isoDay - 1)); return d.toISOString().slice(0,10); })();
            const sunStr = (() => { const d = new Date(monStr+"T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 6); return d.toISOString().slice(0,10); })();

            type WeekItem = { date: string; lines: { name: string; quantity: number; price: number | null }[]; source: "vast"|"eenmalig"; locked: boolean; pickup: string | null };
            const weekItems: WeekItem[] = [];

            recurring.filter(o => o.active).forEach(o => {
              const d = new Date(monStr+"T12:00:00Z");
              d.setUTCDate(d.getUTCDate() + ((o.weekday - 1 + 7) % 7));
              const dateStr = d.toISOString().slice(0,10);
              if (dateStr >= monStr && dateStr <= sunStr) {
                const skipped = o.exceptions.some(e => e.date === dateStr && !e.active);
                if (!skipped && o.lines.some(l => l.quantity > 0)) {
                  weekItems.push({
                    date: dateStr,
                    lines: o.lines.filter(l => l.quantity > 0).map(l => ({ name: l.breadType.name, quantity: l.quantity, price: l.breadType.price })),
                    source: "vast", locked: !isEditable(dateStr), pickup: null,
                  });
                }
              }
            });
            upcoming.forEach(o => {
              if (o.deliveryDate >= monStr && o.deliveryDate <= sunStr) {
                weekItems.push({
                  date: o.deliveryDate,
                  lines: o.lines.map(l => ({ name: l.breadType.name, quantity: l.quantity, price: l.breadType.price })),
                  source: "eenmalig", locked: !isEditable(o.deliveryDate),
                  pickup: o.pickupLocation ?? null,
                });
              }
            });
            weekItems.sort((a,b) => a.date.localeCompare(b.date));
            if (weekItems.length === 0) return null;

            return (
              <section style={{ marginBottom: "2rem" }}>
                <h2 style={{ fontSize: 17, marginBottom: "0.75rem" }}>Deze week</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {weekItems.map((item, i) => {
                    const total = item.lines.reduce((s, l) => l.price != null ? s + l.price * l.quantity * (1 - discountPercent/100) : s, 0);
                    const hasPrice = item.lines.some(l => l.price != null);
                    return (
                      <div key={i} className="card" style={{ padding: "0.75rem 1.25rem", display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ minWidth: 80 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>
                            {new Date(item.date+"T12:00:00Z").toLocaleDateString("nl-NL",{weekday:"short",day:"numeric",month:"short"})}
                          </p>
                          <span style={{ fontSize: 10, color: item.locked ? "var(--danger)" : "var(--success)" }}>
                            {item.locked ? "Aanpassen niet meer mogelijk" : timeUntilCutoff(item.date)}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", flex: 1 }}>
                          {item.lines.map((l,j) => (
                            <span key={j} style={{ fontSize: 12, background: "var(--accent-light)", color: "var(--accent)", padding: "2px 9px", borderRadius: 12 }}>
                              {shortName(l.name)} ×{l.quantity}
                            </span>
                          ))}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                          <span style={{ fontSize: 10, color: "var(--text-subtle)" }}>{item.source === "vast" ? "vast" : "eenmalig"}</span>
                          {item.pickup
                            ? <span style={{ fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 6 }}>🏪 {item.pickup.replace("Winkel ","")}</span>
                            : <span style={{ fontSize: 10, color: "var(--text-subtle)" }}>🚚 bezorgen</span>
                          }
                          {hasPrice && total > 0 && <span style={{ fontSize: 11, fontWeight: 500 }}>€ {total.toFixed(2).replace(".",",")} excl. BTW</span>}
                          {!item.pickup && minDeliveryAmount != null && hasPrice && total > 0 && total < minDeliveryAmount && (
                            <span style={{ fontSize: 10, color: "#b45309", background: "#fef3c7", padding: "1px 6px", borderRadius: 6 }}>
                              ⚠ min. € {minDeliveryAmount.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })()}

          {/* ── Section toggle buttons ── */}
          <div style={{ display: "flex", gap: 10, marginBottom: "1.5rem" }}>
            <button
              onClick={() => setActiveSection(s => s === "eenmalig" ? null : "eenmalig")}
              className={activeSection === "eenmalig" ? "btn-primary" : "btn-secondary"}
              style={{ flex: 1, fontSize: 13, padding: "10px 0" }}
            >
              Eenmalige bestellingen
            </button>
            <button
              onClick={() => setActiveSection(s => s === "vast" ? null : "vast")}
              className={activeSection === "vast" ? "btn-primary" : "btn-secondary"}
              style={{ flex: 1, fontSize: 13, padding: "10px 0" }}
            >
              Vaste bestellingen
            </button>
          </div>

          {/* Vaste bestellingen */}
          {activeSection === "vast" && <section style={{ marginBottom: "2rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <h2 style={{ fontSize: 17, margin: 0 }}>Vaste bestellingen</h2>
              {availableWeekdays.length > 0 && (
                <button onClick={() => { setNewRecWeekday(availableWeekdays[0]); setShowNewRec(true); }} className="btn-secondary" style={{ fontSize: 12 }}>
                  + Dag toevoegen
                </button>
              )}
            </div>

            {savedRecAppliesFrom && (
              <p style={{ fontSize: 12, color: "#92400e", background: "#fef3c7", padding: "8px 12px", borderRadius: 8, margin: "0 0 0.75rem" }}>
                ✓ Opgeslagen. De eerstvolgende bezorging was al vergrendeld en blijft ongewijzigd — de aanpassing gaat in vanaf {new Date(savedRecAppliesFrom+"T12:00:00Z").toLocaleDateString("nl-NL",{day:"numeric",month:"short"})}.
              </p>
            )}

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
                        {order.active && !editable && <span style={{ fontSize: 11, color: "#b45309" }}>Wijzigingen gelden vanaf volgende week</span>}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {order.active && !isEditing && (
                          <button onClick={() => startEditRec(order)} className="btn-secondary" style={{ fontSize: 11, padding: "4px 10px" }}>Wijzigen</button>
                        )}
                        {isEditing && (
                          <>
                            <button onClick={() => setEditingRecId(null)} className="btn-secondary" style={{ fontSize: 11 }}>Annuleer</button>
                            <button onClick={() => saveRec(order)} disabled={savingRec || (!editRecPickup && minDeliveryAmount !== null && calcBasketTotal(editRecQty, breadTypes, discountPercent) < minDeliveryAmount && calcBasketTotal(editRecQty, breadTypes, discountPercent) > 0)} className="btn-primary" style={{ fontSize: 11 }}>{savingRec ? "..." : "Opslaan"}</button>
                          </>
                        )}
                        {editable && (
                          <>
                            <button onClick={() => toggleRecActive(order)} className="btn-secondary" style={{ fontSize: 11, padding: "4px 10px", color: order.active ? "var(--text-subtle)" : "var(--success)" }}>
                              {order.active ? "Pauzeer" : "Hervatten"}
                            </button>
                            <button onClick={() => deleteRec(order.id)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "none", color: "var(--danger)", cursor: "pointer" }}>
                              Verwijder
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {!isEditing && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                        {order.lines.filter(l => l.quantity > 0).map(l => (
                          <span key={l.breadTypeId} style={{ fontSize: 12, background: "var(--accent-light)", color: "var(--accent)", padding: "3px 10px", borderRadius: 12 }}>
                            {shortName(l.breadType.name)} x {l.quantity}
                          </span>
                        ))}
                        {order.lines.length === 0 && <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>Geen producten</span>}
                        {order.pickupLocation && (
                          <span style={{ fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 6 }}>🏪 {order.pickupLocation.replace("Winkel ","")}</span>
                        )}
                        {(() => {
                          const t = order.lines.filter(l => l.quantity > 0).reduce((s, l) => l.breadType.price != null ? s + l.breadType.price * l.quantity * (1 - discountPercent/100) : s, 0);
                          const hasPrice = order.lines.some(l => l.breadType.price != null);
                          const belowMin = !order.pickupLocation && hasPrice && t > 0 && minDeliveryAmount !== null && t < minDeliveryAmount;
                          return hasPrice && t > 0 ? <>
                            <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>€ {t.toFixed(2).replace(".",",")}</span>
                            {belowMin && <span style={{ fontSize: 10, color: "#b45309", background: "#fef3c7", padding: "1px 6px", borderRadius: 6 }}>⚠ min. € {minDeliveryAmount!.toFixed(2)}</span>}
                          </> : null;
                        })()}
                      </div>
                    )}

                    {isEditing && <>
                      <QtyGrid qty={editRecQty} onChange={setEditRecQty} breadTypes={breadTypes} discountPercent={discountPercent} />
                      <div style={{ marginTop: 10 }}>
                        <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Bezorging of afhalen?</label>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {[{ id: "", label: "Bezorgen", icon: "🚚" }, ...PICKUP_LOCATIONS.map(l => ({ id: l.id, label: l.label, icon: "🏪" }))].map(loc => {
                            const active = editRecPickup === loc.id;
                            return (
                              <button key={loc.id} type="button" onClick={() => setEditRecPickup(loc.id)}
                                style={{
                                  display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12,
                                  border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                                  background: active ? "var(--accent-light)" : "var(--surface-2)",
                                  color: active ? "var(--accent)" : "var(--text)",
                                }}>
                                <span>{loc.icon}</span> {loc.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {(() => {
                        const t = calcBasketTotal(editRecQty, breadTypes, discountPercent);
                        const isPickup = !!editRecPickup;
                        return !isPickup && minDeliveryAmount !== null && t > 0 && t < minDeliveryAmount
                          ? <p style={{ fontSize: 12, color: "var(--danger)", margin: "8px 0 0" }}>Minimale bestelwaarde voor bezorging is € {minDeliveryAmount.toFixed(2)}. Voeg meer toe, kies afhalen, of neem contact op met de bakkerij.</p>
                          : null;
                      })()}
                      {thisWeekLocked && (
                        <p style={{ fontSize: 12, color: "#92400e", background: "#fef3c7", padding: "8px 10px", borderRadius: 6, margin: "8px 0 0" }}>
                          De deadline voor de eerstvolgende bezorging ({new Date(next+"T12:00:00Z").toLocaleDateString("nl-NL",{day:"numeric",month:"short"})}) is al verstreken — die bezorging blijft ongewijzigd.
                          Deze wijziging gaat in vanaf {nextEditable ? new Date(nextEditable+"T12:00:00Z").toLocaleDateString("nl-NL",{day:"numeric",month:"short"}) : "volgende week"}.
                        </p>
                      )}
                    </>}

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
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Bezorging of afhalen?</label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[{ id: "", label: "Bezorgen", icon: "🚚" }, ...PICKUP_LOCATIONS.map(l => ({ id: l.id, label: l.label, icon: "🏪" }))].map(loc => {
                        const active = newRecPickup === loc.id;
                        return (
                          <button key={loc.id} type="button" onClick={() => setNewRecPickup(loc.id)}
                            style={{
                              display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12,
                              border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                              background: active ? "var(--accent-light)" : "var(--surface-2)",
                              color: active ? "var(--accent)" : "var(--text)",
                            }}>
                            <span>{loc.icon}</span> {loc.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {(() => {
                    const t = calcBasketTotal(newRecQty, breadTypes, discountPercent);
                    const isPickup = !!newRecPickup;
                    return !isPickup && minDeliveryAmount !== null && t > 0 && t < minDeliveryAmount
                      ? <p style={{ fontSize: 12, color: "var(--danger)", margin: 0 }}>Minimale bestelwaarde voor bezorging is € {minDeliveryAmount.toFixed(2)}. Voeg meer toe, kies afhalen, of neem contact op met de bakkerij.</p>
                      : null;
                  })()}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setShowNewRec(false); setNewRecPickup(""); }} className="btn-secondary" style={{ fontSize: 13 }}>Annuleren</button>
                    <button onClick={createRec} disabled={savingNewRec || (!newRecPickup && minDeliveryAmount !== null && calcBasketTotal(newRecQty, breadTypes, discountPercent) < minDeliveryAmount && calcBasketTotal(newRecQty, breadTypes, discountPercent) > 0)} className="btn-primary" style={{ fontSize: 13 }}>{savingNewRec ? "Opslaan..." : "Vaste bestelling toevoegen"}</button>
                  </div>
                </div>
              )}
            </div>
          </section>}

          {/* Eenmalige bestellingen */}
          {activeSection === "eenmalig" && <section style={{ marginBottom: "2rem" }}>
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
                  <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Bezorging of afhalen?</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[{ id: "", label: "Bezorgen", icon: "🚚", sub: "Thuisbezorgd" }, ...PICKUP_LOCATIONS.map(l => ({ id: l.id, label: l.label, icon: "🏪", sub: "Gratis afhalen" }))].map(loc => {
                      const active = newPickup === loc.id;
                      return (
                        <button key={loc.id} type="button" onClick={() => setNewPickup(loc.id)}
                          style={{
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                            padding: "10px 14px", borderRadius: 10, cursor: "pointer", minWidth: 80,
                            border: `2px solid ${active ? "var(--accent)" : "var(--border)"}`,
                            background: active ? "var(--accent-light)" : "var(--surface-2)",
                            color: active ? "var(--accent)" : "var(--text)",
                          }}>
                          <span style={{ fontSize: 22 }}>{loc.icon}</span>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{loc.label}</span>
                          <span style={{ fontSize: 10, color: active ? "var(--accent)" : "var(--text-subtle)" }}>{loc.sub}</span>
                        </button>
                      );
                    })}
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
                const orderTotal = calcOrderTotal(order, discountPercent);
                return (
                  <div key={order.id} className="card" style={{ padding: "1rem 1.25rem" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: isEditing ? 12 : 0 }}>
                      <div>
                        <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 2px" }}>{formatDate(order.deliveryDate)}</p>
                        {order.notes && <p style={{ fontSize: 12, color: "var(--text-subtle)", margin: "0 0 6px" }}>{order.notes}</p>}
                        {!isEditing && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                            {order.lines.map(l => (
                              <span key={l.breadTypeId} style={{ fontSize: 12, background: "var(--accent-light)", color: "var(--accent)", padding: "3px 10px", borderRadius: 12 }}>
                                {shortName(l.breadType.name)} x {l.quantity}
                              </span>
                            ))}
                            {order.pickupLocation
                              ? <span style={{ fontSize: 11, background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: 10 }}>🏪 {order.pickupLocation.replace("Winkel ","")}</span>
                              : <span style={{ fontSize: 11, background: "var(--surface-2)", color: "var(--text-subtle)", padding: "2px 8px", borderRadius: 10 }}>🚚 bezorgen</span>
                            }
                            {orderTotal != null && <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>€ {orderTotal.toFixed(2).replace(".",",")} excl. BTW</span>}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0, marginLeft: 12 }}>
                        {editable && timeLeft && <span style={{ fontSize: 11, color: "var(--success)" }}>{timeLeft}</span>}
                        {!editable && <span style={{ fontSize: 11, color: "var(--danger)" }}>Aanpassen niet meer mogelijk</span>}
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
          </section>}

          {/* Bestelhistorie */}
          {pastOrders.length > 0 && (
            <section>
              <button onClick={() => setShowLog(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 500, color: "var(--text)", padding: 0, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 8 }}>
                {showLog ? "▾" : "▸"} Bestelhistorie ({pastOrders.length})
              </button>
              {showLog && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {pastOrders.map(order => {
                    const pastTotal = calcOrderTotal(order, discountPercent);
                    const deliveredAt = deliveryTimeMap[order.deliveryDate];
                    const invNr = invoiceNumberMap[order.id];
                    return (
                      <div key={order.id} className="card" style={{ padding: "0.75rem 1rem", opacity: 0.8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <p style={{ fontWeight: 500, fontSize: 13, margin: "0 0 4px" }}>{formatDate(order.deliveryDate)}</p>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                            {order.pickupLocation
                              ? <span style={{ fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 8 }}>🏪 {order.pickupLocation.replace("Winkel ","")}</span>
                              : <span style={{ fontSize: 10, color: "var(--text-subtle)" }}>🚚</span>
                            }
                            {deliveredAt && <span style={{ fontSize: 10, color: "var(--success)" }}>✓ {deliveredAt}</span>}
                            {invNr && <span style={{ fontSize: 10, color: "var(--text-subtle)" }}>📄 {invNr}</span>}
                            {pastTotal != null && <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>€ {pastTotal.toFixed(2).replace(".",",")}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          {order.lines.map(l => (
                            <span key={l.breadTypeId} style={{ fontSize: 11, background: "var(--surface-2)", color: "var(--text-subtle)", padding: "2px 8px", borderRadius: 10 }}>
                              {shortName(l.breadType.name)} x {l.quantity}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
