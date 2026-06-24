"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";

type InvoiceLine = { name: string; quantity: number; unitPrice: number; lineTotal: number; date: string };
type CustomerRow = { customerId: string; customerName: string; customerEmail: string | null; discountPercent: number; lines: InvoiceLine[]; total: number; orderIds: string[] };
type SentInvoice = { id: string; customerId: string; customerName?: string; invoiceNumber: string | null; sentAt: string | null; totalAmountExcl: string };
type Settings = { companyName?: string; companyAddress?: string; companyPostal?: string; companyCity?: string; kvk?: string; btwNumber?: string; iban?: string; bic?: string; companyPhone?: string; companyEmail?: string; companyWebsite?: string; paymentTermDays?: number; paymentCondition?: string };

function prevWeek(w: string) { const [y, wn] = w.split("-W").map(Number); return wn === 1 ? `${y - 1}-W52` : `${y}-W${String(wn - 1).padStart(2, "0")}`; }
function nextWeek(w: string) { const [y, wn] = w.split("-W").map(Number); return wn >= 52 ? `${y + 1}-W01` : `${y}-W${String(wn + 1).padStart(2, "0")}`; }
function currentWeek() {
  const d = new Date(); const day = d.getUTCDay() || 7;
  const thu = new Date(d); thu.setUTCDate(d.getUTCDate() - day + 4);
  const ys = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const wk = Math.ceil((((thu.getTime() - ys.getTime()) / 86400000) + 1) / 7);
  return `${thu.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}

const inp: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 12, background: "var(--surface)", width: "100%" };

export default function FacturatiePage() {
  const searchParams = useSearchParams();
  const exactParam = searchParams.get("exact");

  const [week, setWeek] = useState(() => prevWeek(currentWeek()));
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [sent, setSent] = useState<SentInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [exactConnected, setExactConnected] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Preview modal
  const [previewCustomer, setPreviewCustomer] = useState<CustomerRow | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const previewBlobRef = useRef<Blob | null>(null);

  // Settings panel
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Settings>({});
  const [savingSettings, setSavingSettings] = useState(false);

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
    fetch("/api/instellingen").then(r => r.json()).then(d => setSettings(d)).catch(() => {});
  }, []);

  async function generate(c: CustomerRow) {
    setGenerating(c.customerId);
    const res = await fetch("/api/facturen/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: c.customerId, orderIds: c.orderIds, week }),
    });
    if (!res.ok) { setGenerating(null); alert("Genereren mislukt."); return; }
    const blob = await res.blob();
    previewBlobRef.current = blob;
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    setPreviewCustomer(c);
    setGenerating(null);
  }

  async function sendInvoice() {
    if (!previewCustomer) return;
    setSending(true);
    const res = await fetch("/api/facturen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: previewCustomer.customerId, orderIds: previewCustomer.orderIds, week }),
    }).then(r => r.json()).catch(() => null);
    setSending(false);
    closeModal();
    if (res?.ok) load(week);
    else alert("Er ging iets mis bij het versturen.");
  }

  function closeModal() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewCustomer(null);
    previewBlobRef.current = null;
  }

  function downloadPreview() {
    if (!previewBlobRef.current || !previewCustomer) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(previewBlobRef.current);
    a.download = `factuur-preview-${previewCustomer.customerName}.pdf`;
    a.click();
  }

  async function saveSettings() {
    setSavingSettings(true);
    await fetch("/api/instellingen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) }).catch(() => {});
    setSavingSettings(false);
  }

  const [y, wn] = week.split("-W");
  const weekLabel = `Week ${wn}, ${y}`;

  return (
    <div style={{ padding: "1.5rem", maxWidth: 860 }}>

      {/* ── Header ─────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: 26, margin: 0 }}>Facturatie</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "4px 0 0" }}>Genereer en verstuur facturen per week.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setShowSettings(s => !s)} className="btn-secondary" style={{ fontSize: 12, padding: "6px 12px" }}>
            {showSettings ? "Sluiten" : "⚙ Bedrijfsgegevens"}
          </button>
          {exactConnected === false && (
            <a href="/api/exact/connect" className="btn-secondary" style={{ fontSize: 12, textDecoration: "none", padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", color: "var(--text-subtle)" }}>
              Koppel Exact
            </a>
          )}
          {exactConnected === true && (
            <span style={{ fontSize: 12, color: "var(--success)", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "4px 10px", borderRadius: 6 }}>✓ Exact</span>
          )}
        </div>
      </div>

      {exactParam === "ok" && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>Exact Online succesvol gekoppeld.</div>}
      {exactParam === "error" && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>Koppeling met Exact Online mislukt.</div>}

      {/* ── Company settings panel ─────────────────── */}
      {showSettings && (
        <div className="card" style={{ padding: "1.25rem 1.5rem", marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-subtle)", marginBottom: 16, marginTop: 0 }}>Bedrijfsgegevens (op factuur)</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {([
              ["companyName", "Bedrijfsnaam"],
              ["companyAddress", "Adres"],
              ["companyPostal", "Postcode"],
              ["companyCity", "Stad"],
              ["kvk", "KvK-nummer"],
              ["btwNumber", "BTW-nummer"],
              ["iban", "IBAN"],
              ["bic", "BIC"],
              ["companyPhone", "Telefoon"],
              ["companyEmail", "E-mail"],
              ["companyWebsite", "Website"],
              ["paymentCondition", "Betalingsconditie"],
            ] as [keyof Settings, string][]).map(([key, label]) => (
              <div key={key}>
                <label style={{ fontSize: 11, color: "var(--text-subtle)", display: "block", marginBottom: 3 }}>{label}</label>
                <input style={inp} value={(settings[key] as string) ?? ""} onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 11, color: "var(--text-subtle)", display: "block", marginBottom: 3 }}>Betaaltermijn (dagen)</label>
              <input style={inp} type="number" value={settings.paymentTermDays ?? 30} onChange={e => setSettings(s => ({ ...s, paymentTermDays: Number(e.target.value) }))} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
            <button onClick={saveSettings} disabled={savingSettings} className="btn-primary" style={{ fontSize: 12 }}>
              {savingSettings ? "Opslaan…" : "Opslaan"}
            </button>
          </div>
        </div>
      )}

      {/* ── Week selector ──────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1.5rem" }}>
        <button onClick={() => setWeek(prevWeek(week))} className="btn-secondary" style={{ fontSize: 12, padding: "5px 10px" }}>‹ Vorige</button>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{weekLabel}</span>
        <button onClick={() => setWeek(nextWeek(week))} className="btn-secondary" style={{ fontSize: 12, padding: "5px 10px" }}>Volgende ›</button>
      </div>

      {loading && <p style={{ color: "var(--text-subtle)", fontSize: 13 }}>Laden…</p>}

      {!loading && customers.length === 0 && sent.length === 0 && (
        <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--text-subtle)", fontSize: 13 }}>Geen bestellingen gevonden voor {weekLabel}.</div>
      )}

      {/* ── To invoice ─────────────────────────────── */}
      {customers.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-subtle)", marginBottom: 10 }}>Te factureren</h2>
          {customers.map(c => (
            <div key={c.customerId} className="card" style={{ marginBottom: 10, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.875rem 1.25rem" }}>
                <button onClick={() => setExpanded(expanded === c.customerId ? null : c.customerId)}
                  style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", flex: 1, padding: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{c.customerName}</span>
                    {c.customerEmail
                      ? <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>{c.customerEmail}</span>
                      : <span style={{ fontSize: 12, color: "#f97316" }}>⚠ geen e-mail</span>}
                    {c.discountPercent > 0 && <span style={{ fontSize: 11, background: "#eff6ff", color: "#1d4ed8", padding: "1px 7px", borderRadius: 6 }}>{c.discountPercent}% korting</span>}
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>{c.orderIds.length} bestelling{c.orderIds.length !== 1 ? "en" : ""} · € {c.total.toFixed(2)} excl. BTW</span>
                </button>
                <button
                  onClick={() => generate(c)}
                  disabled={generating === c.customerId}
                  className="btn-primary"
                  style={{ fontSize: 12, padding: "6px 14px", marginLeft: 12, flexShrink: 0 }}
                >
                  {generating === c.customerId ? "Genereren…" : "Genereer factuur"}
                </button>
              </div>
              {expanded === c.customerId && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "0.75rem 1.25rem" }}>
                  <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                    <tbody>
                      {c.lines.map((l, i) => (
                        <tr key={i}>
                          <td style={{ padding: "3px 0" }}>{l.name}</td>
                          <td style={{ padding: "3px 0", color: "var(--text-subtle)" }}>{new Date(l.date + "T12:00:00Z").toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" })}</td>
                          <td style={{ padding: "3px 0", textAlign: "center" }}>{l.quantity}×</td>
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

      {/* ── Sent invoices ──────────────────────────── */}
      {sent.length > 0 && (
        <div>
          <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-subtle)", marginBottom: 10 }}>Verstuurd</h2>
          {sent.map(inv => (
            <div key={inv.id} className="card" style={{ padding: "0.75rem 1.25rem", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontWeight: 500, fontSize: 13 }}>{inv.invoiceNumber ?? `DBK-${inv.id.slice(-6).toUpperCase()}`}</span>
                {inv.sentAt && <span style={{ fontSize: 12, color: "var(--text-subtle)", marginLeft: 8 }}>verstuurd {new Date(inv.sentAt).toLocaleDateString("nl-NL")}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>€ {Number(inv.totalAmountExcl).toFixed(2)}</span>
                <a href={`/api/facturen/${inv.id}`} target="_blank" rel="noopener"
                  style={{ fontSize: 12, color: "var(--text-subtle)", textDecoration: "none", padding: "4px 10px", border: "1px solid var(--border)", borderRadius: 6 }}>
                  PDF ↗
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Preview modal ──────────────────────────── */}
      {previewUrl && previewCustomer && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", flexDirection: "column", padding: 24 }}>
          <div style={{ background: "var(--surface)", borderRadius: 12, display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", maxWidth: 860, width: "100%", margin: "0 auto" }}>
            {/* Modal header */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 15 }}>Factuur — {previewCustomer.customerName}</span>
                {!previewCustomer.customerEmail && <span style={{ fontSize: 12, color: "#f97316", marginLeft: 10 }}>⚠ geen e-mailadres — factuur wordt aangemaakt maar niet verstuurd</span>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={downloadPreview} className="btn-secondary" style={{ fontSize: 12 }}>Download PDF</button>
                <button onClick={sendInvoice} disabled={sending} className="btn-primary" style={{ fontSize: 12 }}>
                  {sending ? "Versturen…" : previewCustomer.customerEmail ? "Verstuur per e-mail" : "Sla op (geen e-mail)"}
                </button>
                <button onClick={closeModal} className="btn-secondary" style={{ fontSize: 12 }}>Annuleer</button>
              </div>
            </div>
            {/* PDF iframe */}
            <iframe src={previewUrl} style={{ flex: 1, border: "none", background: "#f5f5f5" }} title="Factuur preview" />
          </div>
        </div>
      )}
    </div>
  );
}
