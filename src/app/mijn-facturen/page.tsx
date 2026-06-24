"use client";
import { useEffect, useState } from "react";

type InvoiceRow = {
  id: string;
  invoiceNumber: string | null;
  periodStart: string;
  periodEnd: string;
  totalAmountExcl: number;
  vatPercent: number;
  sentAt: string | null;
};

export default function MijnFacturenPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/mijn/facturen").then(r => r.json()).then(d => {
      setInvoices(d.invoices ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: "1.5rem", maxWidth: 700 }}>
      <h1 style={{ fontSize: 26, marginBottom: "0.25rem" }}>Facturen</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: "2rem" }}>
        Facturen ontvangen van uw bakker.
      </p>

      {loading && <p style={{ color: "var(--text-subtle)" }}>Laden...</p>}

      {!loading && invoices.length === 0 && (
        <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--text-subtle)", fontSize: 13 }}>
          Nog geen facturen ontvangen.
        </div>
      )}

      {invoices.map(inv => {
        const excl = Number(inv.totalAmountExcl);
        const vat = excl * (inv.vatPercent / 100);
        const total = excl + vat;
        const start = new Date(inv.periodStart).toLocaleDateString("nl-NL", { day: "numeric", month: "long" });
        const end = new Date(inv.periodEnd).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
        const number = inv.invoiceNumber ?? `DBK-${inv.id.slice(-6).toUpperCase()}`;

        return (
          <div key={inv.id} className="card" style={{ padding: "1rem 1.25rem", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{number}</p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-subtle)" }}>{start} – {end}</p>
              {inv.sentAt && (
                <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--text-subtle)" }}>
                  Ontvangen {new Date(inv.sentAt).toLocaleDateString("nl-NL")}
                </p>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: "var(--accent)" }}>€ {total.toFixed(2)}</p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--text-subtle)" }}>incl. {inv.vatPercent}% BTW</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
