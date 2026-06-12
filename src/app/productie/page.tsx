"use client";
import { useRole } from "@/lib/role-context";
import React, { useEffect, useState } from "react";

const WEEKDAYS = ["","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];

type Topping = { name: string; gramsPerLoaf: number; waterRatio?: number | null };
type FlourLine = { name: string; percentage: number };
type RecipeInfo = { waterPct: number; desemPct: number; zoutPct: number; inwasPct: number; flourLines: FlourLine[] };
type BreadLine = {
  breadTypeId: string; slug: string; name: string; category: string;
  winkelQty: number; horecaQty: number; totalQty: number;
  doughWeightTotal: number; flourWeightTotal: number;
  toppingWeightPerLoaf: number; toppings: Topping[];
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

function g(v: number) { return `${Math.round(v)} g`; }
function fmt(n: number) { return n === 0 ? "—" : String(n); }

// ── Mixer ingredient breakdown ────────────────────────────────────────────────
function MixerIngredients({ mg, mixers }: { mg: MixerGroup; mixers: number }) {
  const r = mg.recipe;
  if (!r || mg.totalDoughNoFillingsKg === 0) return null;

  const baseDoughPerMixer = (mg.totalDoughNoFillingsKg * 1000) / mixers;
  const totalPct = 100 + r.waterPct + r.desemPct + r.zoutPct + r.inwasPct;
  const flourPerMixer = (baseDoughPerMixer / totalPct) * 100;

  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ fontSize: 12, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        Ingrediënten per mixer ({mixers}x)
      </p>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}>
        <p style={{ fontSize: 11, color: "var(--text-subtle)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Per mixer ({mixers}x hetzelfde)
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            {r.flourLines.map(f => (
              <tr key={f.name}>
                <td style={{ padding: "3px 0", color: "var(--text-muted)" }}>{f.name}</td>
                <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 600 }}>{g(flourPerMixer * f.percentage / 100)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "4px 0", color: "var(--text-muted)" }}>Water</td>
              <td style={{ padding: "4px 0", textAlign: "right", fontWeight: 600 }}>{g(flourPerMixer * r.waterPct / 100)}</td>
            </tr>
            <tr>
              <td style={{ padding: "3px 0", color: "var(--text-muted)" }}>Desem</td>
              <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 600 }}>{g(flourPerMixer * r.desemPct / 100)}</td>
            </tr>
            <tr>
              <td style={{ padding: "3px 0", color: "var(--text-muted)" }}>Zout</td>
              <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 600 }}>{g(flourPerMixer * r.zoutPct / 100)}</td>
            </tr>
            {r.inwasPct > 0 && (
              <tr>
                <td style={{ padding: "3px 0", color: "var(--text-muted)" }}>Inwas</td>
                <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 600 }}>{g(flourPerMixer * r.inwasPct / 100)}</td>
              </tr>
            )}
            <tr style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "4px 0", fontSize: 11, color: "var(--text-subtle)" }}>Totaal deeg</td>
              <td style={{ padding: "4px 0", textAlign: "right", fontSize: 11, color: "var(--text-subtle)" }}>{g(baseDoughPerMixer)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Vullingen in mixer ────────────────────────────────────────────────────────
type VullingMode = "mixer" | "hand" | "none";

function VullingenCalculator({ mg, mixers }: { mg: MixerGroup; mixers: number }) {
  // Skip rogge — no filling needed
  if (mg.group === "rogge") return null;

  // Group lines by bread slug (strip -15kg suffix to merge variants)
  // One entry per bread TYPE (olijf = one row with all toppings summed)
  type BreadEntry = {
    key: string;         // slug without -15kg
    label: string;       // display name without "1,5 KG"
    totalLoaves: number; // total loaves (1.5kg counts as 1.5 units)
    totalDough: number;  // pure dough grams (no fillings)
    totalFilling: number;// all fillings combined
  };

  const breadMap = new Map<string, BreadEntry>();

  for (const line of mg.lines) {
    if (line.toppings.length === 0 || line.totalQty === 0) continue;
    const key = line.slug.replace("-15kg", "");
    const label = line.name.replace(" 1,5 KG","").replace(" 1.5 KG","").trim();

    const doughPerLoaf = line.totalQty > 0
      ? (line.doughWeightTotal / line.totalQty) - line.toppingWeightPerLoaf
      : 0;
    const pureDough = Math.max(0, doughPerLoaf) * line.totalQty;
    const totalFilling = line.toppings.reduce((s, t) => s + t.gramsPerLoaf * line.totalQty, 0);
    // 1.5kg loaves count as 1.5 units for "aantal"
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

  const fullMixPerMixer = (mg.totalDoughNoFillingsKg * 1000) / mixers;
  const handEntries  = entries.filter(e => getMode(e.key) === "hand");
  const mixerEntries = entries.filter(e => getMode(e.key) === "mixer");
  const handDoughTotal  = handEntries.reduce((s, e) => s + e.totalDough, 0);
  const mixerDoughTotal = mixerEntries.reduce((s, e) => s + e.totalDough, 0);
  const boerenOut = Math.max(0, fullMixPerMixer - handDoughTotal - mixerDoughTotal);
  const hasAnySelected = handEntries.length > 0 || mixerEntries.length > 0;

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
              <td style={{ padding: "8px", textAlign: "right", fontWeight: 600 }}>
                {Number.isFinite(e.totalLoaves) ? Math.round(e.totalLoaves) : "—"}
              </td>
              <td style={{ padding: "8px", textAlign: "right", color: "var(--text-muted)" }}>{g(e.totalFilling)}</td>
              <td style={{ padding: "8px", textAlign: "center" }}>
                <input type="checkbox" checked={getMode(e.key) === "mixer"}
                  onChange={ev => setMode(e.key, ev.target.checked ? "mixer" : "none")} />
              </td>
              <td style={{ padding: "8px 0", textAlign: "center" }}>
                <input type="checkbox" checked={getMode(e.key) === "hand"}
                  onChange={ev => setMode(e.key, ev.target.checked ? "hand" : "none")} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {hasAnySelected && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 12, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            Werkwijze (1 mixer)
          </p>
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

// ── Desem totaal ──────────────────────────────────────────────────────────────
function DesemTotaal({ groups, deliveryDate }: { groups: MixerGroup[]; deliveryDate?: string }) {
  const [doorstarten, setDoorstarten] = useState(1000);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const isActive = (label: string) => active[label] ?? true;

  const rows = groups.filter(mg => mg.totalLoaves > 0).map(mg => {
    const r = mg.recipe;
    const flourKg = mg.flourWeightKg;
    const desemGrams = r ? flourKg * 1000 * r.desemPct / 100 : 0;
    return { label: mg.label, loaves: mg.totalLoaves, desemGrams };
  });

  const total = rows.filter(r => isActive(r.label)).reduce((s, r) => s + r.desemGrams, 0) + doorstarten;

  const delivLabel = deliveryDate ? (() => {
    const d = new Date(deliveryDate + "T12:00:00Z");
    return d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
  })() : null;

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid var(--border)", background: "#fef3c7" }}>
        <h2 style={{ fontSize: 16, margin: 0, color: "var(--accent)" }}>Desem totaal</h2>
        {delivLabel && (
          <p style={{ fontSize: 12, color: "var(--accent)", margin: "3px 0 0", fontWeight: 500 }}>
            Voor bakdag: {delivLabel}
          </p>
        )}
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
                  <input type="checkbox" checked={isActive(r.label)}
                    onChange={e => setActive(a => ({ ...a, [r.label]: e.target.checked }))} />
                </td>
              </tr>
            ))}
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "8px 0", color: "var(--text-muted)" }}>Doorstarten</td>
              <td style={{ padding: "8px", textAlign: "right" }}>1</td>
              <td style={{ padding: "8px 0", textAlign: "right" }}>
                <input type="number" value={doorstarten} onChange={e => setDoorstarten(parseInt(e.target.value)||0)}
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

// ── Manden totaal ──────────────────────────────────────────────────────────────
function MandenTotaal({ lines }: { lines: BreadLine[] }) {
  const get = (slug: string) => lines.find(l => l.slug === slug)?.totalQty ?? 0;

  const kleineMand = get("boeren-kl");
  const ruitjesOngebloemd = ["sesam","sesam-15kg","zaden","zaden-15kg","olijf","rozijn"].reduce((s,sl) => s + get(sl), 0);
  const ruitjesBloemd = ["boeren-gr","boeren-15kg","volkoren","volkoren-15kg"].reduce((s,sl) => s + get(sl), 0);
  const ruitjesTotaal = ruitjesOngebloemd + ruitjesBloemd;
  const mand15kg = ["boeren-15kg","sesam-15kg","zaden-15kg"].reduce((s,sl) => s + get(sl), 0);
  const rondeMand = ["olijf","rozijn","morning-buns"].reduce((s,sl) => s + get(sl), 0);

  const rows = [
    { label: "Kleine mand", count: kleineMand, note: "Boeren KL" },
    { label: "Ruitjes mand", count: ruitjesTotaal, note: `waarvan ${ruitjesOngebloemd} ongebloemd (met vullingen)` },
    { label: "1,5 kg mand", count: mand15kg, note: "Boeren, Sesam, Zaden 1,5 kg" },
    { label: "Ronde mand", count: rondeMand, note: "Olijf, Rozijn, Morning buns" },
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
              <td style={{ padding: "10px 16px", textAlign: "right" }}>
                <span className="badge badge-amber">{r.count}</span>
              </td>
              <td style={{ padding: "10px 20px", color: "var(--text-subtle)", fontSize: 12 }}>{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Mixer group card ──────────────────────────────────────────────────────────
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
        <span style={{ fontWeight: 500, textAlign: "right" }}>{(mg.totalDoughKg).toFixed(2)} kg</span>
        {mg.totalDoughNoFillingsKg !== mg.totalDoughKg && (
          <>
            <span style={{ color: "var(--text-muted)" }}>Zonder vullingen:</span>
            <span style={{ fontWeight: 500, textAlign: "right" }}>{mg.totalDoughNoFillingsKg.toFixed(2)} kg</span>
          </>
        )}
      </div>

      {/* Per-soort dough weights */}
      <button onClick={() => setShowDetails(!showDetails)} style={{
        background: "none", border: "none", cursor: "pointer", fontSize: 12,
        color: "var(--text-subtle)", padding: 0, display: "flex", alignItems: "center", gap: 4, marginBottom: 8,
      }}>
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

      {/* Mixer count selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Mixers:</span>
        <button onClick={() => setMixers(Math.max(1, mixers-1))} style={{
          width: 26, height: 26, borderRadius: "50%", border: "1px solid var(--border)",
          background: "var(--surface)", cursor: "pointer", fontSize: 15,
        }}>−</button>
        <span style={{ fontSize: 15, fontWeight: 600, minWidth: 16, textAlign: "center" }}>{mixers}</span>
        <button onClick={() => setMixers(Math.min(8, mixers+1))} style={{
          width: 26, height: 26, borderRadius: "50%", border: "1px solid var(--border)",
          background: "var(--surface)", cursor: "pointer", fontSize: 15,
        }}>+</button>
        <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>
          → {g((mg.totalDoughNoFillingsKg * 1000) / mixers)} per mixer
        </span>
      </div>

      {/* Ingredient breakdown per mixer */}
      <MixerIngredients mg={mg} mixers={mixers} />

      {/* Vullingen calculator */}
      <VullingenCalculator mg={mg} mixers={mixers} />
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function ProductiePage() {
  const { role } = useRole();
  const today = new Date().toISOString().slice(0,10);
  const [date, setDate] = useState(today);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [nextPlan, setNextPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function load(d: string) {
    setLoading(true); setError("");
    // Also fetch next production day for desem calculator
    const nextDate = (() => { const nd = new Date(d + "T12:00:00Z"); nd.setUTCDate(nd.getUTCDate() + 1); return nd.toISOString().slice(0,10); })();
    Promise.all([
      fetch(`/digitalbakery/api/production?date=${d}`, { headers: { "x-role": role ?? "" } }).then(r => r.json()),
      fetch(`/digitalbakery/api/production?date=${nextDate}`, { headers: { "x-role": role ?? "" } }).then(r => r.json()),
    ]).then(([data, nextData]) => {
      if (data.error) { setError(data.message ?? data.error); setLoading(false); return; }
      setPlan({ ...data, breadLines: data.breadLines ?? [], mixerGroups: data.mixerGroups ?? [] });
      if (!nextData.error) setNextPlan({ ...nextData, breadLines: nextData.breadLines ?? [], mixerGroups: nextData.mixerGroups ?? [] });
      setLoading(false);
    }).catch(e => { setError(String(e)); setLoading(false); });
  }

  useEffect(() => { load(date); }, [date]);
  function shift(days: number) {
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    setDate(d.toISOString().slice(0,10));
  }

  const prodLabel = plan ? `${WEEKDAYS[plan.weekday]} ${plan.productionDate}` : "";
  const delivWeekday = plan ? getWeekday(plan.deliveryDate) : 1;
  const delivLabel = plan ? `${WEEKDAYS[delivWeekday]} ${plan.deliveryDate}` : "";

  function getWeekday(date: string) {
    const d = new Date(date + "T12:00:00Z");
    const j = d.getUTCDay();
    return j === 0 ? 7 : j;
  }
  const hasAny = plan && plan.breadLines.some(l => l.totalQty > 0);

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 30, marginBottom: 8 }}>Productieoverzicht</h1>
          {plan && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px" }}>
                <p style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 2px" }}>📋 Productiedag</p>
                <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: "var(--text)" }}>{prodLabel}</p>
              </div>
              <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 14px" }}>
                <p style={{ fontSize: 11, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 2px" }}>🍞 Bakken & bezorgen</p>
                <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: "var(--accent)" }}>{delivLabel}</p>
              </div>
            </div>
          )}
        </div>
        <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => shift(-1)} className="btn-secondary" style={{ padding: "8px 12px" }}>←</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input" style={{ width: 150 }} />
          <button onClick={() => shift(1)} className="btn-secondary" style={{ padding: "8px 12px" }}>→</button>
          <button onClick={() => setDate(today)} className="btn-secondary">Vandaag</button>
          <button onClick={() => window.print()} className="btn-primary">🖨 Print</button>
        </div>
      </div>

      {loading && <p style={{ color: "var(--text-subtle)", padding: "3rem 0", textAlign: "center" }}>Laden…</p>}

      {!loading && error && (
        <div style={{ background: "var(--warn-bg)", border: "1px solid #fca5a5", borderRadius: 10, padding: "1rem 1.25rem", color: "var(--warn)", fontSize: 14, marginBottom: 16 }}>
          <strong>Fout:</strong> {error}
        </div>
      )}

      {!loading && !error && plan && (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

          {!hasAny && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                <p style={{ fontSize: 15, margin: "0 0 4px" }}>Geen bestellingen voor {delivLabel}</p>
                <p style={{ fontSize: 13, margin: 0, color: "var(--text-subtle)" }}>Desem hieronder is berekend voor de volgende bakdag.</p>
              </div>
              <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px,1fr))", gap: 16 }}>
                <DesemTotaal groups={nextPlan?.mixerGroups ?? plan.mixerGroups} deliveryDate={nextPlan?.deliveryDate ?? plan.deliveryDate} />
              </section>
            </div>
          )}

          {hasAny && (
            <>
              {/* Aantallen tabel */}
              <section className="card" style={{ overflow: "hidden" }}>
                <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                  <h2 style={{ fontSize: 16 }}>Aantallen — {delivLabel}</h2>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ textAlign: "left", padding: "10px 20px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>Broodsoort</th>
                      <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>W. Delft</th>
                      <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>W. DH</th>
                      <th style={{ textAlign: "right", padding: "10px 12px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>Horeca</th>
                      <th style={{ textAlign: "right", padding: "10px 20px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>Totaal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.breadLines.map((line, i) => (
                      <tr key={line.breadTypeId} style={{
                        borderTop: i > 0 ? "1px solid var(--border)" : "none",
                        opacity: line.totalQty === 0 ? 0.35 : 1,
                        background: (line as any).isBoerenMixPart ? "var(--surface-2)" : "transparent",
                      }}>
                        <td style={{ padding: "9px 20px" }}>
                          {line.name}
                          {(line as any).isBoerenMixPart && (
                            <span style={{ fontSize: 11, color: "var(--text-subtle)", marginLeft: 8 }}>÷4 van boerenmix</span>
                          )}
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--text-muted)" }}>{fmt((line as any).winkelDelftQty ?? line.winkelQty)}</td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--text-muted)" }}>{fmt((line as any).winkelDHQty ?? 0)}</td>
                        <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--text-muted)" }}>{fmt(line.horecaQty)}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right" }}>
                          {line.totalQty > 0 ? <span className="badge badge-amber">{line.totalQty}</span> : <span style={{ color: "var(--text-subtle)" }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              {/* Deeg calculator per mixer group */}
              <section>
                <h2 style={{ fontSize: 17, marginBottom: "1rem" }}>Deeg calculator</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px,1fr))", gap: 16 }}>
                  {plan.mixerGroups.map(mg => <MixerGroupCard key={mg.group} mg={mg} />)}
                </div>
              </section>

              {/* Desem & Manden side by side at bottom */}
              <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px,1fr))", gap: 16 }}>
                <DesemTotaal groups={nextPlan?.mixerGroups ?? plan.mixerGroups} deliveryDate={nextPlan?.deliveryDate ?? plan.deliveryDate} />
                <MandenTotaal lines={plan.breadLines} />
              </section>
            </>
          )}

        </div>
      )}
    </div>
  );
}
