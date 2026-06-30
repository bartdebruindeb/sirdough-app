"use client";
import { useRole } from "@/lib/role-context";
import React, { useEffect, useState, useCallback } from "react";

const WEEKDAYS = ["","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];

// ─── Types ────────────────────────────────────────────────────────────────────
type Topping   = { name: string; gramsPerLoaf: number; waterRatio?: number | null };
type FlourLine = { name: string; percentage: number };
type RecipeInfo = { waterPct: number; desemPct: number; zoutPct: number; inwasPct: number; flourLines: FlourLine[] };
type BreadLine = {
  breadTypeId: string; slug: string; name: string; category: string;
  mixerGroup?: string | null; basketType?: string | null; basketStyle?: string | null;
  winkelQty: number; winkelDelftQty?: number; winkelDHQty?: number;
  horecaQty: number; totalQty: number;
  doughWeightTotal: number; flourWeightTotal: number;
  toppingWeightPerLoaf: number; toppings: Topping[];
  isBoerenMixPart?: boolean;
};
type MixerGroup = {
  group: string; label: string; totalLoaves: number;
  totalDoughKg: number; totalDoughNoFillingsKg: number; flourWeightKg: number;
  recipe: RecipeInfo | null; lines: BreadLine[];
};
type Plan = {
  productionDate: string; deliveryDate: string; weekday: number;
  breadLines: BreadLine[]; mixerGroups: MixerGroup[];
};
type Batch = {
  id: string;
  mixerGroup: string; groupLabel: string; batchNumber: number; totalLoaves: number;
  status: "todo" | "in_mixer" | "rijzen" | "voorvormen" | "eindvormen" | "klaar";
  notes: string | null;
  startedAt: string | null; rijzenAt: string | null; voorvormAt: string | null; eindvormAt: string | null; klaarAt: string | null;
};

const ADDITIVE_SLUGS = new Set(["sesam","sesam-15kg","zaden","zaden-15kg","olijf","rozijn","morning-buns","kaneel-buns","kardemom-buns","baguette-kaas"]);
// Only these get distributed across mixers; morning/kaneel/kardemom buns go in bulk
const DISTRIBUTE_SLUGS = new Set(["sesam","sesam-15kg","zaden","zaden-15kg","olijf","rozijn"]);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function g(v: number) { return `${Math.round(v)} g`; }
function fmt(n: number) { return n === 0 ? "—" : String(n); }
function getWeekday(date: string) {
  const d = new Date(date + "T12:00:00Z");
  return d.getUTCDay() === 0 ? 7 : d.getUTCDay();
}
function fmtTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

// --- CategoryPlanCard (mixer plan per category group) ---
function CategoryPlanCard({ cat, catLines, mixerCount, onMixerCountChange, assign, onAssign }: {
  cat: string; catLines: BreadLine[]; mixerCount: number;
  onMixerCountChange: (n: number) => void;
  assign: Record<string, number>; onAssign: (breadTypeId: string, m: number) => void;
}) {
  const totalQty = catLines.reduce((s, l) => s + l.totalQty, 0);
  const totalDough = catLines.reduce((s, l) => s + l.doughWeightTotal, 0);
  return (
    <div className="card" style={{ padding: "1rem 1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 15, margin: 0, textTransform: "capitalize" }}>{cat}</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>{totalQty} st. · {(totalDough / 1000).toFixed(1)} kg deeg</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Mixers:</span>
          <button onClick={() => onMixerCountChange(Math.max(1, mixerCount - 1))}
            style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 16 }}>-</button>
          <span style={{ fontWeight: 700, fontSize: 16, minWidth: 20, textAlign: "center" }}>{mixerCount}</span>
          <button onClick={() => onMixerCountChange(Math.min(10, mixerCount + 1))}
            style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 16 }}>+</button>
        </div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <th style={{ textAlign: "left", padding: "4px 0", fontWeight: 500, color: "var(--text-subtle)", fontSize: 11 }}>Broodsoort</th>
            <th style={{ textAlign: "right", padding: "4px 6px", fontWeight: 500, color: "var(--text-subtle)", fontSize: 11 }}>St.</th>
            <th style={{ textAlign: "right", padding: "4px 6px", fontWeight: 500, color: "var(--text-subtle)", fontSize: 11 }}>Deeg</th>
            <th style={{ textAlign: "right", padding: "4px 0", fontWeight: 500, color: "var(--text-subtle)", fontSize: 11 }}>Mixer</th>
          </tr>
        </thead>
        <tbody>
          {catLines.map(line => {
            const pureDough = Math.max(0, line.doughWeightTotal - line.toppingWeightPerLoaf * line.totalQty);
            return (
              <tr key={line.breadTypeId} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "6px 0", fontWeight: 500 }}>{line.name}</td>
                <td style={{ padding: "6px 6px", textAlign: "right", color: "var(--text-muted)" }}>{line.totalQty}</td>
                <td style={{ padding: "6px 6px", textAlign: "right", color: "var(--text-muted)", fontSize: 12 }}>{(pureDough / 1000).toFixed(2)} kg</td>
                <td style={{ padding: "6px 0", textAlign: "right" }}>
                  <select value={assign[line.breadTypeId] ?? 1}
                    onChange={e => onAssign(line.breadTypeId, parseInt(e.target.value))}
                    style={{ fontSize: 12, padding: "2px 4px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface)" }}>
                    {Array.from({ length: mixerCount }, (_, i) => (
                      <option key={i + 1} value={i + 1}>#{i + 1}</option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {mixerCount > 1 && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Array.from({ length: mixerCount }, (_, i) => {
            const m = i + 1;
            const mLines = catLines.filter(l => (assign[l.breadTypeId] ?? 1) === m);
            const mDough = mLines.reduce((s, l) => s + Math.max(0, l.doughWeightTotal - l.toppingWeightPerLoaf * l.totalQty), 0);
            return (
              <div key={m} style={{ fontSize: 12, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 10px" }}>
                <span style={{ fontWeight: 600 }}>#{m}</span>
                <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>{(mDough / 1000).toFixed(2)} kg</span>
                {mLines.length > 0 && <span style={{ color: "var(--text-subtle)", marginLeft: 4, fontSize: 11 }}>({mLines.map(l => l.name.split(" ")[0]).join(", ")})</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- MixerDeegCard (deeg calculator per mixer) ---
function MixerDeegCard({ cat, mixerNum, catLines, assign, recipe }: {
  cat: string; mixerNum: number; catLines: BreadLine[];
  assign: Record<string, number>; recipe: RecipeInfo | null;
}) {
  const [weight, setWeight] = useState(0);
  const assignedLines = catLines.filter(l => (assign[l.breadTypeId] ?? 1) === mixerNum && l.totalQty > 0);
  if (assignedLines.length === 0) return null;

  const pureDoughTotal = assignedLines.reduce((s, l) => s + Math.max(0, l.doughWeightTotal - l.toppingWeightPerLoaf * l.totalQty), 0);
  const doughForCalc = weight > 0 ? weight : pureDoughTotal;
  const toppingLines = assignedLines.filter(l => l.toppings.length > 0 && l.toppingWeightPerLoaf > 0);

  return (
    <div className="card" style={{ padding: "1.25rem 1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <h3 style={{ fontSize: 15, margin: 0, textTransform: "capitalize" }}>{cat} — Mixer {mixerNum}</h3>
        <span className="badge badge-amber">{assignedLines.reduce((s, l) => s + l.totalQty, 0)} st.</span>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px" }}>{assignedLines.map(l => l.name).join(" · ")}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, fontSize: 13, marginBottom: 12 }}>
        <span style={{ color: "var(--text-muted)" }}>Deeg totaal:</span>
        <span style={{ fontWeight: 500, textAlign: "right" }}>{(pureDoughTotal / 1000).toFixed(2)} kg</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Ingewogen:</span>
        <input type="number" value={weight || ""} placeholder={String(Math.round(pureDoughTotal))}
          min={0} max={400000}
          onKeyDown={e => { if (["e","E","-","+"].includes(e.key)) e.preventDefault(); }}
          onChange={e => setWeight(Math.min(400000, parseInt(e.target.value) || 0))}
          style={{ width: 100, border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 13 }} />
        <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>g</span>
        {weight > 0 && Math.abs(weight - pureDoughTotal) > 10 && (
          <span style={{ fontSize: 11, color: weight > pureDoughTotal ? "var(--danger)" : "#92400e" }}>
            {weight > pureDoughTotal ? `${Math.round(weight - pureDoughTotal)} g te veel` : `${Math.round(pureDoughTotal - weight)} g te weinig`}
          </span>
        )}
      </div>
      {recipe && (() => {
        const totalPct = 100 + recipe.waterPct + recipe.desemPct + recipe.zoutPct + recipe.inwasPct;
        const flour = doughForCalc / totalPct * 100;
        return (
          <>
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-subtle)", margin: "0 0 6px", letterSpacing: "0.06em" }}>In mixer</p>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <tbody>
                  {recipe.flourLines.map(f => (
                    <tr key={f.name}><td style={{ padding: "2px 0", color: "var(--text-muted)" }}>{f.name}</td><td style={{ padding: "2px 0", textAlign: "right", fontWeight: 600 }}>{g(flour * f.percentage / 100)}</td></tr>
                  ))}
                  <tr style={{ borderTop: "1px solid var(--border)" }}><td style={{ padding: "3px 0", color: "var(--text-muted)" }}>Water</td><td style={{ padding: "3px 0", textAlign: "right", fontWeight: 600 }}>{g(flour * recipe.waterPct / 100)}</td></tr>
                  <tr><td style={{ padding: "2px 0", color: "var(--text-muted)" }}>Desem</td><td style={{ padding: "2px 0", textAlign: "right", fontWeight: 600 }}>{g(flour * recipe.desemPct / 100)}</td></tr>
                  <tr><td style={{ padding: "2px 0", color: "var(--text-muted)" }}>Zout</td><td style={{ padding: "2px 0", textAlign: "right", fontWeight: 600 }}>{g(flour * recipe.zoutPct / 100)}</td></tr>
                  {recipe.inwasPct > 0 && <tr><td style={{ padding: "2px 0", color: "var(--text-muted)" }}>Inwas</td><td style={{ padding: "2px 0", textAlign: "right", fontWeight: 600 }}>{g(flour * recipe.inwasPct / 100)}</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        );
      })()}
      {toppingLines.length > 0 && (
        <>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-subtle)", margin: "0 0 6px", letterSpacing: "0.06em" }}>Met de hand</p>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <tbody>
                {toppingLines.flatMap(line => line.toppings.map(t => (
                  <tr key={`${line.breadTypeId}-${t.name}`}><td style={{ padding: "2px 0", color: "var(--text-muted)" }}>{line.name} – {t.name}</td><td style={{ padding: "2px 0", textAlign: "right", fontWeight: 600 }}>{g(t.gramsPerLoaf * line.totalQty)}</td></tr>
                )))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// STUB — keeping shape so DesemTotaal below still compiles
function BreadLineCard({ line, recipe, mixerCount, onMixerCountChange }: {
  line: BreadLine; recipe: RecipeInfo | null;
  mixerCount: number; onMixerCountChange: (n: number) => void;
}) {
  const [weights, setWeights] = useState<number[]>([]);
  const [showRecipe, setShowRecipe] = useState(false);

  const pureDoughGrams = Math.max(0, line.doughWeightTotal - line.toppingWeightPerLoaf * line.totalQty);
  const paddedWeights  = Array.from({ length: mixerCount }, (_, i) => weights[i] ?? 0);
  const filledTotal    = paddedWeights.reduce((s, w) => s + w, 0);
  const remaining      = pureDoughGrams - filledTotal;
  const anyFilled      = filledTotal > 0;
  const isExact        = anyFilled && Math.abs(remaining) < 10;
  const isOver         = anyFilled && remaining < -10;

  function setWeight(i: number, v: number) {
    setWeights(w => { const n = [...w]; n[i] = v; return n; });
  }

  return (
    <div className="card" style={{ padding: "1.25rem 1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <h3 style={{ fontSize: 15 }}>{line.name}</h3>
        <span className="badge badge-amber">{line.totalQty} st.</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, fontSize: 13, marginBottom: 12 }}>
        <span style={{ color: "var(--text-muted)" }}>Totaal deeg:</span>
        <span style={{ fontWeight: 500, textAlign: "right" }}>{(line.doughWeightTotal / 1000).toFixed(2)} kg</span>
        {pureDoughGrams < line.doughWeightTotal && (<>
          <span style={{ color: "var(--text-muted)" }}>Excl. vulling:</span>
          <span style={{ fontWeight: 500, textAlign: "right" }}>{(pureDoughGrams / 1000).toFixed(2)} kg</span>
        </>)}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Mixers:</span>
        <button onClick={() => onMixerCountChange(Math.max(1, mixerCount - 1))}
          style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 16 }}>-</button>
        <span style={{ fontWeight: 700, fontSize: 16, minWidth: 20, textAlign: "center" }}>{mixerCount}</span>
        <button onClick={() => onMixerCountChange(Math.min(10, mixerCount + 1))}
          style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 16 }}>+</button>
        <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>{g(pureDoughGrams / mixerCount)} / mixer</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
        {paddedWeights.map((w, i) => {
          const runningFilled = paddedWeights.slice(0, i).reduce((s, v) => s + v, 0);
          const leftHint = Math.max(0, pureDoughGrams - runningFilled);
          const isLast = i === mixerCount - 1;
          const remainingForThis = Math.max(0, Math.round(pureDoughGrams - paddedWeights.slice(0, i).reduce((s, v) => s + v, 0)));
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)", minWidth: 62 }}>Mixer {i + 1}:</span>
              <input type="number" value={w || ""} placeholder={String(Math.round(leftHint))}
                min={0} max={400000}
                onKeyDown={e => { if (["e","E","-","+"].includes(e.key)) e.preventDefault(); }}
                onChange={e => setWeight(i, Math.min(400000, parseInt(e.target.value) || 0))}
                style={{ width: 85, border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 13 }} />
              <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>g</span>
              {w > 0 && <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>(nog {Math.round(Math.max(0, pureDoughGrams - runningFilled - w))} g over)</span>}
              {isLast && (
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-subtle)", cursor: "pointer", marginLeft: 4 }}>
                  <input type="checkbox" checked={w === remainingForThis && remainingForThis > 0}
                    onChange={e => { if (e.target.checked) setWeight(i, remainingForThis); }}
                    style={{ width: 13, height: 13 }} />
                  restant
                </label>
              )}
            </div>
          );
        })}
      </div>
      {anyFilled && (
        <div style={{ padding: "7px 12px", borderRadius: 7, fontSize: 13, marginBottom: 10,
          background: isExact ? "#f0fdf4" : isOver ? "#fef2f2" : "#fef3c7",
          border: `1px solid ${isExact ? "#4ade80" : isOver ? "#fca5a5" : "#fde68a"}`,
          color: isExact ? "#16a34a" : isOver ? "var(--danger)" : "#92400e",
        }}>
          {isExact ? "Exact goed" : isOver ? `${Math.round(-remaining)} g te veel ingewogen` : `${Math.round(remaining)} g nog te verdelen`}
        </div>
      )}
      {recipe && (
        <>
          <button onClick={() => setShowRecipe(!showRecipe)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text-subtle)", padding: 0, display: "flex", alignItems: "center", gap: 4, marginBottom: showRecipe ? 8 : 0 }}>
            <span style={{ display: "inline-block", marginRight: 3 }}>{showRecipe ? "v" : ">"}</span>
            {showRecipe ? "Verberg" : "Toon"} recept
          </button>
          {showRecipe && (
            <div>
              {paddedWeights.map((w, i) => {
                const dough = w > 0 ? w : pureDoughGrams / mixerCount;
                const totalPct = 100 + recipe.waterPct + recipe.desemPct + recipe.zoutPct + recipe.inwasPct;
                const flour = dough / totalPct * 100;
                return (
                  <div key={i} style={{ marginBottom: i < mixerCount - 1 ? 12 : 0 }}>
                    {mixerCount > 1 && <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-subtle)", margin: "0 0 4px", textTransform: "uppercase" }}>Mixer {i + 1} -- {Math.round(dough)} g deeg</p>}
                    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <tbody>
                          {recipe.flourLines.map(f => (
                            <tr key={f.name}>
                              <td style={{ padding: "2px 0", color: "var(--text-muted)" }}>{f.name}</td>
                              <td style={{ padding: "2px 0", textAlign: "right", fontWeight: 600 }}>{g(flour * f.percentage / 100)}</td>
                            </tr>
                          ))}
                          <tr style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ padding: "3px 0", color: "var(--text-muted)" }}>Water</td>
                            <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 600 }}>{g(flour * recipe.waterPct / 100)}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: "2px 0", color: "var(--text-muted)" }}>Desem</td>
                            <td style={{ padding: "2px 0", textAlign: "right", fontWeight: 600 }}>{g(flour * recipe.desemPct / 100)}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: "2px 0", color: "var(--text-muted)" }}>Zout</td>
                            <td style={{ padding: "2px 0", textAlign: "right", fontWeight: 600 }}>{g(flour * recipe.zoutPct / 100)}</td>
                          </tr>
                          {recipe.inwasPct > 0 && <tr>
                            <td style={{ padding: "2px 0", color: "var(--text-muted)" }}>Inwas</td>
                            <td style={{ padding: "2px 0", textAlign: "right", fontWeight: 600 }}>{g(flour * recipe.inwasPct / 100)}</td>
                          </tr>}
                          <tr style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ padding: "3px 0", fontSize: 11, color: "var(--text-subtle)" }}>Totaal deeg</td>
                            <td style={{ padding: "3px 0", textAlign: "right", fontSize: 11, color: "var(--text-subtle)" }}>{g(dough)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
// ─── DesemTotaal ──────────────────────────────────────────────────────────────
function DesemTotaal({ groups, deliveryDate }: { groups: MixerGroup[]; deliveryDate?: string }) {
  const [doorstarten, setDoorstarten] = useState(1000);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const isActive = (label: string) => active[label] ?? true;

  const rows = groups.filter(mg => mg.totalLoaves > 0).map(mg => {
    const desemGrams = mg.recipe ? mg.flourWeightKg * 1000 * mg.recipe.desemPct / 100 : 0;
    return { label: mg.label, loaves: mg.totalLoaves, desemGrams };
  });
  const total = rows.filter(r => isActive(r.label)).reduce((s, r) => s + r.desemGrams, 0) + doorstarten;
  const delivLabel = deliveryDate ? new Date(deliveryDate + "T12:00:00Z").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" }) : null;

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid var(--border)", background: "#fef3c7" }}>
        <h2 style={{ fontSize: 16, margin: 0, color: "var(--accent)" }}>Desem totaal</h2>
        {delivLabel && <p style={{ fontSize: 12, color: "var(--accent)", margin: "3px 0 0", fontWeight: 500 }}>Voor bakdag: {delivLabel}</p>}
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "2px 0 0" }}>Vandaag klaarmaken</p>
      </div>
      <div style={{ padding: "1rem 1.5rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ textAlign: "left", padding: "6px 0", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11, textTransform: "uppercase" }}>Deegsoort</th>
              <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11, textTransform: "uppercase" }}>Aantal</th>
              <th style={{ textAlign: "right", padding: "6px 0", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11, textTransform: "uppercase" }}>Desem</th>
              <th style={{ width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} style={{ borderBottom: "1px solid var(--border)", opacity: isActive(r.label) ? 1 : 0.4 }}>
                <td style={{ padding: "8px 0" }}>{r.label}</td>
                <td style={{ padding: "8px", textAlign: "right", color: "var(--text-muted)" }}>{r.loaves}</td>
                <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 500 }}>{g(r.desemGrams)}</td>
                <td style={{ padding: "8px 0", textAlign: "center" }}>
                  <input type="checkbox" checked={isActive(r.label)} onChange={e => setActive(a => ({ ...a, [r.label]: e.target.checked }))} />
                </td>
              </tr>
            ))}
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "8px 0", color: "var(--text-muted)" }}>Doorstarten</td>
              <td style={{ padding: "8px", textAlign: "right" }}>1</td>
              <td style={{ padding: "8px 0", textAlign: "right" }}>
                <input type="number" onKeyDown={e => { if (["e","E","+"].includes(e.key)) e.preventDefault(); }} value={doorstarten} onChange={e => setDoorstarten(parseInt(e.target.value) || 0)}
                  style={{ width: 70, border: "1px solid var(--border)", borderRadius: 6, padding: "3px 6px", fontSize: 13, textAlign: "right" }} />
              </td>
              <td></td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} style={{ padding: "10px 0", fontWeight: 600 }}>TOTAAL</td>
              <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700, color: "var(--accent)", fontSize: 15 }}>{g(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── MandenTotaal ─────────────────────────────────────────────────────────────
function MandenTotaal({ lines }: { lines: BreadLine[] }) {
  const get = (slug: string) => lines.find(l => l.slug === slug)?.totalQty ?? 0;

  // Lines that have basketType set — dynamic (future)
  // Lines without basketType — fall back to hardcoded slug grouping
  const hasBasketType = (slug: string) => !!(lines.find(l => l.slug === slug)?.basketType);

  // Collect slugs already covered by basketType so we don't double-count
  const coveredByDynamic = new Set(lines.filter(l => l.basketType && l.totalQty > 0).map(l => l.slug));

  // Dynamic rows from basketType field
  const byType = new Map<string, { gebloemd: number; ongebloemd: number; other: number; names: string[] }>();
  for (const l of lines.filter(l => l.basketType && l.totalQty > 0)) {
    const type = l.basketType!;
    const basketQty = l.slug === "morning-buns" ? Math.ceil(l.totalQty / 4) : l.totalQty;
    if (!byType.has(type)) byType.set(type, { gebloemd: 0, ongebloemd: 0, other: 0, names: [] });
    const entry = byType.get(type)!;
    const style = l.basketStyle?.toLowerCase() ?? "";
    if (style === "gebloemd") entry.gebloemd += basketQty;
    else if (style === "ongebloemd") entry.ongebloemd += basketQty;
    else entry.other += basketQty;
    if (!entry.names.includes(l.name)) entry.names.push(l.name);
  }

  // Hardcoded fallback rows for slugs without basketType assigned yet
  const slugGet = (slug: string) => coveredByDynamic.has(slug) ? 0 : get(slug);
  const kleineMand    = slugGet("boeren-kl");
  const ruitjesOngebl = ["sesam","sesam-15kg","zaden","zaden-15kg","olijf","rozijn"].reduce((s, sl) => s + slugGet(sl), 0);
  const ruitjesBloemd = ["boeren-gr","boeren-15kg","volkoren","volkoren-15kg"].reduce((s, sl) => s + slugGet(sl), 0);
  const mand15kg      = ["boeren-15kg","sesam-15kg","zaden-15kg"].reduce((s, sl) => s + slugGet(sl), 0);
  const morningBuns   = coveredByDynamic.has("morning-buns") ? 0 : Math.ceil(get("morning-buns") / 4);
  const rondeMand     = ["olijf","rozijn"].reduce((s, sl) => s + slugGet(sl), 0) + morningBuns;

  const hardcodedRows: { label: string; count: number; note: string }[] = [
    kleineMand    > 0 ? { label: "Kleine mand",  count: kleineMand,                    note: "Boeren KL" } : null,
    (ruitjesOngebl + ruitjesBloemd) > 0 ? { label: "Ruitjes mand", count: ruitjesOngebl + ruitjesBloemd, note: `waarvan ${ruitjesOngebl} ongebloemd` } : null,
    mand15kg      > 0 ? { label: "1,5 kg mand",  count: mand15kg,                      note: "Boeren, Sesam, Zaden 1,5 kg" } : null,
    rondeMand     > 0 ? { label: "Ronde mand",   count: rondeMand,                     note: "Olijf, Rozijn, Morning buns (÷4)" } : null,
  ].filter(Boolean) as { label: string; count: number; note: string }[];

  const ORDER = ["750 gram", "rond", "1 kg", "1,5 kg"];
  const dynamicRows = [...byType.entries()]
    .sort((a, b) => (ORDER.indexOf(a[0]) + 1 || 99) - (ORDER.indexOf(b[0]) + 1 || 99))
    .map(([type, entry]) => {
      const total = entry.gebloemd + entry.ongebloemd + entry.other;
      const note = [entry.gebloemd > 0 && `${entry.gebloemd} gebloemd`, entry.ongebloemd > 0 && `${entry.ongebloemd} ongebloemd`].filter(Boolean).join(" · ") || entry.names.join(", ");
      return { label: type, count: total, note };
    });

  const allRows = [...dynamicRows, ...hardcodedRows];
  if (allRows.every(r => r.count === 0)) return null;

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
        <h2 style={{ fontSize: 16 }}>Manden totaal</h2>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <tbody>
          {allRows.map((r, i) => (
            <tr key={r.label} style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
              <td style={{ padding: "10px 20px" }}>{r.label}</td>
              <td style={{ padding: "10px 16px", textAlign: "right" }}><span className="badge badge-amber">{r.count}</span></td>
              <td style={{ padding: "10px 20px", color: "var(--text-subtle)", fontSize: 12 }}>{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── BatchCard ────────────────────────────────────────────────────────────────
const BATCH_BG: Record<string, string>     = { todo: "var(--surface-2)", in_mixer: "#fefce8", rijzen: "#eff6ff", voorvormen: "#fff7ed", eindvormen: "#f5f3ff", klaar: "#f0fdf4" };
const BATCH_BORDER: Record<string, string> = { todo: "var(--border)",    in_mixer: "#fbbf24", rijzen: "#93c5fd", voorvormen: "#fdba74", eindvormen: "#c4b5fd", klaar: "#4ade80" };
const BATCH_NEXT: Record<string, Batch["status"]>  = { todo: "in_mixer", in_mixer: "rijzen", rijzen: "voorvormen", voorvormen: "eindvormen", eindvormen: "klaar" } as const;
const BATCH_BTN: Record<string, string>    = { todo: "▶ In mixer",       in_mixer: "↑ Rijzen", rijzen: "◇ Voorvormen", voorvormen: "◈ Eindvormen", eindvormen: "✓ Klaar" };

function lastUpdateTime(batch: Batch): string | null {
  if (batch.klaarAt)    return `✓ Klaar ${fmtTime(batch.klaarAt)}`;
  if (batch.eindvormAt) return `◈ Eindvormen ${fmtTime(batch.eindvormAt)}`;
  if (batch.voorvormAt) return `◇ Voorvormen ${fmtTime(batch.voorvormAt)}`;
  if (batch.rijzenAt)   return `↑ Rijzen ${fmtTime(batch.rijzenAt)}`;
  if (batch.startedAt)  return `🕐 In mixer ${fmtTime(batch.startedAt)}`;
  return null;
}

function parseBatchAdditives(notes: string | null): string[] {
  if (!notes) return [];
  try { const p = JSON.parse(notes); return Array.isArray(p.additives) ? p.additives : []; } catch { return []; }
}

function BatchCard({ batch, lines, compact, onUpdated }: { batch: Batch; lines?: BreadLine[]; compact?: boolean; onUpdated: () => void }) {
  const { role } = useRole();
  const [updating, setUpdating] = useState(false);

  async function advance() {
    const next = BATCH_NEXT[batch.status];
    if (!next || updating) return;
    setUpdating(true);
    await fetch("/api/production/batches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify({ id: batch.id, status: next }),
    });
    setUpdating(false);
    onUpdated();
  }

  const doughKgApprox = lines
    ? lines.reduce((s, l) => s + l.doughWeightTotal, 0) / 1000 * (batch.totalLoaves / Math.max(1, lines.reduce((s, l) => s + l.totalQty, 0)))
    : null;
  const lastUpdate = lastUpdateTime(batch);

  if (compact) {
    return (
      <div style={{ background: BATCH_BG[batch.status], border: `2px solid ${BATCH_BORDER[batch.status]}`, borderRadius: 10, padding: "10px 14px", minWidth: 200, flex: "0 0 auto", transition: "background 0.3s, border-color 0.3s" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{batch.groupLabel}</span>
          <span style={{ fontSize: 11, color: "var(--text-subtle)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 5, padding: "1px 6px" }}>mixer {batch.batchNumber}</span>
        </div>
        {lines && lines.length > 0 && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
            {lines.filter(l => l.totalQty > 0).map(l => `${l.name} ×${l.totalQty}`).join(", ")}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
            {batch.totalLoaves} stuks{doughKgApprox != null ? ` · ${doughKgApprox.toFixed(2)} kg` : ""}
            {lastUpdate && <><br /><span style={{ fontSize: 11 }}>{lastUpdate}</span></>}
          </div>
          {batch.status !== "klaar" ? (
            <button onClick={advance} disabled={updating} className="btn-primary" style={{ fontSize: 12, padding: "5px 12px", whiteSpace: "nowrap" }}>
              {updating ? "…" : BATCH_BTN[batch.status]}
            </button>
          ) : (
            <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 700 }}>✓ Klaar</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: BATCH_BG[batch.status], border: `2px solid ${BATCH_BORDER[batch.status]}`, borderRadius: 10, padding: "12px 16px", transition: "background 0.3s, border-color 0.3s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{batch.groupLabel}</span>
            <span style={{ fontSize: 11, color: "var(--text-subtle)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 5, padding: "1px 6px" }}>
              mixer {batch.batchNumber}
            </span>
          </div>
          {lines && lines.length > 0 && (
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>
              {lines.filter(l => l.totalQty > 0).map(l => (
                <span key={l.breadTypeId} style={{ marginRight: 10 }}>{l.name} <strong>×{l.totalQty}</strong></span>
              ))}
            </div>
          )}
          <div style={{ fontSize: 13, color: "var(--text-subtle)" }}>
            {batch.totalLoaves} stuks{doughKgApprox != null ? ` · ${doughKgApprox.toFixed(2)} kg deeg` : ""}
          </div>
          {lastUpdate && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{lastUpdate}</div>
          )}
        </div>
        {batch.status !== "klaar" ? (
          <button onClick={advance} disabled={updating} className="btn-primary" style={{ fontSize: 13, padding: "7px 16px", whiteSpace: "nowrap" }}>
            {updating ? "…" : BATCH_BTN[batch.status]}
          </button>
        ) : (
          <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 700 }}>✓ Klaar</span>
        )}
      </div>
    </div>
  );
}

function BatchAdvanceButton({ batch, onUpdated }: { batch: Batch; onUpdated: () => void }) {
  const { role } = useRole();
  const [updating, setUpdating] = useState(false);
  const NEXT: Record<string, Batch["status"]> = { todo: "in_mixer", in_mixer: "rijzen", rijzen: "voorvormen", voorvormen: "eindvormen", eindvormen: "klaar" };
  const BTN: Record<string, string> = { todo: "▶ In mixer", in_mixer: "↑ Rijzen", rijzen: "◇ Voorvormen", voorvormen: "◈ Eindvormen", eindvormen: "✓ Klaar" };
  const next = NEXT[batch.status];
  if (!next) return null;
  async function advance() {
    if (updating) return;
    setUpdating(true);
    await fetch("/api/production/batches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify({ id: batch.id, status: next }),
    });
    setUpdating(false);
    onUpdated();
  }
  return (
    <button onClick={advance} disabled={updating} className="btn-primary" style={{ fontSize: 12, padding: "5px 14px", whiteSpace: "nowrap" }}>
      {updating ? "…" : BTN[batch.status]}
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ProductiePage() {
  const { role } = useRole();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate]       = useState(today);
  const [plan, setPlan]       = useState<Plan | null>(null);
  const [nextPlan, setNextPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  // Per-category mixer count and subtype→mixer assignment
  const [catMixerCounts, setCatMixerCounts] = useState<Record<string, number>>({});
  const [catMixerAssign, setCatMixerAssign] = useState<Record<string, Record<string, number>>>({});

  function setCatCount(cat: string, n: number) {
    const newN = Math.max(1, Math.min(10, n));
    setCatMixerCounts(prev => ({ ...prev, [cat]: newN }));
    // Clamp any over-assigned subtypes to the new max mixer
    setCatMixerAssign(prev => {
      const a = { ...(prev[cat] ?? {}) };
      for (const id of Object.keys(a)) if (a[id] > newN) a[id] = newN;
      return { ...prev, [cat]: a };
    });
  }

  function setCatSubAssign(cat: string, breadTypeId: string, m: number) {
    setCatMixerAssign(prev => ({ ...prev, [cat]: { ...(prev[cat] ?? {}), [breadTypeId]: m } }));
  }
  // Production batches from DB
  const [batches, setBatches]         = useState<Batch[]>([]);
  const [savingPlan, setSavingPlan]   = useState(false);
  const [saveError, setSaveError]     = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [showPlanEdit, setShowPlanEdit] = useState(false);

  // ── Load plan ──
  function loadPlan(d: string) {
    setLoading(true); setError("");
    const next = (() => { const nd = new Date(d + "T12:00:00Z"); nd.setUTCDate(nd.getUTCDate() + 1); return nd.toISOString().slice(0, 10); })();
    Promise.all([
      fetch(`/api/production?date=${d}`,    { headers: { "x-role": role ?? "" } }).then(r => r.json()),
      fetch(`/api/production?date=${next}`, { headers: { "x-role": role ?? "" } }).then(r => r.json()),
    ]).then(([data, nextData]) => {
      if (data.error) { setError(data.message ?? data.error); setLoading(false); return; }
      setPlan({ ...data, breadLines: data.breadLines ?? [], mixerGroups: data.mixerGroups ?? [] });
      if (!nextData.error) setNextPlan({ ...nextData, breadLines: nextData.breadLines ?? [], mixerGroups: nextData.mixerGroups ?? [] });
      setLoading(false);
    }).catch(e => { setError(String(e)); setLoading(false); });
  }

  // ── Load batches ──
  const loadBatches = useCallback(() => {
    fetch(`/api/production/batches?date=${date}`, { headers: { "x-role": role ?? "" } })
      .then(r => r.json())
      .then(d => {
        const bs: Batch[] = d.batches ?? [];
        setBatches(bs);
        // Prefill mixer counts from existing batches (cat::m format)
        if (bs.length > 0) {
          const counts: Record<string, number> = {};
          for (const b of bs) {
            const cat = b.mixerGroup.includes("::") ? b.mixerGroup.split("::")[0] : b.mixerGroup;
            counts[cat] = Math.max(counts[cat] ?? 0, b.batchNumber);
          }
          setCatMixerCounts(counts);
        }
      })
      .catch(() => {});
  }, [date, role]);

  useEffect(() => { loadPlan(date); }, [date]);
  useEffect(() => { loadBatches(); }, [loadBatches]);
  // Auto-refresh batches every 30s (so multiple workers see each other's updates)
  useEffect(() => {
    const id = setInterval(loadBatches, 30000);
    return () => clearInterval(id);
  }, [loadBatches]);

  // Set default mixer counts once plan loads (only when no batches yet)
  useEffect(() => {
    if (!plan || batches.length > 0) return;
    const activeLines = plan.breadLines.filter(l => l.totalQty > 0);
    const cats = [...new Set(activeLines.map(l => l.category))];
    const counts: Record<string, number> = {};
    const assign: Record<string, Record<string, number>> = {};
    for (const cat of cats) {
      counts[cat] = 1;
      assign[cat] = {};
      for (const l of activeLines.filter(l => l.category === cat)) assign[cat][l.breadTypeId] = 1;
    }
    setCatMixerCounts(counts);
    setCatMixerAssign(assign);
  }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps

  function shift(days: number) {
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    setDate(d.toISOString().slice(0, 10));
  }

  const planGroups = plan?.mixerGroups ?? [];
  const planLines  = plan?.breadLines  ?? [];

  // Helper: get recipe for a BreadLine (from its mixer group)
  function getRecipeForLine(breadTypeId: string): RecipeInfo | null {
    return plan?.mixerGroups.find(mg => mg.lines.some(l => l.breadTypeId === breadTypeId))?.recipe ?? null;
  }

  // ── Save plan to DB ──
  async function savePlan() {
    if (!plan) return;
    setConfirmReset(false);
    setSavingPlan(true); setSaveError("");
    const activeLines = planLines.filter(l => l.totalQty > 0 && l.doughWeightTotal > 0);
    const cats = [...new Set(activeLines.map(l => l.category))];
    const toCreate: { mixerGroup: string; groupLabel: string; batchNumber: number; totalLoaves: number }[] = [];
    for (const cat of cats) {
      const catLines = activeLines.filter(l => l.category === cat);
      const mixerCount = catMixerCounts[cat] ?? 1;
      for (let m = 1; m <= mixerCount; m++) {
        const assigned = catLines.filter(l => (catMixerAssign[cat]?.[l.breadTypeId] ?? 1) === m);
        if (assigned.length === 0) continue;
        toCreate.push({
          mixerGroup: `${cat}::${m}`,
          groupLabel: mixerCount > 1 ? `${cat} – Mixer ${m}` : cat,
          batchNumber: m,
          totalLoaves: assigned.reduce((s, l) => s + l.totalQty, 0),
        });
      }
    }
    if (toCreate.length === 0) {
      setSaveError("Geen broodsoorten met aantallen gevonden. Controleer de bestellingen voor deze dag.");
      setSavingPlan(false); return;
    }
    const res = await fetch("/api/production/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify({ date, batches: toCreate }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setSaveError(d.message ?? d.error ?? `Opslaan mislukt (${res.status})`);
      setSavingPlan(false); return;
    }
    setSavingPlan(false);
    setShowPlanEdit(false);
    loadBatches();
  }

  const hasAny       = plan && plan.breadLines.some(l => l.totalQty > 0);
  const prodLabel    = plan ? `${WEEKDAYS[plan.weekday]} ${plan.productionDate}` : "";
  const delivWeekday = plan ? getWeekday(plan.deliveryDate) : 1;
  const delivLabel   = plan ? `${WEEKDAYS[delivWeekday]} ${plan.deliveryDate}` : "";
  const batchGroups  = batches.reduce<Record<string, Batch[]>>((acc, b) => { (acc[b.mixerGroup] ??= []).push(b); return acc; }, {});
  const totalDone    = batches.filter(b => b.status === "klaar").length;
  function getBatchLines(batch: Batch): BreadLine[] {
    // New format: "category::mixerNum"
    if (batch.mixerGroup.includes("::")) {
      const [cat, mStr] = batch.mixerGroup.split("::");
      const m = parseInt(mStr);
      const catLines = plan?.breadLines.filter(l => l.category === cat && l.totalQty > 0) ?? [];
      const assigned = catLines.filter(l => (catMixerAssign[cat]?.[l.breadTypeId] ?? 1) === m);
      return assigned.length > 0 ? assigned : catLines;
    }
    // Old breadTypeId format
    const line = plan?.breadLines.find(l => l.breadTypeId === batch.mixerGroup);
    if (line) return [{ ...line, totalQty: batch.totalLoaves }];
    // Fallback for legacy group-based batches
    const mg = plan?.mixerGroups.find(g => g.group === batch.mixerGroup);
    if (!mg) return [];
    const frac = mg.totalLoaves > 0 ? batch.totalLoaves / mg.totalLoaves : 0;
    return mg.lines.map(l => ({ ...l, totalQty: Math.round(l.totalQty * frac), doughWeightTotal: l.doughWeightTotal * frac, flourWeightTotal: l.flourWeightTotal * frac }));
  }

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 1100 }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 30, marginBottom: 8 }}>Productie</h1>
          {plan && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px" }}>
                <p style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 2px" }}>📋 Productiedag</p>
                <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{prodLabel}</p>
              </div>
              <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 14px" }}>
                <p style={{ fontSize: 11, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 2px" }}>🍞 Bakken & bezorgen</p>
                <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: "var(--accent)" }}>{delivLabel}</p>
              </div>
              {batches.length > 0 && (
                <div style={{ background: totalDone === batches.length ? "#f0fdf4" : "var(--surface-2)", border: `1px solid ${totalDone === batches.length ? "#4ade80" : "var(--border)"}`, borderRadius: 8, padding: "8px 14px" }}>
                  <p style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 2px" }}>⚙️ Voortgang</p>
                  <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: totalDone === batches.length ? "#16a34a" : "inherit" }}>
                    {totalDone}/{batches.length} klaar
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => shift(-1)} className="btn-secondary" style={{ padding: "8px 12px" }}>←</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input" style={{ width: 150 }} />
          <button onClick={() => shift(1)} className="btn-secondary" style={{ padding: "8px 12px" }}>→</button>
          <button onClick={() => setDate(today)} className="btn-secondary">Vandaag</button>
        </div>
      </div>

      {loading && <p style={{ color: "var(--text-subtle)", textAlign: "center", padding: "3rem 0" }}>Laden…</p>}
      {!loading && error && (
        <div style={{ background: "var(--warn-bg)", border: "1px solid #fca5a5", borderRadius: 10, padding: "1rem", color: "var(--warn)", fontSize: 14, marginBottom: 16 }}>
          <strong>Fout:</strong> {error}
        </div>
      )}

      {!loading && !error && plan && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* ── Mixer plan (when no batches exist, or when editing) ── */}
          {(batches.length === 0 || showPlanEdit) && planLines.filter(l => l.totalQty > 0 && l.doughWeightTotal > 0).length > 0 && (
            <section className="card" style={{ padding: "1.25rem 1.5rem" }}>
              <h2 style={{ fontSize: 16, marginBottom: 4 }}>Mixer plan</h2>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                {batches.length === 0
                  ? "Stel het aantal mixers per broodsoort in en sla het plan op om de baklijst te starten."
                  : "Pas het aantal mixers aan. Opslaan verwijdert de huidige voortgang."}
              </p>
              {(() => {
                const activeLines = planLines.filter(l => l.totalQty > 0 && l.doughWeightTotal > 0);
                const cats = [...new Set(activeLines.map(l => l.category))];
                return cats.map(cat => (
                  <div key={cat} style={{ marginBottom: 12 }}>
                    <CategoryPlanCard
                      cat={cat}
                      catLines={activeLines.filter(l => l.category === cat)}
                      mixerCount={catMixerCounts[cat] ?? 1}
                      onMixerCountChange={n => setCatCount(cat, n)}
                      assign={catMixerAssign[cat] ?? {}}
                      onAssign={(btId, m) => setCatSubAssign(cat, btId, m)}
                    />
                  </div>
                ));
              })()}
              {saveError && (
                <div style={{ background: "var(--warn-bg)", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", color: "var(--warn)", fontSize: 13, marginBottom: 12 }}>
                  {saveError}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button onClick={savePlan} disabled={savingPlan} className="btn-primary" style={{ fontSize: 14, padding: "10px 24px" }}>
                  {savingPlan ? "Opslaan…" : batches.length > 0 ? "✓ Opslaan & herstart" : "✓ Plan opslaan & starten"}
                </button>
                {batches.length > 0 && (
                  <button onClick={() => { setShowPlanEdit(false); setConfirmReset(false); }} className="btn-secondary" style={{ fontSize: 13, padding: "10px 16px" }}>
                    Annuleren
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Reset plan button (when batches exist and not already in edit mode) */}
          {batches.length > 0 && !showPlanEdit && planLines.filter(l => l.totalQty > 0).length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button onClick={() => setShowPlanEdit(true)} className="btn-secondary" style={{ fontSize: 13, padding: "7px 16px" }}>
                🔄 Planning aanpassen
              </button>
              <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>Pas het aantal mixers aan en herstart het plan.</span>
              {saveError && <span style={{ fontSize: 12, color: "var(--warn)" }}>{saveError}</span>}
            </div>
          )}

          {/* ── Bakken voortgang (table-based) ── */}
          {batches.length > 0 && (() => {
            const statusSections: { status: Batch["status"]; label: string; color: string; bg: string; border: string; nextLabel?: string }[] = [
              { status: "todo",       label: "Te doen",    color: "var(--text-subtle)", bg: "var(--surface-2)", border: "var(--border)",  nextLabel: "▶ In mixer"    },
              { status: "in_mixer",   label: "In mixer",   color: "#b45309",            bg: "#fefce8",          border: "#fbbf24",         nextLabel: "↑ Rijzen"      },
              { status: "rijzen",     label: "Rijzen",     color: "#1d4ed8",            bg: "#eff6ff",          border: "#93c5fd",         nextLabel: "◇ Voorvormen"  },
              { status: "voorvormen", label: "Voorvormen", color: "#c2410c",            bg: "#fff7ed",          border: "#fdba74",         nextLabel: "◈ Eindvormen"  },
              { status: "eindvormen", label: "Eindvormen", color: "#7c3aed",            bg: "#f5f3ff",          border: "#c4b5fd",         nextLabel: "✓ Klaar"       },
              { status: "klaar",      label: "Klaar",      color: "#16a34a",            bg: "#f0fdf4",          border: "#4ade80" },
            ];
            const thS: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-subtle)", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap" };
            return (
              <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <h2 style={{ fontSize: 16, margin: 0 }}>Bakken voortgang{totalDone === batches.length ? " 🎉" : ` (${totalDone}/${batches.length} klaar)`}</h2>
                {statusSections.map(({ status, label, color, bg, border, nextLabel }) => {
                  const bs = batches.filter(b => b.status === status);
                  if (bs.length === 0) return null;
                  return (
                    <div key={status} className="card" style={{ overflow: "hidden", borderColor: border }}>
                      <div style={{ padding: "8px 16px", background: bg, borderBottom: `1px solid ${border}` }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color }}>{label}</span>
                        <span style={{ fontSize: 12, color: "var(--text-subtle)", marginLeft: 8 }}>{bs.length} batch{bs.length !== 1 ? "es" : ""}</span>
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: "var(--surface-2)" }}>
                            <th style={thS}>Deegsoort</th>
                            <th style={{ ...thS, textAlign: "center" }}>Mixer</th>
                            <th style={{ ...thS, textAlign: "right" }}>Stuks</th>
                            <th style={thS}>Vullingen</th>
                            <th style={{ ...thS, textAlign: "right" }}>Tijdstip</th>
                            {nextLabel && <th style={{ ...thS, textAlign: "center" }}>Actie</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {bs.map((b, i) => {
                            const bLines = getBatchLines(b);
                            const additives = parseBatchAdditives(b.notes);
                            const lastUpdate = lastUpdateTime(b);
                            return (
                              <tr key={b.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none", background: i % 2 === 0 ? "transparent" : "var(--surface-2)" }}>
                                <td style={{ padding: "8px 12px", fontWeight: 600 }}>{b.groupLabel}</td>
                                <td style={{ padding: "8px 12px", textAlign: "center", color: "var(--text-subtle)" }}>#{b.batchNumber}</td>
                                <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600 }}>{b.totalLoaves}</td>
                                <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>
                                  {additives.length > 0
                                    ? additives.join(", ")
                                    : bLines.filter(l => !ADDITIVE_SLUGS.has(l.slug) && l.totalQty > 0).map(l => `${l.name} ×${l.totalQty}`).join(", ")}
                                </td>
                                <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 12, color: "var(--text-subtle)", whiteSpace: "nowrap" }}>{lastUpdate ?? "—"}</td>
                                {nextLabel && (
                                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                                    <BatchAdvanceButton batch={b} onUpdated={loadBatches} />
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </section>
            );
          })()}

          {!hasAny && (
            <div className="card" style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)" }}>
              <p style={{ fontSize: 15, margin: "0 0 4px" }}>Geen bestellingen voor {delivLabel}</p>
              <p style={{ fontSize: 13, margin: 0, color: "var(--text-subtle)" }}>Desem hieronder is voor de volgende bakdag.</p>
            </div>
          )}

          {/* ── Deeg calculator (per broodsoort) ── */}
          {planLines.filter(l => l.totalQty > 0 && l.doughWeightTotal > 0).length > 0 && (
            <section>
              <h2 style={{ fontSize: 15, fontWeight: 600, padding: "0 0 12px", color: "var(--text)", margin: 0 }}>Deeg calculator</h2>
              {(() => {
                const activeLines = planLines.filter(l => l.totalQty > 0 && l.doughWeightTotal > 0);
                const cats = [...new Set(activeLines.map(l => l.category))];
                return cats.map(cat => {
                  const catLines = activeLines.filter(l => l.category === cat);
                  const mixerCount = catMixerCounts[cat] ?? 1;
                  const recipe = plan?.mixerGroups.find(mg => mg.lines.some(l => l.category === cat))?.recipe ?? null;
                  return (
                    <div key={cat} style={{ marginBottom: 24 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-subtle)", margin: "0 0 10px" }}>{cat}</p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px,1fr))", gap: 16 }}>
                        {Array.from({ length: mixerCount }, (_, i) => (
                          <MixerDeegCard
                            key={i + 1}
                            cat={cat} mixerNum={i + 1}
                            catLines={catLines}
                            assign={catMixerAssign[cat] ?? {}}
                            recipe={recipe}
                          />
                        ))}
                      </div>
                    </div>
                  );
                });
              })()}
            </section>
          )}

          {/* ── Desem + Manden ── */}
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px,1fr))", gap: 16 }}>
            <DesemTotaal groups={nextPlan?.mixerGroups ?? planGroups} deliveryDate={nextPlan?.deliveryDate ?? plan.deliveryDate} />
            {hasAny && <MandenTotaal lines={planLines} />}
          </section>

          {/* ── Aantallen ── */}
          {hasAny && (
            <section className="card" style={{ overflow: "hidden" }}>
              <div style={{ padding: "8px 20px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Aantallen — {delivLabel}</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ textAlign: "left",  padding: "10px 20px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 12, textTransform: "uppercase" }}>Broodsoort</th>
                      <th style={{ textAlign: "right", padding: "10px 10px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 12, textTransform: "uppercase" }}>W. Delft</th>
                      <th style={{ textAlign: "right", padding: "10px 10px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 12, textTransform: "uppercase" }}>W. DH</th>
                      <th style={{ textAlign: "right", padding: "10px 10px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 12, textTransform: "uppercase" }}>Horeca</th>
                      <th style={{ textAlign: "right", padding: "10px 20px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 12, textTransform: "uppercase" }}>Totaal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planLines.filter(l => l.totalQty > 0).map((line, i) => (
                      <tr key={line.breadTypeId} style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
                        <td style={{ padding: "8px 20px" }}>{line.name}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--text-muted)" }}>{fmt((line as any).winkelDelftQty ?? line.winkelQty)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--text-muted)" }}>{fmt((line as any).winkelDHQty ?? 0)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--text-muted)" }}>{fmt(line.horecaQty)}</td>
                        <td style={{ padding: "8px 20px", textAlign: "right" }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: "var(--accent)" }}>{line.totalQty}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

        </div>
      )}
    </div>
  );
}
