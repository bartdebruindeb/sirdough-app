"use client";
import { useState } from "react";

const DAYS_NL = ["", "Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

type BreadType = { id: string; name: string; customerOrderable: boolean; winkelOrderable: boolean; availableWeekdays: string | null };

export function BreadTypeAvailabilityManager({ breadTypes, onChanged }: { breadTypes: BreadType[]; onChanged: () => void }) {
  const [saving, setSaving] = useState<string|null>(null);

  async function patch(id: string, data: object) {
    setSaving(id);
    await fetch("/api/bread-types", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": "OWNER" },
      body: JSON.stringify({ id, ...data }),
    });
    setSaving(null);
    onChanged();
  }

  function toggleDayForBread(bt: BreadType, day: number) {
    const current = bt.availableWeekdays ? bt.availableWeekdays.split(",").map(Number) : [];
    const updated = current.includes(day) ? current.filter(d => d !== day) : [...current, day].sort();
    patch(bt.id, { availableWeekdays: updated.length > 0 && updated.length < 7 ? updated.join(",") : null });
  }

  return (
    <div className="card" style={{ padding: "1.25rem 1.5rem", marginBottom: 20 }}>
      <h3 style={{ fontSize: 14, marginBottom: "1rem" }}>Beschikbaarheid broodsoorten</h3>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 500, color: "var(--text-subtle)" }}>Brood</th>
              <th style={{ textAlign: "center", padding: "4px 8px", fontWeight: 500, color: "var(--text-subtle)" }}>Klant&shy;portal</th>
              <th style={{ textAlign: "center", padding: "4px 8px", fontWeight: 500, color: "var(--text-subtle)" }}>Winkel</th>
              <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 500, color: "var(--text-subtle)" }}>Beschikbare dagen</th>
            </tr>
          </thead>
          <tbody>
            {breadTypes.map(bt => {
              const days = bt.availableWeekdays ? bt.availableWeekdays.split(",").map(Number) : [];
              const allDays = days.length === 0;
              return (
                <tr key={bt.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 8px", fontWeight: 500 }}>{bt.name}</td>
                  <td style={{ textAlign: "center", padding: "6px 8px" }}>
                    <button onClick={() => patch(bt.id, { customerOrderable: !bt.customerOrderable })} disabled={saving === bt.id}
                      style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 14,
                        borderColor: bt.customerOrderable ? "var(--accent)" : "var(--border)",
                        background: bt.customerOrderable ? "var(--accent-light)" : "var(--surface)",
                        color: bt.customerOrderable ? "var(--accent)" : "var(--text-subtle)",
                      }}>
                      {bt.customerOrderable ? "✓" : ""}
                    </button>
                  </td>
                  <td style={{ textAlign: "center", padding: "6px 8px" }}>
                    <button onClick={() => patch(bt.id, { winkelOrderable: !bt.winkelOrderable })} disabled={saving === bt.id}
                      style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 14,
                        borderColor: bt.winkelOrderable ? "#d97706" : "var(--border)",
                        background: bt.winkelOrderable ? "#fef3c7" : "var(--surface)",
                        color: bt.winkelOrderable ? "#92400e" : "var(--text-subtle)",
                      }}>
                      {bt.winkelOrderable ? "✓" : ""}
                    </button>
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                      {[1,2,3,4,5,6,7].map(d => (
                        <button key={d} onClick={() => toggleDayForBread(bt, d)} disabled={saving === bt.id}
                          style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 11,
                            borderColor: (allDays || days.includes(d)) ? "var(--success)" : "var(--border)",
                            background: (allDays || days.includes(d)) ? "var(--success-bg)" : "var(--surface)",
                            color: (allDays || days.includes(d)) ? "var(--success)" : "var(--text-subtle)",
                          }}>
                          {DAYS_NL[d]}
                        </button>
                      ))}
                      {!allDays && (
                        <button onClick={() => patch(bt.id, { availableWeekdays: null })} disabled={saving === bt.id}
                          style={{ fontSize: 10, padding: "2px 6px", borderRadius: 5, border: "1px solid var(--border)", background: "none", cursor: "pointer", color: "var(--text-subtle)" }}>
                          Alle
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-subtle)", margin: "10px 0 0" }}>
        Klantportal = bestelbaar in klantenportaal. Winkel = beschikbaar in de winkel(s). Groene dagen = beschikbaar. Klik op een dag om te wisselen. "Alle" = geen beperking.
      </p>
    </div>
  );
}
