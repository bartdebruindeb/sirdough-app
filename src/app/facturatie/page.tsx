"use client";
import { useRole } from "@/lib/role-context";
import { useEffect, useState } from "react";

const WEEKDAYS = ["","Ma","Di","Wo","Do","Vr","Za","Zo"];

type Customer = { id: string; name: string; city: string | null };
type BreadType = { id: string; name: string; slug: string };
type DeliveryLine = { breadTypeId: string; breadTypeName: string; quantity: number };
type Row = { date: string; lines: DeliveryLine[]; deliveryNote?: string };
type InvoiceData = {
  customer: Customer;
  from: string; to: string;
  rows: Row[];
  totals: Record<string, number>;
  breadTypes: BreadType[];
};

function colName(name: string) {
  return name.replace("Boeren ","B.").replace("Morning buns","Buns").replace(" KG","kg")
    .replace("Baguette 0.5 kg","Bag.").replace("Baguette Kaas/Peper","Kaas/P")
    .replace("Gekiemde Rogge","G.Rogge");
}

export default function FacturatiePage() {
  const { role } = useRole();
  const today = new Date().toISOString().slice(0,10);
  const monthStart = today.slice(0,7)+"-01";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/digitalbakery/api/customers?sort=name", { headers: { "x-role": role } })
      .then(r => r.json()).then(d => setCustomers(d.customers?.filter((c: any) => c.active) ?? []));
  }, []);

  function load() {
    if (!customerId) return;
    setLoading(true); setError("");
    fetch(`/digitalbakery/api/facturatie?customerId=${customerId}&from=${from}&to=${to}`, { headers: { "x-role": role } })
      .then(r => r.json())
      .then(d => { if (d.error) { setError(d.message ?? d.error); } else { setData(d); } setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }

  // Active bread types (have at least one delivery)
  const activeBT = data?.breadTypes.filter(bt => (data.totals[bt.id] ?? 0) > 0) ?? [];
  const totalDeliveries = data?.rows.length ?? 0;

  function getWeekday(date: string) {
    const d = new Date(date+"T12:00:00Z");
    const j = d.getUTCDay(); return j===0?7:j;
  }

  return (
    <div style={{ padding:"2rem 2.5rem", maxWidth:1100 }}>
      <h1 style={{ fontSize:28, marginBottom:"1.5rem" }}>Facturatie</h1>

      {/* Controls */}
      <div className="card" style={{ padding:"1.25rem 1.5rem", marginBottom:20 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 140px 140px auto", gap:12, alignItems:"end" }}>
          <div>
            <label style={{ fontSize:11, color:"var(--text-subtle)", textTransform:"uppercase", display:"block", marginBottom:4 }}>Klant</label>
            <select value={customerId} onChange={e=>setCustomerId(e.target.value)}
              style={{ border:"1px solid var(--border)", borderRadius:7, padding:"8px 10px", fontSize:13, background:"var(--surface)", width:"100%" }}>
              <option value="">— selecteer klant —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.city?` (${c.city})`:""}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:11, color:"var(--text-subtle)", textTransform:"uppercase", display:"block", marginBottom:4 }}>Van</label>
            <input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="input" />
          </div>
          <div>
            <label style={{ fontSize:11, color:"var(--text-subtle)", textTransform:"uppercase", display:"block", marginBottom:4 }}>Tot</label>
            <input type="date" value={to} onChange={e=>setTo(e.target.value)} className="input" />
          </div>
          <button onClick={load} disabled={!customerId||loading} className="btn-primary" style={{ fontSize:13, height:36 }}>
            {loading?"Laden…":"Ophalen"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background:"var(--warn-bg)", border:"1px solid #fca5a5", borderRadius:10, padding:"1rem", color:"var(--warn)", fontSize:14, marginBottom:16 }}>
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Summary header */}
          <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:12, flexWrap:"wrap", gap:8 }}>
            <div>
              <h2 style={{ fontSize:20, margin:"0 0 2px" }}>{data.customer.name}</h2>
              <p style={{ fontSize:13, color:"var(--text-muted)", margin:0 }}>
                {new Date(from+"T12:00:00Z").toLocaleDateString("nl-NL",{day:"numeric",month:"long",year:"numeric"})} –{" "}
                {new Date(to+"T12:00:00Z").toLocaleDateString("nl-NL",{day:"numeric",month:"long",year:"numeric"})} · {totalDeliveries} leveringen
              </p>
            </div>
            <button onClick={()=>window.print()} className="btn-secondary" style={{ fontSize:13 }}>🖨 Print / PDF</button>
          </div>

          {/* Totals summary */}
          {activeBT.length > 0 && (
            <div className="card" style={{ padding:"1.25rem 1.5rem", marginBottom:16 }}>
              <h3 style={{ fontSize:14, marginBottom:"0.75rem" }}>Totaal overzicht</h3>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {activeBT.map(bt => (
                  <div key={bt.id} style={{ background:"var(--surface-2)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 14px", textAlign:"center" }}>
                    <p style={{ fontSize:10, color:"var(--text-subtle)", textTransform:"uppercase", margin:"0 0 4px" }}>{colName(bt.name)}</p>
                    <p style={{ fontSize:20, fontWeight:700, color:"var(--accent)", margin:0 }}>{data.totals[bt.id]}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-date table */}
          {data.rows.length === 0 ? (
            <div className="card" style={{ padding:"3rem", textAlign:"center", color:"var(--text-subtle)" }}>
              Geen leveringen gevonden in deze periode.
            </div>
          ) : (
            <div className="card" style={{ overflow:"auto" }}>
              <table style={{ width:"max-content", minWidth:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background:"var(--surface-2)", borderBottom:"1px solid var(--border)" }}>
                    <th style={{ textAlign:"left", padding:"9px 16px", color:"var(--text-subtle)", fontWeight:500, fontSize:11, textTransform:"uppercase", whiteSpace:"nowrap" }}>Datum</th>
                    {activeBT.map(bt=>(
                      <th key={bt.id} style={{ textAlign:"right", padding:"9px 10px", color:"var(--text-subtle)", fontWeight:500, fontSize:10, textTransform:"uppercase", whiteSpace:"nowrap" }}>
                        {colName(bt.name)}
                      </th>
                    ))}
                    <th style={{ textAlign:"left", padding:"9px 16px", color:"var(--text-subtle)", fontWeight:500, fontSize:11, textTransform:"uppercase" }}>Notitie</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row,i)=>{
                    const wd = getWeekday(row.date);
                    const d = new Date(row.date+"T12:00:00Z");
                    const label = d.toLocaleDateString("nl-NL",{weekday:"short",day:"numeric",month:"short"});
                    const isSat = wd===6;
                    return (
                      <tr key={row.date} style={{ borderTop:i>0?"1px solid var(--border)":"none", background:isSat?"var(--surface-2)":"transparent" }}>
                        <td style={{ padding:"8px 16px", whiteSpace:"nowrap", fontWeight:isSat?600:400 }}>
                          {label}
                        </td>
                        {activeBT.map(bt=>{
                          const line=row.lines.find(l=>l.breadTypeId===bt.id);
                          return (
                            <td key={bt.id} style={{ padding:"8px 10px", textAlign:"right" }}>
                              {line?.quantity
                                ? <span className="badge badge-amber">{line.quantity}</span>
                                : <span style={{ color:"var(--border)" }}>—</span>}
                            </td>
                          );
                        })}
                        <td style={{ padding:"8px 16px", fontSize:11, color:"var(--accent)", fontWeight:500 }}>
                          {row.deliveryNote && `🚐 ${row.deliveryNote}`}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Totals row */}
                  <tr style={{ borderTop:"2px solid var(--border-strong)", background:"var(--surface-2)" }}>
                    <td style={{ padding:"10px 16px", fontWeight:700, fontSize:13 }}>Totaal</td>
                    {activeBT.map(bt=>(
                      <td key={bt.id} style={{ padding:"10px 10px", textAlign:"right", fontWeight:700, color:"var(--accent)" }}>
                        {data.totals[bt.id] ?? "—"}
                      </td>
                    ))}
                    <td/>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
