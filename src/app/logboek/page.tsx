"use client";
import { useRole } from "@/lib/role-context";
import { useEffect, useState } from "react";


const CORRECT_ORDER = [
  "boeren-kl","boeren-gr","boeren-15kg",
  "sesam","sesam-15kg","zaden","zaden-15kg",
  "olijf","rozijn",
  "baguette","baguette-kaas",
  "spelt","volkoren","gekiemde-rogge",
  "kaneel-buns","kardemom-buns",
];

type BreadType = { id: string; name: string; slug: string; sortOrder: number };
type LogLine = { breadTypeId: string; breadTypeName: string; quantity: number };
type LogEntry = {
  type: "eenmalig" | "vast" | "winkel";
  date: string;
  customerName: string;
  customerId: string;
  city: string | null;
  notes: string | null;
  deliveryNote?: string;
  lines: LogLine[];
};

function colName(name: string) {
  return name.replace("Boeren ","B. ").replace(" KG","kg")
    .replace("Baguette 0.5 kg","Baguette").replace("Baguette Kaas/Peper","Kaas/P")
    .replace("Gekiemde Rogge","G.Rogge").replace("Morning buns","Buns");
}

export default function LogboekPage() {
  const { role } = useRole();
  const today = new Date().toISOString().slice(0,10);
  const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth()-1);
  const [from, setFrom] = useState(monthAgo.toISOString().slice(0,10));
  const [to, setTo] = useState(today);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [breadTypes, setBreadTypes] = useState<BreadType[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<"all"|"eenmalig"|"vast">("all");
  const [filterCustomer, setFilterCustomer] = useState("all");

  function load() {
    setLoading(true);
    fetch(`/digitalbakery/api/logboek?from=${from}&to=${to}`, { headers: { "x-role": role } })
      .then(r => r.json())
      .then(d => {
        setEntries(d.entries ?? []);
        // Sort bread types by correct column order
        const bts: BreadType[] = d.breadTypes ?? [];
        bts.sort((a: BreadType, b: BreadType) => {
          const ai = CORRECT_ORDER.indexOf(a.slug);
          const bi = CORRECT_ORDER.indexOf(b.slug);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
        setBreadTypes(bts);
        setLoading(false);
      });
  }

  useEffect(() => { load(); }, []);

  const filtered = entries.filter(e =>
    (filterType === "all" || e.type === filterType) &&
    (filterCustomer === "all" || e.customerId === filterCustomer)
  );

  // Active bread types (have at least one entry with quantity)
  const activeBT = breadTypes.filter(bt => filtered.some(e => e.lines.some(l => l.breadTypeId === bt.id && l.quantity > 0)));

  // Unique customers for filter
  const customers = [...new Map(entries.map(e => [e.customerId, { id: e.customerId, name: e.customerName }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));

  function dateLabel(dateStr: string) {
    const d = new Date(dateStr + "T12:00:00Z");
    return d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <div style={{ padding: "2rem 2.5rem", maxWidth: 1200 }}>
      <h1 style={{ fontSize: 28, marginBottom: "1.5rem" }}>Bestellingen logboek</h1>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Van</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input" style={{ width: 140 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Tot</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input" style={{ width: 140 }} />
        </div>
        <button onClick={load} className="btn-primary" style={{ fontSize: 13 }}>Ophalen</button>
        <select value={filterType} onChange={e => setFilterType(e.target.value as any)}
          style={{ border: "1px solid var(--border)", borderRadius: 7, padding: "7px 10px", fontSize: 13, background: "var(--surface)" }}>
          <option value="all">Alle types</option>
          <option value="eenmalig">Eenmalig</option>
          <option value="vast">Vast</option>
          <option value="winkel">Winkel</option>
        </select>
        <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)}
          style={{ border: "1px solid var(--border)", borderRadius: 7, padding: "7px 10px", fontSize: 13, background: "var(--surface)" }}>
          <option value="all">Alle klanten</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span style={{ fontSize: 13, color: "var(--text-subtle)", marginLeft: "auto" }}>
          {filtered.length} leveringen
        </span>
      </div>

      {loading && <p style={{ color: "var(--text-subtle)", textAlign: "center", padding: "3rem" }}>Laden…</p>}

      {!loading && filtered.length === 0 && (
        <div className="card" style={{ padding: "3rem", textAlign: "center", color: "var(--text-subtle)" }}>
          Geen bestellingen gevonden in deze periode.
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="card" style={{ overflow: "auto", maxHeight: "70vh" }}>
          <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0 }}>
                <th style={{ textAlign: "left", padding: "9px 14px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11, textTransform: "uppercase", whiteSpace: "nowrap" }}>Datum</th>
                <th style={{ textAlign: "left", padding: "9px 10px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11, textTransform: "uppercase" }}>Klant</th>
                <th style={{ textAlign: "left", padding: "9px 8px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 10, textTransform: "uppercase" }}>Type</th>
                {activeBT.map(bt => (
                  <th key={bt.id} style={{ textAlign: "right", padding: "9px 8px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 10, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                    {colName(bt.name)}
                  </th>
                ))}
                <th style={{ textAlign: "left", padding: "9px 14px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11, textTransform: "uppercase" }}>Opm.</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <tr key={`${e.type}-${e.date}-${e.customerId}-${i}`} style={{
                  borderTop: i > 0 ? "1px solid var(--border)" : "none",
                  background: e.type === "vast" ? "#f0fdf4" : e.type === "winkel" ? "#f5f3ff" : "transparent",
                }}>
                  <td style={{ padding: "8px 14px", whiteSpace: "nowrap", fontSize: 12 }}>{dateLabel(e.date)}</td>
                  <td style={{ padding: "8px 10px", fontWeight: 500 }}>
                    {e.customerName}
                    {e.city && <span style={{ fontSize: 11, color: "var(--text-subtle)", marginLeft: 6 }}>{e.city}</span>}
                  </td>
                  <td style={{ padding: "8px 8px" }}>
                    <span style={{
                      fontSize: 10, padding: "2px 6px", borderRadius: 8,
                      background: e.type === "vast" ? "var(--success-bg)" : e.type === "winkel" ? "#ede9fe" : "var(--accent-light)",
                      color: e.type === "vast" ? "var(--success)" : e.type === "winkel" ? "#7c3aed" : "var(--accent)",
                    }}>
                      {e.type === "vast" ? "Vast" : e.type === "winkel" ? "Winkel" : "Eenmalig"}
                    </span>
                  </td>
                  {activeBT.map(bt => {
                    const line = e.lines.find(l => l.breadTypeId === bt.id);
                    return (
                      <td key={bt.id} style={{ padding: "8px 8px", textAlign: "right" }}>
                        {line?.quantity
                          ? <span className="badge badge-amber" style={{ fontSize: 11 }}>{line.quantity}</span>
                          : <span style={{ color: "var(--border)" }}>—</span>}
                      </td>
                    );
                  })}
                  <td style={{ padding: "8px 14px", color: "var(--text-subtle)", fontSize: 11 }}>
                    {e.notes}
                    {e.deliveryNote && (
                      <div style={{ marginTop: e.notes ? 4 : 0, color: "var(--accent)", fontWeight: 500 }}>
                        🚐 {e.deliveryNote}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
