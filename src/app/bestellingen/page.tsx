"use client";
import { useRole } from "@/lib/role-context";
import React, { useEffect, useState, useCallback } from "react";

const WEEKDAYS = ["","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];

type BreadType = { id: string; slug: string; name: string; sortOrder: number; customerOrderable: boolean };
type Customer  = { id: string; name: string; city: string | null; preferredBread?: string | null };
type OrderLine = { breadTypeId: string; quantity: number; breadType: { id: string; name: string } };
type OneOffOrder = { id: string; customerId: string; deliveryDate: string; notes: string | null; customer: Customer; lines: OrderLine[] };
type LogboekEntry = { type: "eenmalig"|"vast"|"winkel"; date: string; customerName: string; customerId: string; city: string|null; notes: string|null; lines: { breadTypeId: string; breadTypeName: string; quantity: number }[] };
type RecurringLine = { breadTypeId: string; quantity: number; breadType: { id: string; name: string; sortOrder: number } };
type RecurringOrder = { id: string; customerId: string; weekday: number; active: boolean; notes: string | null; customer: Customer; lines: RecurringLine[] };
type Exception = { id: string; date: string; active: boolean };

function getWeekday(date: string) { const d = new Date(date+"T12:00:00Z"); const j=d.getUTCDay(); return j===0?7:j; }

const SLUG_ORDER = [
  "boeren-kl","boeren-gr","boeren-15kg",
  "sesam","sesam-15kg","zaden","zaden-15kg",
  "olijf","rozijn",
  "baguette","baguette-kaas",
  "spelt","volkoren","gekiemde-rogge",
  "kaneel-buns","kardemom-buns",
];

function colName(name: string) {
  return name.replace("Boeren ","B. ").replace(" KG","kg")
    .replace("Baguette 0.5 kg","Baguette").replace("Baguette Kaas/Peper","Kaas/P")
    .replace("Gekiemde Rogge","G.Rogge").replace("Morning buns","Buns");
}

// ── Bread type manager ────────────────────────────────────────────────────────
function BreadTypeManager({ breadTypes, onChanged }: { breadTypes: BreadType[]; onChanged: () => void }) {
  const [saving, setSaving] = useState<string|null>(null);

  async function toggle(bt: BreadType) {
    setSaving(bt.id);
    await fetch("/digitalbakery/api/bread-types", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": "OWNER" },
      body: JSON.stringify({ id: bt.id, customerOrderable: !bt.customerOrderable }),
    });
    setSaving(null);
    onChanged();
  }

  return (
    <div className="card" style={{ padding: "1.25rem 1.5rem", marginBottom: 20 }}>
      <h3 style={{ fontSize: 14, marginBottom: "0.75rem" }}>Bestelbaar voor klanten</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {breadTypes.map(bt => (
          <button key={bt.id} onClick={() => toggle(bt)} disabled={saving === bt.id} style={{
            padding: "6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer",
            border: "1px solid",
            borderColor: bt.customerOrderable ? "var(--accent)" : "var(--border)",
            background: bt.customerOrderable ? "var(--accent-light)" : "var(--surface-2)",
            color: bt.customerOrderable ? "var(--accent)" : "var(--text-subtle)",
            fontFamily: "var(--font-body)",
            opacity: saving === bt.id ? 0.6 : 1,
          }}>
            {bt.customerOrderable ? "✓" : "+"} {bt.name}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 11, color: "var(--text-subtle)", margin: "8px 0 0" }}>
        Klik op een broodsoort om te wisselen. Goudkleurig = bestelbaar voor klanten.
      </p>
    </div>
  );
}

// ── New order form ────────────────────────────────────────────────────────────
function NewOrderForm({ customers, breadTypes, onSaved, closedWeekdays }: { customers: Customer[]; breadTypes: BreadType[]; onSaved: () => void; closedWeekdays: number[] }) {
  const { role } = useRole();
  const today = new Date().toISOString().slice(0,10);
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState<Record<string,number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const hasLines = Object.values(qty).some(v => v > 0);

  function getDateWeekday(d: string) { const dt = new Date(d+"T12:00:00Z"); const j=dt.getUTCDay(); return j===0?7:j; }

  async function save() {
    if (!customerId) { setError("Selecteer eerst een klant."); return; }
    if (!hasLines) { setError("Voeg minimaal één broodsoort toe."); return; }
    if (closedWeekdays.includes(getDateWeekday(date))) {
      const dayName = WEEKDAYS[getDateWeekday(date)];
      setError(`${dayName} is een gesloten dag — geen levering mogelijk.`);
      return;
    }
    setSaving(true); setError(""); setSuccess("");
    const customerName = customers.find(c=>c.id===customerId)?.name ?? "";
    const res = await fetch("/digitalbakery/api/bestellingen", {
      method: "POST", headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify({ customerId, deliveryDate: date, notes: notes||undefined,
        lines: Object.entries(qty).filter(([,q])=>q>0).map(([breadTypeId,quantity])=>({breadTypeId,quantity})) }),
    });
    setSaving(false);
    if (res.ok) {
      setQty({}); setNotes(""); onSaved();
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
          <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="bijv. voor 9:00, pakbon mee…" style={inp} />
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(110px,1fr))", gap:8, marginBottom:10 }}>
        {breadTypes.filter(bt=>bt.customerOrderable).map(bt=>(
          <div key={bt.id} style={{ background:"var(--surface-2)", border:"1px solid var(--border)", borderRadius:7, padding:"7px 9px" }}>
            <label style={{ fontSize:10, color:"var(--text-subtle)", textTransform:"uppercase", display:"block", marginBottom:3 }}>{colName(bt.name)}</label>
            <input type="number" onKeyDown={e=>{if(["e","E","-","+",","].includes(e.key))e.preventDefault()}} min={0} max={999} value={qty[bt.id]||""} onChange={e=>setQty(q=>({...q,[bt.id]:Math.min(999,parseInt(e.target.value)||0)}))} placeholder="0"
              style={{ width:"100%", border:"1px solid var(--border)", borderRadius:5, padding:"4px 6px", fontSize:14, fontWeight:600, background:"var(--surface)", textAlign:"right" }} />
          </div>
        ))}
      </div>
      {error && <p style={{ color:"var(--danger)", fontSize:13, margin:"0 0 8px" }}>{error}</p>}
      {success && <p style={{ color:"var(--success)", fontSize:13, margin:"0 0 8px", fontWeight:500 }}>{success}</p>}
      <button onClick={save} disabled={saving} className="btn-primary" style={{ fontSize:13 }}>
        {saving?"Opslaan…":"Bestelling toevoegen"}
      </button>
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
    const res = await fetch("/digitalbakery/api/bestellingen/recurring", {
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
        {breadTypes.filter(bt=>bt.customerOrderable).map(bt=>(
          <div key={bt.id} style={{ background:"var(--surface-2)", border:"1px solid var(--border)", borderRadius:7, padding:"7px 9px" }}>
            <label style={{ fontSize:10, color:"var(--text-subtle)", textTransform:"uppercase", display:"block", marginBottom:3 }}>{colName(bt.name)}</label>
            <input type="number" onKeyDown={e=>{if(["e","E","-","+",","].includes(e.key))e.preventDefault()}} min={0} max={999} value={qty[bt.id]||""} onChange={e=>setQty(q=>({...q,[bt.id]:Math.min(999,parseInt(e.target.value)||0)}))} placeholder="0"
              style={{ width:"100%", border:"1px solid var(--border)", borderRadius:5, padding:"4px 6px", fontSize:14, fontWeight:600, background:"var(--surface)", textAlign:"right" }} />
          </div>
        ))}
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
function NewRecurringWeekForm({ customers, breadTypes, recurring, onSaved, closedWeekdays }: {
  customers: Customer[]; breadTypes: BreadType[]; recurring: RecurringOrder[]; onSaved: () => void; closedWeekdays: number[];
}) {
  const { role } = useRole();
  const [customerId, setCustomerId] = useState("");
  // qty: weekday (1-7) → breadTypeId → quantity
  const [qty, setQty] = useState<Record<number, Record<string,number>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [expanded, setExpanded] = useState(false);

  const allBTs = breadTypes; // show all bread types (not filtered by customerOrderable)
  const openDays = [2,3,4,5,6].filter(wd => !closedWeekdays.includes(wd)); // Tue–Sat by default

  // Pre-fill from existing recurring orders for selected customer
  useEffect(() => {
    if (!customerId) { setQty({}); return; }
    const initial: Record<number, Record<string,number>> = {};
    for (const wd of openDays) {
      initial[wd] = {};
      const order = recurring.find(o => o.customerId === customerId && o.weekday === wd);
      if (order) {
        for (const l of order.lines) initial[wd][l.breadTypeId] = l.quantity;
      }
    }
    setQty(initial);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, recurring.map(o=>o.id).join(",")]);

  async function save() {
    if (!customerId) { setError("Selecteer eerst een klant."); return; }
    const daysWithOrders = openDays.filter(wd => Object.values(qty[wd] ?? {}).some(v => v > 0));
    if (daysWithOrders.length === 0) { setError("Voeg minimaal één broodsoort toe."); return; }
    setSaving(true); setError(""); setSuccess("");
    for (const wd of daysWithOrders) {
      const lines = Object.entries(qty[wd] ?? {}).filter(([,q])=>q>0).map(([breadTypeId,quantity])=>({breadTypeId,quantity}));
      await fetch("/digitalbakery/api/bestellingen/recurring", {
        method: "POST", headers: { "Content-Type": "application/json", "x-role": role ?? "" },
        body: JSON.stringify({ customerId, weekday: wd, lines }),
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
            <div style={{ overflowX:"auto", marginBottom:16 }}>
              <table style={{ borderCollapse:"collapse", fontSize:13 }}>
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
                </tbody>
              </table>
            </div>
          )}
          {error && <p style={{ color:"var(--danger)", fontSize:13, margin:"0 0 8px" }}>{error}</p>}
          {success && <p style={{ color:"var(--success)", fontSize:13, margin:"0 0 8px", fontWeight:500 }}>{success}</p>}
          {customerId && (
            <button onClick={save} disabled={saving} className="btn-primary" style={{ fontSize:13 }}>
              {saving?"Opslaan…":"Vaste bestellingen opslaan"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Recurring order with exception planning ───────────────────────────────────
function RecurringCard({ order, breadTypes, onChanged, isOwner, onEditWeek }: {
  order: RecurringOrder; breadTypes: BreadType[]; onChanged: () => void; isOwner: boolean; onEditWeek?: () => void;
}) {
  const { role } = useRole();
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPlanner, setShowPlanner] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [loadingEx, setLoadingEx] = useState(false);
  const [editQty, setEditQty] = useState<Record<string,number>>({});

  async function toggle() {
    setToggling(true);
    await fetch("/digitalbakery/api/bestellingen/recurring", {
      method:"PATCH", headers:{"Content-Type":"application/json","x-role":role ?? ""},
      body: JSON.stringify({ id:order.id, active:!order.active }),
    });
    setToggling(false); onChanged();
  }

  async function deleteOrder() {
    if (!confirm(`Vaste bestelling van ${order.customer.name} (${WEEKDAYS[order.weekday]}) definitief verwijderen?`)) return;
    setDeleting(true);
    await fetch(`/digitalbakery/api/bestellingen/recurring?id=${order.id}`, { method:"DELETE", headers:{"x-role":role ?? ""} });
    setDeleting(false); onChanged();
  }

  async function saveEdit() {
    await fetch("/digitalbakery/api/bestellingen/recurring", {
      method:"POST", headers:{"Content-Type":"application/json","x-role":role ?? ""},
      body: JSON.stringify({ customerId:order.customerId, weekday:order.weekday,
        lines: Object.entries(editQty).filter(([,q])=>q>0).map(([breadTypeId,quantity])=>({breadTypeId,quantity})) }),
    });
    setShowEdit(false); onChanged();
  }

  async function loadExceptions() {
    setLoadingEx(true);
    const res = await fetch(`/digitalbakery/api/bestellingen/exceptions?recurringOrderId=${order.id}`, { headers:{"x-role":role ?? ""} });
    const d = await res.json();
    setExceptions(d.exceptions??[]);
    setLoadingEx(false);
  }

  async function setException(date: string, active: boolean) {
    await fetch("/digitalbakery/api/bestellingen/exceptions", {
      method:"POST", headers:{"Content-Type":"application/json","x-role":role ?? ""},
      body: JSON.stringify({ recurringOrderId:order.id, date, active }),
    });
    loadExceptions();
  }

  function openPlanner() { setShowPlanner(true); loadExceptions(); }
  function openEdit() {
    const q: Record<string,number> = {};
    for (const l of order.lines) q[l.breadTypeId] = l.quantity;
    setEditQty(q); setShowEdit(true);
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
              <button onClick={saveEdit} className="btn-primary" style={{ fontSize:11, padding:"4px 12px" }}>Opslaan</button>
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
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(today);
  const toDefault = new Date(today); toDefault.setDate(toDefault.getDate()+7);
  const [toDate, setToDate] = useState(toDefault.toISOString().slice(0,10));
  const [editingOrderId, setEditingOrderId] = useState<string|null>(null);
  const [editOrderQty, setEditOrderQty] = useState<Record<string,number>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [tab, setTab] = useState<"eenmalig"|"vast"|"klant">("eenmalig");
  const [recurringCustomerFilter, setRecurringCustomerFilter] = useState("");
  const [recurringCityFilter, setRecurringCityFilter] = useState("");
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

  // Week-edit modal: edit all recurring days for one customer
  const [weekEditCustomerId, setWeekEditCustomerId] = useState<string|null>(null);
  const [weekEditEdits, setWeekEditEdits] = useState<Map<string,{lines:Record<string,number>;active:boolean}>>(new Map());
  const [weekEditDirty, setWeekEditDirty] = useState<Set<string>>(new Set());
  const [weekEditSaving, setWeekEditSaving] = useState(false);
  const [weekEditMsg, setWeekEditMsg] = useState<{ok:boolean;text:string}|null>(null);

  function loadOneOff() {
    fetch(`/digitalbakery/api/bestellingen?from=${fromDate}&to=${toDate}`,{headers:{"x-role":role ?? ""}})
      .then(r=>r.json()).then(d=>{ setOrders(d.orders??[]); setBreadTypes(d.breadTypes??[]); setLoading(false);
        if (d.customers?.length) setCustomers(d.customers);
      });
  }
  function loadRecurring() {
    fetch("/digitalbakery/api/bestellingen/recurring",{headers:{"x-role":role ?? ""}})
      .then(r=>r.json()).then(d=>{
        setRecurring(d.orders??[]);
        if (d.customers?.length) setCustomers(d.customers);
      });
  }
  function loadSettings() {
    fetch("/digitalbakery/api/settings",{headers:{"x-role":role ?? ""}})
      .then(r=>r.json()).then(d=>{ if (d.closedWeekdays) setClosedWeekdays(d.closedWeekdays); });
  }
  function loadHistory() {
    setLoadingHistory(true);
    const params = new URLSearchParams({ from: logboekFrom, to: logboekTo });
    if (historyCustomerId) params.set("customerId", historyCustomerId);
    fetch(`/digitalbakery/api/logboek?${params}`,{headers:{"x-role":role ?? ""}})
      .then(r=>r.json()).then(d=>{ setLogboekEntries(d.entries??[]); setLogboekBreadTypes(d.breadTypes??[]); setLoadingHistory(false); })
      .catch(()=>setLoadingHistory(false));
  }
  useEffect(()=>{ loadOneOff(); loadRecurring(); loadSettings(); },[fromDate,toDate]);
  useEffect(()=>{ loadHistory(); },[historyCustomerId, logboekFrom, logboekTo]);

  async function saveClosedWeekdays(days: number[]) {
    setSavingSettings(true);
    await fetch("/digitalbakery/api/settings",{method:"POST",headers:{"Content-Type":"application/json","x-role":role??""}, body:JSON.stringify({closedWeekdays:days})});
    setSavingSettings(false);
    setClosedWeekdays(days);
  }

  function isFutureOrder(deliveryDate: string) {
    const d = deliveryDate.includes("T") ? deliveryDate.slice(0,10) : deliveryDate;
    return d >= today;
  }

  async function deleteOrder(id: string) {
    if (!confirm("Bestelling verwijderen?")) return;
    await fetch(`/digitalbakery/api/bestellingen?id=${id}`,{method:"DELETE",headers:{"x-role":role ?? ""}});
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
    if (!confirm(`${selectedOrders.size} bestelling${selectedOrders.size===1?"":"en"} verwijderen?`)) return;
    setBulkDeleting(true);
    await Promise.all([...selectedOrders].map(id =>
      fetch(`/digitalbakery/api/bestellingen?id=${id}`,{method:"DELETE",headers:{"x-role":role ?? ""}})
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
    await fetch("/digitalbakery/api/bestellingen/lines",{
      method:"PUT", headers:{"Content-Type":"application/json","x-role":role ?? ""},
      body:JSON.stringify({ orderId, lines:Object.entries(editOrderQty).map(([breadTypeId,quantity])=>({breadTypeId,quantity})) }),
    });
    setSavingEdit(false); setEditingOrderId(null); loadOneOff();
  }

  function openWeekEdit(customerId: string) {
    const orders = recurring.filter(o => o.customerId === customerId);
    const edits = new Map<string,{lines:Record<string,number>;active:boolean}>();
    for (const o of orders) {
      const lines: Record<string,number> = {};
      for (const l of o.lines) lines[l.breadTypeId] = l.quantity;
      edits.set(o.id, { lines, active: o.active });
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
      const orders = recurring.filter(o => o.customerId === weekEditCustomerId && weekEditDirty.has(o.id));
      await Promise.all(orders.map(o => {
        const edit = weekEditEdits.get(o.id);
        if (!edit) return Promise.resolve();
        const linesPayload = Object.entries(edit.lines).map(([breadTypeId,quantity])=>({breadTypeId,quantity}));
        return Promise.all([
          fetch("/digitalbakery/api/bestellingen/recurring", {
            method:"POST", headers:{"Content-Type":"application/json","x-role":role??""},
            body:JSON.stringify({ customerId:o.customerId, weekday:o.weekday, lines:linesPayload }),
          }),
          edit.active !== o.active ? fetch("/digitalbakery/api/bestellingen/recurring", {
            method:"PATCH", headers:{"Content-Type":"application/json","x-role":role??""},
            body:JSON.stringify({ id:o.id, active:edit.active }),
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
    .sort((a, b) => {
      const ai = SLUG_ORDER.indexOf(a.slug); const bi = SLUG_ORDER.indexOf(b.slug);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  const recurringByDay=new Map<number,RecurringOrder[]>();
  const filteredRecurring = recurring
    .filter(r => !recurringCustomerFilter || r.customerId === recurringCustomerFilter)
    .filter(r => !recurringCityFilter || (r.customer.city ?? "") === recurringCityFilter);
  for (const r of filteredRecurring) { if (!recurringByDay.has(r.weekday)) recurringByDay.set(r.weekday,[]); recurringByDay.get(r.weekday)!.push(r); }
  const recurringCustomers = Array.from(new Map(recurring.map(r=>[r.customerId, r.customer])).values())
    .sort((a,b)=>a.name.localeCompare(b.name));
  const recurringCities = [...new Set(recurring.map(r=>r.customer.city ?? "").filter(Boolean))].sort();

  return (
    <div style={{ padding:"2rem 2.5rem", maxWidth:1100 }}>
      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:"1.5rem", flexWrap:"wrap", gap:10 }}>
        <h1 style={{ fontSize:28 }}>Bestellingen</h1>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {([["eenmalig","Eenmalig"],["vast","Vaste bestellingen"],["klant","Logboek"]] as const).map(([t,label])=>(
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
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <button onClick={()=>setShowManage(!showManage)} className="btn-secondary" style={{ fontSize:12 }}>
                  {showManage?"▲ Verberg":"▼ Beheer broodsoorten"}
                </button>
              </div>
              {showManage && isOwner && (
                <>
                  <BreadTypeManager breadTypes={breadTypes} onChanged={()=>{ loadOneOff(); }} />
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
              <NewOrderForm customers={customers} breadTypes={breadTypes} onSaved={loadOneOff} closedWeekdays={closedWeekdays} />
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
            const dayOrders=ordersByDate.get(date)??[];
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
                                    <button onClick={()=>deleteOrder(order.id)}
                                      style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text-subtle)", fontSize:16, lineHeight:1 }}>×</button>
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
            <BreadTypeManager breadTypes={breadTypes} onChanged={loadOneOff} />
          )}
          {canWriteRecurring && (
            <NewRecurringWeekForm customers={customers} breadTypes={breadTypes} recurring={recurring} onSaved={loadRecurring} closedWeekdays={closedWeekdays} />
          )}

          {/* filters */}
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <select value={recurringCityFilter} onChange={e=>setRecurringCityFilter(e.target.value)}
              style={{ border:"1px solid var(--border)", borderRadius:7, padding:"6px 10px", fontSize:13, background:"var(--surface)" }}>
              <option value="">Alle steden</option>
              {recurringCities.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <select value={recurringCustomerFilter} onChange={e=>setRecurringCustomerFilter(e.target.value)}
              style={{ border:"1px solid var(--border)", borderRadius:7, padding:"6px 10px", fontSize:13, background:"var(--surface)" }}>
              <option value="">Alle klanten</option>
              {recurringCustomers
                .filter(c => !recurringCityFilter || (c.city ?? "") === recurringCityFilter)
                .map(c=><option key={c.id} value={c.id}>{c.name}{c.city?` (${c.city})`:""}</option>)}
            </select>
            {(recurringCustomerFilter || recurringCityFilter) && (
              <button onClick={()=>{ setRecurringCustomerFilter(""); setRecurringCityFilter(""); }} className="btn-secondary" style={{ fontSize:12, padding:"5px 10px" }}>
                ✕ Filter wissen
              </button>
            )}
          </div>

          {filteredRecurring.length===0 && (
            <p style={{ fontSize:13, color:"var(--text-subtle)", textAlign:"center", padding:"1.5rem 0" }}>
              Geen vaste bestellingen gevonden.
            </p>
          )}
          {[2,3,4,5,6].map(wd=>{
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
                    <RecurringCard key={order.id} order={order} breadTypes={breadTypes} onChanged={loadRecurring} isOwner={canWriteRecurring} onEditWeek={()=>openWeekEdit(order.customerId)} />
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
              <button onClick={()=>setHistoryCustomerId("")} className="btn-secondary" style={{ fontSize:12, padding:"7px 10px" }}>✕ Wissen</button>
            )}
          </div>

          {loadingHistory ? (
            <p style={{ color:"var(--text-subtle)", fontSize:13 }}>Laden…</p>
          ) : logboekEntries.length === 0 ? (
            <div className="card" style={{ padding:"2rem", textAlign:"center", color:"var(--text-subtle)", fontSize:13 }}>
              Geen bestellingen gevonden in deze periode.
            </div>
          ) : (()=>{
            const sorted = [...logboekEntries].sort((a,b)=>b.date.localeCompare(a.date));
            // Use breadTypes from logboek API, sorted by SLUG_ORDER
            const logBTs = [...logboekBreadTypes].sort((a,b)=>{
              const ai=SLUG_ORDER.indexOf(a.slug??""); const bi=SLUG_ORDER.indexOf(b.slug??"");
              return (ai===-1?99:ai)-(bi===-1?99:bi);
            });
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
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                    <thead>
                      <tr>
                        <th style={{ ...thS, textAlign:"center", width:26 }}>Type</th>
                        <th style={{ ...thS, textAlign:"left" }}>Datum</th>
                        {!historyCustomerId && <th style={{ ...thS, textAlign:"left" }}>Klant</th>}
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
                            {!historyCustomerId && <td style={{ ...tdS, textAlign:"left" }}>{entry.customerName}{entry.city ? <span style={{ fontSize:11, color:"var(--text-subtle)" }}> ({entry.city})</span> : null}</td>}
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
              </div>
            );
          })()}
        </div>
      )}

      {/* ── WEEK EDIT MODAL ── */}
      {weekEditCustomerId && (()=>{
        const customerOrders = recurring.filter(o=>o.customerId===weekEditCustomerId).sort((a,b)=>a.weekday-b.weekday);
        const customerName = customerOrders[0]?.customer.name ?? "";
        const vastBTs = breadTypes
          .filter(bt=>bt.customerOrderable||customerOrders.some(o=>o.lines.some(l=>l.breadTypeId===bt.id)))
          .sort((a,b)=>{ const ai=SLUG_ORDER.indexOf(a.slug); const bi=SLUG_ORDER.indexOf(b.slug); return (ai===-1?99:ai)-(bi===-1?99:bi); });
        const thS: React.CSSProperties = { fontSize:11, fontWeight:600, textTransform:"uppercase", color:"var(--text-subtle)", padding:"6px 8px", borderBottom:"2px solid var(--border)", textAlign:"center", whiteSpace:"nowrap" };
        const tdS: React.CSSProperties = { padding:"6px 8px", borderBottom:"1px solid var(--border)", textAlign:"center", verticalAlign:"middle" };
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(28,16,9,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:50, padding:24 }}>
            <div style={{ background:"var(--surface)", borderRadius:14, width:"100%", maxWidth:760, padding:"1.75rem", display:"flex", flexDirection:"column", gap:16, maxHeight:"90vh", overflowY:"auto" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <h2 style={{ margin:0, fontSize:18 }}>Vaste bestelling — {customerName}</h2>
                <button onClick={()=>setWeekEditCustomerId(null)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:22, color:"var(--text-subtle)" }}>×</button>
              </div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead>
                    <tr>
                      <th style={{ ...thS, textAlign:"left" }}>Dag</th>
                      {vastBTs.map(bt=><th key={bt.id} style={thS}>{colName(bt.name)}</th>)}
                      <th style={thS}>Actief</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerOrders.map(order=>{
                      const edit = weekEditEdits.get(order.id) ?? { lines:{}, active:order.active };
                      function setOrdEdit(upd: Partial<typeof edit>) {
                        setWeekEditEdits(prev=>new Map(prev).set(order.id,{...edit,...upd}));
                        setWeekEditDirty(prev=>new Set(prev).add(order.id));
                      }
                      return (
                        <tr key={order.id} style={{ opacity: edit.active ? 1 : 0.5, background: weekEditDirty.has(order.id) ? "var(--accent-light)" : undefined }}>
                          <td style={{ ...tdS, textAlign:"left", fontWeight:500 }}>{WEEKDAYS[order.weekday]}</td>
                          {vastBTs.map(bt=>(
                            <td key={bt.id} style={tdS}>
                              <input type="number" min={0} max={99}
                                value={edit.lines[bt.id] ?? 0}
                                onChange={e=>setOrdEdit({ lines:{...edit.lines,[bt.id]:Math.max(0,parseInt(e.target.value)||0)} })}
                                style={{ width:46, border:"1px solid var(--border)", borderRadius:5, padding:"3px 5px", fontSize:12, textAlign:"center", background:"var(--surface)" }}
                              />
                            </td>
                          ))}
                          <td style={tdS}>
                            <input type="checkbox" checked={edit.active} onChange={e=>setOrdEdit({ active:e.target.checked })} style={{ width:16, height:16, cursor:"pointer" }} />
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
