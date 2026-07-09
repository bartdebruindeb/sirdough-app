"use client";
import { useEffect, useRef, useState } from "react";
import { bakeryConfig } from "@/config/bakery.config";
import { breadImageUrls } from "@/lib/breadImage";
import { LocationMap } from "./LocationMap";

const WEEKDAYS = ["","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];
const EMAIL_DEBOUNCE_MS = 10 * 60 * 1000;

// Pickup locations (shop + bakery) come from the API (src/app/api/mijn/bestellingen),
// which reads the real shop addresses off their Customer records — so when the owner
// edits a shop's address/KvK in Klanten, the order form and map pick it up automatically.
type PickupLocation = { id: string; label: string; lat: number; lng: number; address: string | null };

type BreadType = { id: string; name: string; sortOrder: number; price: number | null; availableWeekdays: string | null; imageFile?: string | null };
type RecurringException = { date: string; active: boolean };
type RecurringLine = { breadTypeId: string; quantity: number; breadType: BreadType };
type RecurringOrder = { id: string; weekday: number; active: boolean; pickupLocation?: string | null; notes?: string | null; lines: RecurringLine[]; exceptions: RecurringException[] };
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

// Calendar date picker: available dates are highlighted and clickable, everything else
// (past, closed weekday, deadline passed) is dimmed and disabled. Weekend days are styled
// exactly like weekdays — availability comes only from isAvailable, no weekend rule.
const DOW = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
function OrderDatePicker({ value, onChange, isAvailable }: {
  value: string;
  onChange: (d: string) => void;
  isAvailable: (dateStr: string) => boolean;
}) {
  const todayMonth = new Date().toISOString().slice(0, 7);
  const [view, setView] = useState<string>(() => (value ? value.slice(0, 7) : todayMonth));
  const [y, m] = view.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay() || 7; // 1=Mon..7=Sun
  const cells: (number | null)[] = [...Array(firstDow - 1).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("nl-NL", { month: "long", year: "numeric", timeZone: "UTC" });
  const canPrev = view > todayMonth;
  const shift = (delta: number) => setView(new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7));

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, background: "var(--surface)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button type="button" onClick={() => canPrev && shift(-1)} disabled={!canPrev} className="btn-secondary" style={{ fontSize: 12, padding: "3px 9px", opacity: canPrev ? 1 : 0.4 }}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>{monthLabel}</span>
        <button type="button" onClick={() => shift(1)} className="btn-secondary" style={{ fontSize: 12, padding: "3px 9px" }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {DOW.map(d => <div key={d} style={{ textAlign: "center", fontSize: 10, color: "var(--text-subtle)", padding: "2px 0" }}>{d}</div>)}
        {cells.map((day, i) => {
          if (day === null) return <div key={`b${i}`} />;
          const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const available = isAvailable(dateStr);
          const selected = dateStr === value;
          return (
            <button key={dateStr} type="button" disabled={!available} onClick={() => onChange(dateStr)}
              style={{
                aspectRatio: "1", borderRadius: 7, fontSize: 13, cursor: available ? "pointer" : "default",
                border: selected ? "2px solid var(--accent)" : "1px solid transparent",
                background: selected ? "var(--accent)" : available ? "var(--accent-light)" : "transparent",
                color: selected ? "#fff" : available ? "var(--accent)" : "var(--text-subtle)",
                opacity: available ? 1 : 0.35, fontWeight: available ? 600 : 400,
              }}>
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Delivery/pickup chooser with a map below it: click a location and the map
// re-renders that spot's geolocation + address, with a link out to Google Maps.
// Stacked vertically (buttons, then map) so the form reads top-to-bottom instead
// of side-by-side. Used in every order form (new/edit one-off, new/edit recurring).
function PickupAndMap({ value, onChange, options, mapTarget }: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  mapTarget: (pickup: string) => { lat: number; lng: number; label: string } | null;
}) {
  const t = mapTarget(value);
  return (
    <div>
      <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Bezorging of afhalen?</label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[{ id: "", label: "Bezorgen" }, ...options].map(loc => {
          const active = value === loc.id;
          return (
            <button key={loc.id} type="button" onClick={() => onChange(loc.id)}
              style={{
                display: "flex", alignItems: "center", gap: 4, padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12,
                border: `2px solid ${active ? "var(--accent)" : "var(--border)"}`,
                background: active ? "var(--accent-light)" : "var(--surface-2)",
                color: active ? "var(--accent)" : "var(--text)",
              }}>
              <span>{loc.id ? "🏪" : "🚚"}</span> {loc.label}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 10 }}>
        {t ? (
          <>
            <LocationMap lat={t.lat} lng={t.lng} label={t.label} />
            <p style={{ fontSize: 11, color: "var(--text-subtle)", margin: "5px 0 0", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span>📍 {t.label}</span>
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${t.lat},${t.lng}`)}`}
                target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                Bekijk op Google Maps ↗
              </a>
            </p>
          </>
        ) : !value ? (
          <p style={{ fontSize: 11, color: "var(--text-subtle)", margin: 0 }}>Bezorgadres nog niet ingesteld — neem contact op met de bakkerij.</p>
        ) : null}
      </div>
    </div>
  );
}

// The order forms (with the full bread-product picture grid) are tall, so they open in
// a centered popup instead of pushing the week overview down the page. Click the dimmed
// backdrop or the × to close; each caller passes its own reset as onClose.
function FormModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(28,16,9,0.5)", zIndex: 60, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: "100%", maxWidth: 640, margin: "2rem 0", padding: "1.5rem", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{title}</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, lineHeight: 1, cursor: "pointer", color: "var(--text-subtle)" }}>×</button>
        </div>
        {children}
      </div>
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
  const [editRecNotes, setEditRecNotes] = useState("");
  const [savingRec, setSavingRec]       = useState(false);
  const [savedRecAppliesFrom, setSavedRecAppliesFrom] = useState<string | null>(null);
  const [editRecError, setEditRecError] = useState("");

  // New recurring
  const [showNewRec, setShowNewRec]     = useState(false);
  const [newRecWeekday, setNewRecWeekday] = useState(1);
  const [newRecQty, setNewRecQty]       = useState<Record<string,number>>({});
  const [newRecPickup, setNewRecPickup] = useState<string>("");
  const [newRecNotes, setNewRecNotes]   = useState("");
  const [savingNewRec, setSavingNewRec] = useState(false);
  const [newRecError, setNewRecError]   = useState("");

  // One-off edit
  const [editingOOId, setEditingOOId]   = useState<string | null>(null);
  const [editOOQty, setEditOOQty]       = useState<Record<string,number>>({});
  const [editOONotes, setEditOONotes]   = useState("");
  const [editOOPickup, setEditOOPickup] = useState<string>("");
  const [savingOO, setSavingOO]         = useState(false);
  const [editOOError, setEditOOError]   = useState("");

  // New one-off
  const [showNewOO, setShowNewOO]       = useState(false);
  const [newDate, setNewDate]           = useState("");
  const [newQty, setNewQty]             = useState<Record<string,number>>({});
  const [newNotes, setNewNotes]         = useState("");
  const [savingNew, setSavingNew]       = useState(false);
  const [dateError, setDateError]       = useState("");
  const [newOOError, setNewOOError]     = useState("");

  // New one-off: pickup
  const [newPickup, setNewPickup]       = useState<string>(""); // "" = delivery, else location id

  // Past log
  const [showLog, setShowLog]           = useState(false);
  // Section toggle
  const [activeSection, setActiveSection] = useState<"eenmalig"|"vast"|null>(null);
  const [showChooser, setShowChooser]   = useState(false);
  // Delivery address (for the order-form map)
  const [delivery, setDelivery]         = useState<{ lat: number | null; lng: number | null; label: string }>({ lat: null, lng: null, label: "" });
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [deliveryTimeMap, setDeliveryTimeMap] = useState<Record<string,string>>({});
  const [invoiceNumberMap, setInvoiceNumberMap] = useState<Record<string,string>>({});
  // Week overview scroller — 0 = this week, -1 = last week, +1 = next week, etc.
  const [weekOffset, setWeekOffset] = useState(0);

  // This login's own restaurant locations (separate KvK/invoice each) — shown as
  // buttons above "Deze week" so switching which one's orders you're viewing/placing
  // is a single click. Managing them (adding, editing KvK/address) lives on Mijn account.
  const [myLocations, setMyLocations] = useState<{ id: string; name: string; city: string | null }[]>([]);
  const [activeLocation, setActiveLocation] = useState("");

  useEffect(() => {
    fetch("/api/mijn/locations").then(r => r.json()).then(d => {
      setMyLocations(d.locations ?? []);
      setActiveLocation(d.selected ?? "");
    }).catch(() => {});
  }, []);

  // Switch which location's orders are shown: persist the choice in a cookie (the
  // server validates it against this login's own locations — see mijnCustomer.ts)
  // and reload so every section on the page refetches scoped to it.
  function switchLocation(id: string) {
    if (id === activeLocation) return;
    document.cookie = `mijn_location=${id}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  }

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
        setDelivery({ lat: d.deliveryLat ?? null, lng: d.deliveryLng ?? null, label: d.deliveryLabel ?? "" });
        setPickupLocations(d.pickupLocations ?? []);
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
    setEditRecQty(q); setEditRecPickup(o.pickupLocation ?? ""); setEditRecNotes(o.notes ?? ""); setEditRecError(""); setEditingRecId(o.id);
  }
  async function saveRec(o: RecurringOrder) {
    // Checked only at the moment of saving, not continuously while adjusting the
    // basket — the message should disappear the instant it no longer applies, not
    // linger as a standing warning.
    const isPickup = !!editRecPickup;
    const total = calcBasketTotal(editRecQty, breadTypes, discountPercent);
    if (!isPickup && minDeliveryAmount !== null && total > 0 && total < minDeliveryAmount) {
      setEditRecError(`Bestelling is lager dan de minimale bestelwaarde (€ ${minDeliveryAmount.toFixed(2)}) voor bezorging.`);
      return;
    }
    setEditRecError("");
    setSavingRec(true);
    const res = await fetch("/api/mijn/bestellingen", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recurringOrderId: o.id,
        lines: breadTypes.map(bt => ({ breadTypeId: bt.id, quantity: editRecQty[bt.id] ?? 0 })),
        pickupLocation: editRecPickup || null,
        notes: editRecNotes || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingRec(false);
    if (!res.ok) { setEditRecError(data.message ?? "Opslaan mislukt."); return; }
    setEditingRecId(null); scheduleEmail(); load();
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
    const isPickup = !!newRecPickup;
    const total = calcBasketTotal(newRecQty, breadTypes, discountPercent);
    if (!isPickup && minDeliveryAmount !== null && total > 0 && total < minDeliveryAmount) {
      setNewRecError(`Bestelling is lager dan de minimale bestelwaarde (€ ${minDeliveryAmount.toFixed(2)}) voor bezorging.`);
      return;
    }
    setNewRecError("");
    setSavingNewRec(true);
    const res = await fetch("/api/mijn/bestellingen", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekday: newRecWeekday,
        lines: breadTypes.map(bt => ({ breadTypeId: bt.id, quantity: newRecQty[bt.id] ?? 0 })),
        pickupLocation: newRecPickup || undefined,
        notes: newRecNotes || undefined,
      }),
    });
    setSavingNewRec(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setNewRecError(d.message ?? "Opslaan mislukt."); return; }
    setShowNewRec(false); setNewRecQty({}); setNewRecPickup(""); setNewRecNotes(""); scheduleEmail(); load();
  }

  // One-off
  function startEditOO(o: OneOffOrder) {
    const q: Record<string,number> = {};
    o.lines.forEach(l => { q[l.breadTypeId] = l.quantity; });
    setEditOOQty(q); setEditOONotes(o.notes ?? ""); setEditOOPickup(o.pickupLocation ?? "");
    setEditOOError(""); setEditingOOId(o.id);
  }
  async function saveOO(o: OneOffOrder) {
    // Same minimum-delivery rule as placing a new order — editing a delivery order
    // down below the minimum must be blocked here too, not just on create. The server
    // enforces this regardless (real trust boundary); this is just the fast client check.
    const isPickup = !!editOOPickup;
    const total = calcBasketTotal(editOOQty, breadTypes, discountPercent);
    if (!isPickup && minDeliveryAmount !== null && total > 0 && total < minDeliveryAmount) {
      setEditOOError(`Bestelling is lager dan de minimale bestelwaarde (€ ${minDeliveryAmount.toFixed(2)}) voor bezorging.`);
      return;
    }
    setEditOOError("");
    setSavingOO(true);
    const res = await fetch("/api/mijn/bestellingen", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: o.id, notes: editOONotes || undefined, pickupLocation: editOOPickup || null,
        lines: breadTypes.map(bt => ({ breadTypeId: bt.id, quantity: editOOQty[bt.id] ?? 0 })).filter(l => l.quantity > 0),
      }),
    });
    setSavingOO(false);
    if (res.ok) { setEditingOOId(null); scheduleEmail(); load(); }
    else { const d = await res.json().catch(() => ({})); setEditOOError(d.message ?? "Opslaan mislukt."); }
  }
  async function deleteOO(id: string) {
    if (!confirm("Bestelling annuleren?")) return;
    await fetch(`/api/mijn/bestellingen?id=${id}`, { method: "DELETE" });
    load();
  }
  async function createOO() {
    const err = validateDate(newDate);
    if (err || !newDate || Object.values(newQty).every(v => v === 0)) return;
    // Checked only at the moment of placing the order, not continuously while adjusting
    // the basket — the message should disappear the instant it no longer applies.
    const isPickup = !!newPickup;
    const total = calcBasketTotal(newQty, breadTypes, discountPercent);
    if (!isPickup && minDeliveryAmount !== null && total > 0 && total < minDeliveryAmount) {
      setNewOOError(`Bestelling is lager dan de minimale bestelwaarde (€ ${minDeliveryAmount.toFixed(2)}) voor bezorging.`);
      return;
    }
    setNewOOError("");
    setSavingNew(true);
    const res = await fetch("/api/mijn/bestellingen", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deliveryDate: newDate,
        notes: newNotes || undefined,
        pickupLocation: newPickup || undefined,
        lines: Object.entries(newQty).filter(([,q]) => q > 0).map(([breadTypeId, quantity]) => ({ breadTypeId, quantity: quantity as number })),
      }),
    });
    setSavingNew(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setNewOOError(d.message ?? "Opslaan mislukt."); return; }
    setShowNewOO(false); setNewQty({}); setNewNotes(""); setNewPickup(""); setDateError(""); scheduleEmail(); load();
  }

  // Where an order goes, for the form map: a pickup shop (its real address, from the
  // owner-edited Customer record) or, for delivery (pickup === ""), the account's own
  // geocoded address. null when we have no coords.
  function mapTargetFor(pickup: string): { lat: number; lng: number; label: string } | null {
    if (pickup) {
      const loc = pickupLocations.find(l => l.id === pickup);
      return loc ? { lat: loc.lat, lng: loc.lng, label: loc.address ?? loc.label } : null;
    }
    if (delivery.lat != null && delivery.lng != null) return { lat: delivery.lat, lng: delivery.lng, label: delivery.label || "Bezorgadres" };
    return null;
  }
  const pickupOptions = pickupLocations.map(l => ({ id: l.id, label: l.label }));

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
        Wijzigingen mogelijk tot 4:00 AM de dag vóór bezorging.
      </p>

      {loading && <p style={{ color: "var(--text-subtle)" }}>Laden...</p>}

      {!loading && (
        <>
          {/* ── Locatie kiezen (alleen als er meer dan één is) ── */}
          {myLocations.length > 1 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "1.25rem" }}>
              {myLocations.map(loc => {
                const active = loc.id === activeLocation;
                return (
                  <button key={loc.id} onClick={() => switchLocation(loc.id)}
                    style={{
                      fontSize: 13, padding: "7px 14px", borderRadius: 8, cursor: "pointer",
                      border: `2px solid ${active ? "var(--accent)" : "var(--border)"}`,
                      background: active ? "var(--accent-light)" : "var(--surface-2)",
                      color: active ? "var(--accent)" : "var(--text)",
                      fontWeight: active ? 600 : 400,
                    }}>
                    {loc.name}{loc.city ? ` — ${loc.city}` : ""}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Weekoverzicht (scrollbaar) ── */}
          {(() => {
            const todayUTC = new Date().toISOString().slice(0,10);
            const isoDay = jsWeekdayToISO(new Date());
            const thisMonStr = (() => { const d = new Date(todayUTC+"T12:00:00Z"); d.setUTCDate(d.getUTCDate() - (isoDay - 1)); return d.toISOString().slice(0,10); })();
            const monStr = (() => { const d = new Date(thisMonStr+"T12:00:00Z"); d.setUTCDate(d.getUTCDate() + weekOffset*7); return d.toISOString().slice(0,10); })();
            const sunStr = (() => { const d = new Date(monStr+"T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 6); return d.toISOString().slice(0,10); })();
            // Show the full Mon–Sun range for every week, including the current one — past
            // days now show their real delivery status/deviation note instead of just hiding.
            const showFrom = monStr;

            type WeekItem = { date: string; lines: { name: string; quantity: number; price: number | null }[]; source: "vast"|"eenmalig"; locked: boolean; pickup: string | null; deviationNote: string | null };
            const weekItems: WeekItem[] = [];

            // A recurring delivery that got adjusted by the driver (see the pakbon flow in
            // Bezorgen) is recorded as a real OneOffOrder with a deviation note — once that
            // exists for a date, it reflects reality better than the plain computed
            // occurrence, so skip the computed one for that date.
            const oneOffDates = new Set([...upcoming, ...pastOrders].map(o => o.deliveryDate));

            recurring.filter(o => o.active).forEach(o => {
              const d = new Date(monStr+"T12:00:00Z");
              d.setUTCDate(d.getUTCDate() + ((o.weekday - 1 + 7) % 7));
              const dateStr = d.toISOString().slice(0,10);
              if (dateStr >= showFrom && dateStr <= sunStr && !oneOffDates.has(dateStr)) {
                const skipped = o.exceptions.some(e => e.date === dateStr && !e.active);
                if (!skipped && o.lines.some(l => l.quantity > 0)) {
                  weekItems.push({
                    date: dateStr,
                    lines: o.lines.filter(l => l.quantity > 0).map(l => ({ name: l.breadType.name, quantity: l.quantity, price: l.breadType.price })),
                    source: "vast", locked: !isEditable(dateStr), pickup: null, deviationNote: null,
                  });
                }
              }
            });
            [...upcoming, ...pastOrders].forEach(o => {
              if (o.deliveryDate >= showFrom && o.deliveryDate <= sunStr) {
                weekItems.push({
                  date: o.deliveryDate,
                  lines: o.lines.map(l => ({ name: l.breadType.name, quantity: l.quantity, price: l.breadType.price })),
                  source: "eenmalig", locked: !isEditable(o.deliveryDate),
                  pickup: o.pickupLocation ?? null,
                  deviationNote: o.notes && o.notes.startsWith("Afwijking bezorging") ? o.notes : null,
                });
              }
            });
            weekItems.sort((a,b) => a.date.localeCompare(b.date));

            const weekLabel = weekOffset === 0 ? "Deze week" : weekOffset === -1 ? "Vorige week" : weekOffset === 1 ? "Volgende week"
              : `${new Date(monStr+"T12:00:00Z").toLocaleDateString("nl-NL",{day:"numeric",month:"short"})} – ${new Date(sunStr+"T12:00:00Z").toLocaleDateString("nl-NL",{day:"numeric",month:"short"})}`;

            return (
              <section style={{ marginBottom: "2rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "0.75rem" }}>
                  <button onClick={() => setWeekOffset(w => w - 1)} className="btn-secondary" style={{ fontSize: 12, padding: "5px 10px" }}>‹</button>
                  <h2 style={{ fontSize: 17, margin: 0 }}>{weekLabel}</h2>
                  <button onClick={() => setWeekOffset(w => w + 1)} className="btn-secondary" style={{ fontSize: 12, padding: "5px 10px" }}>›</button>
                  {weekOffset !== 0 && (
                    <button onClick={() => setWeekOffset(0)} style={{ fontSize: 11, color: "var(--text-subtle)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>naar deze week</button>
                  )}
                </div>
                {weekItems.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--text-subtle)" }}>Geen bestellingen in deze week.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {weekItems.map((item, i) => {
                      const total = item.lines.reduce((s, l) => l.price != null ? s + l.price * l.quantity * (1 - discountPercent/100) : s, 0);
                      const hasPrice = item.lines.some(l => l.price != null);
                      // Real confirmation from Bezorgen (DeliveryStatus.deliveredAt), not a
                      // date guess — only actually "Ontvangen" once the driver checks it in.
                      const deliveredTime = deliveryTimeMap[item.date];
                      const received = !!deliveredTime;
                      return (
                        <div key={i} className="card" style={{ padding: "0.75rem 1.25rem", display: "flex", flexDirection: "column", gap: 6, opacity: received ? 0.75 : 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ minWidth: 80 }}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>
                              {new Date(item.date+"T12:00:00Z").toLocaleDateString("nl-NL",{weekday:"short",day:"numeric",month:"short"})}
                            </p>
                            <span style={{ fontSize: 10, color: received ? "var(--success)" : (item.locked ? "var(--danger)" : "var(--success)") }}>
                              {received ? `✓ Ontvangen ${deliveredTime}` : (item.locked ? "Aanpassen niet meer mogelijk" : timeUntilCutoff(item.date))}
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
                        {item.deviationNote && (
                          <div style={{ fontSize: 11, color: "#92400e", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 6, padding: "4px 8px" }}>
                            ⚠ Hoeveelheid aangepast bij bezorging — {item.deviationNote.replace("Afwijking bezorging: ", "")}
                          </div>
                        )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })()}

          {/* ── Bestelling toevoegen/aanpassen: one entry, then choose the type ── */}
          {activeSection === null ? (
            !showChooser ? (
              <div style={{ marginBottom: "1.5rem" }}>
                <button onClick={() => setShowChooser(true)} className="btn-primary" style={{ width: "100%", fontSize: 14, padding: "12px 0" }}>
                  ➕ Bestelling toevoegen / aanpassen
                </button>
              </div>
            ) : (
              <div style={{ marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Eenmalig of een vaste (wekelijkse) bestelling?</p>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => { setActiveSection("eenmalig"); setShowChooser(false); }}
                    style={{ flex: 1, fontSize: 13, padding: "10px 0", borderRadius: 8, border: "none", cursor: "pointer", background: "var(--danger)", color: "#fff", fontFamily: "var(--font-body)" }}>
                    Eenmalige bestelling
                  </button>
                  <button onClick={() => { setActiveSection("vast"); setShowChooser(false); }}
                    style={{ flex: 1, fontSize: 13, padding: "10px 0", borderRadius: 8, border: "none", cursor: "pointer", background: "var(--danger)", color: "#fff", fontFamily: "var(--font-body)" }}>
                    Vaste bestelling
                  </button>
                </div>
                <button onClick={() => setShowChooser(false)} style={{ fontSize: 12, color: "var(--text-subtle)", background: "none", border: "none", cursor: "pointer", alignSelf: "flex-start" }}>Annuleren</button>
              </div>
            )
          ) : (
            <div style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => { setActiveSection(null); setShowChooser(false); }} className="btn-secondary" style={{ fontSize: 12, padding: "5px 10px" }}>‹ Terug</button>
              <span style={{ fontSize: 13, color: "var(--text-subtle)" }}>{activeSection === "eenmalig" ? "Eenmalige bestelling" : "Vaste bestelling"}</span>
            </div>
          )}

          {/* Vaste bestellingen */}
          {activeSection === "vast" && <section style={{ marginBottom: "2rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <h2 style={{ fontSize: 17, margin: 0 }}>Vaste bestellingen</h2>
              {availableWeekdays.length > 0 && (
                <button onClick={() => { setNewRecWeekday(availableWeekdays[0]); setNewRecError(""); setShowNewRec(true); }} className="btn-secondary" style={{ fontSize: 12 }}>
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
                      {/* All three actions in one compact dropdown so they don't wrap/
                          overflow horizontally on a phone. Selecting runs the action; the
                          menu resets to "Acties…" since value stays "". */}
                      {!isEditing && (order.active || editable) && (
                        <select value="" className="btn-secondary" style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, cursor: "pointer" }}
                          onChange={e => {
                            const v = e.target.value;
                            if (v === "edit") startEditRec(order);
                            else if (v === "toggle") toggleRecActive(order);
                            else if (v === "delete") deleteRec(order.id);
                          }}>
                          <option value="" disabled>Acties…</option>
                          {order.active && <option value="edit">Wijzigen</option>}
                          {editable && <option value="toggle">{order.active ? "Pauzeer" : "Hervatten"}</option>}
                          {editable && <option value="delete">Verwijder</option>}
                        </select>
                      )}
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

                    {isEditing && (
                      <FormModal title={`Wijzigen — ${WEEKDAYS[order.weekday]}`} onClose={() => setEditingRecId(null)}>
                      <QtyGrid qty={editRecQty} onChange={setEditRecQty} breadTypes={breadTypes} discountPercent={discountPercent} />
                      <div style={{ marginTop: 10 }}>
                        <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Opmerkingen</label>
                        <input value={editRecNotes} onChange={e => setEditRecNotes(e.target.value)} placeholder="bijv. licht gebakken" style={inputStyle} />
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <PickupAndMap value={editRecPickup} onChange={setEditRecPickup} options={pickupOptions} mapTarget={mapTargetFor} />
                      </div>
                      {thisWeekLocked && (
                        <p style={{ fontSize: 12, color: "#92400e", background: "#fef3c7", padding: "8px 10px", borderRadius: 6, margin: "8px 0 0" }}>
                          De deadline voor de eerstvolgende bezorging ({new Date(next+"T12:00:00Z").toLocaleDateString("nl-NL",{day:"numeric",month:"short"})}) is al verstreken — die bezorging blijft ongewijzigd.
                          Deze wijziging gaat in vanaf {nextEditable ? new Date(nextEditable+"T12:00:00Z").toLocaleDateString("nl-NL",{day:"numeric",month:"short"}) : "volgende week"}.
                        </p>
                      )}
                      {/* Shown only at the moment Opslaan is actually rejected, not while adjusting */}
                      {editRecError && <p style={{ fontSize: 12, color: "var(--danger)", margin: "8px 0 0" }}>{editRecError}</p>}
                      <div style={{ display: "flex", gap: 8, marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                        <button onClick={() => setEditingRecId(null)} className="btn-secondary" style={{ fontSize: 13 }}>Annuleer</button>
                        <button onClick={() => saveRec(order)} disabled={savingRec} className="btn-primary" style={{ fontSize: 13 }}>{savingRec ? "Opslaan..." : "Opslaan"}</button>
                      </div>
                      </FormModal>
                    )}

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
                <FormModal title="Vaste bestelling toevoegen" onClose={() => { setShowNewRec(false); setNewRecPickup(""); setNewRecError(""); }}>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Bezorgdag</label>
                    <select value={newRecWeekday} onChange={e => setNewRecWeekday(Number(e.target.value))} style={inputStyle}>
                      {availableWeekdays.map(d => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Opmerkingen</label>
                    <input value={newRecNotes} onChange={e => setNewRecNotes(e.target.value)} placeholder="bijv. licht gebakken" style={inputStyle} />
                  </div>
                  <QtyGrid qty={newRecQty} onChange={setNewRecQty} breadTypes={breadTypes} discountPercent={discountPercent} />
                  <PickupAndMap value={newRecPickup} onChange={setNewRecPickup} options={pickupOptions} mapTarget={mapTargetFor} />
                  {/* Shown only at the moment "toevoegen" is actually rejected, not while adjusting */}
                  {newRecError && <p style={{ fontSize: 12, color: "var(--danger)", margin: 0 }}>{newRecError}</p>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setShowNewRec(false); setNewRecPickup(""); setNewRecError(""); }} className="btn-secondary" style={{ fontSize: 13 }}>Annuleren</button>
                    <button onClick={createRec} disabled={savingNewRec} className="btn-primary" style={{ fontSize: 13 }}>{savingNewRec ? "Opslaan..." : "Vaste bestelling toevoegen"}</button>
                  </div>
                </FormModal>
              )}
            </div>
          </section>}

          {/* Eenmalige bestellingen */}
          {activeSection === "eenmalig" && <section style={{ marginBottom: "2rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <h2 style={{ fontSize: 17, margin: 0 }}>Eenmalige bestellingen</h2>
              <button onClick={() => { setNewOOError(""); setShowNewOO(true); }} className="btn-primary" style={{ fontSize: 13 }}>+ Bestelling plaatsen</button>
            </div>

            {showNewOO && (
              <FormModal title="Bestelling plaatsen" onClose={() => { setShowNewOO(false); setDateError(""); setNewPickup(""); setNewOOError(""); }}>
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Bezorgdatum</label>
                  <OrderDatePicker value={newDate} onChange={d => { setNewDate(d); setDateError(validateDate(d)); }} isAvailable={dateStr => !validateDate(dateStr)} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Opmerkingen</label>
                  <input value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="bijv. licht gebakken" style={inputStyle} />
                </div>
                {dateError && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{dateError}</p>}
                <QtyGrid qty={newQty} onChange={setNewQty} breadTypes={breadTypes} discountPercent={discountPercent} deliveryDate={newDate} />

                <PickupAndMap value={newPickup} onChange={setNewPickup} options={pickupOptions} mapTarget={mapTargetFor} />

                {/* Basket total (informational — always shown once there are prices) */}
                {(() => {
                  const total = calcBasketTotal(newQty, breadTypes, discountPercent);
                  const isPickup = !!newPickup;
                  const hasPrices = breadTypes.some(b => b.price != null);
                  return hasPrices ? (
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span style={{ fontSize: 13, color: "var(--text-subtle)" }}>Totaal (excl. BTW)</span>
                        <span style={{ fontSize: 16, fontWeight: 600 }}>€ {total.toFixed(2)}</span>
                      </div>
                      {discountPercent > 0 && (
                        <p style={{ fontSize: 11, color: "var(--success)", margin: "3px 0 0" }}>{discountPercent}% korting verwerkt</p>
                      )}
                      {isPickup && minDeliveryAmount !== null && (
                        <p style={{ fontSize: 11, color: "var(--text-subtle)", margin: "3px 0 0" }}>Geen minimale bestelwaarde bij afhalen.</p>
                      )}
                    </div>
                  ) : null;
                })()}

                {/* Shown only at the moment "Bestelling plaatsen" is actually rejected, not while adjusting */}
                {newOOError && <p style={{ fontSize: 12, color: "var(--danger)", margin: 0 }}>{newOOError}</p>}

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setShowNewOO(false); setDateError(""); setNewPickup(""); setNewOOError(""); }} className="btn-secondary" style={{ fontSize: 13 }}>Annuleren</button>
                  <button onClick={createOO}
                    disabled={savingNew || !!dateError || !newDate || Object.values(newQty).every(v => v === 0)}
                    className="btn-primary" style={{ fontSize: 13 }}>
                    {savingNew ? "Plaatsen..." : "Bestelling plaatsen"}
                  </button>
                </div>
              </FormModal>
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
                        {editable && !isEditing && (
                          <button onClick={() => deleteOO(order.id)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", color: "var(--danger)" }}>
                            Annuleren
                          </button>
                        )}
                      </div>
                    </div>
                    {isEditing && (
                      <FormModal title={`Wijzigen — ${formatDate(order.deliveryDate)}`} onClose={() => setEditingOOId(null)}>
                        <div>
                          <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Opmerkingen</label>
                          <input value={editOONotes} onChange={e => setEditOONotes(e.target.value)} style={inputStyle} placeholder="bijv. licht gebakken" />
                        </div>
                        <QtyGrid qty={editOOQty} onChange={setEditOOQty} breadTypes={breadTypes} discountPercent={discountPercent} />
                        <PickupAndMap value={editOOPickup} onChange={setEditOOPickup} options={pickupOptions} mapTarget={mapTargetFor} />
                        {/* Shown only at the moment Opslaan is actually rejected, not while adjusting */}
                        {editOOError && <p style={{ fontSize: 12, color: "var(--danger)", margin: 0 }}>{editOOError}</p>}
                        <div style={{ display: "flex", gap: 8, marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                          <button onClick={() => setEditingOOId(null)} className="btn-secondary" style={{ fontSize: 13 }}>Annuleer</button>
                          <button onClick={() => saveOO(order)}
                            disabled={savingOO}
                            className="btn-primary" style={{ fontSize: 13 }}>{savingOO ? "Opslaan..." : "Opslaan"}</button>
                        </div>
                      </FormModal>
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
