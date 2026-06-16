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
  status: "todo" | "in_mixer" | "rijzen" | "klaar";
  startedAt: string | null; rijzenAt: string | null; klaarAt: string | null;
};

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

function applyAdj(groups: MixerGroup[], adj: Record<string, number>): MixerGroup[] {
  return groups.map(mg => {
    const adjLines = mg.lines.map(l => {
      const q = Math.max(0, l.totalQty + (adj[l.breadTypeId] ?? 0));
      const dpL = l.totalQty > 0 ? l.doughWeightTotal / l.totalQty : 0;
      const fpL = l.totalQty > 0 ? l.flourWeightTotal / l.totalQty : 0;
      return { ...l, totalQty: q, doughWeightTotal: q * dpL, flourWeightTotal: q * fpL };
    });
    const al = adjLines.filter(l => l.doughWeightTotal > 0 || l.totalQty > 0);
    const doughKg   = al.reduce((s, l) => s + l.doughWeightTotal, 0) / 1000;
    const toppingKg = adjLines.reduce((s, l) => s + l.toppingWeightPerLoaf * l.totalQty, 0) / 1000;
    const flourKg   = al.reduce((s, l) => s + l.flourWeightTotal, 0) / 1000;
    const loaves    = al.filter(l => l.doughWeightTotal > 0).reduce((s, l) => s + l.totalQty, 0);
    return { ...mg, lines: adjLines, totalLoaves: loaves, totalDoughKg: doughKg, totalDoughNoFillingsKg: doughKg - toppingKg, flourWeightKg: flourKg };
  }).filter(mg => mg.lines.some(l => l.totalQty > 0));
}

// ─── MixerIngredients ─────────────────────────────────────────────────────────
function MixerIngredients({ mg, mixers }: { mg: MixerGroup; mixers: number }) {
  const r = mg.recipe;
  if (!r || mg.totalDoughNoFillingsKg === 0) return null;
  const baseDough  = (mg.totalDoughNoFillingsKg * 1000) / mixers;
  const totalPct   = 100 + r.waterPct + r.desemPct + r.zoutPct + r.inwasPct;
  const flour      = (baseDough / totalPct) * 100;
  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ fontSize: 12, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        Ingrediënten per mixer ({mixers}x)
      </p>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            {r.flourLines.map(f => (
              <tr key={f.name}>
                <td style={{ padding: "3px 0", color: "var(--text-muted)" }}>{f.name}</td>
                <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 600 }}>{g(flour * f.percentage / 100)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "4px 0", color: "var(--text-muted)" }}>Water</td>
              <td style={{ padding: "4px 0", textAlign: "right", fontWeight: 600 }}>{g(flour * r.waterPct / 100)}</td>
            </tr>
            <tr>
              <td style={{ padding: "3px 0", color: "var(--text-muted)" }}>Desem</td>
              <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 600 }}>{g(flour * r.desemPct / 100)}</td>
            </tr>
            <tr>
              <td style={{ padding: "3px 0", color: "var(--text-muted)" }}>Zout</td>
              <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 600 }}>{g(flour * r.zoutPct / 100)}</td>
            </tr>
            {r.inwasPct > 0 && (
              <tr>
                <td style={{ padding: "3px 0", color: "var(--text-muted)" }}>Inwas</td>
                <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 600 }}>{g(flour * r.inwasPct / 100)}</td>
              </tr>
            )}
            <tr style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "4px 0", fontSize: 11, color: "var(--text-subtle)" }}>Totaal deeg</td>
              <td style={{ padding: "4px 0", textAlign: "right", fontSize: 11, color: "var(--text-subtle)" }}>{g(baseDough)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── VullingenCalculator ─────────────────────────────────────────────────────
type VullingMode = "mixer" | "hand" | "none";

function VullingenCalculator({ mg, mixers }: { mg: MixerGroup; mixers: number }) {
  if (mg.group === "rogge") return null;

  type BreadEntry = { key: string; label: string; totalLoaves: number; totalDough: number; totalFilling: number };
  const breadMap = new Map<string, BreadEntry>();

  for (const line of mg.lines) {
    if (line.toppings.length === 0 || line.totalQty === 0) continue;
    const key   = line.slug.replace("-15kg", "");
    const label = line.name.replace(" 1,5 KG","").replace(" 1.5 KG","").trim();
    const doughPerLoaf  = line.totalQty > 0 ? (line.doughWeightTotal / line.totalQty) - line.toppingWeightPerLoaf : 0;
    const pureDough     = Math.max(0, doughPerLoaf) * line.totalQty;
    const totalFilling  = line.toppings.reduce((s, t) => s + t.gramsPerLoaf * line.totalQty, 0);
    const doughKgPerLoaf = line.totalQty > 0 ? (line.doughWeightTotal / line.totalQty) / 1000 : 1;
    const loavesEq = line.totalQty * (doughKgPerLoaf > 1.2 ? 1.5 : 1);
    if (!breadMap.has(key)) breadMap.set(key, { key, label, totalLoaves: 0, totalDough: 0, totalFilling: 0 });
    const e = breadMap.get(key)!;
    e.totalLoaves  += loavesEq;
    e.totalDough   += pureDough;
    e.totalFilling += totalFilling;
  }

  const entries = Array.from(breadMap.values()).filter(e => e.totalFilling > 0);
  if (entries.length === 0) return null;

  const [modes, setModes] = useState<Record<string, VullingMode>>({});
  const getMode = (key: string): VullingMode => modes[key] ?? "none";
  const setMode = (key: string, mode: VullingMode) => setModes(m => ({ ...m, [key]: mode }));

  const fullMixPerMixer  = (mg.totalDoughNoFillingsKg * 1000) / mixers;
  const handEntries      = entries.filter(e => getMode(e.key) === "hand");
  const mixerEntries     = entries.filter(e => getMode(e.key) === "mixer");
  const handDoughTotal   = handEntries.reduce((s, e) => s + e.totalDough, 0);
  const mixerDoughTotal  = mixerEntries.reduce((s, e) => s + e.totalDough, 0);
  const boerenOut        = Math.max(0, fullMixPerMixer - handDoughTotal - mixerDoughTotal);

  return (
    <div style={{ marginTop: 16, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
      <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 12px" }}>Vullingen in mixer</p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <th style={{ textAlign: "left", padding: "6px 0", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11, textTransform: "uppercase" }}>Brood</th>
            <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11, textTransform: "uppercase" }}>Aantal</th>
            <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11, textTransform: "uppercase" }}>Vulling</th>
            <th style={{ textAlign: "center", padding: "6px 8px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11, textTransform: "uppercase" }}>In mixer</th>
            <th style={{ textAlign: "center", padding: "6px 0", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11, textTransform: "uppercase" }}>Met hand</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(e => (
            <tr key={e.key} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "8px 0" }}>{e.label}</td>
              <td style={{ padding: "8px", textAlign: "right", fontWeight: 600 }}>{Number.isFinite(e.totalLoaves) ? Math.round(e.totalLoaves) : "—"}</td>
              <td style={{ padding: "8px", textAlign: "right", color: "var(--text-muted)" }}>{g(e.totalFilling)}</td>
              <td style={{ padding: "8px", textAlign: "center" }}>
                <input type="checkbox" checked={getMode(e.key) === "mixer"} onChange={ev => setMode(e.key, ev.target.checked ? "mixer" : "none")} />
              </td>
              <td style={{ padding: "8px 0", textAlign: "center" }}>
                <input type="checkbox" checked={getMode(e.key) === "hand"} onChange={ev => setMode(e.key, ev.target.checked ? "hand" : "none")} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(handEntries.length > 0 || mixerEntries.length > 0) && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 12, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Werkwijze (1 mixer)</p>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <tbody>
                <tr>
                  <td style={{ padding: "4px 0", color: "var(--text-muted)" }}>Volledige mix</td>
                  <td style={{ padding: "4px 0", textAlign: "right", fontWeight: 600 }}>{g(fullMixPerMixer)}</td>
                </tr>
                {handEntries.map(e => (
                  <tr key={e.key} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "4px 0", color: "var(--text-muted)" }}>Hand mix eruit — {e.label}</td>
                    <td style={{ padding: "4px 0", textAlign: "right", fontWeight: 600, color: "var(--danger)" }}>− {g(e.totalDough)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "4px 0", color: "var(--text-muted)" }}>Boeren eruit</td>
                  <td style={{ padding: "4px 0", textAlign: "right", fontWeight: 600, color: "var(--danger)" }}>− {g(boerenOut)}</td>
                </tr>
                {mixerEntries.map(e => (
                  <tr key={e.key} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "4px 0", color: "var(--text-muted)" }}>+ {e.label} toevoegen</td>
                    <td style={{ padding: "4px 0", textAlign: "right", fontWeight: 600, color: "var(--success)" }}>{g(e.totalFilling)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <td style={{ padding: "6px 0", fontWeight: 600 }}>Rest in mixer{mixerEntries.map(e => ` (${e.label})`).join("")}</td>
                  <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 700, color: "var(--accent)" }}>
                    {g(mixerDoughTotal + mixerEntries.reduce((s, e) => s + e.totalFilling, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MixerGroupCard ───────────────────────────────────────────────────────────
function MixerGroupCard({ mg }: { mg: MixerGroup }) {
  const [mixers, setMixers] = useState(mg.group === "boeren" ? 3 : 1);
  const [showDetails, setShowDetails] = useState(false);
  return (
    <div className="card" style={{ padding: "1.25rem 1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <h3 style={{ fontSize: 17 }}>{mg.label}</h3>
        <span className="badge badge-amber">{mg.totalLoaves} st.</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 13, marginBottom: 10 }}>
        <span style={{ color: "var(--text-muted)" }}>Totaal deeg:</span>
        <span style={{ fontWeight: 500, textAlign: "right" }}>{mg.totalDoughKg.toFixed(2)} kg</span>
        {mg.totalDoughNoFillingsKg !== mg.totalDoughKg && (<>
          <span style={{ color: "var(--text-muted)" }}>Zonder vullingen:</span>
          <span style={{ fontWeight: 500, textAlign: "right" }}>{mg.totalDoughNoFillingsKg.toFixed(2)} kg</span>
        </>)}
      </div>
      <button onClick={() => setShowDetails(!showDetails)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text-subtle)", padding: 0, display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
        <span style={{ transform: showDetails ? "rotate(90deg)" : "none", display: "inline-block", transition: "0.15s" }}>▶</span>
        {showDetails ? "Verberg" : "Toon"} deeg per soort
      </button>
      {showDetails && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 10 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ textAlign: "left", padding: "4px 0", color: "var(--text-subtle)", fontWeight: 500 }}>Soort</th>
              <th style={{ textAlign: "right", padding: "4px 8px", color: "var(--text-subtle)", fontWeight: 500 }}>St.</th>
              <th style={{ textAlign: "right", padding: "4px 0", color: "var(--text-subtle)", fontWeight: 500 }}>Deeg</th>
              <th style={{ textAlign: "right", padding: "4px 0", color: "var(--text-subtle)", fontWeight: 500 }}>Bloem</th>
            </tr>
          </thead>
          <tbody>
            {mg.lines.filter(l => l.totalQty > 0).map(l => (
              <tr key={l.breadTypeId} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "6px 0" }}>{l.name}</td>
                <td style={{ padding: "6px 8px", textAlign: "right", color: "var(--text-muted)" }}>{l.totalQty}</td>
                <td style={{ padding: "6px 0", textAlign: "right" }}>{g(l.doughWeightTotal)}</td>
                <td style={{ padding: "6px 0", textAlign: "right", color: "var(--text-subtle)" }}>{g(l.flourWeightTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Mixers:</span>
        <button onClick={() => setMixers(Math.max(1, mixers - 1))} style={{ width: 26, height: 26, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 15 }}>−</button>
        <span style={{ fontSize: 15, fontWeight: 600, minWidth: 16, textAlign: "center" }}>{mixers}</span>
        <button onClick={() => setMixers(Math.min(8, mixers + 1))} style={{ width: 26, height: 26, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 15 }}>+</button>
        <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>→ {g((mg.totalDoughNoFillingsKg * 1000) / mixers)} per mixer</span>
      </div>
      <MixerIngredients mg={mg} mixers={mixers} />
      <VullingenCalculator mg={mg} mixers={mixers} />
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
  const kleineMand       = get("boeren-kl");
  const ruitjesOngebl    = ["sesam","sesam-15kg","zaden","zaden-15kg","olijf","rozijn"].reduce((s, sl) => s + get(sl), 0);
  const ruitjesBloemd    = ["boeren-gr","boeren-15kg","volkoren","volkoren-15kg"].reduce((s, sl) => s + get(sl), 0);
  const mand15kg         = ["boeren-15kg","sesam-15kg","zaden-15kg"].reduce((s, sl) => s + get(sl), 0);
  const rondeMand        = ["olijf","rozijn","morning-buns"].reduce((s, sl) => s + get(sl), 0);
  const rows = [
    { label: "Kleine mand",   count: kleineMand,                      note: "Boeren KL" },
    { label: "Ruitjes mand",  count: ruitjesOngebl + ruitjesBloemd,   note: `waarvan ${ruitjesOngebl} ongebloemd` },
    { label: "1,5 kg mand",   count: mand15kg,                        note: "Boeren, Sesam, Zaden 1,5 kg" },
    { label: "Ronde mand",    count: rondeMand,                       note: "Olijf, Rozijn, Morning buns" },
  ];
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
        <h2 style={{ fontSize: 16 }}>Manden totaal</h2>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <tbody>
          {rows.map((r, i) => (
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
const BATCH_BG: Record<string, string>     = { todo: "var(--surface-2)", in_mixer: "#fefce8", rijzen: "#eff6ff", klaar: "#f0fdf4" };
const BATCH_BORDER: Record<string, string> = { todo: "var(--border)",    in_mixer: "#fbbf24", rijzen: "#93c5fd", klaar: "#4ade80" };
const BATCH_NEXT: Record<string, Batch["status"]>  = { todo: "in_mixer", in_mixer: "rijzen", rijzen: "klaar" } as const;
const BATCH_BTN: Record<string, string>    = { todo: "▶ In mixer",       in_mixer: "↑ Rijzen",                  rijzen: "✓ Klaar" };

function BatchCard({ batch, onUpdated }: { batch: Batch; onUpdated: () => void }) {
  const { role } = useRole();
  const [updating, setUpdating] = useState(false);
  const [elapsed, setElapsed]   = useState("");

  useEffect(() => {
    if (batch.status !== "in_mixer" || !batch.startedAt) { setElapsed(""); return; }
    const tick = () => {
      const ms = Date.now() - new Date(batch.startedAt!).getTime();
      setElapsed(`${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [batch.status, batch.startedAt]);

  async function advance() {
    const next = BATCH_NEXT[batch.status];
    if (!next || updating) return;
    setUpdating(true);
    await fetch("/digitalbakery/api/production/batches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify({ id: batch.id, status: next }),
    });
    setUpdating(false);
    onUpdated();
  }

  return (
    <div style={{ background: BATCH_BG[batch.status], border: `2px solid ${BATCH_BORDER[batch.status]}`, borderRadius: 10, padding: "12px 16px", transition: "background 0.3s, border-color 0.3s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{batch.groupLabel}</span>
            <span style={{ fontSize: 11, color: "var(--text-subtle)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 5, padding: "1px 6px" }}>
              mixer {batch.batchNumber}
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>{batch.totalLoaves} stuks</p>
        </div>
        {batch.status !== "klaar" ? (
          <button onClick={advance} disabled={updating} className="btn-primary" style={{ fontSize: 13, padding: "7px 16px" }}>
            {updating ? "…" : BATCH_BTN[batch.status]}
          </button>
        ) : (
          <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 700 }}>✓ Klaar</span>
        )}
      </div>

      {(batch.startedAt || batch.rijzenAt || batch.klaarAt) && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border)", display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
          {batch.startedAt && (
            <span style={{ color: batch.status === "in_mixer" ? "#b45309" : "var(--text-muted)" }}>
              🕐 In mixer {fmtTime(batch.startedAt)}
              {batch.status === "in_mixer" && elapsed && <strong style={{ marginLeft: 4 }}>({elapsed})</strong>}
            </span>
          )}
          {batch.rijzenAt && <span style={{ color: "var(--text-muted)" }}>↑ Rijzen {fmtTime(batch.rijzenAt)}</span>}
          {batch.klaarAt  && <span style={{ color: "#16a34a" }}>✓ Klaar {fmtTime(batch.klaarAt)}</span>}
        </div>
      )}
    </div>
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

  // Per-breadtype quantity adjustments (client-only, reset on date change)
  const [adj, setAdj]         = useState<Record<string, number>>({});
  // Per-group mixer count for planning
  const [mixerCounts, setMixerCounts] = useState<Record<string, number>>({});
  // Production batches from DB
  const [batches, setBatches]         = useState<Batch[]>([]);
  const [savingPlan, setSavingPlan]   = useState(false);
  // Deeg calculator visibility
  const [showDeeg, setShowDeeg]       = useState(false);

  // ── Load plan ──
  function loadPlan(d: string) {
    setLoading(true); setError("");
    const next = (() => { const nd = new Date(d + "T12:00:00Z"); nd.setUTCDate(nd.getUTCDate() + 1); return nd.toISOString().slice(0, 10); })();
    Promise.all([
      fetch(`/digitalbakery/api/production?date=${d}`,    { headers: { "x-role": role ?? "" } }).then(r => r.json()),
      fetch(`/digitalbakery/api/production?date=${next}`, { headers: { "x-role": role ?? "" } }).then(r => r.json()),
    ]).then(([data, nextData]) => {
      if (data.error) { setError(data.message ?? data.error); setLoading(false); return; }
      setPlan({ ...data, breadLines: data.breadLines ?? [], mixerGroups: data.mixerGroups ?? [] });
      if (!nextData.error) setNextPlan({ ...nextData, breadLines: nextData.breadLines ?? [], mixerGroups: nextData.mixerGroups ?? [] });
      setLoading(false);
    }).catch(e => { setError(String(e)); setLoading(false); });
  }

  // ── Load batches ──
  const loadBatches = useCallback(() => {
    fetch(`/digitalbakery/api/production/batches?date=${date}`, { headers: { "x-role": role ?? "" } })
      .then(r => r.json())
      .then(d => {
        const bs: Batch[] = d.batches ?? [];
        setBatches(bs);
        // Prefill mixer counts from existing batches
        if (bs.length > 0) {
          const counts: Record<string, number> = {};
          for (const b of bs) counts[b.mixerGroup] = Math.max(counts[b.mixerGroup] ?? 0, b.batchNumber);
          setMixerCounts(counts);
        }
      })
      .catch(() => {});
  }, [date, role]);

  useEffect(() => { loadPlan(date); setAdj({}); }, [date]);
  useEffect(() => { loadBatches(); }, [loadBatches]);
  // Auto-refresh batches every 30s (so multiple workers see each other's updates)
  useEffect(() => {
    const id = setInterval(loadBatches, 30000);
    return () => clearInterval(id);
  }, [loadBatches]);

  // Set default mixer counts once plan loads (only when no batches yet)
  useEffect(() => {
    if (!plan || batches.length > 0) return;
    const defaults: Record<string, number> = {};
    for (const mg of plan.mixerGroups) defaults[mg.group] = mg.group === "boeren" ? 3 : 1;
    setMixerCounts(defaults);
  }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps

  function shift(days: number) {
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    setDate(d.toISOString().slice(0, 10));
  }

  // Adjusted groups & lines (flow to deeg calculator, desem, manden)
  const adjGroups = plan ? applyAdj(plan.mixerGroups, adj) : [];
  const adjLines  = plan ? plan.breadLines.map(l => ({ ...l, totalQty: Math.max(0, l.totalQty + (adj[l.breadTypeId] ?? 0)) })) : [];

  // ── Save plan to DB ──
  async function savePlan() {
    const hasProgress = batches.some(b => b.status !== "todo");
    if (hasProgress && !confirm("Sommige batches zijn al gestart. Wil je het plan opnieuw maken? De voortgang gaat verloren.")) return;
    setSavingPlan(true);
    const toCreate = adjGroups.filter(mg => mg.totalLoaves > 0).flatMap(mg => {
      const count = Math.max(1, mixerCounts[mg.group] ?? 1);
      const base  = Math.floor(mg.totalLoaves / count);
      const rem   = mg.totalLoaves - base * count;
      return Array.from({ length: count }, (_, i) => ({
        mixerGroup: mg.group, groupLabel: mg.label,
        batchNumber: i + 1,
        totalLoaves: i === 0 ? base + rem : base,
      }));
    });
    await fetch("/digitalbakery/api/production/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify({ date, batches: toCreate }),
    });
    setSavingPlan(false);
    loadBatches();
  }

  const hasAny        = plan && plan.breadLines.some(l => l.totalQty > 0);
  const prodLabel     = plan ? `${WEEKDAYS[plan.weekday]} ${plan.productionDate}` : "";
  const delivWeekday  = plan ? getWeekday(plan.deliveryDate) : 1;
  const delivLabel    = plan ? `${WEEKDAYS[delivWeekday]} ${plan.deliveryDate}` : "";
  const batchGroups   = batches.reduce<Record<string, Batch[]>>((acc, b) => { (acc[b.mixerGroup] ??= []).push(b); return acc; }, {});
  const totalDone     = batches.filter(b => b.status === "klaar").length;
  const hasAdj        = Object.values(adj).some(v => v !== 0);

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
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

          {/* ── 1. Aantallen + aanpassingen ── */}
          <section className="card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid var(--border)", background: "var(--surface-2)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>Aantallen — {delivLabel}</h2>
              {hasAdj && (
                <button onClick={() => setAdj({})} className="btn-secondary" style={{ fontSize: 12 }}>↺ Reset aanpassingen</button>
              )}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ textAlign: "left",   padding: "10px 20px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 12, textTransform: "uppercase" }}>Broodsoort</th>
                    <th style={{ textAlign: "right",  padding: "10px 10px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 12, textTransform: "uppercase" }}>W. Delft</th>
                    <th style={{ textAlign: "right",  padding: "10px 10px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 12, textTransform: "uppercase" }}>W. DH</th>
                    <th style={{ textAlign: "right",  padding: "10px 10px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 12, textTransform: "uppercase" }}>Horeca</th>
                    <th style={{ textAlign: "center", padding: "10px 10px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 12, textTransform: "uppercase" }}>Aanpassing</th>
                    <th style={{ textAlign: "right",  padding: "10px 20px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 12, textTransform: "uppercase" }}>Totaal</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.breadLines.map((line, i) => {
                    const delta    = adj[line.breadTypeId] ?? 0;
                    const adjTotal = Math.max(0, line.totalQty + delta);
                    const changed  = delta !== 0;
                    return (
                      <tr key={line.breadTypeId} style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none", opacity: adjTotal === 0 && line.totalQty === 0 ? 0.3 : 1 }}>
                        <td style={{ padding: "8px 20px" }}>{line.name}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--text-muted)" }}>{fmt((line as any).winkelDelftQty ?? line.winkelQty)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--text-muted)" }}>{fmt((line as any).winkelDHQty ?? 0)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--text-muted)" }}>{fmt(line.horecaQty)}</td>
                        <td style={{ padding: "6px 10px", textAlign: "center" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <button onClick={() => setAdj(a => ({ ...a, [line.breadTypeId]: delta - 1 }))}
                              style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid var(--border)", background: delta < 0 ? "#fee2e2" : "var(--surface)", cursor: "pointer", fontSize: 15, fontWeight: 700, lineHeight: 1, color: "var(--danger)" }}>−</button>
                            <span style={{ minWidth: 30, textAlign: "center", fontSize: 13, fontWeight: 600,
                              color: delta > 0 ? "#16a34a" : delta < 0 ? "var(--danger)" : "var(--text-subtle)" }}>
                              {delta > 0 ? `+${delta}` : delta < 0 ? String(delta) : "0"}
                            </span>
                            <button onClick={() => setAdj(a => ({ ...a, [line.breadTypeId]: delta + 1 }))}
                              style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid var(--border)", background: delta > 0 ? "#dcfce7" : "var(--surface)", cursor: "pointer", fontSize: 15, fontWeight: 700, lineHeight: 1, color: "#16a34a" }}>+</button>
                          </div>
                        </td>
                        <td style={{ padding: "8px 20px", textAlign: "right" }}>
                          {adjTotal > 0
                            ? <span style={{ fontWeight: 700, fontSize: 15, color: changed ? (delta > 0 ? "#16a34a" : "var(--danger)") : "var(--accent)" }}>{adjTotal}</span>
                            : <span style={{ color: "var(--text-subtle)" }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── 2. Mixer plan ── */}
          {adjGroups.length > 0 && (
            <section className="card" style={{ padding: "1.25rem 1.5rem" }}>
              <h2 style={{ fontSize: 16, marginBottom: 4 }}>Mixer plan</h2>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                Stel het aantal mixers per deegsoort in en sla het plan op om de baklijst te starten.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12, marginBottom: 20 }}>
                {adjGroups.filter(mg => mg.totalLoaves > 0).map(mg => {
                  const count    = Math.max(1, mixerCounts[mg.group] ?? 1);
                  const perMixer = Math.ceil(mg.totalLoaves / count);
                  return (
                    <div key={mg.group} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px" }}>
                      <p style={{ fontWeight: 600, margin: "0 0 2px", fontSize: 14 }}>{mg.label}</p>
                      <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 10px" }}>{mg.totalLoaves} stuks</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Mixers:</span>
                        <button onClick={() => setMixerCounts(c => ({ ...c, [mg.group]: Math.max(1, (c[mg.group] ?? 1) - 1) }))}
                          style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 16 }}>−</button>
                        <span style={{ fontWeight: 700, fontSize: 17, minWidth: 22, textAlign: "center" }}>{count}</span>
                        <button onClick={() => setMixerCounts(c => ({ ...c, [mg.group]: Math.min(10, (c[mg.group] ?? 1) + 1) }))}
                          style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 16 }}>+</button>
                      </div>
                      <p style={{ fontSize: 12, color: "var(--text-subtle)", margin: 0 }}>~{perMixer} stuks per mixer</p>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={savePlan} disabled={savingPlan} className="btn-primary" style={{ fontSize: 14, padding: "10px 24px" }}>
                  {savingPlan ? "Opslaan…" : batches.length > 0 ? "🔄 Plan opnieuw opslaan" : "✓ Plan opslaan & starten"}
                </button>
                {batches.length > 0 && (
                  <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>Bestaande voortgang wordt overschreven.</span>
                )}
              </div>
            </section>
          )}

          {/* ── 3. Bakken voortgang (checklist) ── */}
          {batches.length > 0 && (
            <section>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h2 style={{ fontSize: 17, margin: 0 }}>Bakken voortgang</h2>
                <span style={{ fontSize: 13, color: totalDone === batches.length ? "#16a34a" : "var(--text-subtle)", fontWeight: totalDone === batches.length ? 600 : 400 }}>
                  {totalDone === batches.length ? "🎉 Alles klaar!" : `${totalDone}/${batches.length} klaar`}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {Object.entries(batchGroups).map(([group, bs]) => {
                  const done = bs.filter(b => b.status === "klaar").length;
                  return (
                    <div key={group}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <h3 style={{ fontSize: 13, margin: 0, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-subtle)" }}>
                          {bs[0].groupLabel}
                        </h3>
                        <span style={{ fontSize: 12, color: done === bs.length ? "#16a34a" : "var(--text-muted)" }}>
                          {done}/{bs.length} klaar
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 10 }}>
                        {bs.map(b => <BatchCard key={b.id} batch={b} onUpdated={loadBatches} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── 4. Deeg calculator (collapsible) ── */}
          {adjGroups.length > 0 && (
            <section>
              <button onClick={() => setShowDeeg(v => !v)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontSize: 17, fontWeight: 600, padding: 0, color: "var(--text)", marginBottom: showDeeg ? 14 : 0 }}>
                <span style={{ transform: showDeeg ? "rotate(90deg)" : "none", display: "inline-block", transition: "0.15s", fontSize: 13 }}>▶</span>
                Deeg calculator
              </button>
              {showDeeg && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px,1fr))", gap: 16 }}>
                  {adjGroups.map(mg => <MixerGroupCard key={mg.group} mg={mg} />)}
                </div>
              )}
            </section>
          )}

          {/* ── 5. Desem + Manden ── */}
          {hasAny && (
            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px,1fr))", gap: 16 }}>
              <DesemTotaal groups={nextPlan?.mixerGroups ?? adjGroups} deliveryDate={nextPlan?.deliveryDate ?? plan.deliveryDate} />
              <MandenTotaal lines={adjLines} />
            </section>
          )}

          {!hasAny && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                <p style={{ fontSize: 15, margin: "0 0 4px" }}>Geen bestellingen voor {delivLabel}</p>
                <p style={{ fontSize: 13, margin: 0, color: "var(--text-subtle)" }}>Desem hieronder is voor de volgende bakdag.</p>
              </div>
              <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px,1fr))", gap: 16 }}>
                <DesemTotaal groups={nextPlan?.mixerGroups ?? plan.mixerGroups} deliveryDate={nextPlan?.deliveryDate ?? plan.deliveryDate} />
              </section>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
