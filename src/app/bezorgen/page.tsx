"use client";
import { useRole } from "@/lib/role-context";
import { useEffect, useState } from "react";

const WEEKDAYS = ["","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];

type BreadType = { id: string; name: string; slug: string };
type DeliveryRow = {
  customerId: string; name: string; city: string; address: string;
  cityOrder: number; notes: string; isShop: boolean;
  lat: number | null; lng: number | null;
  quantities: Record<string, number>;
  pickupLocation: string | null;
};
type DeliveryData = {
  date: string; breadTypes: BreadType[];
  cityRoutes: { city: string; sortOrder: number }[];
  rows: DeliveryRow[]; role: string;
};
type DeliveryStatus = {
  customerId: string; customerName: string; customerCity: string | null;
  inBusAt: string | null; deliveredAt: string | null;
};

function getWeekday(date: string) {
  const d = new Date(date + "T12:00:00Z");
  const j = d.getUTCDay();
  return j === 0 ? 7 : j;
}

function buildMapsUrl(rows: DeliveryRow[]): string {
  const addresses = rows.filter(r => r.address).map(r => encodeURIComponent(r.address));
  if (addresses.length === 0) return "";
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

  // Delivery notes keyed by customerId
  const [deliveryNotes, setDeliveryNotes] = useState<Record<string, string[]>>({});

  // Bus = ordered list of customer IDs for this shift
  const [busOrder, setBusOrder] = useState<string[]>([]);
  // Delivered
  const [delivered, setDelivered] = useState<Record<string, boolean>>({});
  // Timestamps
  const [inBusTimes, setInBusTimes]       = useState<Record<string, string>>({});
  const [deliveredTimes, setDeliveredTimes] = useState<Record<string, string>>({});
  // Drag state
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  // Pakbon modal
  type PakbonLine = { breadTypeId: string; name: string; orderedQty: number; deliveredQty: number };
  const [pakbonModal, setPakbonModal] = useState<{ customerId: string; name: string; lines: PakbonLine[] } | null>(null);
  const [sendingPakbon, setSendingPakbon] = useState(false);

  function loadNotes(d: string) {
    fetch(`/api/delivery-notes?from=${d}&to=${d}`, { headers: { "x-role": role ?? "" } })
      .then(r => r.json())
      .then(data => {
        const map: Record<string, string[]> = {};
        for (const n of data.notes ?? []) {
          if (!map[n.customerId]) map[n.customerId] = [];
          map[n.customerId].push(n.note);
        }
        setDeliveryNotes(map);
      })
      .catch(() => {});
  }

  function load(d: string) {
    setLoading(true); setError("");
    setBusOrder([]); setDelivered({}); setInBusTimes({}); setDeliveredTimes({});

    Promise.all([
      fetch(`/api/bezorgen?date=${d}`, { headers: { "x-role": role ?? "" } }).then(r => r.json()),
      fetch(`/api/delivery-status?date=${d}`, { headers: { "x-role": role ?? "" } }).then(r => r.json()),
    ]).then(([delivData, statusData]) => {
      if (delivData.error) { setError(delivData.message ?? delivData.error); setLoading(false); return; }
      setData(delivData);

      // Restore bus/delivered from saved statuses
      const statuses: DeliveryStatus[] = statusData.statuses ?? [];
      const busIds: string[] = [];
      const deliveredMap: Record<string, boolean> = {};
      const inBusMap: Record<string, string> = {};
      const delivTimesMap: Record<string, string> = {};

      // Sort by inBusAt to preserve bus order
      const withBus = statuses.filter(s => s.inBusAt && !s.deliveredAt)
        .sort((a, b) => (a.inBusAt ?? "").localeCompare(b.inBusAt ?? ""));
      for (const s of withBus) {
        busIds.push(s.customerId);
        if (s.inBusAt) inBusMap[s.customerId] = s.inBusAt;
      }
      for (const s of statuses) {
        if (s.deliveredAt) {
          deliveredMap[s.customerId] = true;
          delivTimesMap[s.customerId] = s.deliveredAt;
          if (s.inBusAt) inBusMap[s.customerId] = s.inBusAt;
        }
      }
      setBusOrder(busIds);
      setDelivered(deliveredMap);
      setInBusTimes(inBusMap);
      setDeliveredTimes(delivTimesMap);
      setLoading(false);
    }).catch(e => { setError(String(e)); setLoading(false); });

    loadNotes(d);
  }

  useEffect(() => { load(date); }, [date]);

  function shift(days: number) {
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    setDate(d.toISOString().slice(0, 10));
  }

  async function postStatus(customerId: string, action: string) {
    await fetch("/api/delivery-status", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify({ date, customerId, action }),
    }).catch(() => {});
  }

  function addToBus(id: string) {
    if (busOrder.includes(id)) return;
    const now = new Date().toISOString();
    setBusOrder(prev => [...prev, id]);
    setInBusTimes(t => ({ ...t, [id]: now }));
    postStatus(id, "in_bus");
  }

  function removeFromBus(id: string) {
    setBusOrder(prev => prev.filter(x => x !== id));
    setInBusTimes(t => { const n = { ...t }; delete n[id]; return n; });
    postStatus(id, "removed_from_bus");
  }

  function toggleDelivered(id: string) {
    const isDone = delivered[id];
    if (!isDone) {
      // Mark as delivered
      const now = new Date().toISOString();
      setDelivered(d => ({ ...d, [id]: true }));
      setDeliveredTimes(t => ({ ...t, [id]: now }));
      setBusOrder(prev => prev.filter(x => x !== id));
      postStatus(id, "delivered");
    } else {
      // Unmark
      setDelivered(d => ({ ...d, [id]: false }));
      setDeliveredTimes(t => { const n = { ...t }; delete n[id]; return n; });
      postStatus(id, "undelivered");
    }
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

  function openPakbonModal(row: DeliveryRow) {
    const lines = activeBreadTypes
      .filter(bt => (row.quantities[bt.id] ?? 0) > 0)
      .map(bt => ({
        breadTypeId: bt.id,
        name: bt.name,
        orderedQty: row.quantities[bt.id] ?? 0,
        deliveredQty: row.quantities[bt.id] ?? 0,
      }));
    setPakbonModal({ customerId: row.customerId, name: row.name, lines });
  }

  async function confirmPakbon() {
    if (!pakbonModal) return;
    setSendingPakbon(true);
    await fetch("/api/bezorgen/pakbon", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify({ customerId: pakbonModal.customerId, date, deliveredLines: pakbonModal.lines }),
    }).catch(() => {});
    // Mark as delivered
    const now = new Date().toISOString();
    setDelivered(d => ({ ...d, [pakbonModal.customerId]: true }));
    setDeliveredTimes(t => ({ ...t, [pakbonModal.customerId]: now }));
    setBusOrder(prev => prev.filter(x => x !== pakbonModal.customerId));
    postStatus(pakbonModal.customerId, "delivered");
    setSendingPakbon(false);
    setPakbonModal(null);
  }

  async function saveNote() {
    if (!noteModal || !noteText.trim()) return;
    setSavingNote(true);
    const note = noteText.trim();
    await fetch("/api/delivery-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify({ customerId: noteModal.customerId, date, note }),
    });
    setSavingNote(false);
    setDeliveryNotes(prev => ({
      ...prev,
      [noteModal.customerId]: [...(prev[noteModal.customerId] ?? []), note],
    }));
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
    <div style={{ padding: "1.25rem 1rem", maxWidth: 1400 }}>
      <style>{`@media (max-width: 700px) { .bez-cols { flex-direction: column !important; } .bez-col-bus { flex: 1 1 100% !important; } }`}</style>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 3 }}>Bezorgen</h1>
          {data && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
              <strong style={{ color: "var(--text)" }}>{weekdayLabel} {date}</strong>
              {rows.length > 0 && (
                <> · <span style={{ color: deliveredCount === rows.length && rows.length > 0 ? "var(--success)" : "var(--text-muted)" }}>
                  {deliveredCount}/{rows.length} geleverd
                </span></>
              )}
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
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── TWO-COLUMN: BUS | PENDING+DELIVERED ── */}
          <div className="bez-cols" style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

            {/* Left: In de bus */}
            <div className="bez-col-bus" style={{ flex: "0 0 52%", minWidth: 0 }}>
              <h2 style={{ fontSize: 15, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                🚐 In de bus
                {busRows.length > 0 && (
                  <span style={{ fontSize: 12, color: "var(--text-subtle)", fontFamily: "var(--font-body)", fontWeight: 400 }}>
                    {busRows.length} stops
                  </span>
                )}
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                    style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5,
                      fontSize: 12, padding: "4px 10px", borderRadius: 7,
                      background: "#1a73e8", color: "white", textDecoration: "none", fontWeight: 500,
                      fontFamily: "var(--font-body)" }}>
                    🗺️ Open route
                  </a>
                )}
              </h2>
              {busRows.length === 0 ? (
                <div style={{ border: "2px dashed var(--border)", borderRadius: 12, padding: "1.25rem", textAlign: "center", color: "var(--text-subtle)", fontSize: 13 }}>
                  Voeg stops toe vanuit de lijst rechts
                </div>
              ) : (
                <div className="card" style={{ overflow: "hidden" }}>
                  {busRows.map((row, i) => (
                    <div key={row.customerId} draggable
                      onDragStart={() => onDragStart(row.customerId)}
                      onDragOver={e => onDragOver(e, row.customerId)}
                      onDrop={() => onDrop(row.customerId)}
                      onDragEnd={() => { setDragging(null); setDragOver(null); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "9px 12px",
                        borderTop: i > 0 ? "1px solid var(--border)" : "none",
                        background: dragOver === row.customerId ? "var(--accent-light)" : "transparent",
                        cursor: "grab",
                      }}>
                      <span style={{ color: "var(--border-strong)", fontSize: 14, cursor: "grab", flexShrink: 0 }}>⠿</span>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#6366f1", color: "white", fontSize: 11, fontWeight: 700, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{row.name}</span>
                        {row.pickupLocation ? (
                          <span style={{ fontSize: 11, background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", borderRadius: 8, padding: "1px 7px", marginLeft: 6, fontWeight: 600, whiteSpace: "nowrap" }}>
                            🏪 Afhalen {row.pickupLocation.replace("Winkel ", "")}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: "var(--text-subtle)", marginLeft: 6 }}>{row.city}</span>
                        )}
                        {row.notes && <div style={{ fontSize: 11, color: "var(--text-subtle)" }}>{row.notes}</div>}
                        {(deliveryNotes[row.customerId] ?? []).map((n, ni) => (
                          <div key={ni} style={{ fontSize: 11, color: "var(--warn)" }}>📝 {n}</div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 110 }}>
                        {activeBreadTypes.filter(bt => (row.quantities[bt.id] ?? 0) > 0).map(bt => (
                          <span key={bt.id} style={{ fontSize: 10, background: "var(--accent-light)", color: "var(--accent)", padding: "2px 5px", borderRadius: 8, whiteSpace: "nowrap" }}>
                            {shortName(bt.name)} {row.quantities[bt.id]}
                          </span>
                        ))}
                      </div>
                      <button onClick={() => openPakbonModal(row)}
                        style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, border: "2px solid var(--border-strong)", background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}
                        title="Geleverd">✓</button>
                      <button onClick={() => removeFromBus(row.customerId)}
                        style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, border: "none", background: "none", cursor: "pointer", fontSize: 15, color: "var(--text-subtle)" }}
                        title="Verwijder">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Nog te bezorgen + Geleverd */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>

              {/* Nog te bezorgen */}
              <div>
                <h2 style={{ fontSize: 15, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8 }}>
                  Nog te bezorgen
                  {pendingRows.length > 0 && (
                    <span style={{ fontSize: 12, color: "var(--text-subtle)", fontFamily: "var(--font-body)", fontWeight: 400 }}>{pendingRows.length}</span>
                  )}
                </h2>
                {pendingRows.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--text-subtle)", padding: "10px 0" }}>Alle stops ingepland of geleverd.</div>
                ) : (
                  <div className="card" style={{ overflow: "hidden" }}>
                    {pendingRows.map((row, i) => (
                      <div key={row.customerId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
                        <button onClick={() => addToBus(row.customerId)}
                          style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, border: "2px solid var(--border-strong)", background: "transparent", cursor: "pointer", fontSize: 15, color: "var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}
                          title="Voeg toe aan bus">+</button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: row.isShop ? 600 : 500 }}>{row.name}</span>
                          {row.pickupLocation ? (
                            <span style={{ fontSize: 11, background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", borderRadius: 8, padding: "1px 7px", marginLeft: 6, fontWeight: 600, whiteSpace: "nowrap" }}>
                              🏪 Afhalen {row.pickupLocation.replace("Winkel ", "")}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: "var(--text-subtle)", marginLeft: 6 }}>{row.city}</span>
                          )}
                          {row.notes && <div style={{ fontSize: 11, color: "var(--text-subtle)" }}>{row.notes}</div>}
                          {(deliveryNotes[row.customerId] ?? []).map((n, ni) => (
                            <div key={ni} style={{ fontSize: 11, color: "var(--warn)" }}>📝 {n}</div>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 100 }}>
                          {activeBreadTypes.filter(bt => (row.quantities[bt.id] ?? 0) > 0).map(bt => (
                            <span key={bt.id} style={{ fontSize: 10, background: "var(--accent-light)", color: "var(--accent)", padding: "2px 5px", borderRadius: 8, whiteSpace: "nowrap" }}>
                              {shortName(bt.name)} {row.quantities[bt.id]}
                            </span>
                          ))}
                        </div>
                        {canNote && (
                          <button onClick={() => { setNoteModal({ customerId: row.customerId, name: row.name }); setNoteText(""); }}
                            style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, border: "none", background: "none", cursor: "pointer", fontSize: 13, color: "var(--text-subtle)" }}
                            title="Notitie">📝</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Geleverd */}
              {deliveredCount > 0 && (
                <div>
                  <h2 style={{ fontSize: 15, margin: "0 0 8px", color: "var(--success)", display: "flex", alignItems: "center", gap: 8 }}>
                    ✓ Geleverd
                    <span style={{ fontSize: 12, fontFamily: "var(--font-body)", fontWeight: 400 }}>{deliveredCount}/{rows.length}</span>
                  </h2>
                  <div className="card" style={{ overflow: "hidden" }}>
                    {rows.filter(r => delivered[r.customerId]).map((row, i) => (
                      <div key={row.customerId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderTop: i > 0 ? "1px solid var(--border)" : "none", background: "var(--success-bg)" }}>
                        <button onClick={() => toggleDelivered(row.customerId)}
                          style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, border: "2px solid var(--success)", background: "var(--success)", cursor: "pointer", fontSize: 13, color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}
                          title="Ongedaan maken">✓</button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, textDecoration: "line-through", color: "var(--text-muted)" }}>{row.name}</span>
                          <span style={{ fontSize: 11, color: "var(--text-subtle)", marginLeft: 6 }}>{row.city}</span>
                        </div>
                        {deliveredTimes[row.customerId] && (
                          <span style={{ fontSize: 11, color: "var(--success)", fontWeight: 600 }}>
                            {new Date(deliveredTimes[row.customerId]).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: "var(--success)", fontWeight: 500 }}>Pakbon verzonden</span>
                      </div>
                    ))}
                    {deliveredCount === rows.length && (
                      <div style={{ padding: "8px 12px", textAlign: "center", fontSize: 13, fontWeight: 600, color: "var(--success)", borderTop: "1px solid var(--border)" }}>
                        🎉 Alles bezorgd!
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>{/* end right column */}
          </div>{/* end two-column */}
        </div>
      )}

      {/* Pakbon modal */}
      {pakbonModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(28,16,9,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}>
          <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 480, padding: "1.75rem", display: "flex", flexDirection: "column", gap: 14, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Pakbon — {pakbonModal.name}</h2>
              <button onClick={() => setPakbonModal(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--text-subtle)" }}>×</button>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
              Controleer de aantallen. Pas aan als er iets afwijkt van de bestelling.
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "6px 0", color: "var(--text-subtle)", fontWeight: 500, fontSize: 12 }}>Broodsoort</th>
                  <th style={{ textAlign: "center", padding: "6px 8px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 12 }}>Besteld</th>
                  <th style={{ textAlign: "center", padding: "6px 0", color: "var(--text-subtle)", fontWeight: 500, fontSize: 12 }}>Geleverd</th>
                </tr>
              </thead>
              <tbody>
                {pakbonModal.lines.map((line, i) => {
                  const diff = line.deliveredQty - line.orderedQty;
                  return (
                    <tr key={line.breadTypeId} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 0", fontWeight: 500 }}>{line.name}</td>
                      <td style={{ padding: "8px 8px", textAlign: "center", color: "var(--text-muted)" }}>{line.orderedQty}</td>
                      <td style={{ padding: "8px 0", textAlign: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          <button onClick={() => setPakbonModal(m => m ? { ...m, lines: m.lines.map((l, j) => j === i ? { ...l, deliveredQty: Math.max(0, l.deliveredQty - 1) } : l) } : null)}
                            style={{ width: 24, height: 24, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface-2)", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>−</button>
                          <span style={{ fontWeight: 700, minWidth: 24, textAlign: "center", color: diff !== 0 ? (diff < 0 ? "var(--danger)" : "var(--success)") : "inherit" }}>
                            {line.deliveredQty}
                          </span>
                          <button onClick={() => setPakbonModal(m => m ? { ...m, lines: m.lines.map((l, j) => j === i ? { ...l, deliveredQty: l.deliveredQty + 1 } : l) } : null)}
                            style={{ width: 24, height: 24, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface-2)", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>+</button>
                          {diff !== 0 && (
                            <span style={{ fontSize: 11, color: diff < 0 ? "var(--danger)" : "var(--success)", minWidth: 40 }}>
                              {diff > 0 ? `+${diff}` : diff}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {pakbonModal.lines.some(l => l.deliveredQty !== l.orderedQty) && (
              <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#92400e" }}>
                Afwijking van bestelling — dit wordt vermeld in de pakbon en verwerkt in de factuurlijst.
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setPakbonModal(null)} className="btn-secondary" style={{ fontSize: 13 }}>Annuleren</button>
              <button onClick={confirmPakbon} disabled={sendingPakbon} className="btn-primary" style={{ fontSize: 13 }}>
                {sendingPakbon ? "Verzenden…" : "Stuur pakbon & bevestig bezorging"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delivery note modal */}
      {noteModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(28,16,9,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}>
          <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 420, padding: "1.75rem", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Notitie toevoegen</h2>
              <button onClick={() => setNoteModal(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--text-subtle)" }}>×</button>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
              Voor <strong>{noteModal.name}</strong> — {date}
            </p>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={4}
              placeholder="bijv. niemand thuis, op 2e adres afgeleverd, klant had klacht over kwaliteit…"
              style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 14, fontFamily: "var(--font-body)", resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setNoteModal(null)} className="btn-secondary">Annuleren</button>
              <button onClick={saveNote} disabled={savingNote || !noteText.trim()} className="btn-primary">
                {savingNote ? "Opslaan…" : "Opslaan"}
              </button>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-subtle)", margin: 0 }}>
              Deze notitie is zichtbaar in het logboek en facturatie.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
