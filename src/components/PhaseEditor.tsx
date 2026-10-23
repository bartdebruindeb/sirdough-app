"use client";
import { type DoughPhase, type PhaseIngredient, resolvePhases, fmtGrams } from "@/lib/dough-phases";
import { NumInput } from "@/components/NumInput";

const input: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 13, background: "var(--surface)" };
const label: React.CSSProperties = { fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 };
const dashed: React.CSSProperties = { background: "none", border: "1px dashed var(--border-strong)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, color: "var(--text-muted)" };
const iconBtn: React.CSSProperties = { background: "none", border: "1px solid var(--border)", borderRadius: 5, cursor: "pointer", fontSize: 12, padding: "2px 7px", color: "var(--text-muted)" };

/**
 * Editor for a phased recipe (voordeeg → tussendeeg → eindeeg → bakken). Per phase: name,
 * when it happens (production day / the day before), a timing note, ingredients in grams for
 * ONE loaf, and instructions. "Volledige vorige stap" pulls the whole previous mixing phase in.
 */
export function PhaseEditor({ phases, onChange }: { phases: DoughPhase[]; onChange: (p: DoughPhase[]) => void }) {
  const resolved = resolvePhases(phases);
  const set = (i: number, patch: Partial<DoughPhase>) => onChange(phases.map((p, j) => j === i ? { ...p, ...patch } : p));
  const setIng = (i: number, k: number, patch: Partial<PhaseIngredient>) =>
    set(i, { ingredients: phases[i].ingredients.map((x, j) => j === k ? { ...x, ...patch } : x) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= phases.length) return;
    const next = [...phases]; [next[i], next[j]] = [next[j], next[i]]; onChange(next);
  };
  const hasPrevMix = (i: number) => phases.slice(0, i).some(p => p.kind === "mix" && p.ingredients.length > 0);
  const mixCount = phases.filter(p => p.kind === "mix").length;

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
      <label style={label}>Fases (optioneel)</label>
      <p style={{ fontSize: 11, color: "var(--text-subtle)", margin: "0 0 10px" }}>
        Voor recepten die in stappen gemaakt worden (bijv. 3-fasen rogge). Hoeveelheden zijn in gram voor <strong>1 brood</strong>;
        de productiepagina rekent ze om naar het aantal broden. Zonder fases gebruikt dit basisrecept gewoon de percentages hierboven.
      </p>

      {phases.map((p, i) => (
        <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 10, background: "var(--surface-2)" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <input value={p.name} onChange={e => set(i, { name: e.target.value })} placeholder={p.kind === "bake" ? "Bakken" : `Stap ${i + 1}`}
              style={{ ...input, fontWeight: 600, width: 140 }} />
            <select value={p.kind} onChange={e => set(i, { kind: e.target.value as "mix" | "bake", ingredients: e.target.value === "bake" ? [] : p.ingredients })} style={input}>
              <option value="mix">Mengen / vormen</option>
              <option value="bake">Bakken (alleen instructies)</option>
            </select>
            <select value={p.daysBefore} onChange={e => set(i, { daysBefore: e.target.value === "1" ? 1 : 0 })} style={input} title="Wanneer moet deze fase gedaan worden?">
              <option value={0}>Op de productiedag</option>
              <option value={1}>De dag ervoor</option>
            </select>
            <span style={{ flex: 1 }} />
            <button onClick={() => move(i, -1)} disabled={i === 0} style={iconBtn} title="Omhoog">↑</button>
            <button onClick={() => move(i, 1)} disabled={i === phases.length - 1} style={iconBtn} title="Omlaag">↓</button>
            <button onClick={() => onChange(phases.filter((_, j) => j !== i))} style={{ ...iconBtn, color: "var(--danger)", borderColor: "#fca5a5" }} title="Fase verwijderen">×</button>
          </div>

          <label style={label}>Tijd / wachttijd</label>
          <input value={p.timing} onChange={e => set(i, { timing: e.target.value })} placeholder="bijv. overnacht laten fermenteren (15-18 uur)"
            style={{ ...input, width: "100%", marginBottom: 8 }} />

          {p.kind === "mix" && (
            <div style={{ marginBottom: 8 }}>
              <label style={label}>Ingrediënten (gram per brood)</label>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {p.ingredients.map((ing, k) => (
                    <tr key={k} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "4px 4px 4px 0" }}>
                        {ing.carryOver
                          ? <span style={{ fontSize: 13, color: "var(--text-subtle)", fontStyle: "italic" }}>{resolved[i].ingredients[k]?.name}</span>
                          : <input value={ing.name} onChange={e => setIng(i, k, { name: e.target.value })} placeholder="bijv. Roggemeel" style={{ ...input, width: "100%" }} />}
                      </td>
                      <td style={{ padding: "4px 0", width: 110, textAlign: "right" }}>
                        {ing.carryOver
                          ? <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtGrams(resolved[i].ingredients[k]?.grams ?? 0)}</span>
                          : <NumInput max={100000} step="any" value={ing.grams} onChange={n => setIng(i, k, { grams: n })} style={{ ...input, width: 90, textAlign: "right" }} />}
                      </td>
                      <td style={{ padding: "4px 0 4px 4px", width: 28, textAlign: "right" }}>
                        <button onClick={() => set(i, { ingredients: p.ingredients.filter((_, j) => j !== k) })}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: 16, padding: "0 4px" }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                <button onClick={() => set(i, { ingredients: [...p.ingredients, { name: "", grams: 0 }] })} style={dashed}>+ Ingrediënt</button>
                {hasPrevMix(i) && !p.ingredients.some(x => x.carryOver) && (
                  <button onClick={() => set(i, { ingredients: [{ name: "", grams: 0, carryOver: true }, ...p.ingredients] })} style={dashed}>+ Volledige vorige stap</button>
                )}
                <span style={{ fontSize: 11, color: "var(--text-subtle)", marginLeft: "auto" }}>Totaal fase: {fmtGrams(resolved[i].totalGrams)}</span>
              </div>
            </div>
          )}

          <label style={label}>Instructies (één stap per regel)</label>
          <textarea value={p.instructions} onChange={e => set(i, { instructions: e.target.value })} rows={p.kind === "bake" ? 4 : 3}
            placeholder={p.kind === "bake" ? "Oven voorwarmen 270\n2-3x stomen\n30 min klep dicht" : "Mengen en overnacht laten fermenteren"}
            style={{ ...input, width: "100%", resize: "vertical", fontFamily: "inherit" }} />
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => onChange([...phases, { name: `Stap ${mixCount + 1}`, kind: "mix", daysBefore: 0, timing: "", instructions: "", ingredients: [] }])} style={dashed}>+ Fase toevoegen</button>
        {!phases.some(p => p.kind === "bake") && (
          <button onClick={() => onChange([...phases, { name: "Bakken", kind: "bake", daysBefore: 0, timing: "", instructions: "", ingredients: [] }])} style={dashed}>+ Bakinstructies</button>
        )}
      </div>
    </div>
  );
}
