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
  weightGrams: number | null;
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
    const key   = line.slug;
    const label = line.name.trim();
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
// Renders one standalone card per mixer (e.g. "Boerenmix 1", "Boerenmix 2", ...)
// instead of stacking mixers inside a single shared card.
function MixerGroupCard({ mg, weightsKg }: { mg: MixerGroup; weightsKg: number[] }) {
  const mixers = weightsKg.length || 1;
  return (
    <>
      {weightsKg.map((wKg, i) => {
        const frac = mg.totalDoughNoFillingsKg > 0 ? wKg / mg.totalDoughNoFillingsKg : 0;
        const mixerLines = mg.lines.map(l => ({
          ...l,
          totalQty: Math.round(l.totalQty * frac),
          doughWeightTotal: l.doughWeightTotal * frac,
          flourWeightTotal: l.flourWeightTotal * frac,
        }));
        const fillingsKg = mg.totalDoughKg - mg.totalDoughNoFillingsKg;
        const virtualMg: MixerGroup = {
          ...mg,
          lines: mixerLines,
          totalDoughNoFillingsKg: wKg,
          totalDoughKg: wKg + fillingsKg * frac,
        };
        const label = mixers > 1 ? `${mg.label} ${i + 1}` : mg.label;
        return <MixerCard key={i} label={label} virtualMg={virtualMg} />;
      })}
    </>
  );
}

function MixerCard({ label, virtualMg }: { label: string; virtualMg: MixerGroup }) {
  const [showDetails, setShowDetails] = useState(false);
  const loaves = virtualMg.lines.filter(l => l.doughWeightTotal > 0).reduce((s, l) => s + l.totalQty, 0);
  return (
    <div className="card" style={{ padding: "1.25rem 1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <h3 style={{ fontSize: 17 }}>{label}</h3>
        <span className="badge badge-amber">{loaves} st.</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 13, marginBottom: 10 }}>
        <span style={{ color: "var(--text-muted)" }}>Totaal deeg:</span>
        <span style={{ fontWeight: 500, textAlign: "right" }}>{virtualMg.totalDoughKg.toFixed(2)} kg</span>
        {virtualMg.totalDoughNoFillingsKg !== virtualMg.totalDoughKg && (<>
          <span style={{ color: "var(--text-muted)" }}>Zonder vullingen:</span>
          <span style={{ fontWeight: 500, textAlign: "right" }}>{virtualMg.totalDoughNoFillingsKg.toFixed(2)} kg</span>
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
            {virtualMg.lines.filter(l => l.totalQty > 0).map(l => (
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
      <MixerIngredients mg={virtualMg} mixers={1} />
      <VullingenCalculator mg={virtualMg} mixers={1} />
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

  // Per-group mixer count for planning
  const [mixerCounts, setMixerCounts] = useState<Record<string, number>>({});
  // Per-group, per-mixer dough weight in kg (manually editable, not equally distributed)
  const [mixerWeights, setMixerWeights] = useState<Record<string, number[]>>({});
  // Production batches from DB
  const [batches, setBatches]         = useState<Batch[]>([]);
  const [savingPlan, setSavingPlan]   = useState(false);
  const [saveError, setSaveError]     = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [showPlanEdit, setShowPlanEdit] = useState(false);
  const [showAantallen, setShowAantallen] = useState(false);
  // additiveAssignment: group → breadTypeId → batchNumber
  const [additiveAssignment, setAdditiveAssignment] = useState<Record<string, Record<string, number>>>({});

  // Resize a group's weight array to `count` entries, filling new slots with an even
  // share of whatever's left of totalKg, without disturbing values the user already typed.
  function syncWeights(group: string, count: number, totalKg: number) {
    setMixerWeights(w => {
      const cur = w[group] ?? [];
      if (cur.length === count) return w;
      const arr = cur.slice(0, count);
      while (arr.length < count) {
        const used = arr.reduce((s, v) => s + v, 0);
        arr.push(Number(Math.max(0, (totalKg - used) / (count - arr.length)).toFixed(2)));
      }
      return { ...w, [group]: arr };
    });
  }

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
        // Prefill mixer counts + weights from existing batches
        if (bs.length > 0) {
          const counts: Record<string, number> = {};
          const weights: Record<string, number[]> = {};
          for (const b of bs) {
            counts[b.mixerGroup] = Math.max(counts[b.mixerGroup] ?? 0, b.batchNumber);
            (weights[b.mixerGroup] ??= [])[b.batchNumber - 1] = (b.weightGrams ?? 0) / 1000;
          }
          setMixerCounts(counts);
          setMixerWeights(weights);
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

  // Set default mixer counts + even weight split once plan loads (only when no batches yet)
  useEffect(() => {
    if (!plan || batches.length > 0) return;
    const defaults: Record<string, number> = {};
    const weightDefaults: Record<string, number[]> = {};
    for (const mg of plan.mixerGroups) {
      const c = mg.group === "boeren" ? 3 : 1;
      defaults[mg.group] = c;
      weightDefaults[mg.group] = Array.from({ length: c }, () => Number((mg.totalDoughNoFillingsKg / c).toFixed(2)));
    }
    setMixerCounts(defaults);
    setMixerWeights(weightDefaults);
  }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps

  function shift(days: number) {
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    setDate(d.toISOString().slice(0, 10));
  }

  const planGroups = plan?.mixerGroups ?? [];
  const planLines  = plan?.breadLines  ?? [];

  // ── Save plan to DB ──
  async function savePlan() {
    if (!plan) return;
    setConfirmReset(false);
    setSavingPlan(true); setSaveError("");
    const toCreate = planGroups.filter(mg => mg.totalLoaves > 0).flatMap(mg => {
      const count = Math.max(1, mixerCounts[mg.group] ?? 1);
      const weightsKg = mixerWeights[mg.group]?.length === count
        ? mixerWeights[mg.group]
        : Array.from({ length: count }, () => mg.totalDoughNoFillingsKg / count);
      const weightSum = weightsKg.reduce((s, v) => s + v, 0) || 1;
      const assignment = additiveAssignment[mg.group] ?? {};
      let loavesAssigned = 0;
      return weightsKg.map((wKg, i) => {
        const batchNum = i + 1;
        const isLast = i === weightsKg.length - 1;
        const loaves = isLast ? mg.totalLoaves - loavesAssigned : Math.round(mg.totalLoaves * wKg / weightSum);
        loavesAssigned += loaves;
        const additivesForBatch = mg.lines.filter(l => ADDITIVE_SLUGS.has(l.slug) && l.totalQty > 0 && (assignment[l.breadTypeId] ?? 1) === batchNum);
        const notes = additivesForBatch.length > 0 ? JSON.stringify({ additives: additivesForBatch.map(l => `${l.name} ×${l.totalQty}`) }) : undefined;
        return { mixerGroup: mg.group, groupLabel: mg.label, batchNumber: batchNum, totalLoaves: Math.max(0, loaves), weightGrams: Math.round(wKg * 1000), notes };
      });
    });
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
    const mg = plan?.mixerGroups.find(g => g.group === batch.mixerGroup);
    if (!mg) return [];
    const frac = mg.totalLoaves > 0 ? batch.totalLoaves / mg.totalLoaves : 0;
    return mg.lines.map(l => ({ ...l, totalQty: Math.round(l.totalQty * frac), doughWeightTotal: l.doughWeightTotal * frac, flourWeightTotal: l.flourWeightTotal * frac }));
  }

  const weightsByGroup: Record<string, number[]> = {};
  for (const mg of planGroups) {
    const savedBatches = (batchGroups[mg.group] ?? []).slice().sort((a, b) => a.batchNumber - b.batchNumber);
    if (savedBatches.length > 0) {
      weightsByGroup[mg.group] = savedBatches.map(b => (b.weightGrams ?? 0) / 1000);
    } else if (mixerWeights[mg.group]?.length) {
      weightsByGroup[mg.group] = mixerWeights[mg.group];
    } else {
      weightsByGroup[mg.group] = [mg.totalDoughNoFillingsKg];
    }
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

      {/* ── Aantallen (collapsible) ── */}
      {!loading && !error && hasAny && (
        <section className="card" style={{ overflow: "hidden", marginBottom: 20 }}>
          <button
            onClick={() => setShowAantallen(s => !s)}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 20px", border: "none", background: "var(--surface-2)", cursor: "pointer", textAlign: "left" }}
          >
            <span style={{ fontSize: 11, transform: showAantallen ? "rotate(90deg)" : "none", transition: "transform 0.15s", color: "var(--text-subtle)" }}>▶</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Aantallen — {delivLabel}</span>
          </button>
          {showAantallen && (
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
          )}
        </section>
      )}

      {loading && <p style={{ color: "var(--text-subtle)", textAlign: "center", padding: "3rem 0" }}>Laden…</p>}
      {!loading && error && (
        <div style={{ background: "var(--warn-bg)", border: "1px solid #fca5a5", borderRadius: 10, padding: "1rem", color: "var(--warn)", fontSize: 14, marginBottom: 16 }}>
          <strong>Fout:</strong> {error}
        </div>
      )}

      {!loading && !error && plan && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* ── Mixer plan (when no batches exist, or when editing) ── */}
          {(batches.length === 0 || showPlanEdit) && planGroups.filter(mg => mg.totalLoaves > 0).length > 0 && (
            <section className="card" style={{ padding: "1.25rem 1.5rem" }}>
              <h2 style={{ fontSize: 16, marginBottom: 4 }}>Mixer plan</h2>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                {batches.length === 0
                  ? "Stel het aantal mixers per deegsoort in en sla het plan op om de baklijst te starten."
                  : "Pas het aantal mixers aan. Opslaan verwijdert de huidige voortgang."}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginBottom: 16 }}>
                {planGroups.filter(mg => mg.totalLoaves > 0).map(mg => {
                  const count    = Math.max(1, mixerCounts[mg.group] ?? 1);
                  const weightsKg = mixerWeights[mg.group]?.length === count
                    ? mixerWeights[mg.group]
                    : Array.from({ length: count }, () => Number((mg.totalDoughNoFillingsKg / count).toFixed(2)));
                  const weightSum = weightsKg.reduce((s, v) => s + v, 0);
                  const weightWarn = Math.abs(weightSum - mg.totalDoughNoFillingsKg) > 0.05;
                  const additiveLinesInGroup = mg.lines.filter(l => DISTRIBUTE_SLUGS.has(l.slug) && l.totalQty > 0);
                  // Each product (incl. size variants like sesam / sesam-15kg) gets its own row
                  const additiveLinesDisplay = additiveLinesInGroup;
                  const assignment = additiveAssignment[mg.group] ?? {};
                  return (
                    <div key={mg.group} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
                      <p style={{ fontWeight: 600, margin: "0 0 2px", fontSize: 15 }}>{mg.label}</p>
                      <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 8px" }}>{mg.totalLoaves} stuks · {mg.totalDoughNoFillingsKg.toFixed(2)} kg deeg</p>
                      <div style={{ fontSize: 12, color: "var(--text-subtle)", marginBottom: 10 }}>
                        {mg.lines.filter(l => l.totalQty > 0).map(l => `${l.name} ×${l.totalQty}`).join(" · ")}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Mixers:</span>
                        <button onClick={() => { const nc = Math.max(1, count - 1); setMixerCounts(c => ({ ...c, [mg.group]: nc })); syncWeights(mg.group, nc, mg.totalDoughNoFillingsKg); }}
                          style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 17 }}>−</button>
                        <span style={{ fontWeight: 700, fontSize: 18, minWidth: 24, textAlign: "center" }}>{count}</span>
                        <button onClick={() => { const nc = Math.min(10, count + 1); setMixerCounts(c => ({ ...c, [mg.group]: nc })); syncWeights(mg.group, nc, mg.totalDoughNoFillingsKg); }}
                          style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 17 }}>+</button>
                      </div>
                      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 8 }}>
                        <p style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 6px" }}>Gewicht per mixer (kg)</p>
                        {weightsKg.map((wKg, i) => {
                          const isLast = i === weightsKg.length - 1;
                          const othersSum = weightsKg.reduce((s, w, j) => j !== i ? s + w : s, 0);
                          const fillKg = Number(Math.max(0, mg.totalDoughNoFillingsKg - othersSum).toFixed(2));
                          return (
                            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, gap: 4 }}>
                              <span style={{ color: "var(--text-muted)" }}>Mixer {i + 1}</span>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <input type="number" step="0.1" min="0" max={400} value={wKg}
                                  onChange={e => {
                                    const v = Math.min(400, parseFloat(e.target.value) || 0);
                                    setMixerWeights(w => {
                                      const arr = [...(w[mg.group] ?? weightsKg)];
                                      arr[i] = v;
                                      return { ...w, [mg.group]: arr };
                                    });
                                  }}
                                  style={{ width: 70, border: "1px solid var(--border)", borderRadius: 6, padding: "3px 6px", fontSize: 13, textAlign: "right" }} />
                                {isLast && count >= 2 && (
                                  <button
                                    onClick={() => setMixerWeights(w => { const arr = [...(w[mg.group] ?? weightsKg)]; arr[i] = fillKg; return { ...w, [mg.group]: arr }; })}
                                    title={`Vul aan tot ${fillKg.toFixed(2)} kg (totaal − mixers 1–${count - 1})`}
                                    style={{ fontSize: 11, padding: "2px 6px", border: "1px solid var(--border)", borderRadius: 5, background: "var(--surface-2)", cursor: "pointer", color: "var(--text-muted)", whiteSpace: "nowrap" }}
                                  >→ {fillKg.toFixed(1)}</button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
                          <span style={{ color: "var(--text-muted)" }}>Totaal ingevoerd</span>
                          <strong style={{ color: weightWarn ? "var(--warn)" : "inherit" }}>
                            {weightSum.toFixed(2)} kg{weightWarn ? ` (benodigd ${mg.totalDoughNoFillingsKg.toFixed(2)} kg)` : ""}
                          </strong>
                        </div>
                        {weightWarn && (
                          <p style={{ fontSize: 11, color: "var(--warn)", margin: "4px 0 0" }}>⚠ Som van de mixers wijkt af van het totaal benodigde deeg.</p>
                        )}
                      </div>
                      {/* Additive chooser for groups with multiple mixers */}
                      {count > 1 && additiveLinesDisplay.length > 0 && (
                        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                          <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-subtle)", margin: "0 0 8px" }}>Verdeel vullingen</p>
                          {additiveLinesDisplay.map(l => (
                            <div key={l.breadTypeId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                              <span style={{ fontSize: 12 }}>{l.name} ×{l.totalQty}</span>
                              <div style={{ display: "flex", gap: 4 }}>
                                {Array.from({ length: count }, (_, i) => i + 1).map(bn => (
                                  <button key={bn} onClick={() => setAdditiveAssignment(a => ({ ...a, [mg.group]: { ...(a[mg.group] ?? {}), [l.breadTypeId]: bn } }))}
                                    style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer", border: "1px solid", fontFamily: "var(--font-body)",
                                      borderColor: (assignment[l.breadTypeId] ?? 1) === bn ? "var(--accent)" : "var(--border)",
                                      background: (assignment[l.breadTypeId] ?? 1) === bn ? "var(--accent)" : "var(--surface)",
                                      color: (assignment[l.breadTypeId] ?? 1) === bn ? "white" : "var(--text-subtle)",
                                    }}>
                                    M{bn}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
          {batches.length > 0 && !showPlanEdit && planGroups.filter(mg => mg.totalLoaves > 0).length > 0 && (
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

          {/* ── Deeg calculator (always visible) ── */}
          {planGroups.length > 0 && (
            <section>
              <h2 style={{ fontSize: 15, fontWeight: 600, padding: "0 0 12px", color: "var(--text)", margin: 0 }}>Deeg calculator</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px,1fr))", gap: 16 }}>
                {planGroups.map(mg => <MixerGroupCard key={mg.group} mg={mg} weightsKg={weightsByGroup[mg.group] ?? [mg.totalDoughNoFillingsKg]} />)}
              </div>
            </section>
          )}

          {/* ── Desem + Manden ── */}
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px,1fr))", gap: 16 }}>
            <DesemTotaal groups={nextPlan?.mixerGroups ?? planGroups} deliveryDate={nextPlan?.deliveryDate ?? plan.deliveryDate} />
            {hasAny && <MandenTotaal lines={planLines} />}
          </section>

        </div>
      )}
    </div>
  );
}
