"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useRole } from "@/lib/role-context";

type InvoiceLine = { name: string; quantity: number; unitPrice: number; lineTotal: number; date: string };
type CustomerRow = { customerId: string; customerName: string; customerEmail: string | null; discountPercent: number; lines: InvoiceLine[]; total: number; orderIds: string[] };
type SentInvoice = { id: string; customerId: string; invoiceNumber: string | null; sentAt: string | null; totalAmountExcl: string };
type Undelivered = { customerName: string; city: string | null; date: string };
type BillingEntity = { id: string; name: string; companyAddress?: string; companyPostal?: string; companyCity?: string; kvk?: string; btwNumber?: string; iban?: string; bic?: string; companyPhone?: string; companyEmail?: string; companyWebsite?: string; paymentTermDays?: number; paymentCondition?: string; isDefault?: boolean };

const EMPTY_ENTITY: Partial<BillingEntity> = { name: "", paymentTermDays: 30, paymentCondition: "30 dagen", isDefault: false };

function prevWeek(w: string) { const [y, wn] = w.split("-W").map(Number); return wn === 1 ? `${y - 1}-W52` : `${y}-W${String(wn - 1).padStart(2, "0")}`; }
function nextWeek(w: string) { const [y, wn] = w.split("-W").map(Number); return wn >= 52 ? `${y + 1}-W01` : `${y}-W${String(wn + 1).padStart(2, "0")}`; }
function currentWeek() {
  const d = new Date(); const day = d.getUTCDay() || 7;
  const thu = new Date(d); thu.setUTCDate(d.getUTCDate() - day + 4);
  const ys = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const wk = Math.ceil((((thu.getTime() - ys.getTime()) / 86400000) + 1) / 7);
  return `${thu.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}
// Monday–Sunday date range of an ISO week (Jan 4 is always in week 1) — matches the
// server's weekBounds() so the displayed dates line up with what gets invoiced.
function weekDateRange(w: string): string {
  const [y, wn] = w.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (wn - 1) * 7);
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

const inp: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 12, background: "var(--surface)", width: "100%" };

function LogoUpload({ isOwner, role }: { isOwner: boolean; role: string | null }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [ts, setTs] = useState(() => Date.now());

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    await fetch("/api/instellingen/logo", { method: "POST", headers: { "x-role": role ?? "" }, body: form }).catch(() => {});
    setUploading(false);
    setTs(Date.now());
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/logo.jpg?t=${ts}`} alt="logo" style={{ height: 52, width: 52, objectFit: "contain", borderRadius: 8 }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
      {isOwner && (
        <>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-secondary" style={{ fontSize: 11, padding: "4px 10px" }}>
            {uploading ? "…" : "Logo wijzigen"}
          </button>
        </>
      )}
    </div>
  );
}

export default function FacturatiePage() {
  const searchParams = useSearchParams();
  const exactParam = searchParams.get("exact");
  const { role } = useRole();
  const isOwner = role === "OWNER";

  const [week, setWeek] = useState(() => prevWeek(currentWeek()));
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [sent, setSent] = useState<SentInvoice[]>([]);
  const [undelivered, setUndelivered] = useState<Undelivered[]>([]);
  const [loading, setLoading] = useState(false);
  const [exactConnected, setExactConnected] = useState<boolean | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Billing entities
  const [entities, setEntities] = useState<BillingEntity[]>([]);
  const [showEntities, setShowEntities] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Partial<BillingEntity> | null>(null);
  const [savingEntity, setSavingEntity] = useState(false);

  // BV picker — shown before generating
  const [pickingCustomer, setPickingCustomer] = useState<CustomerRow | null>(null);

  // Preview modal
  const [previewCustomer, setPreviewCustomer] = useState<CustomerRow | null>(null);
  const [previewEntityId, setPreviewEntityId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const previewBlobRef = useRef<Blob | null>(null);

  const load = useCallback((w: string) => {
    setLoading(true);
    fetch(`/api/facturen?week=${w}`).then(r => r.json()).then(d => {
      setCustomers(d.customers ?? []);
      setSent(d.invoiced ?? []);
      setUndelivered(d.undelivered ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadEntities = useCallback(() => {
    fetch("/api/billing-entities").then(r => r.json()).then(d => {
      setEntities(d.entities ?? []);
    }).catch(() => {});
  }, []);

  useEffect(() => { load(week); }, [week, load]);
  useEffect(() => {
    loadEntities();
    fetch("/api/exact/status").then(r => r.json()).then(d => setExactConnected(d.connected)).catch(() => setExactConnected(false));
  }, [loadEntities]);

  function requestGenerate(c: CustomerRow) {
    if (entities.length > 1) { setPickingCustomer(c); return; }
    // 0 or 1 entity — skip picker
    generate(c, entities[0]?.id ?? null);
  }

  async function generate(c: CustomerRow, entityId: string | null) {
    setPickingCustomer(null);
    setGenerating(c.customerId);
    const res = await fetch("/api/facturen/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: c.customerId, orderIds: c.orderIds, week, billingEntityId: entityId }),
    });
    if (!res.ok) { setGenerating(null); alert("Genereren mislukt."); return; }
    const blob = await res.blob();
    previewBlobRef.current = blob;
    setPreviewUrl(URL.createObjectURL(blob));
    setPreviewCustomer(c);
    setPreviewEntityId(entityId);
    setGenerating(null);
  }

  // Creates the real invoice (in Exact, if connected) and saves its final PDF — the
  // invoice/customer number only exists once this actually runs, since Exact assigns
  // them on creation. Emailing is a separate step afterward (sendInvoiceEmail below).
  async function createInvoice() {
    if (!previewCustomer) return;
    setSending(true);
    const res = await fetch("/api/facturen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: previewCustomer.customerId, orderIds: previewCustomer.orderIds, week, billingEntityId: previewEntityId }),
    }).then(r => r.json()).catch(() => null);
    setSending(false);
    closeModal();
    if (res?.ok) load(week);
    else alert("Er ging iets mis bij het aanmaken van de factuur.");
  }

  async function sendInvoiceEmail(id: string) {
    setResending(id);
    const r = await fetch(`/api/facturen/${id}`, { method: "POST" }).then(x => x.json()).catch(() => ({}));
    setResending(null);
    if (r.ok) load(week);
    else alert(r.error === "NO_EMAIL" ? "Klant heeft geen e-mailadres." : "Versturen mislukt.");
  }

  async function deleteInvoice(id: string) {
    if (!confirm("Factuur definitief verwijderen? Als deze in Exact staat, wordt hij daar ook verwijderd (alleen mogelijk zolang hij nog niet verwerkt/geboekt is).")) return;
    setDeleting(id);
    const r = await fetch(`/api/facturen/${id}`, { method: "DELETE" }).then(x => x.json()).catch(() => ({}));
    setDeleting(null);
    if (r.ok) load(week);
    else if (r.error === "EXACT_DELETE_FAILED") alert(`Kon niet verwijderen: deze factuur staat nog in Exact en kan daar niet meer automatisch worden verwijderd (waarschijnlijk al verwerkt/geboekt). Verwijder of crediteer hem eerst handmatig in Exact.\n\n${r.detail ?? ""}`);
    else alert("Verwijderen mislukt.");
  }

  function closeModal() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null); setPreviewCustomer(null); setPreviewEntityId(null); previewBlobRef.current = null;
  }

  function downloadPreview() {
    if (!previewBlobRef.current || !previewCustomer) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(previewBlobRef.current);
    a.download = `factuur-preview-${previewCustomer.customerName}.pdf`;
    a.click();
  }

  async function saveEntity() {
    if (!editingEntity?.name) return;
    setSavingEntity(true);
    const method = editingEntity.id ? "PATCH" : "POST";
    await fetch("/api/billing-entities", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingEntity),
    });
    setSavingEntity(false);
    setEditingEntity(null);
    loadEntities();
  }

  async function deleteEntity(id: string) {
    if (!confirm("Entiteit verwijderen?")) return;
    await fetch("/api/billing-entities", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    loadEntities();
  }

  const [y, wn] = week.split("-W");
  const weekLabel = `Week ${wn}, ${y} · ${weekDateRange(week)}`;

  const ENTITY_FIELDS: [keyof BillingEntity, string][] = [
    ["name", "Bedrijfsnaam *"], ["companyAddress", "Adres"], ["companyPostal", "Postcode"],
    ["companyCity", "Stad"], ["kvk", "KvK-nummer"], ["btwNumber", "BTW-nummer"],
    ["iban", "IBAN"], ["bic", "BIC"], ["companyPhone", "Telefoon"],
    ["companyEmail", "E-mail"], ["companyWebsite", "Website"], ["paymentCondition", "Betalingsconditie"],
  ];

  return (
    <div style={{ padding: "1.5rem", maxWidth: 860 }}>

      {/* ── Header ─────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: 26, margin: 0 }}>Facturatie</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "4px 0 0" }}>Genereer en verstuur facturen per week.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setShowEntities(s => !s)} className="btn-secondary" style={{ fontSize: 12, padding: "6px 12px" }}>
            {showEntities ? "Sluiten" : "⚙ BV's beheren"}
          </button>
          {exactConnected === false && <a href="/api/exact/connect" className="btn-secondary" style={{ fontSize: 12, textDecoration: "none", padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", color: "var(--text-subtle)" }}>Koppel Exact</a>}
          {exactConnected === true && (
            <>
              <span style={{ fontSize: 12, color: "var(--success)", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "4px 10px", borderRadius: 6 }}>✓ Exact</span>
              <button
                disabled={disconnecting}
                onClick={async () => {
                  if (!confirm("Exact ontkoppelen? Facturen gaan daarna niet meer automatisch naar Exact totdat je opnieuw koppelt.")) return;
                  setDisconnecting(true);
                  await fetch("/api/exact/status", { method: "DELETE" }).catch(() => {});
                  setDisconnecting(false);
                  setExactConnected(false);
                }}
                className="btn-secondary"
                style={{ fontSize: 12, padding: "6px 12px" }}
              >
                {disconnecting ? "…" : "Ontkoppel"}
              </button>
            </>
          )}
        </div>
      </div>

      {exactParam === "ok" && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>Exact Online succesvol gekoppeld.</div>}

      {/* ── BV management panel ─────────────────────── */}
      {showEntities && (
        <div className="card" style={{ padding: "1.25rem 1.5rem", marginBottom: "1.5rem" }}>
          {/* Logo lives here (not the always-visible header) — it's set once and rarely
              touched, so it doesn't need permanent page space. */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
            <LogoUpload isOwner={isOwner} role={role} />
            <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>Logo op facturen</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-subtle)", margin: 0 }}>Facturerende entiteiten</h2>
            <button onClick={() => setEditingEntity({ ...EMPTY_ENTITY })} className="btn-primary" style={{ fontSize: 12 }}>+ Toevoegen</button>
          </div>
          {entities.length === 0 && <p style={{ fontSize: 13, color: "var(--text-subtle)" }}>Nog geen entiteiten. Voeg er een toe.</p>}
          {entities.map(e => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", marginBottom: 8, background: e.isDefault ? "var(--accent-light)" : "var(--surface)" }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{e.name}</span>
                {e.companyCity && <span style={{ fontSize: 12, color: "var(--text-subtle)", marginLeft: 8 }}>{e.companyCity}</span>}
                {e.isDefault && <span style={{ fontSize: 11, background: "var(--accent)", color: "#fff", padding: "1px 7px", borderRadius: 6, marginLeft: 8 }}>standaard</span>}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setEditingEntity({ ...e })} className="btn-secondary" style={{ fontSize: 11, padding: "3px 10px" }}>Bewerken</button>
                <button onClick={() => deleteEntity(e.id)} className="btn-secondary" style={{ fontSize: 11, padding: "3px 10px", color: "#dc2626" }}>Verwijderen</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Entity edit modal ──────────────────────── */}
      {editingEntity && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div className="card" style={{ width: "100%", maxWidth: 560, padding: "1.5rem", maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 16 }}>{editingEntity.id ? "Entiteit bewerken" : "Nieuwe entiteit"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {ENTITY_FIELDS.map(([key, label]) => (
                <div key={key}>
                  <label style={{ fontSize: 11, color: "var(--text-subtle)", display: "block", marginBottom: 3 }}>{label}</label>
                  <input style={inp} value={(editingEntity[key] as string) ?? ""} onChange={e => setEditingEntity(s => ({ ...s, [key]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11, color: "var(--text-subtle)", display: "block", marginBottom: 3 }}>Betaaltermijn (dagen)</label>
                <input style={inp} type="number" value={editingEntity.paymentTermDays ?? 30} onChange={e => setEditingEntity(s => ({ ...s, paymentTermDays: Number(e.target.value) }))} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 18 }}>
                <input type="checkbox" id="isDefault" checked={!!editingEntity.isDefault} onChange={e => setEditingEntity(s => ({ ...s, isDefault: e.target.checked }))} />
                <label htmlFor="isDefault" style={{ fontSize: 12 }}>Standaard entiteit</label>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditingEntity(null)} className="btn-secondary" style={{ fontSize: 12 }}>Annuleer</button>
              <button onClick={saveEntity} disabled={savingEntity || !editingEntity.name} className="btn-primary" style={{ fontSize: 12 }}>
                {savingEntity ? "Opslaan…" : "Opslaan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Week + entity selector ─────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1.5rem" }}>
        <button onClick={() => setWeek(prevWeek(week))} className="btn-secondary" style={{ fontSize: 12, padding: "5px 10px" }}>‹ Vorige</button>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{weekLabel}</span>
        <button onClick={() => setWeek(nextWeek(week))} className="btn-secondary" style={{ fontSize: 12, padding: "5px 10px" }}>Volgende ›</button>
        {entities.length === 0 && <span style={{ marginLeft: "auto", fontSize: 12, color: "#f97316" }}>⚠ Voeg eerst een BV toe via "BV's beheren"</span>}
      </div>

      {/* Vaste bezorgingen die niet als bezorgd zijn verwerkt worden niet gefactureerd —
          waarschuw zodat de eigenaar ze eerst in Bezorgen afrondt. */}
      {!loading && undelivered.length > 0 && (
        <div style={{ background: "var(--warn-bg, #fff7ed)", border: "1px solid #fca5a5", borderRadius: 10, padding: "1rem", color: "var(--warn, #b45309)", fontSize: 13, marginBottom: 16 }}>
          <strong>⚠️ {undelivered.length} vaste {undelivered.length === 1 ? "bezorging staat" : "bezorgingen staan"} niet op ‘bezorgd’</strong> — deze worden niet gefactureerd zolang ze niet in Bezorgen zijn afgerond:
          <ul style={{ margin: "8px 0 0", paddingLeft: 22 }}>
            {undelivered.map((u, i) => (
              <li key={i}>
                {u.customerName}{u.city ? ` — ${u.city}` : ""}
                <span style={{ color: "var(--text-subtle)" }}> · {new Date(u.date + "T12:00:00Z").toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{c.customerName}</span>
                    {c.customerEmail
                      ? <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>{c.customerEmail}</span>
                      : <span style={{ fontSize: 12, color: "#f97316" }}>⚠ geen e-mail</span>}
                    {c.discountPercent > 0 && <span style={{ fontSize: 11, background: "#eff6ff", color: "#1d4ed8", padding: "1px 7px", borderRadius: 6 }}>{c.discountPercent}% korting</span>}
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>{c.orderIds.length} bestelling{c.orderIds.length !== 1 ? "en" : ""} · € {(c.total * 1.09).toFixed(2)} incl. BTW</span>
                </button>
                <button onClick={() => requestGenerate(c)} disabled={generating === c.customerId} className="btn-primary" style={{ fontSize: 12, padding: "6px 14px", marginLeft: 12, flexShrink: 0 }}>
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

      {/* ── Invoiced ────────────────────────────────── */}
      {sent.length > 0 && (
        <div>
          <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-subtle)", marginBottom: 10 }}>Gefactureerd</h2>
          {sent.map(inv => (
            <div key={inv.id} className="card" style={{ padding: "0.75rem 1.25rem", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontWeight: 500, fontSize: 13 }}>{inv.invoiceNumber ?? `DBK-${inv.id.slice(-6).toUpperCase()}`}</span>
                {inv.sentAt
                  ? <span style={{ fontSize: 12, color: "var(--text-subtle)", marginLeft: 8 }}>verstuurd {new Date(inv.sentAt).toLocaleDateString("nl-NL")}</span>
                  : <span style={{ fontSize: 12, color: "#f97316", marginLeft: 8 }}>nog niet verstuurd</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>€ {Number(inv.totalAmountExcl).toFixed(2)}</span>
                <a href={`/api/facturen/${inv.id}`} target="_blank" rel="noopener" style={{ fontSize: 12, color: "var(--text-subtle)", textDecoration: "none", padding: "4px 10px", border: "1px solid var(--border)", borderRadius: 6 }}>PDF ↗</a>
                <button
                  disabled={resending === inv.id}
                  onClick={() => sendInvoiceEmail(inv.id)}
                  className="btn-secondary"
                  style={{ fontSize: 11, padding: "4px 10px" }}
                >
                  {resending === inv.id ? "…" : inv.sentAt ? "Opnieuw versturen" : "Verstuur per e-mail"}
                </button>
                {isOwner && (
                  <button
                    disabled={deleting === inv.id}
                    onClick={() => deleteInvoice(inv.id)}
                    className="btn-secondary"
                    style={{ fontSize: 11, padding: "4px 10px", color: "#dc2626" }}
                  >
                    {deleting === inv.id ? "…" : "🗑"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── BV picker modal ───────────────────────── */}
      {pickingCustomer && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div className="card" style={{ width: "100%", maxWidth: 420, padding: "1.5rem" }}>
            <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 6 }}>Factuur voor {pickingCustomer.customerName}</h2>
            <p style={{ fontSize: 13, color: "var(--text-subtle)", marginBottom: 16 }}>Van welke entiteit wil je factureren?</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {entities.map(e => (
                <button key={e.id} onClick={() => generate(pickingCustomer, e.id)}
                  disabled={generating === pickingCustomer.customerId}
                  style={{ textAlign: "left", padding: "12px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", opacity: generating ? 0.6 : 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{e.name}</div>
                  {(e.companyCity || e.kvk) && (
                    <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 2 }}>
                      {[e.companyCity, e.kvk ? `KvK ${e.kvk}` : null].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setPickingCustomer(null)} className="btn-secondary" style={{ fontSize: 12 }}>Annuleer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview modal ──────────────────────────── */}
      {previewUrl && previewCustomer && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", flexDirection: "column", padding: 24 }}>
          <div style={{ background: "var(--surface)", borderRadius: 12, display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", maxWidth: 860, width: "100%", margin: "0 auto" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{previewCustomer.customerName}</span>
                {previewEntityId && <span style={{ fontSize: 12, color: "var(--text-subtle)", marginLeft: 8 }}>van {entities.find(e => e.id === previewEntityId)?.name}</span>}
                {!previewCustomer.customerEmail && <span style={{ fontSize: 12, color: "#f97316", marginLeft: 10 }}>⚠ geen e-mail</span>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={downloadPreview} className="btn-secondary" style={{ fontSize: 12 }}>Download voorbeeld</button>
                <button onClick={createInvoice} disabled={sending} className="btn-primary" style={{ fontSize: 12 }}>
                  {sending ? "Aanmaken…" : "Aanmaken in Exact"}
                </button>
                <button onClick={closeModal} className="btn-secondary" style={{ fontSize: 12 }}>Annuleer</button>
              </div>
            </div>
            <iframe src={previewUrl} style={{ flex: 1, border: "none", background: "#f5f5f5" }} title="Factuur preview" />
          </div>
        </div>
      )}
    </div>
  );
}
