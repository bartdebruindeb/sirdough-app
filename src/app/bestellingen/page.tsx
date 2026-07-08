"use client";
import { useRole } from "@/lib/role-context";
import React, { useEffect, useState, useCallback } from "react";
import { useUndoStack } from "@/hooks/useUndoStack";
import { BreadTypeAvailabilityManager } from "@/components/BreadTypeAvailabilityManager";

const WEEKDAYS = ["","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];

// weekday from JS Date: 0=Sun,1=Mon...6=Sat → convert to 1=Mon...7=Sun
function jsWeekdayToISO(d: Date): number { return d.getDay() === 0 ? 7 : d.getDay(); }

type BreadType = { id: string; slug: string; name: string; sortOrder: number; customerOrderable: boolean; winkelOrderable: boolean; availableWeekdays: string | null; imageFile?: string | null; price?: number | null };
type Customer  = { id: string; name: string; city: string | null; preferredBread?: string | null; discountPercent?: number };
type OrderLine = { breadTypeId: string; quantity: number; breadType: { id: string; name: string } };
type OneOffOrder = { id: string; customerId: string; deliveryDate: string; notes: string | null; customer: Customer; lines: OrderLine[] };
type LogboekEntry = { type: "eenmalig"|"vast"|"winkel"; date: string; customerName: string; customerId: string; city: string|null; notes: string|null; lines: { breadTypeId: string; breadTypeName: string; quantity: number }[] };
type RecurringLine = { breadTypeId: string; quantity: number; breadType: { id: string; name: string; sortOrder: number } };
type RecurringOrder = { id: string; customerId: string; weekday: number; active: boolean; notes: string | null; pickupLocation?: string | null; customer: Customer; lines: RecurringLine[] };
type Exception = { id: string; date: string; active: boolean };

function getWeekday(date: string) { const d = new Date(date+"T12:00:00Z"); const j=d.getUTCDay(); return j===0?7:j; }

// Same total calculation as the customer portal (mijn-bestellingen) — kept in sync
// so the staff-side minimum-order check matches what customers themselves see.
function calcTotal(qty: Record<string,number>, breadTypes: BreadType[], discountPercent = 0): number {
  return breadTypes.reduce((sum, bt) => {
    const q = qty[bt.id] ?? 0;
    if (!q || !bt.price) return sum;
    return sum + bt.price * q * (1 - discountPercent / 100);
  }, 0);
}

function colName(name: string) {
  return name.replace("Boeren ","B. ").replace(" KG","kg")
    .replace("Baguette 0.5 kg","Baguette").replace("Baguette Kaas/Peper","Kaas/P")
    .replace("Gekiemde Rogge","G.Rogge").replace("Morning buns","Buns");
}

// ── New order form ────────────────────────────────────────────────────────────
// Shop/pickup options are fetched from /api/shops (owner-managed on Winkel) and
// passed down as `shopPickup`, replacing the old hardcoded list.

function NewOrderForm({ customers, breadTypes, onSaved, closedWeekdays, minDeliveryAmount, shopPickup }: { customers: Customer[]; breadTypes: BreadType[]; onSaved: () => void; closedWeekdays: number[]; minDeliveryAmount: number | null; shopPickup: { id: string; label: string }[] }) {
  const { role } = useRole();
  const today = new Date().toISOString().slice(0,10);
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [pickupLocation, setPickupLocation] = useState("");
  const [qty, setQty] = useState<Record<string,number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const hasLines = Object.values(qty).some(v => v > 0);
  const [deadlineWarning, setDeadlineWarning] = useState(false);

  function getDateWeekday(d: string) { const dt = new Date(d+"T12:00:00Z"); const j=dt.getUTCDay(); return j===0?7:j; }

  function isPastDeadline(deliveryDate: string) {
    const now = new Date();
    const todayStr = now.toISOString().slice(0,10);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0,10);
    return (deliveryDate === todayStr || deliveryDate === tomorrowStr) && now.getHours() >= 4;
  }

  const customer = customers.find(c => c.id === customerId);
  const total = calcTotal(qty, breadTypes, customer?.discountPercent ?? 0);
  const belowMin = !pickupLocation && minDeliveryAmount !== null && total > 0 && total < minDeliveryAmount;

  async function save(bypassWarning = false) {
    if (!customerId) { setError("Selecteer eerst een klant."); return; }
    if (!hasLines) { setError("Voeg minimaal één broodsoort toe."); return; }
    if (belowMin) { setError(`Bestelling is lager dan de minimale bestelwaarde (€ ${minDeliveryAmount!.toFixed(2)}) voor bezorging.`); return; }
    if (closedWeekdays.includes(getDateWeekday(date))) {
      const dayName = WEEKDAYS[getDateWeekday(date)];
      setError(`${dayName} is een gesloten dag — geen levering mogelijk.`);
      return;
    }
    if (!bypassWarning && isPastDeadline(date)) {
      if (!role) {
        setError("De besteldeadline (04:00) is verstreken. Neem contact op met de bakkerij.");
        return;
      }
      setDeadlineWarning(true);
      return;
    }
    setDeadlineWarning(false);
    setSaving(true); setError(""); setSuccess("");
    const customerName = customers.find(c=>c.id===customerId)?.name ?? "";
    const res = await fetch("/api/bestellingen", {
      method: "POST", headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify({ customerId, deliveryDate: date, notes: notes||undefined,
        pickupLocation: pickupLocation || undefined,
        lines: Object.entries(qty).filter(([,q])=>q>0).map(([breadTypeId,quantity])=>({breadTypeId,quantity})) }),
    });
    setSaving(false);
    if (res.ok) {
      setQty({}); setNotes(""); setPickupLocation(""); onSaved();
      setSuccess(`✓ Bestelling voor ${customerName} toegevoegd.`);
      setTimeout(() => setSuccess(""), 4000);
    }
    else { const d=await res.json(); setError(d.message??"Opslaan mislukt."); }
  }

  const inp: React.CSSProperties = { border:"1px solid var(--border)", borderRadius:7, padding:"7px 10px", fontSize:13, background:"var(--surface)", width:"100%" };

  return (
    <div className="card" style={{ padding: "1.25rem 1.5rem" }}>
      <h3 style={{ fontSize: 14, marginBottom: "0.75rem" }}>Nieuwe eenmalige bestelling</h3>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 140px 1fr", gap:10, marginBottom:10, alignItems:"end" }}>
        <div>
          <label style={{ fontSize:11, color:"var(--text-subtle)", textTransform:"uppercase", display:"block", marginBottom:4 }}>Klant</label>
          <select value={customerId} onChange={e=>setCustomerId(e.target.value)} style={inp}>
            <option value="">— selecteer —</option>
            {customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.city?` (${c.city})`:""}</option>)}
          </select>
          {customers.find(c=>c.id===customerId)?.preferredBread && (
            <p style={{ fontSize:12, color:"var(--accent)", margin:"4px 0 0" }}>🍞 Voorkeur: {customers.find(c=>c.id===customerId)?.preferredBread}</p>
          )}
        </div>
        <div>
          <label style={{ fontSize:11, color:"var(--text-subtle)", textTransform:"uppercase", display:"block", marginBottom:4 }}>Datum</label>
          <input type="date" value={date} min={today} onChange={e=>setDate(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={{ fontSize:11, color:"var(--text-subtle)", textTransform:"uppercase", display:"block", marginBottom:4 }}>Opmerkingen</label>
          <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="bijv. licht gebakken" style={inp} />
        </div>
      </div>
      {/* Pickup / delivery toggle */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, flexWrap:"wrap" }}>
        <label style={{ fontSize:11, color:"var(--text-subtle)", textTransform:"uppercase", flexShrink:0 }}>Bezorging:</label>
        <button type="button" onClick={()=>setPickupLocation("")}
          style={{ fontSize:12, padding:"5px 12px", borderRadius:7, cursor:"pointer", border:`1px solid ${pickupLocation===""?"var(--accent)":"var(--border)"}`, background:pickupLocation===""?"var(--accent-light)":"var(--surface)", color:pickupLocation===""?"var(--accent)":"var(--text)", fontFamily:"var(--font-body)" }}>
          🚚 Bezorgen
        </button>
        {shopPickup.map(s=>(
          <button key={s.id} type="button" onClick={()=>setPickupLocation(s.id)}
            style={{ fontSize:12, padding:"5px 12px", borderRadius:7, cursor:"pointer", border:`1px solid ${pickupLocation===s.id?"#d97706":"var(--border)"}`, background:pickupLocation===s.id?"#fef3c7":"var(--surface)", color:pickupLocation===s.id?"#92400e":"var(--text)", fontFamily:"var(--font-body)" }}>
            🏪 Afhalen {s.label}
          </button>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(110px,1fr))", gap:8, marginBottom:10 }}>
        {breadTypes.filter(bt=>bt.customerOrderable).map(bt=>{
          const days = bt.availableWeekdays ? bt.availableWeekdays.split(",").map(Number) : [];
          const dateDay = date ? new Date(date+"T12:00:00Z").getUTCDay() : -1;
          const isoDay = dateDay === 0 ? 7 : dateDay;
          const available = days.length === 0 || days.includes(isoDay);
          return (
            <div key={bt.id} style={{ background:"var(--surface-2)", border:"1px solid var(--border)", borderRadius:7, padding:"7px 9px", opacity: available ? 1 : 0.4 }}>
              <label style={{ fontSize:10, color:"var(--text-subtle)", textTransform:"uppercase", display:"block", marginBottom:3 }}>{colName(bt.name)}</label>
              {!available && <span style={{ fontSize:9, color:"var(--danger)", display:"block" }}>niet op deze dag</span>}
              <input type="number" disabled={!available} onKeyDown={e=>{if(["e","E","-","+",","].includes(e.key))e.preventDefault()}} min={0} max={999} value={qty[bt.id]||""} onChange={e=>setQty(q=>({...q,[bt.id]:Math.min(999,parseInt(e.target.value)||0)}))} placeholder="0"
                style={{ width:"100%", border:"1px solid var(--border)", borderRadius:5, padding:"4px 6px", fontSize:14, fontWeight:600, background:"var(--surface)", textAlign:"right" }} />
            </div>
          );
        })}
      </div>
      {deadlineWarning && (
        <div style={{ background:"#fff3cd", border:"1px solid #ffc107", borderRadius:8, padding:"12px 14px", marginBottom:10 }}>
          <p style={{ fontSize:13, fontWeight:600, margin:"0 0 6px", color:"#856404" }}>⚠️ Besteldeadline verstreken</p>
          <p style={{ fontSize:13, color:"#856404", margin:"0 0 10px" }}>De deadline voor morgen (04:00) is verstreken. Weet je zeker dat je deze bestelling toch wilt plaatsen?</p>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => save(true)} className="btn-primary" style={{ fontSize:13 }}>Ja, toch opslaan</button>
            <button onClick={() => setDeadlineWarning(false)} className="btn-secondary" style={{ fontSize:13 }}>Annuleren</button>
          </div>
        </div>
      )}
      {belowMin && (
        <p style={{ fontSize:13, color:"var(--danger)", margin:"0 0 8px" }}>
          ⚠ Bestelling (€ {total.toFixed(2)}) is lager dan de minimale bestelwaarde (€ {minDeliveryAmount!.toFixed(2)}) voor bezorging — kies afhalen of voeg meer toe.
        </p>
      )}
      {error && <p style={{ color:"var(--danger)", fontSize:13, margin:"0 0 8px" }}>{error}</p>}
      {success && <p style={{ color:"var(--success)", fontSize:13, margin:"0 0 8px", fontWeight:500 }}>{success}</p>}
      {!deadlineWarning && (
        <button onClick={() => save()} disabled={saving || belowMin} className="btn-primary" style={{ fontSize:13 }}>
          {saving?"Opslaan…":"Bestelling toevoegen"}
        </button>
      )}
    </div>
  );
}



// ── New recurring order form ──────────────────────────────────────────────────
function NewRecurringOrderForm({ customers, breadTypes, onSaved, closedWeekdays }: { customers: Customer[]; breadTypes: BreadType[]; onSaved: () => void; closedWeekdays: number[] }) {
  const { role } = useRole();
  const [customerId, setCustomerId] = useState("");
  const [weekday, setWeekday] = useState(2);
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState<Record<string,number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const hasLines = Object.values(qty).some(v => v > 0);

  async function save() {
    if (!customerId) { setError("Selecteer eerst een klant."); return; }
    if (!hasLines) { setError("Voeg minimaal één broodsoort toe."); return; }
    if (closedWeekdays.includes(weekday)) { setError(`${WEEKDAYS[weekday]} is een gesloten dag.`); return; }
    setSaving(true); setError(""); setSuccess("");
    const customerName = customers.find(c=>c.id===customerId)?.name ?? "";
    const res = await fetch("/api/bestellingen/recurring", {
      method: "POST", headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify({ customerId, weekday, notes: notes || undefined,
        lines: Object.entries(qty).filter(([,q])=>q>0).map(([breadTypeId,quantity])=>({breadTypeId,quantity})) }),
    });
    setSaving(false);
    if (res.ok) {
      setQty({}); setNotes(""); onSaved();
      setSuccess(`✓ Vaste bestelling voor ${customerName} (${WEEKDAYS[weekday]}) toegevoegd.`);
      setTimeout(() => setSuccess(""), 4000);
    }
    else { const d = await res.json(); setError(d.message ?? "Opslaan mislukt."); }
  }

  const inp: React.CSSProperties = { border:"1px solid var(--border)", borderRadius:7, padding:"7px 10px", fontSize:13, background:"var(--surface)", width:"100%" };

  return (
    <div className="card" style={{ padding: "1.25rem 1.5rem" }}>
      <h3 style={{ fontSize: 14, marginBottom: "0.75rem" }}>Nieuwe vaste bestelling</h3>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 140px 1fr", gap:10, marginBottom:10, alignItems:"end" }}>
        <div>
          <label style={{ fontSize:11, color:"var(--text-subtle)", textTransform:"uppercase", display:"block", marginBottom:4 }}>Klant</label>
          <select value={customerId} onChange={e=>setCustomerId(e.target.value)} style={inp}>
            <option value="">— selecteer —</option>
            {customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.city?` (${c.city})`:""}</option>)}
          </select>
          {customers.find(c=>c.id===customerId)?.preferredBread && (
            <p style={{ fontSize:12, color:"var(--accent)", margin:"4px 0 0" }}>🍞 Voorkeur: {customers.find(c=>c.id===customerId)?.preferredBread}</p>
          )}
        </div>
        <div>
          <label style={{ fontSize:11, color:"var(--text-subtle)", textTransform:"uppercase", display:"block", marginBottom:4 }}>Dag</label>
          <select value={weekday} onChange={e=>setWeekday(parseInt(e.target.value))} style={inp}>
            {[1,2,3,4,5,6,7].filter(wd=>!closedWeekdays.includes(wd)).map(wd=><option key={wd} value={wd}>{WEEKDAYS[wd]}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize:11, color:"var(--text-subtle)", textTransform:"uppercase", display:"block", marginBottom:4 }}>Opmerkingen</label>
          <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="bijv. adres, leveringsinstructies…" style={inp} />
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(110px,1fr))", gap:8, marginBottom:10 }}>
        {breadTypes.filter(bt=>bt.customerOrderable).map(bt=>{
          const days = bt.availableWeekdays ? bt.availableWeekdays.split(",").map(Number) : [];
          const available = days.length === 0 || days.includes(weekday);
          return (
            <div key={bt.id} style={{ background:"var(--surface-2)", border:"1px solid var(--border)", borderRadius:7, padding:"7px 9px", opacity: available ? 1 : 0.4 }}>
              <label style={{ fontSize:10, color:"var(--text-subtle)", textTransform:"uppercase", display:"block", marginBottom:3 }}>{colName(bt.name)}</label>
              {!available && <span style={{ fontSize:9, color:"var(--danger)", display:"block" }}>niet op deze dag</span>}
              <input type="number" disabled={!available} onKeyDown={e=>{if(["e","E","-","+",","].includes(e.key))e.preventDefault()}} min={0} max={999} value={qty[bt.id]||""} onChange={e=>setQty(q=>({...q,[bt.id]:Math.min(999,parseInt(e.target.value)||0)}))} placeholder="0"
                style={{ width:"100%", border:"1px solid var(--border)", borderRadius:5, padding:"4px 6px", fontSize:14, fontWeight:600, background:"var(--surface)", textAlign:"right" }} />
            </div>
          );
        })}
      </div>
      {error && <p style={{ color:"var(--danger)", fontSize:13, margin:"0 0 8px" }}>{error}</p>}
      {success && <p style={{ color:"var(--success)", fontSize:13, margin:"0 0 8px", fontWeight:500 }}>{success}</p>}
      <button onClick={save} disabled={saving} className="btn-primary" style={{ fontSize:13 }}>
        {saving?"Opslaan…":"Vaste bestelling toevoegen"}
      </button>
    </div>
  );
}



// ── New recurring order: week table form (one go for all days) ───────────────
function NewRecurringWeekForm({ customers, breadTypes, recurring, onSaved, closedWeekdays, minDeliveryAmount, shopPickup }: {
  customers: Customer[]; breadTypes: BreadType[]; recurring: RecurringOrder[]; onSaved: () => void; closedWeekdays: number[]; minDeliveryAmount: number | null; shopPickup: { id: string; label: string }[];
}) {
  const { role } = useRole();
  const [customerId, setCustomerId] = useState("");
  // qty: weekday (1-7) → breadTypeId → quantity
  const [qty, setQty] = useState<Record<number, Record<string,number>>>({});
  const [pickupLocation, setPickupLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [expanded, setExpanded] = useState(false);

  const allBTs = breadTypes; // show all bread types (not filtered by customerOrderable)
  const openDays = [2,3,4,5,6].filter(wd => !closedWeekdays.includes(wd)); // Tue–Sat by default
  const customer = customers.find(c => c.id === customerId);
  const daysWithOrders = openDays.filter(wd => Object.values(qty[wd] ?? {}).some(v => v > 0));
  const dayTotals = Object.fromEntries(daysWithOrders.map(wd => [wd, calcTotal(qty[wd] ?? {}, breadTypes, customer?.discountPercent ?? 0)]));
  const belowMinDays = !pickupLocation && minDeliveryAmount !== null
    ? daysWithOrders.filter(wd => dayTotals[wd] > 0 && dayTotals[wd] < minDeliveryAmount)
    : [];

  // Pre-fill from existing recurring orders for selected customer
  useEffect(() => {
    if (!customerId) { setQty({}); setPickupLocation(""); return; }
    const initial: Record<number, Record<string,number>> = {};
    for (const wd of openDays) {
      initial[wd] = {};
      const order = recurring.find(o => o.customerId === customerId && o.weekday === wd);
      if (order) {
        for (const l of order.lines) initial[wd][l.breadTypeId] = l.quantity;
      }
    }
    setQty(initial);
    const anyOrder = recurring.find(o => o.customerId === customerId && o.pickupLocation);
    setPickupLocation(anyOrder?.pickupLocation ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, recurring.map(o=>o.id).join(",")]);

  async function save() {
    if (!customerId) { setError("Selecteer eerst een klant."); return; }
    if (daysWithOrders.length === 0) { setError("Voeg minimaal één broodsoort toe."); return; }
    if (belowMinDays.length > 0) {
      setError(`${belowMinDays.map(wd => WEEKDAYS[wd]).join(", ")}: lager dan de minimale bestelwaarde (€ ${minDeliveryAmount!.toFixed(2)}) voor bezorging — kies afhalen of voeg meer toe.`);
      return;
    }
    setSaving(true); setError(""); setSuccess("");
    for (const wd of daysWithOrders) {
      const lines = Object.entries(qty[wd] ?? {}).filter(([,q])=>q>0).map(([breadTypeId,quantity])=>({breadTypeId,quantity}));
      await fetch("/api/bestellingen/recurring", {
        method: "POST", headers: { "Content-Type": "application/json", "x-role": role ?? "" },
        body: JSON.stringify({ customerId, weekday: wd, lines, pickupLocation: pickupLocation || null }),
      });
    }
    setSaving(false);
    const customerName = customers.find(c=>c.id===customerId)?.name ?? "";
    setSuccess(`✓ Vaste bestellingen voor ${customerName} opgeslagen (${daysWithOrders.length} dag${daysWithOrders.length>1?"en":""}).`);
    setTimeout(() => setSuccess(""), 5000);
    onSaved();
    setExpanded(false);
  }

  const inp: React.CSSProperties = { border:"1px solid var(--border)", borderRadius:7, padding:"7px 10px", fontSize:13, background:"var(--surface)", width:"100%" };

  return (
    <div className="card" style={{ padding:"1.25rem 1.5rem" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: expanded ? 16 : 0 }}>
        <h3 style={{ fontSize:14, margin:0 }}>Nieuwe / bewerken vaste bestelling</h3>
        <button onClick={()=>setExpanded(v=>!v)} className="btn-secondary" style={{ fontSize:12 }}>
          {expanded ? "▲ Sluiten" : "▼ Openen"}
        </button>
      </div>
      {expanded && (
        <>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, color:"var(--text-subtle)", textTransform:"uppercase", display:"block", marginBottom:4 }}>Klant</label>
            <select value={customerId} onChange={e=>setCustomerId(e.target.value)} style={{ ...inp, maxWidth:360 }}>
              <option value="">— selecteer klant —</option>
              {customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.city?` (${c.city})`:""}</option>)}
            </select>
          </div>
          {customerId && (
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:11, color:"var(--text-subtle)", textTransform:"uppercase", display:"block", marginBottom:6 }}>Bezorging</label>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                <button type="button" onClick={()=>setPickupLocation("")}
                  style={{ fontSize:12, padding:"5px 12px", borderRadius:7, cursor:"pointer", border:`1px solid ${pickupLocation===""?"var(--accent)":"var(--border)"}`, background:pickupLocation===""?"var(--accent-light)":"var(--surface)", color:pickupLocation===""?"var(--accent)":"var(--text)", fontFamily:"var(--font-body)" }}>
                  🚚 Bezorgen
                </button>
                {shopPickup.map(s=>(
                  <button key={s.id} type="button" onClick={()=>setPickupLocation(s.id)}
                    style={{ fontSize:12, padding:"5px 12px", borderRadius:7, cursor:"pointer", border:`1px solid ${pickupLocation===s.id?"#d97706":"var(--border)"}`, background:pickupLocation===s.id?"#fef3c7":"var(--surface)", color:pickupLocation===s.id?"#92400e":"var(--text)", fontFamily:"var(--font-body)" }}>
                    🏪 Afhalen {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {error && <p style={{ color:"var(--danger)", fontSize:13, margin:"0 0 8px" }}>{error}</p>}
          {success && <p style={{ color:"var(--success)", fontSize:13, margin:"0 0 8px", fontWeight:500 }}>{success}</p>}
          {customerId && (
            <button onClick={save} disabled={saving || belowMinDays.length > 0} className="btn-primary" style={{ fontSize:13, marginBottom:16 }}>
              {saving?"Opslaan…":"Vaste bestellingen opslaan"}
            </button>
          )}
          {customerId && (
            <div style={{ overflowX:"auto", marginBottom:16 }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background:"var(--surface-2)", borderBottom:"2px solid var(--border)" }}>
                    <th style={{ textAlign:"left", padding:"8px 14px", fontSize:11, fontWeight:600, textTransform:"uppercase", color:"var(--text-subtle)", minWidth:130, whiteSpace:"nowrap" }}>Broodsoort</th>
                    {openDays.map(wd=>(
                      <th key={wd} style={{ textAlign:"center", padding:"8px 10px", fontSize:12, fontWeight:600, color:"var(--text-subtle)", minWidth:80, borderLeft:"1px solid var(--border)" }}>
                        {WEEKDAYS[wd].slice(0,2)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allBTs.map((bt, bi)=>(
                    <tr key={bt.id} style={{ borderTop:"1px solid var(--border)", background: bi%2===0?"transparent":"var(--surface-2)" }}>
                      <td style={{ padding:"5px 14px", whiteSpace:"nowrap", color:"var(--text-muted)", fontSize:13 }}>{colName(bt.name)}</td>
                      {openDays.map(wd=>(
                        <td key={wd} style={{ padding:"4px 6px", borderLeft:"1px solid var(--border)", textAlign:"center" }}>
                          <input type="number" min={0} max={999} value={(qty[wd]?.[bt.id])||""} placeholder="0"
                            onKeyDown={e=>{if(["e","E","-","+",","].includes(e.key))e.preventDefault()}}
                            onChange={e=>{ const v=Math.min(999,parseInt(e.target.value)||0); setQty(q=>({...q,[wd]:{...(q[wd]??{}),[bt.id]:v}})); }}
                            style={{ width:60, border:"1px solid var(--border)", borderRadius:5, padding:"3px 6px", fontSize:13, fontWeight:600, background:"var(--surface)", textAlign:"right" }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {minDeliveryAmount !== null && (
                    <tr style={{ borderTop:"2px solid var(--border)" }}>
                      <td style={{ padding:"6px 14px", fontSize:11, color:"var(--text-subtle)", textTransform:"uppercase" }}>Totaal</td>
                      {openDays.map(wd=>{
                        const t = dayTotals[wd] ?? 0;
                        const low = belowMinDays.includes(wd);
                        return (
                          <td key={wd} style={{ padding:"6px 6px", borderLeft:"1px solid var(--border)", textAlign:"center", fontSize:11, color: low ? "var(--danger)" : "var(--text-subtle)", fontWeight: low ? 700 : 400 }}>
                            {t > 0 ? `€${t.toFixed(0)}${low ? " ⚠" : ""}` : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {belowMinDays.length > 0 && (
            <p style={{ fontSize:12, color:"var(--danger)", margin:0 }}>
              ⚠ {belowMinDays.map(wd => WEEKDAYS[wd]).join(", ")} onder de minimale bestelwaarde (€ {minDeliveryAmount!.toFixed(2)}) — kies afhalen of voeg meer toe.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── Recurring order with exception planning ───────────────────────────────────
function RecurringCard({ order, breadTypes, onChanged, isOwner, onEditWeek, minDeliveryAmount, shopPickup }: {
  order: RecurringOrder; breadTypes: BreadType[]; onChanged: () => void; isOwner: boolean; onEditWeek?: () => void; minDeliveryAmount: number | null; shopPickup: { id: string; label: string }[];
}) {
  const { role } = useRole();
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPlanner, setShowPlanner] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [loadingEx, setLoadingEx] = useState(false);
  const [editQty, setEditQty] = useState<Record<string,number>>({});
  const [editPickup, setEditPickup] = useState("");

  const editTotal = calcTotal(editQty, breadTypes, order.customer.discountPercent ?? 0);
  const editBelowMin = !editPickup && minDeliveryAmount !== null && editTotal > 0 && editTotal < minDeliveryAmount;

  async function toggle() {
    setToggling(true);
    await fetch("/api/bestellingen/recurring", {
      method:"PATCH", headers:{"Content-Type":"application/json","x-role":role ?? ""},
      body: JSON.stringify({ id:order.id, active:!order.active }),
    });
    setToggling(false); onChanged();
  }

  async function deleteOrder() {
    if (!confirm(`Vaste bestelling van ${order.customer.name} (${WEEKDAYS[order.weekday]}) definitief verwijderen?`)) return;
    setDeleting(true);
    await fetch(`/api/bestellingen/recurring?id=${order.id}`, { method:"DELETE", headers:{"x-role":role ?? ""} });
    setDeleting(false); onChanged();
  }

  async function saveEdit() {
    if (editBelowMin) return;
    await fetch("/api/bestellingen/recurring", {
      method:"POST", headers:{"Content-Type":"application/json","x-role":role ?? ""},
      body: JSON.stringify({ customerId:order.customerId, weekday:order.weekday,
        lines: Object.entries(editQty).filter(([,q])=>q>0).map(([breadTypeId,quantity])=>({breadTypeId,quantity})),
        pickupLocation: editPickup || null }),
    });
    setShowEdit(false); onChanged();
  }

  async function loadExceptions() {
    setLoadingEx(true);
    const res = await fetch(`/api/bestellingen/exceptions?recurringOrderId=${order.id}`, { headers:{"x-role":role ?? ""} });
    const d = await res.json();
    setExceptions(d.exceptions??[]);
    setLoadingEx(false);
  }

  async function setException(date: string, active: boolean) {
    await fetch("/api/bestellingen/exceptions", {
      method:"POST", headers:{"Content-Type":"application/json","x-role":role ?? ""},
      body: JSON.stringify({ recurringOrderId:order.id, date, active }),
    });
    loadExceptions();
  }

  function openPlanner() { setShowPlanner(true); loadExceptions(); }
  function openEdit() {
    const q: Record<string,number> = {};
    for (const l of order.lines) q[l.breadTypeId] = l.quantity;
    setEditQty(q); setEditPickup(order.pickupLocation ?? ""); setShowEdit(true);
  }

  const occurrences = (() => {
    const dates: string[] = [];
    const d = new Date(); d.setHours(12,0,0,0);
    for (let i=0; dates.length<8; i++) {
      const wd = d.getDay()===0?7:d.getDay();
      if (wd===order.weekday) dates.push(d.toISOString().slice(0,10));
      d.setDate(d.getDate()+1);
      if (i>60) break;
    }
    return dates;
  })();

  const sortedLines = [...order.lines].sort((a,b)=>a.breadType.sortOrder-b.breadType.sortOrder);

  return (
    <div style={{ border:"1px solid var(--border)", borderRadius:8, overflow:"hidden", background:order.active?"var(--surface)":"var(--surface-2)", opacity:order.active?1:0.6 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px" }}>
        {isOwner && (
          <button onClick={toggle} disabled={toggling} style={{
            width:36, height:20, borderRadius:10, border:"none", cursor:"pointer", flexShrink:0,
            background:order.active?"var(--accent)":"var(--border-strong)", position:"relative", transition:"background 0.2s",
          }}>
            <span style={{ position:"absolute", top:2, left:order.active?18:2, width:16, height:16, borderRadius:"50%", background:"white", transition:"left 0.2s" }} />
          </button>
        )}
        <div style={{ flex:1 }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:8, flexWrap:"wrap" }}>
            <span style={{ fontWeight:500, fontSize:13 }}>{order.customer.name}</span>
            <span style={{ fontSize:12, color:"var(--text-subtle)" }}>{order.customer.city}</span>
            {order.pickupLocation && <span style={{ fontSize:11, background:"var(--accent-light)", color:"var(--accent)", padding:"2px 7px", borderRadius:10 }}>🏪 Afhalen {order.pickupLocation.replace("Winkel ","")}</span>}
            {order.notes && <span style={{ fontSize:11, color:"var(--text-subtle)", fontStyle:"italic" }}>{order.notes}</span>}
          </div>
          <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:4 }}>
            {sortedLines.map(l=>(
              <span key={l.breadTypeId} style={{ fontSize:11, background:"var(--accent-light)", color:"var(--accent)", padding:"2px 7px", borderRadius:10 }}>
                {colName(l.breadType.name)} {l.quantity}
              </span>
            ))}
          </div>
        </div>
        <div style={{ display:"flex", gap:5, flexShrink:0 }}>
          {isOwner && <button onClick={onEditWeek ?? openEdit} style={{ fontSize:11, padding:"4px 9px", borderRadius:6, border:"1px solid var(--border)", background:"none", cursor:"pointer", color:"var(--text-subtle)" }}>✎ Bewerken</button>}
          <button onClick={openPlanner} style={{ fontSize:11, padding:"4px 9px", borderRadius:6, border:"1px solid var(--border)", background:"none", cursor:"pointer", color:"var(--text-subtle)" }}>📅 Plannen</button>
          {isOwner && <button onClick={deleteOrder} disabled={deleting} style={{ fontSize:11, padding:"4px 9px", borderRadius:6, border:"1px solid #fca5a5", background:"none", cursor:"pointer", color:"var(--danger)" }}>🗑</button>}
        </div>
      </div>

      {/* Edit panel */}
      {showEdit && (
        <div style={{ borderTop:"1px solid var(--border)", padding:"12px 14px", background:"var(--surface-2)" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <p style={{ fontSize:12, fontWeight:500, margin:0 }}>Aantallen aanpassen</p>
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={saveEdit} disabled={editBelowMin} className="btn-primary" style={{ fontSize:11, padding:"4px 12px", opacity:editBelowMin?0.5:1 }}>Opslaan</button>
              <button onClick={()=>setShowEdit(false)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:16, color:"var(--text-subtle)" }}>×</button>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(110px,1fr))", gap:7 }}>
            {breadTypes.filter(bt=>bt.customerOrderable||order.lines.some(l=>l.breadTypeId===bt.id)).map(bt=>(
              <div key={bt.id} style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:6, padding:"7px 9px" }}>
                <label style={{ fontSize:10, color:"var(--text-subtle)", textTransform:"uppercase", display:"block", marginBottom:3 }}>{colName(bt.name)}</label>
                <input type="number" onKeyDown={e=>{if(["e","E","-","+"].includes(e.key))e.preventDefault()}} min={0} value={editQty[bt.id]||""} onChange={e=>setEditQty(q=>({...q,[bt.id]:Math.min(999,parseInt(e.target.value)||0)}))} max={999} placeholder="0"
                  style={{ width:"100%", border:"1px solid var(--border)", borderRadius:5, padding:"3px 6px", fontSize:13, fontWeight:600, background:"var(--surface)", textAlign:"right" }} />
              </div>
            ))}
          </div>
          <div style={{ marginTop:10 }}>
            <label style={{ fontSize:10, color:"var(--text-subtle)", textTransform:"uppercase", display:"block", marginBottom:4 }}>Afhalen (optioneel)</label>
            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
              <button type="button" onClick={()=>setEditPickup("")} style={{ fontSize:11, padding:"4px 9px", borderRadius:6, border:"1px solid var(--border)", cursor:"pointer", background:!editPickup?"var(--accent)":"none", color:!editPickup?"white":"var(--text-subtle)" }}>Bezorgen</button>
              {shopPickup.map(p=>(
                <button key={p.id} type="button" onClick={()=>setEditPickup(p.id)} style={{ fontSize:11, padding:"4px 9px", borderRadius:6, border:"1px solid var(--border)", cursor:"pointer", background:editPickup===p.id?"var(--accent)":"none", color:editPickup===p.id?"white":"var(--text-subtle)" }}>{p.label}</button>
              ))}
            </div>
          </div>
          {editBelowMin && (
            <p style={{ fontSize:11, color:"var(--danger)", marginTop:8 }}>
              Totaal (€{editTotal.toFixed(2)}) ligt onder het bezorgminimum (€{minDeliveryAmount!.toFixed(2)}). Kies "Afhalen" of verhoog de bestelling.
            </p>
          )}
        </div>
      )}

      {/* Planner panel */}
      {showPlanner && (
        <div style={{ borderTop:"1px solid var(--border)", padding:"12px 14px", background:"var(--surface-2)" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <p style={{ fontSize:12, fontWeight:500, margin:0 }}>Komende leveringen — klik om aan/uit te zetten</p>
            <button onClick={()=>setShowPlanner(false)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:16, color:"var(--text-subtle)" }}>×</button>
          </div>
          {loadingEx ? <p style={{ fontSize:12, color:"var(--text-subtle)" }}>Laden…</p> : (
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {occurrences.map(date=>{
                const ex=exceptions.find(e=>e.date===date);
                const isActive=ex?ex.active:order.active;
                const d=new Date(date+"T12:00:00Z");
                const label=d.toLocaleDateString("nl-NL",{day:"numeric",month:"short"});
                return (
                  <button key={date} onClick={()=>setException(date,!isActive)} style={{
                    padding:"6px 12px", borderRadius:8, fontSize:12, cursor:"pointer", border:"1px solid", fontFamily:"var(--font-body)",
                    borderColor:isActive?"var(--accent)":"var(--border)", background:isActive?"var(--accent-light)":"var(--surface)", color:isActive?"var(--accent)":"var(--text-subtle)",
                  }}>
                    {isActive?"✓":"✕"} {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function BestellingenPage() {
  const { role, can } = useRole();
  const today = new Date().toISOString().slice(0,10);
  const isOwner = role === "OWNER";
  const canWrite = can("orders:write");
  const canWriteRecurring = can("orders:write_recurring");
  const [orders, setOrders] = useState<OneOffOrder[]>([]);
  const [recurring, setRecurring] = useState<RecurringOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [breadTypes, setBreadTypes] = useState<BreadType[]>([]);
  const [minDeliveryAmount, setMinDeliveryAmount] = useState<number | null>(null);
  const [shopPickup, setShopPickup] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(today);
  const toDefault = new Date(today); toDefault.setDate(toDefault.getDate()+7);
  const [toDate, setToDate] = useState(toDefault.toISOString().slice(0,10));
  const [editingOrderId, setEditingOrderId] = useState<string|null>(null);
  const [editOrderQty, setEditOrderQty, undoEditOrderQty, canUndoEditOrderQty] = useUndoStack<Record<string,number>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [showVastManage, setShowVastManage] = useState(false);
  const [eenmaligCustomerFilter, setEenmaligCustomerFilter] = useState("");
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [tab, setTab] = useState<"eenmalig"|"vast"|"klant">(role === "BAKKER" ? "klant" : "eenmalig");
  const [pendingDeleteId, setPendingDeleteId] = useState<string|null>(null);
  const [recurringCustomerFilter, setRecurringCustomerFilter] = useState("");
  const [recurringDayFilter, setRecurringDayFilter] = useState<number | "">("");
  const [closedWeekdays, setClosedWeekdays] = useState<number[]>([1,7]);
  const [savingSettings, setSavingSettings] = useState(false);

  const [historyCustomerId, setHistoryCustomerId] = useState("");
  const [logboekEntries, setLogboekEntries] = useState<LogboekEntry[]>([]);
  const [logboekBreadTypes, setLogboekBreadTypes] = useState<{id:string;name:string;slug:string}[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Logboek date range — default last 60 days + next 14 days
  const logboekDefaultFrom = (() => { const d = new Date(); d.setDate(d.getDate()-60); return d.toISOString().slice(0,10); })();
  const logboekDefaultTo   = (() => { const d = new Date(); d.setDate(d.getDate()+14); return d.toISOString().slice(0,10); })();
  const [logboekFrom, setLogboekFrom] = useState(logboekDefaultFrom);
  const [logboekTo,   setLogboekTo]   = useState(logboekDefaultTo);

  // ── Week planning ────────────────────────────────────────────────────────────
  const [wpMonday, setWpMonday] = useState<string>(()=>{
    const d=new Date(); const day=d.getDay(); const diff=day===0?-6:1-day; d.setDate(d.getDate()+diff);
    return d.toISOString().slice(0,10);
  });
  const [wpOrders, setWpOrders] = useState<OneOffOrder[]>([]);
  const [wpLoading, setWpLoading] = useState(false);
  const [wpEditKey, setWpEditKey] = useState<string|null>(null); // "customerId_date"
  const [wpEditQty, setWpEditQty] = useState<Record<string,number>>({});
  const [wpSaving, setWpSaving] = useState(false);

  const wpSunday = (()=>{ const d=new Date(wpMonday+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+6); return d.toISOString().slice(0,10); })();

  function loadWpOrders(monday: string) {
    setWpLoading(true);
    const sunday = (()=>{ const d=new Date(monday+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+6); return d.toISOString().slice(0,10); })();
    fetch(`/api/bestellingen?from=${monday}&to=${sunday}`,{headers:{"x-role":role ?? ""}})
      .then(r=>r.json()).then(d=>{ setWpOrders(d.orders??[]); if(d.breadTypes?.length) setBreadTypes(d.breadTypes); })
      .finally(()=>setWpLoading(false));
  }
  function wpShiftWeek(delta: number) {
    const d=new Date(wpMonday+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+delta*7);
    const next=d.toISOString().slice(0,10); setWpMonday(next); loadWpOrders(next);
  }
  function wpStartEdit(customerId: string, date: string, ro: RecurringOrder) {
    const oneOff = wpOrders.find(o=>o.customerId===customerId && o.deliveryDate.slice(0,10)===date);
    const base: Record<string,number> = {};
    const src = oneOff ? oneOff.lines : ro.lines;
    for (const l of src) base[l.breadTypeId]=l.quantity;
    setWpEditQty(base); setWpEditKey(`${customerId}_${date}`);
  }
  async function wpSaveRow(customerId: string, date: string) {
    setWpSaving(true);
    const lines = Object.entries(wpEditQty).filter(([,q])=>q>0).map(([breadTypeId,quantity])=>({breadTypeId,quantity}));
    const existing = wpOrders.find(o=>o.customerId===customerId && o.deliveryDate.slice(0,10)===date);
    if (lines.length===0 && existing) {
      await fetch(`/api/bestellingen?id=${existing.id}`,{method:"DELETE",headers:{"x-role":role??""}});
    } else if (lines.length>0 && existing) {
      await fetch("/api/bestellingen/lines",{method:"PUT",headers:{"Content-Type":"application/json","x-role":role??""},body:JSON.stringify({orderId:existing.id,lines})});
    } else if (lines.length>0) {
      await fetch("/api/bestellingen",{method:"POST",headers:{"Content-Type":"application/json","x-role":role??""},body:JSON.stringify({customerId,deliveryDate:date,lines})});
    }
    setWpEditKey(null); setWpSaving(false); loadWpOrders(wpMonday);
  }
  async function wpDeleteOverride(orderId: string) {
    await fetch(`/api/bestellingen?id=${orderId}`,{method:"DELETE",headers:{"x-role":role??""}});
    loadWpOrders(wpMonday);
  }

  // Week-edit modal: edit all recurring days for one customer
  const [weekEditCustomerId, setWeekEditCustomerId] = useState<string|null>(null);
  const [weekEditEdits, setWeekEditEdits] = useState<Map<number,{lines:Record<string,number>;active:boolean}>>(new Map());
  const [weekEditDirty, setWeekEditDirty] = useState<Set<number>>(new Set());
  const [weekEditSaving, setWeekEditSaving] = useState(false);
  const [weekEditMsg, setWeekEditMsg] = useState<{ok:boolean;text:string}|null>(null);

  function loadOneOff() {
    fetch(`/api/bestellingen?from=${fromDate}&to=${toDate}`,{headers:{"x-role":role ?? ""}})
      .then(r=>r.json()).then(d=>{ setOrders(d.orders??[]); setBreadTypes(d.breadTypes??[]); setLoading(false);
        setMinDeliveryAmount(d.minDeliveryAmount ?? null);
        if (d.customers?.length) setCustomers(d.customers);
      });
  }
  function loadRecurring() {
    fetch("/api/bestellingen/recurring",{headers:{"x-role":role ?? ""}})
      .then(r=>r.json()).then(d=>{
        setRecurring(d.orders??[]);
        if (d.customers?.length) setCustomers(d.customers);
      });
  }
  function loadSettings() {
    fetch("/api/settings",{headers:{"x-role":role ?? ""}})
      .then(r=>r.json()).then(d=>{
        if (d.closedWeekdays) setClosedWeekdays(d.closedWeekdays);
      });
  }
  // Shop/pickup locations — owner-managed on Winkel, adding one there makes it
  // selectable here immediately.
  function loadShops() {
    fetch("/api/shops",{headers:{"x-role":role ?? ""}})
      .then(r=>r.json())
      .then(d => setShopPickup((d.shops ?? []).map((s: any) => ({ id: s.name, label: s.name.replace("Winkel ", "") }))));
  }
  function loadHistory() {
    setLoadingHistory(true);
    const params = new URLSearchParams({ from: logboekFrom, to: logboekTo });
    if (historyCustomerId) params.set("customerId", historyCustomerId);
    fetch(`/api/logboek?${params}`,{headers:{"x-role":role ?? ""}})
      .then(r=>r.json()).then(d=>{ setLogboekEntries(d.entries??[]); setLogboekBreadTypes(d.breadTypes??[]); setLoadingHistory(false); })
      .catch(()=>setLoadingHistory(false));
  }
  useEffect(()=>{ loadOneOff(); loadRecurring(); loadSettings(); loadShops(); },[fromDate,toDate]);
  useEffect(()=>{ loadHistory(); },[historyCustomerId, logboekFrom, logboekTo]);

  async function saveClosedWeekdays(days: number[]) {
    setSavingSettings(true);
    await fetch("/api/settings",{method:"POST",headers:{"Content-Type":"application/json","x-role":role??""}, body:JSON.stringify({closedWeekdays:days})});
    setSavingSettings(false);
    setClosedWeekdays(days);
  }

  function isFutureOrder(deliveryDate: string) {
    const d = deliveryDate.includes("T") ? deliveryDate.slice(0,10) : deliveryDate;
    return d >= today;
  }

  async function deleteOrder(id: string) {
    await fetch(`/api/bestellingen?id=${id}`,{method:"DELETE",headers:{"x-role":role ?? ""}});
    setPendingDeleteId(null);
    loadOneOff();
    loadHistory();
  }

  function toggleSelect(id: string) {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function deleteSelected() {
    if (selectedOrders.size === 0) return;
    setBulkDeleting(true);
    await Promise.all([...selectedOrders].map(id =>
      fetch(`/api/bestellingen?id=${id}`,{method:"DELETE",headers:{"x-role":role ?? ""}})
    ));
    setBulkDeleting(false);
    setSelectedOrders(new Set());
    loadOneOff();
  }

  function startEditOrder(order: OneOffOrder) {
    const q: Record<string,number>={};
    for (const l of order.lines) q[l.breadTypeId]=l.quantity;
    setEditOrderQty(q); setEditingOrderId(order.id);
  }

  async function saveOrderEdit(orderId: string) {
    setSavingEdit(true);
    await fetch("/api/bestellingen/lines",{
      method:"PUT", headers:{"Content-Type":"application/json","x-role":role ?? ""},
      body:JSON.stringify({ orderId, lines:Object.entries(editOrderQty).map(([breadTypeId,quantity])=>({breadTypeId,quantity})) }),
    });
    setSavingEdit(false); setEditingOrderId(null); loadOneOff();
  }

  function openWeekEdit(customerId: string) {
    const orders = recurring.filter(o => o.customerId === customerId);
    const edits = new Map<number,{lines:Record<string,number>;active:boolean}>();
    for (const o of orders) {
      const lines: Record<string,number> = {};
      for (const l of o.lines) lines[l.breadTypeId] = l.quantity;
      edits.set(o.weekday, { lines, active: o.active });
    }
    setWeekEditEdits(edits);
    setWeekEditDirty(new Set());
    setWeekEditMsg(null);
    setWeekEditCustomerId(customerId);
  }

  async function saveWeekEdit() {
    if (!weekEditCustomerId) return;
    setWeekEditSaving(true); setWeekEditMsg(null);
    try {
      // POST upserts by customerId+weekday — works for both new and existing days
      await Promise.all([...weekEditDirty].map(weekday => {
        const edit = weekEditEdits.get(weekday);
        if (!edit) return Promise.resolve();
        const linesPayload = Object.entries(edit.lines)
          .filter(([,q]) => q > 0)
          .map(([breadTypeId,quantity])=>({breadTypeId,quantity}));
        const existingOrder = recurring.find(o => o.customerId === weekEditCustomerId && o.weekday === weekday);
        return Promise.all([
          fetch("/api/bestellingen/recurring", {
            method:"POST", headers:{"Content-Type":"application/json","x-role":role??""},
            body:JSON.stringify({ customerId:weekEditCustomerId, weekday, lines:linesPayload }),
          }),
          existingOrder && edit.active !== existingOrder.active ? fetch("/api/bestellingen/recurring", {
            method:"PATCH", headers:{"Content-Type":"application/json","x-role":role??""},
            body:JSON.stringify({ id:existingOrder.id, active:edit.active }),
          }) : Promise.resolve(),
        ]);
      }));
      setWeekEditMsg({ ok:true, text:`✓ Opgeslagen.` });
      setWeekEditDirty(new Set());
      loadRecurring();
    } catch(e) {
      setWeekEditMsg({ ok:false, text:`Fout bij opslaan.` });
    }
    setWeekEditSaving(false);
    setTimeout(()=>setWeekEditMsg(null), 4000);
  }

  // Group by date — fix: use T12:00:00Z to avoid timezone issues
  const ordersByDate=new Map<string,OneOffOrder[]>();
  for (const o of orders) {
    const d = o.deliveryDate.includes("T")
      ? o.deliveryDate.slice(0,10)
      : new Date(o.deliveryDate + "T12:00:00Z").toISOString().slice(0,10);
    if (!ordersByDate.has(d)) ordersByDate.set(d,[]);
    ordersByDate.get(d)!.push(o);
  }

  // Quick day buttons
  function dateOffset(days: number) {
    const d = new Date(); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10);
  }
  function setDay(days: number) { const d=dateOffset(days); setFromDate(d); setToDate(d); }

  // Also get recurring for a specific weekday
  function recurringForDate(dateStr: string): RecurringOrder[] {
    const wd = getWeekday(dateStr);
    return (recurringByDay.get(wd)??[]).filter(r=>r.active);
  }

  const sortedDates=[...ordersByDate.keys()].sort();
  // Also add dates that have recurring but no one-off
  const allDates = new Set([...sortedDates]);
  if (fromDate===toDate) {
    // single day view — always show even if empty
    allDates.add(fromDate);
  }

  const activeBT = breadTypes
    .filter(bt => bt.customerOrderable ||
      orders.some(o => o.lines.some(l => l.breadTypeId === bt.id)) ||
      recurring.some(r => r.lines.some(l => l.breadTypeId === bt.id)))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const recurringByDay=new Map<number,RecurringOrder[]>();
  const filteredRecurring = recurring
    .filter(r => !recurringCustomerFilter || r.customerId === recurringCustomerFilter)
    .filter(r => recurringDayFilter === "" || r.weekday === recurringDayFilter);
  for (const r of filteredRecurring) { if (!recurringByDay.has(r.weekday)) recurringByDay.set(r.weekday,[]); recurringByDay.get(r.weekday)!.push(r); }
  const recurringCustomers = Array.from(new Map(recurring.map(r=>[r.customerId, r.customer])).values())
    .sort((a,b)=>a.name.localeCompare(b.name));
  // Tue–Sat, reordered to start from today's weekday (wrapping), so e.g. on Wednesday the
  // order is Wed, Thu, Fri, Sat, Tue instead of always Tue-first.
  const recurringDayOrder = (() => {
    const base = [2,3,4,5,6];
    const todayWd = jsWeekdayToISO(new Date());
    const startIdx = base.findIndex(d => d >= todayWd);
    return startIdx === -1 ? base : [...base.slice(startIdx), ...base.slice(0, startIdx)];
  })();

  return (
    <div style={{ padding:"2rem 2.5rem", maxWidth:1100 }}>
      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:"1.5rem", flexWrap:"wrap", gap:10 }}>
        <h1 style={{ fontSize:28 }}>Bestellingen</h1>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {(role === "BAKKER"
            ? [["klant","Logboek"]] as const
            : [["eenmalig","Eenmalig"],["vast","Vaste bestellingen"],["klant","Logboek"]] as const
          ).map(([t,label])=>(
            <button key={t} onClick={()=>setTab(t as any)} style={{
              padding:"7px 14px", borderRadius:8, border:"1px solid var(--border)",
              background:tab===t?"var(--accent)":"var(--surface)",
              color:tab===t?"white":"var(--text-muted)",
              cursor:"pointer", fontSize:13, fontFamily:"var(--font-body)",
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── EENMALIG ── */}
      {tab==="eenmalig" && (
        <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
          {canWrite && (
            <>
              {isOwner && (
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <button onClick={()=>setShowManage(!showManage)} className="btn-secondary" style={{ fontSize:12 }}>
                    {showManage?"▲ Verberg":"▼ Beheer broodsoorten"}
                  </button>
                </div>
              )}
              {showManage && isOwner && (
                <>
                  <BreadTypeAvailabilityManager breadTypes={breadTypes} onChanged={()=>{ loadOneOff(); }} />
                  <div className="card" style={{ padding:"1.25rem 1.5rem", marginBottom:0 }}>
                    <h3 style={{ fontSize:14, marginBottom:"0.75rem" }}>Gesloten dagen</h3>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:8 }}>
                      {[1,2,3,4,5,6,7].map(wd=>(
                        <button key={wd} onClick={()=>{
                          const next = closedWeekdays.includes(wd) ? closedWeekdays.filter(d=>d!==wd) : [...closedWeekdays,wd];
                          saveClosedWeekdays(next);
                        }} disabled={savingSettings} style={{
                          padding:"6px 12px", borderRadius:8, fontSize:12, cursor:"pointer", border:"1px solid", fontFamily:"var(--font-body)",
                          borderColor:closedWeekdays.includes(wd)?"var(--danger)":"var(--border)",
                          background:closedWeekdays.includes(wd)?"#fef2f2":"var(--surface-2)",
                          color:closedWeekdays.includes(wd)?"var(--danger)":"var(--text-subtle)",
                          opacity:savingSettings?0.6:1,
                        }}>
                          {closedWeekdays.includes(wd)?"✕":"+"} {WEEKDAYS[wd]}
                        </button>
                      ))}
                    </div>
                    <p style={{ fontSize:11, color:"var(--text-subtle)", margin:0 }}>Rood = gesloten dag (geen bestellingen/productie mogelijk).</p>
                  </div>
                </>
              )}
              <NewOrderForm customers={customers} breadTypes={breadTypes} onSaved={loadOneOff} closedWeekdays={closedWeekdays} minDeliveryAmount={minDeliveryAmount} shopPickup={shopPickup} />
            </>
          )}

          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <span style={{ fontSize:13, color:"var(--text-muted)" }}>Van</span>
            <input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} className="input" style={{ width:140 }} />
            <span style={{ fontSize:13, color:"var(--text-muted)" }}>tot</span>
            <input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} className="input" style={{ width:140 }} />
            <div style={{ display:"flex", gap:5 }}>
              {[["Vandaag",0],["Morgen",1],["Overmorgen",2]].map(([label,days])=>(
                <button key={label as string} onClick={()=>setDay(days as number)} className="btn-secondary" style={{ fontSize:12, padding:"6px 10px", whiteSpace:"nowrap" }}>
                  {label as string}
                </button>
              ))}
            </div>
            <select value={eenmaligCustomerFilter} onChange={e=>setEenmaligCustomerFilter(e.target.value)}
              style={{ border:"1px solid var(--border)", borderRadius:7, padding:"6px 10px", fontSize:13, background:"var(--surface)" }}>
              <option value="">Alle klanten</option>
              {[...customers].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>(
                <option key={c.id} value={c.id}>{c.name}{c.city?` (${c.city})`:""}</option>
              ))}
            </select>
            {eenmaligCustomerFilter && (
              <button onClick={()=>setEenmaligCustomerFilter("")} className="btn-secondary" style={{ fontSize:12, padding:"5px 8px" }}>✕</button>
            )}
          </div>

          {canWrite && (() => {
            const allOneOffIds = [...ordersByDate.values()].flat().filter(o=>isFutureOrder(o.deliveryDate)).map(o=>o.id);
            const allSelected = allOneOffIds.length > 0 && allOneOffIds.every(id=>selectedOrders.has(id));
            return allOneOffIds.length > 0 ? (
              <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, color:"var(--text-muted)", cursor:"pointer" }}>
                  <input type="checkbox" checked={allSelected}
                    onChange={()=>setSelectedOrders(allSelected ? new Set() : new Set(allOneOffIds))}
                    style={{ width:16, height:16, cursor:"pointer" }} />
                  Alles selecteren ({allOneOffIds.length})
                </label>
                {selectedOrders.size > 0 && (
                  <button onClick={deleteSelected} disabled={bulkDeleting}
                    style={{ fontSize:12, padding:"6px 12px", borderRadius:7, border:"1px solid #fca5a5", background:"none", cursor:"pointer", color:"var(--danger)" }}>
                    {bulkDeleting ? "Verwijderen…" : `🗑 ${selectedOrders.size} verwijderen`}
                  </button>
                )}
              </div>
            ) : null;
          })()}

          {loading && <p style={{ color:"var(--text-subtle)", fontSize:13 }}>Laden…</p>}
          {!loading&&sortedDates.length===0&&!(fromDate===toDate)&&(
            <div className="card" style={{ padding:"2.5rem", textAlign:"center", color:"var(--text-subtle)" }}>
              Geen bestellingen in deze periode.
            </div>
          )}

          {[...allDates].sort().map(date=>{
            const dayOrders=(ordersByDate.get(date)??[])
              .filter(o=>!eenmaligCustomerFilter || o.customerId===eenmaligCustomerFilter);
            if (dayOrders.length===0) return null;
            const d=new Date(date+"T12:00:00Z");
            const dateLabel=d.toLocaleDateString("nl-NL",{weekday:"long",day:"numeric",month:"long"});
            return (
              <section key={date}>
                <h2 style={{ fontSize:14, textTransform:"uppercase", letterSpacing:"0.06em", color:"var(--text-subtle)", marginBottom:8 }}>{dateLabel}</h2>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {/* One-off orders */}
                  {dayOrders.map(order=>{
                    const isEditing=editingOrderId===order.id;
                    const lines = order.lines.filter(l=>l.quantity>0);
                    return (
                      <div key={order.id} style={{ border:"1px solid var(--border)", borderRadius:8, padding:"10px 14px", background:isEditing?"var(--surface-2)":selectedOrders.has(order.id)?"var(--accent-light)":"var(--surface)" }}>
                        <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
                          {canWrite && !isEditing && isFutureOrder(order.deliveryDate) && (
                            <input type="checkbox" checked={selectedOrders.has(order.id)} onChange={()=>toggleSelect(order.id)}
                              style={{ marginTop:3, width:16, height:16, flexShrink:0, cursor:"pointer" }} />
                          )}
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:"flex", alignItems:"baseline", gap:8, flexWrap:"wrap", marginBottom:lines.length||order.notes?6:0 }}>
                              <span style={{ fontWeight:500, fontSize:13 }}>{order.customer.name}</span>
                              {order.customer.city && <span style={{ fontSize:12, color:"var(--text-subtle)" }}>{order.customer.city}</span>}
                              <span style={{ fontSize:10, background:"var(--accent-light)", color:"var(--accent)", padding:"2px 7px", borderRadius:8 }}>Eenmalig</span>
                              {order.notes && <span style={{ fontSize:11, color:"var(--text-subtle)", fontStyle:"italic" }}>{order.notes}</span>}
                            </div>
                            {!isEditing && (
                              <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                                {lines.map(l=>(
                                  <span key={l.breadTypeId} style={{ fontSize:11, background:"var(--accent-light)", color:"var(--accent)", padding:"2px 7px", borderRadius:10 }}>
                                    {colName(l.breadType.name)} {l.quantity}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {canWrite && (
                            <div style={{ display:"flex", gap:5, flexShrink:0 }}>
                              {isEditing ? (
                                <>
                                  <button onClick={()=>saveOrderEdit(order.id)} disabled={savingEdit}
                                    style={{ fontSize:11, padding:"4px 10px", borderRadius:6, border:"none", background:"var(--accent)", color:"white", cursor:"pointer" }}>
                                    {savingEdit?"…":"✓ Opslaan"}
                                  </button>
                                  <button onClick={undoEditOrderQty} disabled={!canUndoEditOrderQty}
                                    title="Ongedaan maken"
                                    style={{ fontSize:11, padding:"4px 9px", borderRadius:6, border:"1px solid var(--border)", background:"none", cursor:"pointer" }}>↩</button>
                                  <button onClick={()=>setEditingOrderId(null)}
                                    style={{ fontSize:11, padding:"4px 9px", borderRadius:6, border:"1px solid var(--border)", background:"none", cursor:"pointer" }}>✕</button>
                                </>
                              ) : (
                                <>
                                  {isFutureOrder(order.deliveryDate) && (
                                    <button onClick={()=>startEditOrder(order)}
                                      style={{ fontSize:11, padding:"4px 9px", borderRadius:6, border:"1px solid var(--border)", background:"none", cursor:"pointer", color:"var(--text-subtle)" }}>✎</button>
                                  )}
                                  {isFutureOrder(order.deliveryDate) && (
                                    pendingDeleteId === order.id ? (
                                      <>
                                        <button onClick={()=>deleteOrder(order.id)} style={{ fontSize:11, padding:"4px 9px", borderRadius:6, border:"none", background:"var(--danger)", color:"white", cursor:"pointer" }}>Ja, wis</button>
                                        <button onClick={()=>setPendingDeleteId(null)} style={{ fontSize:11, padding:"4px 9px", borderRadius:6, border:"1px solid var(--border)", background:"none", cursor:"pointer" }}>Nee</button>
                                      </>
                                    ) : (
                                      <button onClick={()=>setPendingDeleteId(order.id)}
                                        style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text-subtle)", fontSize:16, lineHeight:1 }}>×</button>
                                    )
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Edit panel */}
                        {isEditing && (
                          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(110px,1fr))", gap:7, marginTop:6 }}>
                            {activeBT.map(bt=>(
                              <div key={bt.id} style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:6, padding:"7px 9px" }}>
                                <label style={{ fontSize:10, color:"var(--text-subtle)", textTransform:"uppercase", display:"block", marginBottom:3 }}>{colName(bt.name)}</label>
                                <input type="number" onKeyDown={e=>{if(["e","E","-","+"].includes(e.key))e.preventDefault()}} min={0} value={editOrderQty[bt.id]||""}
                                  onChange={e=>setEditOrderQty(q=>({...q,[bt.id]:Math.min(999,parseInt(e.target.value)||0)}))} max={999}
                                  placeholder="0"
                                  style={{ width:"100%", border:"1px solid var(--border)", borderRadius:5, padding:"3px 6px", fontSize:13, fontWeight:600, background:"var(--surface)", textAlign:"right" }} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ── VAST ── */}
      {tab==="vast"&&(
        <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
          {isOwner && breadTypes.length > 0 && (
            <>
              <button onClick={() => setShowVastManage(v => !v)} className="btn-secondary" style={{ fontSize: 12, alignSelf: "flex-start" }}>
                {showVastManage ? "▲ Verberg broodsoorten" : "▼ Beheer broodsoorten"}
              </button>
              {showVastManage && <BreadTypeAvailabilityManager breadTypes={breadTypes} onChanged={loadOneOff} />}
            </>
          )}
          {canWriteRecurring && (
            <NewRecurringWeekForm customers={customers} breadTypes={breadTypes} recurring={recurring} onSaved={loadRecurring} closedWeekdays={closedWeekdays} minDeliveryAmount={minDeliveryAmount} shopPickup={shopPickup} />
          )}

          {/* filters */}
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <select value={recurringDayFilter} onChange={e=>setRecurringDayFilter(e.target.value === "" ? "" : Number(e.target.value))}
              style={{ border:"1px solid var(--border)", borderRadius:7, padding:"6px 10px", fontSize:13, background:"var(--surface)" }}>
              <option value="">Alle dagen</option>
              {recurringDayOrder.map(wd=><option key={wd} value={wd}>{WEEKDAYS[wd]}</option>)}
            </select>
            <select value={recurringCustomerFilter} onChange={e=>setRecurringCustomerFilter(e.target.value)}
              style={{ border:"1px solid var(--border)", borderRadius:7, padding:"6px 10px", fontSize:13, background:"var(--surface)" }}>
              <option value="">Alle klanten</option>
              {recurringCustomers.map(c=><option key={c.id} value={c.id}>{c.name}{c.city?` (${c.city})`:""}</option>)}
            </select>
            {(recurringCustomerFilter || recurringDayFilter !== "") && (
              <button onClick={()=>{ setRecurringCustomerFilter(""); setRecurringDayFilter(""); }} className="btn-secondary" style={{ fontSize:12, padding:"5px 10px" }}>
                ✕ Reset filter
              </button>
            )}
          </div>

          {filteredRecurring.length===0 && (
            <p style={{ fontSize:13, color:"var(--text-subtle)", textAlign:"center", padding:"1.5rem 0" }}>
              Geen vaste bestellingen gevonden.
            </p>
          )}
          {recurringDayOrder.map(wd=>{
            const dayOrders=recurringByDay.get(wd)??[];
            if (dayOrders.length===0) return null;
            const activeCount=dayOrders.filter(o=>o.active).length;
            return (
              <section key={wd}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                  <h2 style={{ fontSize:14, textTransform:"uppercase", letterSpacing:"0.06em", color:"var(--text-subtle)", margin:0 }}>{WEEKDAYS[wd]}</h2>
                  <span style={{ fontSize:12, color:"var(--text-subtle)" }}>{activeCount}/{dayOrders.length} actief</span>
                  <div style={{ flex:1, height:1, background:"var(--border)" }}/>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {dayOrders.map(order=>(
                    <RecurringCard key={order.id} order={order} breadTypes={breadTypes} onChanged={loadRecurring} isOwner={canWriteRecurring} onEditWeek={()=>openWeekEdit(order.customerId)} minDeliveryAmount={minDeliveryAmount} shopPickup={shopPickup} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ── LOGBOEK ── */}
      {tab==="klant" && (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {/* Filters */}
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-end" }}>
            <div>
              <label style={{ fontSize:11, color:"var(--text-subtle)", textTransform:"uppercase", display:"block", marginBottom:4 }}>Van</label>
              <input type="date" value={logboekFrom} onChange={e=>setLogboekFrom(e.target.value)}
                style={{ border:"1px solid var(--border)", borderRadius:7, padding:"7px 10px", fontSize:13, background:"var(--surface)" }} />
            </div>
            <div>
              <label style={{ fontSize:11, color:"var(--text-subtle)", textTransform:"uppercase", display:"block", marginBottom:4 }}>Tot</label>
              <input type="date" value={logboekTo} onChange={e=>setLogboekTo(e.target.value)}
                style={{ border:"1px solid var(--border)", borderRadius:7, padding:"7px 10px", fontSize:13, background:"var(--surface)" }} />
            </div>
            <div>
              <label style={{ fontSize:11, color:"var(--text-subtle)", textTransform:"uppercase", display:"block", marginBottom:4 }}>Klant</label>
              <select value={historyCustomerId} onChange={e=>setHistoryCustomerId(e.target.value)}
                style={{ border:"1px solid var(--border)", borderRadius:7, padding:"7px 10px", fontSize:13, background:"var(--surface)", minWidth:200 }}>
                <option value="">Alle klanten</option>
                {[...customers].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>(
                  <option key={c.id} value={c.id}>{c.name}{c.city?` (${c.city})`:""}</option>
                ))}
              </select>
            </div>
            {historyCustomerId && (
              <button onClick={()=>setHistoryCustomerId("")} className="btn-secondary" style={{ fontSize:12, padding:"7px 10px" }}>✕ Reset filter</button>
            )}
          </div>

          <style>{`@media(max-width:700px){.logboek-table{display:none!important;}.logboek-cards{display:flex!important;}}`}</style>
          {loadingHistory ? (
            <p style={{ color:"var(--text-subtle)", fontSize:13 }}>Laden…</p>
          ) : logboekEntries.length === 0 ? (
            <div className="card" style={{ padding:"2rem", textAlign:"center", color:"var(--text-subtle)", fontSize:13 }}>
              Geen bestellingen gevonden in deze periode.
            </div>
          ) : (()=>{
            const sorted = [...logboekEntries].sort((a,b)=>b.date.localeCompare(a.date));
            const logBTs = [...logboekBreadTypes].sort((a,b)=>a.name.localeCompare(b.name));
            const thS: React.CSSProperties = { fontSize:11, fontWeight:600, textTransform:"uppercase", color:"var(--text-subtle)", padding:"5px 8px", textAlign:"right", borderBottom:"2px solid var(--border)", whiteSpace:"nowrap" };
            const tdS: React.CSSProperties = { fontSize:13, padding:"5px 8px", textAlign:"right", borderBottom:"1px solid var(--border)" };
            const TYPE_LABEL: Record<string,string> = { eenmalig:"E", vast:"V", winkel:"W" };
            const TYPE_COLOR: Record<string,string> = { eenmalig:"var(--accent)", vast:"#7c3aed", winkel:"#059669" };
            return (
              <div>
                <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:8 }}>
                  <p style={{ fontSize:12, color:"var(--text-subtle)", margin:0 }}>{sorted.length} regels</p>
                  <span style={{ fontSize:11, color:"var(--text-subtle)" }}>
                    <span style={{ color:"var(--accent)", fontWeight:600 }}>E</span> = eenmalig &nbsp;
                    <span style={{ color:"#7c3aed", fontWeight:600 }}>V</span> = vast &nbsp;
                    <span style={{ color:"#059669", fontWeight:600 }}>W</span> = winkel
                  </span>
                </div>
                {/* Desktop table */}
                <div className="logboek-table" style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                    <thead>
                      <tr>
                        <th style={{ ...thS, textAlign:"center", width:26 }}>Type</th>
                        <th style={{ ...thS, textAlign:"left" }}>Datum</th>
                        <th style={{ ...thS, textAlign:"left" }}>Klant</th>
                        {logBTs.map(bt=><th key={bt.id} style={thS}>{colName(bt.name)}</th>)}
                        <th style={thS}>Notities</th>
                        <th style={thS}>Totaal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((entry, idx)=>{
                        const d = new Date(entry.date+"T12:00:00Z");
                        const dateLabel = d.toLocaleDateString("nl-NL",{weekday:"short",day:"numeric",month:"short"});
                        const isPast = entry.date < today;
                        const qtyMap = new Map(entry.lines.map(l=>[l.breadTypeId, l.quantity]));
                        const total = entry.lines.reduce((s,l)=>s+l.quantity,0);
                        return (
                          <tr key={idx} style={{ opacity: isPast ? 0.8 : 1, background: isPast ? undefined : "var(--accent-light)" }}>
                            <td style={{ ...tdS, textAlign:"center" }}>
                              <span style={{ fontSize:11, fontWeight:700, color:TYPE_COLOR[entry.type] }}>{TYPE_LABEL[entry.type]}</span>
                            </td>
                            <td style={{ ...tdS, textAlign:"left", whiteSpace:"nowrap", color: isPast ? "var(--text-subtle)" : "var(--text)", fontWeight: isPast ? 400 : 600 }}>{dateLabel}</td>
                            <td style={{ ...tdS, textAlign:"left" }}>{entry.customerName}{entry.city ? <span style={{ fontSize:11, color:"var(--text-subtle)" }}> ({entry.city})</span> : null}</td>
                            {logBTs.map(bt=>(
                              <td key={bt.id} style={{ ...tdS, color: (qtyMap.get(bt.id)??0)>0 ? "var(--text)" : "var(--text-subtle)" }}>
                                {qtyMap.get(bt.id) || "—"}
                              </td>
                            ))}
                            <td style={{ ...tdS, fontSize:11, color:"var(--text-subtle)", fontStyle:"italic", textAlign:"left", maxWidth:160 }}>{entry.notes || ""}</td>
                            <td style={{ ...tdS, fontWeight:600 }}>{total || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Mobile card list */}
                <div className="logboek-cards" style={{ display:"none", flexDirection:"column", gap:8 }}>
                  {sorted.map((entry,idx)=>{
                    const d = new Date(entry.date+"T12:00:00Z");
                    const dateLabel = d.toLocaleDateString("nl-NL",{weekday:"short",day:"numeric",month:"short"});
                    const isPast = entry.date < today;
                    const total = entry.lines.reduce((s,l)=>s+l.quantity,0);
                    return (
                      <div key={idx} style={{ border:"1px solid var(--border)", borderRadius:8, padding:"10px 14px", background: isPast ? "var(--surface)" : "var(--accent-light)" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                          <span style={{ fontSize:10, fontWeight:700, color:TYPE_COLOR[entry.type], background:"var(--surface-2)", padding:"2px 6px", borderRadius:5 }}>{TYPE_LABEL[entry.type]}</span>
                          <span style={{ fontSize:12, fontWeight:600, color: isPast?"var(--text-subtle)":"var(--text)" }}>{dateLabel}</span>
                          <span style={{ fontSize:13, fontWeight:500, flex:1 }}>{entry.customerName}{entry.city&&<span style={{ fontSize:11, color:"var(--text-subtle)", marginLeft:4 }}>({entry.city})</span>}</span>
                          <span style={{ fontSize:13, fontWeight:700, color:"var(--accent)" }}>{total}</span>
                        </div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                          {entry.lines.filter(l=>l.quantity>0).map(l=>(
                            <span key={l.breadTypeId} style={{ fontSize:11, background:"var(--accent-light)", color:"var(--accent)", padding:"2px 7px", borderRadius:8 }}>
                              {colName(l.breadTypeName)} ×{l.quantity}
                            </span>
                          ))}
                        </div>
                        {entry.notes&&<div style={{ fontSize:11, color:"var(--text-subtle)", fontStyle:"italic", marginTop:4 }}>{entry.notes}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── WEEK EDIT MODAL ── */}
      {weekEditCustomerId && (()=>{
        const customerOrders = recurring.filter(o=>o.customerId===weekEditCustomerId).sort((a,b)=>a.weekday-b.weekday);
        const customerName = customers.find(c=>c.id===weekEditCustomerId)?.name ?? customerOrders[0]?.customer.name ?? "";
        // Show all open delivery weekdays (2–6 by default, minus closed days)
        const openWeekdays = [2,3,4,5,6].filter(wd=>!closedWeekdays.includes(wd));
        const vastBTs = breadTypes
          .filter(bt=>bt.customerOrderable||customerOrders.some(o=>o.lines.some(l=>l.breadTypeId===bt.id)))
          .sort((a,b)=>a.sortOrder-b.sortOrder);
        const thS: React.CSSProperties = { fontSize:11, fontWeight:600, textTransform:"uppercase", color:"var(--text-subtle)", padding:"6px 10px", borderBottom:"2px solid var(--border)", textAlign:"center", whiteSpace:"nowrap" };
        const tdS: React.CSSProperties = { padding:"5px 6px", borderBottom:"1px solid var(--border)", textAlign:"center", verticalAlign:"middle" };
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(28,16,9,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:50, padding:16 }}>
            <div style={{ background:"var(--surface)", borderRadius:14, width:"100%", maxWidth:"min(99vw, 1400px)", padding:"1.75rem", display:"flex", flexDirection:"column", gap:16, maxHeight:"95vh", overflowY:"auto" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <h2 style={{ margin:0, fontSize:18 }}>Vaste bestelling — {customerName}</h2>
                <button onClick={()=>setWeekEditCustomerId(null)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:22, color:"var(--text-subtle)" }}>×</button>
              </div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13, minWidth:600 }}>
                  <thead>
                    <tr>
                      <th style={{ ...thS, textAlign:"left", minWidth:90 }}>Dag</th>
                      {vastBTs.map(bt=><th key={bt.id} style={{ ...thS, minWidth:60 }}>{colName(bt.name)}</th>)}
                      <th style={{ ...thS, minWidth:60 }}>Actief</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openWeekdays.map(weekday=>{
                      const existingOrder = customerOrders.find(o=>o.weekday===weekday);
                      const edit = weekEditEdits.get(weekday) ?? { lines:{}, active: existingOrder?.active ?? true };
                      function setDayEdit(upd: Partial<typeof edit>) {
                        setWeekEditEdits(prev=>new Map(prev).set(weekday,{...edit,...upd}));
                        setWeekEditDirty(prev=>new Set(prev).add(weekday));
                      }
                      const hasAny = vastBTs.some(bt=>(edit.lines[bt.id]??0)>0);
                      return (
                        <tr key={weekday} style={{ opacity: edit.active ? 1 : 0.5, background: weekEditDirty.has(weekday) ? "var(--accent-light)" : !existingOrder ? "var(--surface-2)" : undefined }}>
                          <td style={{ ...tdS, textAlign:"left", fontWeight:500 }}>
                            {WEEKDAYS[weekday]}
                            {!existingOrder && <span style={{ fontSize:10, color:"var(--text-subtle)", marginLeft:5 }}>nieuw</span>}
                          </td>
                          {vastBTs.map(bt=>(
                            <td key={bt.id} style={tdS}>
                              <input type="number" min={0} max={99}
                                value={edit.lines[bt.id] ?? 0}
                                onChange={e=>setDayEdit({ lines:{...edit.lines,[bt.id]:Math.max(0,parseInt(e.target.value)||0)} })}
                                style={{ width:52, border:"1px solid var(--border)", borderRadius:5, padding:"3px 5px", fontSize:12, textAlign:"center", background:"var(--surface)" }}
                              />
                            </td>
                          ))}
                          <td style={tdS}>
                            {(existingOrder || hasAny) && (
                              <input type="checkbox" checked={edit.active} onChange={e=>setDayEdit({ active:e.target.checked })} style={{ width:16, height:16, cursor:"pointer" }} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <button onClick={saveWeekEdit} disabled={weekEditSaving||weekEditDirty.size===0}
                  style={{ padding:"9px 22px", borderRadius:8, border:"none", background:"var(--accent)", color:"#fff", fontWeight:600, fontSize:13, cursor: weekEditDirty.size===0?"default":"pointer", opacity: weekEditDirty.size===0?0.5:1 }}>
                  {weekEditSaving ? "Opslaan…" : `Opslaan${weekEditDirty.size>0?` (${weekEditDirty.size} gewijzigd)`:""}`}
                </button>
                <button onClick={()=>setWeekEditCustomerId(null)} className="btn-secondary" style={{ fontSize:13 }}>Sluiten</button>
                {weekEditMsg && <span style={{ fontSize:13, color: weekEditMsg.ok?"var(--accent)":"var(--danger)" }}>{weekEditMsg.text}</span>}
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
