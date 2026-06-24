"use client";
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

type InvoiceLine = { name: string; quantity: number; unitPrice: number; lineTotal: number; date: string };
type CustomerRow = { customerId: string; customerName: string; customerEmail: string | null; discountPercent: number; lines: InvoiceLine[]; total: number; orderIds: string[] };
type SentInvoice = { id: string; customerId: string; invoiceNumber: string | null; sentAt: string | null; totalAmountExcl: string };

function prevWeek(w: string) {
  const [y, wn] = w.split("-W").map(Number);
  if (wn === 1) return `${y - 1}-W52`;
  return `${y}-W${String(wn - 1).padStart(2, "0")}`;
}
function nextWeek(w: string) {
  const [y, wn] = w.split("-W").map(Number);
  if (wn >= 52) return `${y + 1}-W01`;
  return `${y}-W${String(wn + 1).padStart(2, "0")}`;
}
function currentWeek() {
  const d = new Date();
  const day = d.getUTCDay() || 7;
  const thu = new Date(d); thu.setUTCDate(d.getUTCDate() - day + 4);
  const ys = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const wk = Math.ceil((((thu.getTime() - ys.getTime()) / 86400000) + 1) / 7);
  return `${thu.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}

export default function FacturenPage() {
  const searchParams = useSearchParams();
  const exactParam = searchParams.get("exact");

  const [week, setWeek] = useState(() => {
    // Default to previous week
    return prevWeek(currentWeek());
  });
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [sent, setSent] = useState<SentInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [exactConnected, setExactConnected] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback((w: string) => {
    setLoading(true);
    fetch(`/api/facturen?week=${w}`).then(r => r.json()).then(d => {
      setCustomers(d.customers ?? []);
      setSent(d.invoiced ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(week); }, [week, load]);

  useEffect(() => {
    fetch("/api/exact/status").then(r => r.json()).then(d => setExactConnected(d.connected)).catch(() => setExactConnected(false));
  }, []);

  async function sendInvoice(c: CustomerRow) {
    setSending(c.customerId);
    const res = await fetch("/api/facturen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: c.customerId, orderIds: c.orderIds, week }),
    }).then(r => r.json()).catch(() => null);
    setSending(null);
    if (res?.ok) load(week);
    else alert("Er ging iets mis. Controleer de console.");
  }

  const sentCustomerIds = new Set(sent.map(s => s.customerId));
  const [y, wn] = week.split("-W");
  const weekLabel = `Week ${wn}, ${y}`;

  return (
    <div style={{ padding: "1.5rem", maxWidth: 860 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: 26, margin: 0 }}>Facturatie</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "4px 0 0" }}>Genereer en verstuur facturen per week.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {exactConnected === false && (
            <a href="/api/exact/connect" className="btn-secondary" style={{ fontSize: 12, textDecoration: "none", padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", color: "var(--text-subtle)" }}>
              Koppel Exact Online
            </a>
          )}
          {exactConnected === true && (
            <span style={{ fontSize: 12, color: "var(--success)", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "4px 10px", borderRadius: 6 }}>
              ✓ Exact Online gekoppeld
            </span>
          )}
        </div>
      </div>

      {exactParam === "ok" && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          Exact Online succesvol gekoppeld.
        </div>
      )}
      {exactParam === "error" && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          Koppeling met Exact Online mislukt. Probeer opnieuw.
        </div>
      )}

      {/* Week selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1.5rem" }}>
        <button onClick={() => setWeek(prevWeek(week))} className="btn-secondary" style={{ fontSize: 12, padding: "5px 10px" }}>‹ Vorige</button>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{weekLabel}</span>
        <button onClick={() => setWeek(nextWeek(week))} className="btn-secondary" style={{ fontSize: 12, padding: "5px 10px" }}>Volgende ›</button>
      </div>

      {loading && <p style={{ color: "var(--text-subtle)", fontSize: 13 }}>Laden…</p>}

      {!loading && customers.length === 0 && sent.length === 0 && (
        <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--text-subtle)", fontSize: 13 }}>
          Geen bestellingen gevonden voor {weekLabel}.
        </div>
      )}

      {/* To invoice */}
      {customers.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-subtle)", marginBottom: 10 }}>Te factureren</h2>
          {customers.map(c => (
            <div key={c.customerId} className="card" style={{ marginBottom: 10, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.875rem 1.25rem" }}>
                <button onClick={() => setExpanded(expanded === c.customerId ? null : c.customerId)}
                  style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{c.customerName}</span>
                    {c.customerEmail
                      ? <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>{c.customerEmail}</span>
                      : <span style={{ fontSize: 12, color: "#f97316" }}>⚠ geen e-mail</span>
                    }
                    {c.discountPercent > 0 && (
                      <span style={{ fontSize: 11, background: "#eff6ff", color: "#1d4ed8", padding: "1px 7px", borderRadius: 6 }}>{c.discountPercent}% korting</span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>{c.orderIds.length} bestelling{c.orderIds.length !== 1 ? "en" : ""} · € {c.total.toFixed(2)} excl. BTW</span>
                </button>
                <button
                  onClick={() => sendInvoice(c)}
                  disabled={sending === c.customerId || !c.customerEmail}
                  className="btn-primary"
                  style={{ fontSize: 12, padding: "6px 14px", marginLeft: 12, flexShrink: 0 }}
                  title={!c.customerEmail ? "Klant heeft geen e-mailadres" : ""}
                >
                  {sending === c.customerId ? "Versturen…" : "Verstuur factuur"}
                </button>
              </div>
              {expanded === c.customerId && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "0.75rem 1.25rem" }}>
                  <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: "var(--text-subtle)" }}>
                        <th style={{ padding: "3px 0", textAlign: "left", fontWeight: 500 }}>Omschrijving</th>
                        <th style={{ padding: "3px 0", textAlign: "left", fontWeight: 500 }}>Datum</th>
                        <th style={{ padding: "3px 0", textAlign: "center", fontWeight: 500 }}>Aantal</th>
                        <th style={{ padding: "3px 0", textAlign: "right", fontWeight: 500 }}>Prijs</th>
                        <th style={{ padding: "3px 0", textAlign: "right", fontWeight: 500 }}>Totaal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.lines.map((l, i) => (
                        <tr key={i}>
                          <td style={{ padding: "3px 0" }}>{l.name}</td>
                          <td style={{ padding: "3px 0", color: "var(--text-subtle)" }}>{new Date(l.date + "T12:00:00Z").toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" })}</td>
                          <td style={{ padding: "3px 0", textAlign: "center" }}>{l.quantity}×</td>
                          <td style={{ padding: "3px 0", textAlign: "right", color: "var(--text-subtle)" }}>€ {l.unitPrice.toFixed(2)}</td>
                          <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 500 }}>€ {l.lineTotal.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Already sent */}
      {sent.length > 0 && (
        <div>
          <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-subtle)", marginBottom: 10 }}>Verstuurd</h2>
          {sent.map(inv => (
            <div key={inv.id} className="card" style={{ padding: "0.75rem 1.25rem", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontWeight: 500, fontSize: 13 }}>{inv.invoiceNumber ?? `DBK-${inv.id.slice(-6).toUpperCase()}`}</span>
                {inv.sentAt && <span style={{ fontSize: 12, color: "var(--text-subtle)", marginLeft: 8 }}>verstuurd {new Date(inv.sentAt).toLocaleDateString("nl-NL")}</span>}
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>€ {Number(inv.totalAmountExcl).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
