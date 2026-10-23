"use client";
import { type DoughPhase, resolvePhases, phaseTotals, fmtGrams } from "@/lib/dough-phases";

const label: React.CSSProperties = { fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.04em" };

/**
 * Read-only view of a phased recipe: per phase its timing, ingredients (scaled to `loaves`)
 * and instructions. Used on the Recepten page (1 loaf) and the production sheet (real count).
 * `only` filters which phases are shown — carry-over amounts are still resolved over the whole list.
 */
export function PhaseView({ phases, loaves = 1, only, showTotals = true }: {
  phases: DoughPhase[]; loaves?: number; only?: (p: DoughPhase) => boolean; showTotals?: boolean;
}) {
  const resolved = resolvePhases(phases, loaves);
  const shown = only ? resolved.filter(only) : resolved;
  if (shown.length === 0) return null;
  const totals = phaseTotals(resolved);

  return (
    <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 10 }}>
      {shown.map((p, i) => (
        <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            <strong style={{ fontSize: 14 }}>{p.name}</strong>
            {p.daysBefore === 1 && <span style={{ fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "1px 7px", borderRadius: 8 }}>dag ervoor</span>}
            {p.timing && <span style={{ fontSize: 12, color: "var(--accent)" }}>⏱ {p.timing}</span>}
          </div>
          {p.ingredients.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: p.instructions ? 8 : 0 }}>
              <tbody>
                {p.ingredients.map((ing, j) => (
                  <tr key={j} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "5px 0", color: ing.carryOver ? "var(--text-subtle)" : "var(--text-muted)", fontStyle: ing.carryOver ? "italic" : "normal" }}>{ing.name}</td>
                    <td style={{ padding: "5px 0", textAlign: "right", fontWeight: 600 }}>{fmtGrams(ing.grams)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: "5px 0", fontSize: 11, color: "var(--text-subtle)" }}>Totaal deze fase</td>
                  <td style={{ padding: "5px 0", textAlign: "right", fontSize: 11, color: "var(--text-subtle)" }}>{fmtGrams(p.totalGrams)}</td>
                </tr>
              </tbody>
            </table>
          )}
          {p.instructions.trim() && (
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-muted)", lineHeight: 1.5 }}>
              {p.instructions.split("\n").map(l => l.trim()).filter(Boolean).map((l, k) => <li key={k}>{l}</li>)}
            </ul>
          )}
        </div>
      ))}
      {showTotals && !only && totals.ingredients.length > 0 && (
        <div style={{ padding: "2px 4px" }}>
          <p style={{ ...label, margin: "0 0 4px" }}>Totaal recept{loaves !== 1 ? ` (${loaves} broden)` : " (1 brood)"}</p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {totals.ingredients.map(t => (
                <tr key={t.name} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "4px 0", color: "var(--text-muted)" }}>{t.name}</td>
                  <td style={{ padding: "4px 0", textAlign: "right" }}>{fmtGrams(t.grams)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ padding: "5px 0", fontWeight: 600 }}>Totaal gewicht</td>
                <td style={{ padding: "5px 0", textAlign: "right", fontWeight: 600 }}>{fmtGrams(totals.totalGrams)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
