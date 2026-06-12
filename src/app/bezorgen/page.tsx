"use client";
import { useRole } from "@/lib/role-context";
import { useEffect, useState } from "react";

const WEEKDAYS = ["","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];

type BreadType = { id: string; name: string; slug: string };
type DeliveryRow = {
  customerId: string; name: string; city: string; address: string;
  cityOrder: number; notes: string; isShop: boolean;
  quantities: Record<string, number>;
};
type DeliveryData = {
  date: string; breadTypes: BreadType[];
  cityRoutes: { city: string; sortOrder: number }[];
  rows: DeliveryRow[]; role: string;
};

function getWeekday(date: string) {
  const d = new Date(date + "T12:00:00Z");
  const j = d.getUTCDay();
  return j === 0 ? 7 : j;
}

function buildMapsUrl(rows: DeliveryRow[]): string {
  const addresses = rows.filter(r => r.address).map(r => encodeURIComponent(r.address));
  if (addresses.length === 0) return "";
  // Start from current location
  const destination = addresses[addresses.length - 1];
  const waypoints = addresses.slice(0, -1).join("|");
  let url = `https://www.google.com/maps/dir/?api=1&origin=My+Location&destination=${destination}`;
  if (waypoints) url += `&waypoints=${waypoints}`;
  url += "&travelmode=driving";
  return url;
}

function shortName(name: string) {
  return name.replace("Boeren ", "B.").replace(" KG", "kg").replace("Morning buns", "Buns")
    .replace("Baguette 0.5 kg", "Bag.").replace("Baguette Kaas/Peper", "B.K/P")
    .replace("Gekiemde Rogge", "G.Rogge").replace("Volkoren", "Volk.");
}

export default function BezorgenPage() {
  const { role, can } = useRole();
  const canNote = can("delivery:note");
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [data, setData] = useState<DeliveryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [noteModal, setNoteModal] = useState<{ customerId: string; name: string } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Bus = ordered list of customer IDs for this shift
  const [busOrder, setBusOrder] = useState<string[]>([]);
  // Delivered
  const [delivered, setDelivered] = useState<Record<string, boolean>>({});
  // Drag state
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  function load(d: string) {
    setLoading(true); setError("");
    setBusOrder([]); setDelivered({});
    fetch(`/digitalbakery/api/bezorgen?date=${d}`, { headers: { "x-role": role ?? "" } })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.message ?? d.error); setLoading(false); return; }
        setData(d);
        setLoading(false);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }

  useEffect(() => { load(date); }, [date]);

  function shift(days: number) {
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    setDate(d.toISOString().slice(0, 10));
  }

  function addToBus(id: string) {
    if (!busOrder.includes(id)) setBusOrder(prev => [...prev, id]);
  }
  function removeFromBus(id: string) {
    setBusOrder(prev => prev.filter(x => x !== id));
  }
  function toggleDelivered(id: string) {
    setDelivered(d => ({ ...d, [id]: !d[id] }));
    if (!delivered[id]) removeFromBus(id);
  }

  // Drag reorder in bus
  function onDragStart(id: string) { setDragging(id); }
  function onDragOver(e: React.DragEvent, id: string) { e.preventDefault(); setDragOver(id); }
  function onDrop(targetId: string) {
    if (!dragging || dragging === targetId) { setDragging(null); setDragOver(null); return; }
    setBusOrder(prev => {
      const arr = [...prev];
      const from = arr.indexOf(dragging);
      const to = arr.indexOf(targetId);
      arr.splice(from, 1);
      arr.splice(to, 0, dragging);
      return arr;
    });
    setDragging(null); setDragOver(null);
  }

  async function saveNote() {
    if (!noteModal || !noteText.trim()) return;
    setSavingNote(true);
    await fetch("/digitalbakery/api/delivery-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify({ customerId: noteModal.customerId, date, note: noteText.trim() }),
    });
    setSavingNote(false);
    setNoteModal(null);
    setNoteText("");
  }

  const rows = data?.rows ?? [];
  const breadTypes = data?.breadTypes ?? [];
  const weekdayLabel = WEEKDAYS[getWeekday(date)] ?? "";
  const deliveredCount = rows.filter(r => delivered[r.customerId]).length;
  const rowMap = new Map(rows.map(r => [r.customerId, r]));

  const busRows = busOrder.map(id => rowMap.get(id)).filter(Boolean) as DeliveryRow[];
  const pendingRows = rows.filter(r => !delivered[r.customerId] && !busOrder.includes(r.customerId));

  const activeBreadTypes = breadTypes.filter(bt => rows.some(r => (r.quantities[bt.id] ?? 0) > 0));
  const mapsUrl = buildMapsUrl(busRows);

  return (
    <div style={{ padding: "1.25rem 1.5rem", maxWidth: 960 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 3 }}>Bezorgen</h1>
          {data && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
              <strong style={{ color: "var(--text)" }}>{weekdayLabel} {date}</strong>
              {rows.length > 0 && <> · <span style={{ color: deliveredCount === rows.length && rows.length > 0 ? "var(--success)" : "var(--text-muted)" }}>{deliveredCount}/{rows.length} geleverd</span></>}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => shift(-1)} className="btn-secondary" style={{ padding: "7px 11px" }}>←</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input" style={{ width: 140 }} />
          <button onClick={() => shift(1)} className="btn-secondary" style={{ padding: "7px 11px" }}>→</button>
          <button onClick={() => setDate(today)} className="btn-secondary">Vandaag</button>
        </div>
      </div>

      {loading && <p style={{ color: "var(--text-subtle)", textAlign: "center", padding: "3rem 0" }}>Laden…</p>}
      {!loading && error && (
        <div style={{ background: "var(--warn-bg)", border: "1px solid #fca5a5", borderRadius: 10, padding: "1rem", color: "var(--warn)", fontSize: 14, marginBottom: 12 }}>
          <strong>Fout:</strong> {error}
        </div>
      )}

      {!loading && !error && data && rows.length === 0 && (
        <div className="card" style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: "0 0 6px" }}>Niets te bezorgen</p>
          <p style={{ fontSize: 13, margin: 0 }}>Geen bestellingen voor {weekdayLabel.toLowerCase()}.</p>
        </div>
      )}

      {!loading && !error && data && rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* ── BUS PANEL ── */}
          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>
                🚐 In de bus
                {busRows.length > 0 && <span style={{ fontSize: 13, color: "var(--text-subtle)", fontFamily: "var(--font-body)", fontWeight: 400, marginLeft: 8 }}>{busRows.length} stops</span>}
              </h2>
              {busRows.length > 0 && mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{
                  background: "#1a73e8", color: "white", textDecoration: "none",
                  borderRadius: 8, padding: "8px 16px", fontSize: 14, fontWeight: 500,
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  📍 Open route in Maps
                </a>
              )}
            </div>

            {busRows.length === 0 ? (
              <div style={{
                border: "2px dashed var(--border)", borderRadius: 12, padding: "1.5rem",
                textAlign: "center", color: "var(--text-subtle)", fontSize: 13,
              }}>
                Voeg stops toe vanuit de lijst hieronder
              </div>
            ) : (
              <div className="card" style={{ overflow: "hidden" }}>
                {busRows.map((row, i) => (
                  <div
                    key={row.customerId}
                    draggable
                    onDragStart={() => onDragStart(row.customerId)}
                    onDragOver={e => onDragOver(e, row.customerId)}
                    onDrop={() => onDrop(row.customerId)}
                    onDragEnd={() => { setDragging(null); setDragOver(null); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px",
                      borderTop: i > 0 ? "1px solid var(--border)" : "none",
                      background: dragOver === row.customerId ? "var(--accent-light)" : "transparent",
                      cursor: "grab",
                      transition: "background 0.1s",
                    }}
                  >
                    <span style={{ color: "var(--border-strong)", fontSize: 16, cursor: "grab" }}>⠿</span>
                    <span style={{ fontSize: 12, color: "var(--text-subtle)", minWidth: 18 }}>{i + 1}.</span>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{row.name}</span>
                      <span style={{ fontSize: 12, color: "var(--text-subtle)", marginLeft: 8 }}>{row.city}</span>
                      {row.notes && <span style={{ fontSize: 11, color: "var(--text-subtle)", marginLeft: 8 }}>{row.notes}</span>}
                    </div>
                    {/* Quantities summary */}
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {activeBreadTypes.filter(bt => (row.quantities[bt.id] ?? 0) > 0).map(bt => (
                        <span key={bt.id} style={{ fontSize: 11, background: "var(--accent-light)", color: "var(--accent)", padding: "2px 6px", borderRadius: 10 }}>
                          {shortName(bt.name)} {row.quantities[bt.id]}
                        </span>
                      ))}
                    </div>
                    {/* Delivered button */}
                    <button
                      onClick={() => toggleDelivered(row.customerId)}
                      style={{
                        width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                        border: "2px solid var(--border-strong)", background: "transparent",
                        cursor: "pointer", fontSize: 15, color: "var(--border-strong)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                      title="Geleverd"
                    >✓</button>
                    {/* Remove from bus */}
                    <button
                      onClick={() => removeFromBus(row.customerId)}
                      style={{
                        width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                        border: "none", background: "none", cursor: "pointer",
                        fontSize: 16, color: "var(--text-subtle)",
                      }}
                      title="Verwijder uit bus"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── FULL LIST ── */}
          <section>
            <h2 style={{ fontSize: 16, marginBottom: 10 }}>
              Alle bestellingen
              {pendingRows.length > 0 && <span style={{ fontSize: 13, color: "var(--text-subtle)", fontFamily: "var(--font-body)", fontWeight: 400, marginLeft: 8 }}>{pendingRows.length} nog te bezorgen</span>}
            </h2>
            <div className="card" style={{ overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ textAlign: "left", padding: "8px 14px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11, textTransform: "uppercase" }}>Klant</th>
                    <th style={{ textAlign: "left", padding: "8px 8px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11, textTransform: "uppercase" }}>Stad</th>
                    {activeBreadTypes.map(bt => (
                      <th key={bt.id} style={{ textAlign: "right", padding: "8px 8px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 10, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                        {shortName(bt.name)}
                      </th>
                    ))}
                    <th style={{ width: 80, padding: "8px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const isDone = delivered[row.customerId];
                    const inBus = busOrder.includes(row.customerId);
                    return (
                      <tr key={row.customerId} style={{
                        borderTop: i > 0 ? "1px solid var(--border)" : "none",
                        background: isDone ? "var(--success-bg)" : inBus ? "#fffbeb" : "transparent",
                        opacity: isDone ? 0.5 : 1,
                      }}>
                        <td style={{ padding: "9px 14px" }}>
                          <span style={{ textDecoration: isDone ? "line-through" : "none", fontWeight: row.isShop ? 600 : 400 }}>
                            {row.name}
                          </span>
                          {row.notes && <span style={{ fontSize: 11, color: "var(--text-subtle)", display: "block" }}>{row.notes}</span>}
                        </td>
                        <td style={{ padding: "9px 8px", color: "var(--text-subtle)", fontSize: 12 }}>{row.city}</td>
                        {activeBreadTypes.map(bt => {
                          const qty = row.quantities[bt.id] ?? 0;
                          return (
                            <td key={bt.id} style={{ padding: "9px 8px", textAlign: "right" }}>
                              {qty > 0
                                ? <span className="badge badge-amber" style={{ fontSize: 11, padding: "2px 7px" }}>{qty}</span>
                                : <span style={{ color: "var(--border)" }}>—</span>}
                            </td>
                          );
                        })}
                        <td style={{ padding: "9px 10px", textAlign: "right" }}>
                          {isDone ? (
                            <button onClick={() => toggleDelivered(row.customerId)}
                              style={{ fontSize: 11, color: "var(--success)", background: "none", border: "none", cursor: "pointer" }}>
                              ✓ Geleverd
                            </button>
                          ) : inBus ? (
                            <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 500 }}>In bus</span>
                          ) : (
                            <button onClick={() => addToBus(row.customerId)}
                              className="btn-secondary"
                              style={{ fontSize: 11, padding: "4px 10px", whiteSpace: "nowrap" }}>
                              + Bus
                            </button>
                          )}
                          {canNote && (
                            <button onClick={() => { setNoteModal({ customerId: row.customerId, name: row.name }); setNoteText(""); }}
                              style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "none", cursor: "pointer", color: "var(--text-subtle)", whiteSpace: "nowrap" }}>
                              📝
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Delivered summary */}
          {deliveredCount > 0 && (
            <div style={{ padding: "10px 14px", background: "var(--success-bg)", border: "1px solid #86efac", borderRadius: 10, fontSize: 13, color: "var(--success)", display: "flex", justifyContent: "space-between" }}>
              <span>✓ {deliveredCount} van {rows.length} geleverd</span>
              {deliveredCount === rows.length && <strong>🎉 Alles bezorgd!</strong>}
            </div>
          )}
        </div>
      )}

      {/* Delivery note modal */}
      {noteModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(28,16,9,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:50, padding:24 }}>
          <div style={{ background:"var(--surface)", borderRadius:14, width:"100%", maxWidth:420, padding:"1.75rem", display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <h2 style={{ margin:0, fontSize:18 }}>Notitie toevoegen</h2>
              <button onClick={()=>setNoteModal(null)} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:"var(--text-subtle)" }}>×</button>
            </div>
            <p style={{ fontSize:13, color:"var(--text-muted)", margin:0 }}>
              Voor <strong>{noteModal.name}</strong> — {date}
            </p>
            <textarea value={noteText} onChange={e=>setNoteText(e.target.value)} rows={4}
              placeholder="bijv. niemand thuis, op 2e adres afgeleverd, klant had klacht over kwaliteit…"
              style={{ border:"1px solid var(--border)", borderRadius:8, padding:"10px 12px", fontSize:14, fontFamily:"var(--font-body)", resize:"vertical" }} />
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button onClick={()=>setNoteModal(null)} className="btn-secondary">Annuleren</button>
              <button onClick={saveNote} disabled={savingNote||!noteText.trim()} className="btn-primary">
                {savingNote?"Opslaan…":"Opslaan"}
              </button>
            </div>
            <p style={{ fontSize:11, color:"var(--text-subtle)", margin:0 }}>
              Deze notitie is zichtbaar in het logboek en facturatie.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
