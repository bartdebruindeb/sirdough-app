"use client";
import { useRole } from "@/lib/role-context";
import { useEffect, useRef, useState } from "react";
import { breadImageUrls } from "@/lib/breadImage";


type RecipeFlour  = { id?: string; name: string; percentage: number; sortOrder?: number };
type RecipeTopping = { id?: string; name: string; gramsPerLoaf: number; waterRatio?: number | null; requiresKoking: boolean };
type Recipe = {
  waterPct: number; desemPct: number; zoutPct: number; inwasPct: number;
  doughWeightPerLoaf: number; mixerGroup: string; notes?: string;
  flourLines: RecipeFlour[]; toppings: RecipeTopping[];
};
type DoughType = {
  id: string; name: string; slug: string; notes?: string | null;
  waterPct: number; desemPct: number; zoutPct: number; inwasPct: number;
  flourLines: RecipeFlour[]; extras: RecipeFlour[];
};
type BreadType = {
  id: string; name: string; slug: string; category: string; sortOrder: number; weightGrams: number;
  basketType: string; basketStyle?: string | null; showInProduction?: boolean; imageFile?: string | null;
  doughTypeId?: string | null; doughType?: DoughType | null;
  recipe: Recipe | null;
};

function kg(g: number) { return g >= 1000 ? `${(g/1000).toFixed(2).replace(/\.?0+$/,"")} kg` : `${Math.round(g)} g`; }

function RecipeWorkerView({ bt, qty }: { bt: BreadType; qty: number }) {
  const r = bt.recipe;
  if (!r) return <p style={{ color: "var(--text-subtle)", fontSize: 13, fontStyle: "italic" }}>Geen recept</p>;
  const dt = bt.doughType;
  const n = qty || 1;
  // doughWeightPerLoaf is the TOTAL loaf weight including fillings — the dough
  // actually mixed is that total minus the toppings/vullingen weight.
  const toppingTotal = r.toppings.reduce((s, t) => s + t.gramsPerLoaf, 0);
  const pureDough = Math.max(0, r.doughWeightPerLoaf - toppingTotal);
  const totalDough = n * pureDough;
  const waterPct = dt?.waterPct ?? r.waterPct;
  const desemPct = dt?.desemPct ?? r.desemPct;
  const zoutPct  = dt?.zoutPct  ?? r.zoutPct;
  const inwasPct = dt?.inwasPct ?? r.inwasPct;
  const flourLines = dt?.flourLines ?? r.flourLines;
  const extras = dt?.extras ?? [];
  const extrasPct = extras.reduce((s, e) => s + e.percentage, 0);
  const totalPct = 100 + waterPct + desemPct + zoutPct + inwasPct + extrasPct;
  const flourTotal = (totalDough / totalPct) * 100;

  return (
    <div style={{ fontSize: 13 }}>
      {dt && (
        <p style={{ fontSize: 11, color: "var(--text-subtle)", margin: "0 0 8px" }}>
          Basisrecept: <strong>{dt.name}</strong> (gedeeld met andere broodsoorten)
        </p>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
        <tbody>
          {flourLines.map((f, i) => (
            <tr key={f.id ?? i} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "7px 0", color: "var(--text-muted)" }}>{f.name}</td>
              <td style={{ padding: "7px 0", textAlign: "right", fontWeight: 500 }}>{kg(flourTotal * f.percentage / 100)}</td>
            </tr>
          ))}
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <td style={{ padding: "7px 0", color: "var(--text-muted)" }}>Water</td>
            <td style={{ padding: "7px 0", textAlign: "right", fontWeight: 500 }}>{kg(flourTotal * waterPct / 100)}</td>
          </tr>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <td style={{ padding: "7px 0", color: "var(--text-muted)" }}>Desem</td>
            <td style={{ padding: "7px 0", textAlign: "right", fontWeight: 500 }}>{kg(flourTotal * desemPct / 100)}</td>
          </tr>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <td style={{ padding: "7px 0", color: "var(--text-muted)" }}>Zout</td>
            <td style={{ padding: "7px 0", textAlign: "right", fontWeight: 500 }}>{kg(flourTotal * zoutPct / 100)}</td>
          </tr>
          {inwasPct > 0 && (
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "7px 0", color: "var(--text-muted)" }}>Inwas</td>
              <td style={{ padding: "7px 0", textAlign: "right", fontWeight: 500 }}>{kg(flourTotal * inwasPct / 100)}</td>
            </tr>
          )}
          {extras.map((e, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "7px 0", color: "var(--text-muted)" }}>{e.name}</td>
              <td style={{ padding: "7px 0", textAlign: "right", fontWeight: 500 }}>{kg(flourTotal * e.percentage / 100)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {r.toppings.length > 0 && (
        <>
          <p style={{ fontWeight: 500, color: "var(--text-muted)", marginBottom: 4, marginTop: 8 }}>Toevoegingen</p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {r.toppings.map(t => (
                <tr key={t.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 0", color: "var(--text-muted)" }}>{t.name}</td>
                  <td style={{ padding: "6px 0", textAlign: "right" }}>{kg(t.gramsPerLoaf * n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {r.notes && <p style={{ color: "var(--text-subtle)", fontStyle: "italic", marginTop: 8, marginBottom: 0 }}>{r.notes}</p>}
    </div>
  );
}

function RecipeOwnerEdit({ bt, onSaved, allCategories, allBreadTypes, basketTypeOptions, doughTypes }: { bt: BreadType; onSaved: () => void; allCategories: string[]; allBreadTypes: BreadType[]; basketTypeOptions: string[]; doughTypes: DoughType[] }) {
  const r = bt.recipe;
  const [doughTypeId, setDoughTypeId] = useState(bt.doughTypeId ?? "");
  const [waterPct,  setWater]  = useState(r?.waterPct  ?? 71.5);
  const [desemPct,  setDesem]  = useState(r?.desemPct  ?? 15);
  const [zoutPct,   setZout]   = useState(r?.zoutPct   ?? 2);
  const [inwasPct,  setInwas]  = useState(r?.inwasPct  ?? 6);
  const [doughWeight, setDough] = useState(r?.doughWeightPerLoaf ?? 1000);
  const [basketType, setBasketType] = useState(bt.basketType ?? "");
  const [basketStyle, setBasketStyle] = useState(bt.basketStyle ?? "");
  const [category, setCategory] = useState(bt.category ?? "");
  const [showInProduction, setShowInProduction] = useState(bt.showInProduction ?? true);
  const [mixerGroup, setMixerGroup] = useState((bt as any).mixerGroup ?? "");
  const [notes,     setNotes]  = useState(r?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [flourLines, setFlourLines] = useState<{name:string;percentage:number}[]>(
    r?.flourLines ?? [{ name: "Tarwebloem", percentage: 100 }]
  );
  const [toppings, setToppings] = useState<RecipeTopping[]>(r?.toppings ?? []);

  const flourSum = flourLines.reduce((s, f) => s + f.percentage, 0);
  const selectedDoughType = doughTypes.find(d => d.id === doughTypeId) ?? null;

  async function save() {
    setSaving(true);
    if (basketType !== bt.basketType || category !== bt.category || basketStyle !== (bt.basketStyle ?? "") || showInProduction !== (bt.showInProduction ?? true) || mixerGroup !== ((bt as any).mixerGroup ?? "") || doughTypeId !== (bt.doughTypeId ?? "")) {
      await fetch("/api/bread-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-role": "OWNER" },
        body: JSON.stringify({ id: bt.id, basketType, basketStyle: basketStyle || null, category, showInProduction, mixerGroup: mixerGroup || null, doughTypeId: doughTypeId || null }),
      });
    }
    await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": "OWNER" },
      body: JSON.stringify({
        breadTypeId: bt.id, waterPct, desemPct, zoutPct, inwasPct,
        doughWeightPerLoaf: doughWeight, notes,
        flourLines: flourLines.map((f, i) => ({ ...f, sortOrder: i })),
        toppings: toppings.map((t, i) => ({ ...t, sortOrder: i })),
      }),
    });
    setSaving(false);
    onSaved();
  }

  const inputStyle = { border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 13, background: "var(--surface)", width: "80px" };

  return (
    <div style={{ fontSize: 13 }}>
      {/* Shared base recipe (dough type) */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Basisrecept</label>
        <select value={doughTypeId} onChange={e => setDoughTypeId(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
          <option value="">— eigen percentages (niet gedeeld) —</option>
          {doughTypes.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <p style={{ fontSize: 11, color: "var(--text-subtle)", margin: "4px 0 0" }}>
          Koppel aan een basisrecept om bloem/water/desem/zout% te delen met andere broodsoorten. Beheer basisrecepten bovenaan de pagina.
        </p>
      </div>

      {/* Baker's percentages — editable only when NOT linked to a shared dough type */}
      {selectedDoughType ? (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
          <p style={{ fontSize: 11, color: "var(--text-subtle)", margin: "0 0 6px" }}>Percentages van basisrecept "{selectedDoughType.name}" (bewerk via Basisrecepten):</p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {(selectedDoughType.flourLines ?? []).map((f, i) => (
                <tr key={i}><td style={{ padding: "3px 0", color: "var(--text-muted)" }}>{f.name}</td><td style={{ padding: "3px 0", textAlign: "right" }}>{f.percentage}%</td></tr>
              ))}
              <tr><td style={{ padding: "3px 0", color: "var(--text-muted)" }}>Water</td><td style={{ padding: "3px 0", textAlign: "right" }}>{selectedDoughType.waterPct}%</td></tr>
              <tr><td style={{ padding: "3px 0", color: "var(--text-muted)" }}>Desem</td><td style={{ padding: "3px 0", textAlign: "right" }}>{selectedDoughType.desemPct}%</td></tr>
              <tr><td style={{ padding: "3px 0", color: "var(--text-muted)" }}>Zout</td><td style={{ padding: "3px 0", textAlign: "right" }}>{selectedDoughType.zoutPct}%</td></tr>
              <tr><td style={{ padding: "3px 0", color: "var(--text-muted)" }}>Inwas</td><td style={{ padding: "3px 0", textAlign: "right" }}>{selectedDoughType.inwasPct}%</td></tr>
              {(selectedDoughType.extras ?? []).map((e, i) => (
                <tr key={`extra-${i}`}><td style={{ padding: "3px 0", color: "var(--text-muted)" }}>{e.name}</td><td style={{ padding: "3px 0", textAlign: "right" }}>{e.percentage}%</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "6px 0", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11, textTransform: "uppercase" }}>Ingredient</th>
              <th style={{ textAlign: "right", padding: "6px 0", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11, textTransform: "uppercase" }}>%</th>
            </tr>
          </thead>
          <tbody>
            {flourLines.map((f, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "7px 0" }}>
                  <input value={f.name} onChange={e => setFlourLines(fl => fl.map((x,j) => j===i ? {...x,name:e.target.value} : x))}
                    style={{ ...inputStyle, width: "160px" }} />
                </td>
                <td style={{ padding: "7px 0", textAlign: "right" }}>
                  <input type="number" min={0} max={999} onKeyDown={e=>{if(["e","E","-","+"].includes(e.key))e.preventDefault()}} value={f.percentage} onChange={e => setFlourLines(fl => fl.map((x,j) => j===i ? {...x,percentage:Math.min(999,parseFloat(e.target.value)||0)} : x))}
                    style={inputStyle} />
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={2} style={{ padding: "6px 0" }}>
                <button onClick={() => setFlourLines(fl => [...fl, { name: "", percentage: 0 }])}
                  style={{ background: "none", border: "1px dashed var(--border-strong)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>
                  + Bloem toevoegen
                </button>
                {flourSum !== 100 && <span style={{ color: "var(--danger)", marginLeft: 8 }}>Som = {flourSum}% (moet 100% zijn)</span>}
              </td>
            </tr>
            {[
              ["Water", waterPct, setWater], ["Desem", desemPct, setDesem],
              ["Zout",  zoutPct,  setZout],  ["Inwas", inwasPct, setInwas],
            ].map(([label, val, setter]: any) => (
              <tr key={label} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "7px 0", color: "var(--text-muted)" }}>{label}</td>
                <td style={{ padding: "7px 0", textAlign: "right" }}>
                  <input type="number" max={999} onKeyDown={e=>{if(["e","E","-","+"].includes(e.key))e.preventDefault()}} step="0.5" value={val} onChange={e => setter(Math.min(999,parseFloat(e.target.value)||0))} style={inputStyle} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div>
          <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Totaalgewicht / brood (g, incl. vulling)</label>
          <input type="number" onKeyDown={e=>{if(["e","E","-","+"].includes(e.key))e.preventDefault()}} value={doughWeight} onChange={e => setDough(parseFloat(e.target.value)||0)} style={{ ...inputStyle, width: "100%" }} />
        </div>
        <div>
          {/* total% removed — auto-computed from water+desem+zout+inwas+100 */}
        </div>
      </div>

      {/* Toppings / fillings — per bread type, independent of shared dough type */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Vullingen / toevoegingen</label>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {toppings.map((t, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "5px 4px 5px 0" }}>
                  <input value={t.name} onChange={e => setToppings(ts => ts.map((x,j) => j===i ? {...x,name:e.target.value} : x))}
                    placeholder="bijv. Sesam" style={{ ...inputStyle, width: "130px" }} />
                </td>
                <td style={{ padding: "5px 4px" }}>
                  <input type="number" min={0} max={999} onKeyDown={e=>{if(["e","E","-","+"].includes(e.key))e.preventDefault()}} value={t.gramsPerLoaf}
                    onChange={e => setToppings(ts => ts.map((x,j) => j===i ? {...x,gramsPerLoaf:Math.min(999,parseFloat(e.target.value)||0)} : x))}
                    style={{ ...inputStyle, width: "70px" }} title="Gram per brood" />
                </td>
                <td style={{ padding: "5px 4px", fontSize: 11, color: "var(--text-subtle)" }}>g/brood</td>
                <td style={{ padding: "5px 0", textAlign: "right" }}>
                  <button onClick={() => setToppings(ts => ts.filter((_,j) => j!==i))}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: 16, padding: "0 4px" }}>×</button>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={4} style={{ padding: "6px 0" }}>
                <button onClick={() => setToppings(ts => [...ts, { name: "", gramsPerLoaf: 0, requiresKoking: false }])}
                  style={{ background: "none", border: "1px dashed var(--border-strong)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>
                  + Vulling toevoegen
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        {(() => {
          const toppingTotal = toppings.reduce((s, t) => s + (t.gramsPerLoaf || 0), 0);
          const pureDough = Math.max(0, doughWeight - toppingTotal);
          return (
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0" }}>
              Totaal gewicht (deeg {kg(pureDough)} + vulling {kg(toppingTotal)}) = <strong style={{ color: "var(--text)" }}>{kg(doughWeight)}</strong> per brood
            </p>
          );
        })()}
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Categorie</label>
        <select value={category} onChange={e => setCategory(e.target.value)}
          style={{ ...inputStyle, width: "100%", marginBottom: 10 }}>
          {[...new Set([...allCategories, category])].filter(Boolean).map(c => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
        <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Mandformaat</label>
        <select value={basketType} onChange={e => setBasketType(e.target.value)}
          style={{ ...inputStyle, width: "100%", marginBottom: 10 }}>
          <option value="">— geen mand —</option>
          {basketTypeOptions.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {basketType && (
          <>
            <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Mandstijl</label>
            <select value={basketStyle} onChange={e => setBasketStyle(e.target.value)}
              style={{ ...inputStyle, width: "100%", marginBottom: 10 }}>
              <option value="">— kies stijl —</option>
              <option value="gebloemd">Gebloemd</option>
              <option value="ongebloemd">Ongebloemd</option>
            </select>
          </>
        )}
        <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Notities</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          style={{ ...inputStyle, width: "100%", resize: "vertical" }} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer", fontSize: 13 }}>
          <input type="checkbox" checked={showInProduction} onChange={e => setShowInProduction(e.target.checked)} style={{ width: 16, height: 16 }} />
          Toon in productieplanning
          <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>(uitschakelen = verschijnt alleen in bestellingen en bezorging)</span>
        </label>
      </div>

      <button onClick={save} disabled={saving || flourSum !== 100} className="btn-primary" style={{ fontSize: 13, padding: "7px 16px" }}>
        {saving ? "Opslaan…" : "Recept opslaan"}
      </button>
    </div>
  );
}

function NewBreadTypeModal({ onClose, onSaved, existingCategories, basketTypeOptions }: {
  onClose: () => void; onSaved: () => void; existingCategories: string[]; basketTypeOptions: string[];
}) {
  const allCats = [...new Set([...existingCategories.length ? existingCategories : ["boeren","baguette","spelt","volkoren","rogge","zoet"]])];
  const [name, setName] = useState("");
  const [category, setCategory] = useState(allCats[0] ?? "boeren");
  const [weightGrams, setWeightGrams] = useState(1010);
  const [basketType, setBasketType] = useState("");
  const [basketStyle, setBasketStyle] = useState("");
  const [showInProduction, setShowInProduction] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toSlug(n: string) {
    return n.toLowerCase()
      .replace(/[àáâã]/g,"a").replace(/[èéêë]/g,"e").replace(/[ìíî]/g,"i")
      .replace(/[òóôõ]/g,"o").replace(/[ùúû]/g,"u")
      .replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
  }

  async function save() {
    if (!name.trim()) { setError("Naam is verplicht."); return; }
    setSaving(true); setError("");
    const res = await fetch("/api/bread-types", {
      method:"POST", headers:{"Content-Type":"application/json","x-role":"OWNER"},
      body:JSON.stringify({ name:name.trim(), slug:toSlug(name.trim()), category, weightGrams, basketType, basketStyle: basketStyle || null, showInProduction }),
    });
    setSaving(false);
    if (res.ok) onSaved();
    else { const d=await res.json(); setError(d.message??"Opslaan mislukt."); }
  }

  const inp:React.CSSProperties = {border:"1px solid var(--border)",borderRadius:8,padding:"8px 12px",fontSize:14,background:"var(--surface)",width:"100%"};

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(28,16,9,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,padding:24}}>
      <div style={{background:"var(--surface)",borderRadius:14,width:"100%",maxWidth:420,padding:"1.75rem",display:"flex",flexDirection:"column",gap:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h2 style={{margin:0,fontSize:20}}>Nieuw broodsoort</h2>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"var(--text-subtle)"}}>×</button>
        </div>
        <div>
          <label style={{fontSize:12,color:"var(--text-subtle)",textTransform:"uppercase",display:"block",marginBottom:5}}>Naam</label>
          <input value={name} onChange={e=>setName(e.target.value)} style={inp} placeholder="bijv. Spelt Rozijn" autoFocus />
          {name&&<p style={{fontSize:11,color:"var(--text-subtle)",margin:"3px 0 0"}}>ID: {toSlug(name)}</p>}
        </div>
        <div>
          <label style={{fontSize:12,color:"var(--text-subtle)",textTransform:"uppercase",display:"block",marginBottom:5}}>Categorie</label>
          <select value={category} onChange={e=>setCategory(e.target.value)} style={inp}>
            {allCats.map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
          </select>
          <p style={{fontSize:11,color:"var(--text-subtle)",margin:"3px 0 0"}}>Nieuwe categorie toevoegen via "Categorieën beheren".</p>
        </div>
        <div>
          <label style={{fontSize:12,color:"var(--text-subtle)",textTransform:"uppercase",display:"block",marginBottom:5}}>Deeggewicht per brood (g)</label>
          <input type="number" onKeyDown={e=>{if(["e","E","-","+"].includes(e.key))e.preventDefault()}} value={weightGrams} onChange={e=>setWeightGrams(parseInt(e.target.value)||1000)} style={inp} />
        </div>
        <div>
          <label style={{fontSize:12,color:"var(--text-subtle)",textTransform:"uppercase",display:"block",marginBottom:5}}>Mandformaat</label>
          <select value={basketType} onChange={e=>setBasketType(e.target.value)} style={inp}>
            <option value="">— geen mand —</option>
            {basketTypeOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        {basketType && (
          <div>
            <label style={{fontSize:12,color:"var(--text-subtle)",textTransform:"uppercase",display:"block",marginBottom:5}}>Mandstijl</label>
            <select value={basketStyle} onChange={e=>setBasketStyle(e.target.value)} style={inp}>
              <option value="">— kies stijl —</option>
              <option value="gebloemd">Gebloemd</option>
              <option value="ongebloemd">Ongebloemd</option>
            </select>
          </div>
        )}
        <label style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer",fontSize:13,padding:"10px 12px",borderRadius:8,border:"1px solid var(--border)",background:showInProduction?"var(--surface)":"#fef3c7"}}>
          <input type="checkbox" checked={!showInProduction} onChange={e=>setShowInProduction(!e.target.checked)} style={{width:16,height:16,marginTop:1,flexShrink:0}} />
          <div>
            <span style={{fontWeight:500}}>Geen productie</span>
            <p style={{fontSize:11,color:"var(--text-subtle)",margin:"2px 0 0"}}>
              Verschijnt in bestellingen en bezorging, maar niet op het productievel. Recept invullen is niet verplicht.
            </p>
          </div>
        </label>
        {error&&<p style={{color:"var(--danger)",background:"var(--danger-bg)",padding:"8px 12px",borderRadius:8,fontSize:13,margin:0}}>{error}</p>}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button onClick={onClose} className="btn-secondary">Annuleren</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving?"Aanmaken…":"Aanmaken"}</button>
        </div>
      </div>
    </div>
  );
}

function BreadImageUpload({ bt, role, onUploaded }: { bt: BreadType; role: string | null; onUploaded: (imageFile: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/bread-types/image?id=${bt.id}`, {
      method: "POST",
      headers: { "x-role": role ?? "" },
      body: form,
    }).then(r => r.json()).catch(() => ({}));
    setUploading(false);
    if (res.imageFile) onUploaded(res.imageFile);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 1rem" }}>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="btn-secondary"
        style={{ fontSize: 11, padding: "4px 10px" }}
      >
        {uploading ? "…" : "Wijzig foto"}
      </button>
    </div>
  );
}

// ─── Dough type (shared base recipe) editor ─────────────────────────────────
function DoughTypeEditor({ dt, onSaved, onDeleted }: { dt: DoughType; onSaved: () => void; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(dt.name);
  const [waterPct, setWater] = useState(dt.waterPct);
  const [desemPct, setDesem] = useState(dt.desemPct);
  const [zoutPct,  setZout]  = useState(dt.zoutPct);
  const [inwasPct, setInwas] = useState(dt.inwasPct);
  const [flourLines, setFlourLines] = useState<{name:string;percentage:number}[]>(
    (dt.flourLines ?? []).length > 0 ? dt.flourLines.map(f => ({ name: f.name, percentage: f.percentage })) : [{ name: "Tarwebloem", percentage: 100 }]
  );
  const [extras, setExtras] = useState<{name:string;percentage:number}[]>(
    (dt.extras ?? []).map(e => ({ name: e.name, percentage: e.percentage }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  const flourSum = flourLines.reduce((s, f) => s + f.percentage, 0);
  const inputStyle = { border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 13, background: "var(--surface)", width: "80px" };

  async function save() {
    setSaving(true); setError("");
    await fetch("/api/dough-types", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": "OWNER" },
      body: JSON.stringify({
        id: dt.id, name, slug: dt.slug, waterPct, desemPct, zoutPct, inwasPct,
        flourLines: flourLines.map((f, i) => ({ ...f, sortOrder: i })),
        extras: extras.map((e, i) => ({ ...e, sortOrder: i })),
      }),
    });
    setSaving(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
    onSaved();
  }

  async function del() {
    if (!confirm(`Basisrecept "${dt.name}" verwijderen?`)) return;
    const res = await fetch(`/api/dough-types?id=${dt.id}`, { method: "DELETE", headers: { "x-role": "OWNER" } });
    if (res.status === 409) { const d = await res.json(); setError(d.message ?? "Kan niet verwijderen."); return; }
    onDeleted();
  }

  return (
    <div className="card" style={{ marginBottom: 10, overflow: "hidden" }}>
      <button onClick={() => setOpen(v => !v)} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0.85rem 1.25rem", background: "none", border: "none", cursor: "pointer", textAlign: "left",
      }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{name}</span>
        <span style={{ color: "var(--text-subtle)", fontSize: 13, transform: open ? "rotate(180deg)" : "none", transition: "0.2s" }}>↓</span>
      </button>
      {open && (
      <div style={{ padding: "0 1.25rem 1.25rem" }}>
      <input value={name} onChange={e => setName(e.target.value)}
        style={{ ...inputStyle, width: "100%", fontWeight: 600, fontSize: 14, marginBottom: 10 }} />
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
        <tbody>
          {flourLines.map((f, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "6px 4px 6px 0" }}>
                <input value={f.name} onChange={e => setFlourLines(fl => fl.map((x,j) => j===i ? {...x,name:e.target.value} : x))}
                  style={{ ...inputStyle, width: "160px" }} />
              </td>
              <td style={{ padding: "6px 0", textAlign: "right" }}>
                <input type="number" min={0} max={999} onKeyDown={e=>{if(["e","E","-","+"].includes(e.key))e.preventDefault()}} value={f.percentage}
                  onChange={e => setFlourLines(fl => fl.map((x,j) => j===i ? {...x,percentage:Math.min(999,parseFloat(e.target.value)||0)} : x))}
                  style={inputStyle} />
              </td>
              <td style={{ padding: "6px 0 6px 4px", textAlign: "right" }}>
                <button onClick={() => setFlourLines(fl => fl.filter((_,j) => j!==i))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: 16, padding: "0 4px" }}>×</button>
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={3} style={{ padding: "6px 0" }}>
              <button onClick={() => setFlourLines(fl => [...fl, { name: "", percentage: 0 }])}
                style={{ background: "none", border: "1px dashed var(--border-strong)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>
                + Bloem toevoegen
              </button>
              {flourSum !== 100 && <span style={{ color: "var(--danger)", marginLeft: 8, fontSize: 12 }}>Som = {flourSum}% (moet 100% zijn)</span>}
            </td>
          </tr>
          {[
            ["Water", waterPct, setWater], ["Desem", desemPct, setDesem],
            ["Zout",  zoutPct,  setZout],  ["Inwas", inwasPct, setInwas],
          ].map(([label, val, setter]: any) => (
            <tr key={label} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "6px 0", color: "var(--text-muted)" }}>{label}</td>
              <td style={{ padding: "6px 0", textAlign: "right" }}>
                <input type="number" max={999} onKeyDown={e=>{if(["e","E","-","+"].includes(e.key))e.preventDefault()}} step="0.5" value={val} onChange={e => setter(Math.min(999,parseFloat(e.target.value)||0))} style={inputStyle} />
              </td>
              <td />
            </tr>
          ))}
          {extras.map((ex, i) => (
            <tr key={`extra-${i}`} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "6px 4px 6px 0" }}>
                <input value={ex.name} onChange={e => setExtras(xs => xs.map((x,j) => j===i ? {...x,name:e.target.value} : x))}
                  placeholder="bijv. Boter" style={{ ...inputStyle, width: "160px" }} />
              </td>
              <td style={{ padding: "6px 0", textAlign: "right" }}>
                <input type="number" max={999} onKeyDown={e=>{if(["e","E","-","+"].includes(e.key))e.preventDefault()}} step="0.5" value={ex.percentage}
                  onChange={e => setExtras(xs => xs.map((x,j) => j===i ? {...x,percentage:Math.min(999,parseFloat(e.target.value)||0)} : x))}
                  style={inputStyle} />
              </td>
              <td style={{ padding: "6px 0 6px 4px", textAlign: "right" }}>
                <button onClick={() => setExtras(xs => xs.filter((_,j) => j!==i))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: 16, padding: "0 4px" }}>×</button>
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={3} style={{ padding: "6px 0" }}>
              <button onClick={() => setExtras(xs => [...xs, { name: "", percentage: 0 }])}
                style={{ background: "none", border: "1px dashed var(--border-strong)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>
                + Extra ingrediënt toevoegen
              </button>
              <span style={{ fontSize: 11, color: "var(--text-subtle)", marginLeft: 8 }}>bijv. Boter — % van bloemgewicht</span>
            </td>
          </tr>
        </tbody>
      </table>
      {error && <p style={{ color: "var(--danger)", fontSize: 12, margin: "0 0 8px" }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={del} style={{ fontSize: 12, padding: "6px 12px", background: "none", border: "1px solid #fca5a5", borderRadius: 7, cursor: "pointer", color: "var(--danger)" }}>
          Verwijderen
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {savedFlash && <span style={{ fontSize: 12, color: "var(--success)", fontWeight: 500 }}>✓ Wijzigingen opgeslagen</span>}
          <button onClick={save} disabled={saving || flourSum !== 100} className="btn-primary" style={{ fontSize: 13 }}>
            {saving ? "Opslaan…" : "Basisrecept opslaan"}
          </button>
        </div>
      </div>
      </div>
      )}
    </div>
  );
}

function DoughTypeManager({ doughTypes, onChanged }: { doughTypes: DoughType[]; onChanged: () => void }) {
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");

  function toSlug(n: string) {
    return n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  async function createNew() {
    if (!newName.trim()) return;
    await fetch("/api/dough-types", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": "OWNER" },
      body: JSON.stringify({
        name: newName.trim(), slug: toSlug(newName.trim()),
        waterPct: 71.5, desemPct: 15, zoutPct: 2, inwasPct: 6,
        flourLines: [{ name: "Tarwebloem", percentage: 100, sortOrder: 0 }],
      }),
    });
    setNewName(""); setShowNew(false);
    onChanged();
  }

  return (
    <div className="card" style={{ padding: "1.25rem 1.5rem", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <h3 style={{ fontSize: 14, margin: 0 }}>Basisrecepten</h3>
        <button onClick={() => setShowNew(v => !v)} className="btn-secondary" style={{ fontSize: 12 }}>
          {showNew ? "Annuleren" : "+ Nieuw basisrecept"}
        </button>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
        Een basisrecept bevat de bakkers-percentages (bloem/water/desem/zout/inwas) die je op één plek beheert
        en aan meerdere broodsoorten kunt koppelen (bijv. Boerenbrood, Boeren Sesam, Boeren Zaden delen hetzelfde deeg).
        Vullingen en deeggewicht blijven per broodsoort instelbaar via "Bewerken".
      </p>
      {showNew && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="bijv. Boerenmix"
            style={{ border: "1px solid var(--border)", borderRadius: 7, padding: "6px 10px", fontSize: 13, flex: 1 }}
            onKeyDown={e => e.key === "Enter" && createNew()} autoFocus />
          <button onClick={createNew} className="btn-primary" style={{ fontSize: 13 }}>Aanmaken</button>
        </div>
      )}
      {doughTypes.length === 0 && !showNew && (
        <p style={{ fontSize: 13, color: "var(--text-subtle)", textAlign: "center", padding: "1rem 0" }}>
          Nog geen basisrecepten. Klik op "Nieuw basisrecept" om te starten.
        </p>
      )}
      {doughTypes.map(dt => <DoughTypeEditor key={dt.id} dt={dt} onSaved={onChanged} onDeleted={onChanged} />)}
    </div>
  );
}

export default function ReceptenPage() {
  const { role, can } = useRole();
  const isOwner = role === "OWNER";
  const [breadTypes, setBreadTypes] = useState<BreadType[]>([]);
  const [doughTypes, setDoughTypes] = useState<DoughType[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [qty] = useState(1);
  const [editMode, setEditMode] = useState<Record<string, boolean>>({});
  const [showNewBread, setShowNewBread] = useState(false);
  const [showCatManager, setShowCatManager] = useState(false);
  const [showBasketManager, setShowBasketManager] = useState(false);
  const [showDoughManager, setShowDoughManager] = useState(false);
  const [basketTypes, setBasketTypes] = useState<string[]>(["750 gram","rond","1 kg","1,5 kg"]);
  const [newBasketName, setNewBasketName] = useState("");
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [renamingCat, setRenamingCat] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<BreadType | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    setLoading(true);
    fetch("/api/recipes", { headers: { "x-role": role ?? "" } })
      .then(r => r.json())
      .then(d => { setBreadTypes(d.breadTypes ?? []); setDoughTypes(d.doughTypes ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  async function loadSettings() {
    const d = await fetch("/api/settings", { headers: { "x-role": role ?? "" } }).then(r => r.json()).catch(() => ({}));
    if (d.basketTypes?.length) setBasketTypes(d.basketTypes);
    if (d.extraCategories) setExtraCategories(d.extraCategories);
  }

  async function saveBasketTypes(types: string[]) {
    setBasketTypes(types);
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json", "x-role": role ?? "" }, body: JSON.stringify({ basketTypes: types }) });
  }

  async function saveExtraCategories(cats: string[]) {
    setExtraCategories(cats);
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json", "x-role": role ?? "" }, body: JSON.stringify({ extraCategories: cats }) });
  }

  async function renameCategory(from: string, to: string) {
    if (!to.trim() || to === from) return;
    const toName = to.trim().toLowerCase();
    await fetch("/api/bread-types", { method: "PUT", headers: { "Content-Type": "application/json", "x-role": role ?? "" }, body: JSON.stringify({ from, to: toName }) });
    // update extraCategories if needed
    const newExtra = extraCategories.map(c => c === from ? toName : c);
    await saveExtraCategories(newExtra);
    load();
    setRenamingCat(null);
  }

  useEffect(() => { load(); loadSettings(); }, []);

  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/bread-types?id=${deleteTarget.id}`, { method: "DELETE", headers: { "x-role": role ?? "" } });
    const data = await res.json().catch(() => ({}));
    setDeleting(false);
    setDeleteTarget(null);
    if (data.deleted) setDeleteMsg(`✓ Verwijderd.`);
    else if (data.deactivated) setDeleteMsg(`Broodsoort heeft bestellingen — gedeactiveerd (niet zichtbaar voor klanten).`);
    else setDeleteMsg(`Fout bij verwijderen.`);
    setTimeout(() => setDeleteMsg(null), 5000);
    load();
  }

  const categories = [...new Set([...breadTypes.map(b => b.category), ...extraCategories])];

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 860 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 30, marginBottom: 4 }}>Recepten</h1>
          <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 13 }}>
            {isOwner ? "Bekijk en bewerk bakkers-percentages per broodsoort" : "Grammen en ml voor 1 brood"}
          </p>
          {deleteMsg && <p style={{ fontSize: 13, color: deleteMsg.startsWith("✓") ? "var(--accent)" : "var(--text-subtle)", margin: "4px 0 0" }}>{deleteMsg}</p>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isOwner && (
            <>
              <button onClick={() => setShowDoughManager(!showDoughManager)} className="btn-secondary" style={{ fontSize: 13 }}>
                {showDoughManager ? "Sluit basisrecepten" : "Basisrecepten beheren"}
              </button>
              <button onClick={() => setShowCatManager(!showCatManager)} className="btn-secondary" style={{ fontSize: 13 }}>
                {showCatManager ? "Sluit categorieën" : "Categorieën beheren"}
              </button>
              <button onClick={() => setShowBasketManager(!showBasketManager)} className="btn-secondary" style={{ fontSize: 13 }}>
                {showBasketManager ? "Sluit manden" : "Manden beheren"}
              </button>
              <button className="btn-primary" onClick={() => setShowNewBread(true)} style={{ fontSize: 13, padding: "8px 16px" }}>
                + Nieuw broodsoort
              </button>
            </>
          )}
        </div>
      </div>

      {/* Dough type (shared base recipe) manager */}
      {showDoughManager && isOwner && (
        <DoughTypeManager doughTypes={doughTypes} onChanged={load} />
      )}

      {/* Category manager */}
      {showCatManager && isOwner && (
        <div className="card" style={{ padding: "1.25rem 1.5rem", marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, marginBottom: "0.75rem" }}>Categorieën</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {categories.map(cat => {
              const count = breadTypes.filter(b => b.category === cat).length;
              const isRenaming = renamingCat === cat;
              return (
                <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px" }}>
                  {isRenaming ? (
                    <>
                      <input value={renameValue} onChange={e => setRenameValue(e.target.value)} autoFocus
                        style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 13, flex: 1 }}
                        onKeyDown={e => { if (e.key === "Enter") renameCategory(cat, renameValue); if (e.key === "Escape") setRenamingCat(null); }} />
                      <button onClick={() => renameCategory(cat, renameValue)} className="btn-primary" style={{ fontSize: 12, padding: "4px 10px" }}>OK</button>
                      <button onClick={() => setRenamingCat(null)} className="btn-secondary" style={{ fontSize: 12 }}>✕</button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 13, flex: 1 }}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
                      <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>{count} broodsoorten</span>
                      <button onClick={() => { setRenamingCat(cat); setRenameValue(cat); }}
                        style={{ fontSize: 12, padding: "3px 9px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface)", cursor: "pointer" }}>
                        Naam aanpassen
                      </button>
                      {count === 0 && (
                        <button onClick={() => saveExtraCategories(extraCategories.filter(c => c !== cat))}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: 16, padding: "0 2px" }}>×</button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
              placeholder="Nieuwe categorie naam…"
              style={{ border: "1px solid var(--border)", borderRadius: 7, padding: "6px 10px", fontSize: 13, flex: 1 }}
              onKeyDown={e => {
                if (e.key === "Enter" && newCatName.trim()) {
                  const slug = newCatName.trim().toLowerCase();
                  if (!categories.includes(slug)) saveExtraCategories([...extraCategories, slug]);
                  setNewCatName("");
                }
              }} />
            <button className="btn-primary" style={{ fontSize: 13 }} onClick={() => {
              const slug = newCatName.trim().toLowerCase();
              if (slug && !categories.includes(slug)) { saveExtraCategories([...extraCategories, slug]); setNewCatName(""); }
            }}>Toevoegen</button>
          </div>
        </div>
      )}

      {/* Basket type manager */}
      {showBasketManager && isOwner && (
        <div className="card" style={{ padding: "1.25rem 1.5rem", marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, marginBottom: "0.75rem" }}>Mandformaten</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {basketTypes.map(bt => (
              <div key={bt} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px" }}>
                <span style={{ fontSize: 13 }}>{bt}</span>
                <button onClick={() => saveBasketTypes(basketTypes.filter(b => b !== bt))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={newBasketName} onChange={e => setNewBasketName(e.target.value)}
              placeholder="Nieuw mandformaat…"
              style={{ border: "1px solid var(--border)", borderRadius: 7, padding: "6px 10px", fontSize: 13, flex: 1 }}
              onKeyDown={e => { if (e.key === "Enter" && newBasketName.trim()) { saveBasketTypes([...basketTypes, newBasketName.trim()]); setNewBasketName(""); } }}
            />
            <button className="btn-primary" style={{ fontSize: 13 }}
              onClick={() => { if (newBasketName.trim()) { saveBasketTypes([...basketTypes, newBasketName.trim()]); setNewBasketName(""); } }}>
              Toevoegen
            </button>
          </div>
        </div>
      )}

      {loading && <p style={{ color: "var(--text-subtle)", textAlign: "center", padding: "3rem 0" }}>Laden…</p>}

      {!loading && categories.map(cat => {
        const bts = breadTypes.filter(b => b.category === cat);
        return (
          <div key={cat} style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-subtle)", marginBottom: "0.75rem" }}>
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {bts.map(bt => {
                const isOpen = expanded === bt.id;
                const isEditing = editMode[bt.id];
                const [imgPrimary, imgFallback] = breadImageUrls(bt);
                return (
                  <div key={bt.id} className="card" style={{ overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <button onClick={() => setExpanded(isOpen ? null : bt.id)} style={{
                        flex: 1, display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between",
                        padding: "1rem 1.25rem", background: "none", border: "none", cursor: "pointer", textAlign: "left",
                      }}>
                        <img src={imgPrimary} alt=""
                          style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6, border: "1px solid var(--border)", background: "#f5f0eb", flexShrink: 0 }}
                          onError={e => {
                            const el = e.target as HTMLImageElement;
                            if (imgFallback && el.src !== window.location.origin + imgFallback) { el.src = imgFallback; }
                            else { el.style.visibility = "hidden"; }
                          }}
                        />
                        <span style={{ fontFamily: "var(--font-display)", fontSize: 16, flex: 1 }}>{bt.name}</span>
                        {bt.basketType && <span style={{ fontSize: 11, color: "var(--accent)", background: "var(--accent-light)", padding: "2px 7px", borderRadius: 8 }}>🧺 {bt.basketType}</span>}
                        {bt.basketStyle && <span style={{ fontSize: 11, color: "#7c3aed", background: "#ede9fe", padding: "2px 7px", borderRadius: 8 }}>{bt.basketStyle}</span>}
                        {bt.showInProduction === false && <span style={{ fontSize: 11, color: "#b45309", background: "#fef3c7", padding: "2px 7px", borderRadius: 8 }}>niet in productie</span>}
                        <span style={{ color: "var(--text-subtle)", fontSize: 13, transform: isOpen ? "rotate(180deg)" : "none", transition: "0.2s" }}>↓</span>
                      </button>
                      {isOwner && isOpen && (
                        <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "0 1rem" }}>
                          <BreadImageUpload bt={bt} role={role} onUploaded={imageFile => {
                            setBreadTypes(prev => prev.map(b => b.id === bt.id ? { ...b, imageFile } : b));
                          }} />
                          <button
                            onClick={() => setEditMode(m => ({ ...m, [bt.id]: !isEditing }))}
                            className="btn-secondary"
                            style={{ fontSize: 12, padding: "5px 12px" }}
                          >
                            {isEditing ? "Annuleer" : "Bewerken"}
                          </button>
                          <button
                            onClick={() => setDeleteTarget(bt)}
                            style={{ fontSize: 12, padding: "5px 12px", background: "none", border: "1px solid #fca5a5", borderRadius: 7, cursor: "pointer", color: "var(--danger)" }}
                          >
                            Verwijderen
                          </button>
                        </div>
                      )}
                    </div>
                    {isOpen && (
                      <div style={{ borderTop: "1px solid var(--border)", padding: "1rem 1.25rem", background: "var(--surface-2)" }}>
                        {isOwner && isEditing
                          ? <RecipeOwnerEdit bt={bt} allCategories={categories} allBreadTypes={breadTypes} basketTypeOptions={basketTypes} doughTypes={doughTypes} onSaved={() => { setEditMode(m => ({ ...m, [bt.id]: false })); setDeleteMsg("✓ Wijzigingen opgeslagen."); setTimeout(() => setDeleteMsg(null), 4000); load(); }} />
                          : <RecipeWorkerView bt={bt} qty={qty} />
                        }
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* New bread type modal */}
      {showNewBread && (
        <NewBreadTypeModal onClose={() => setShowNewBread(false)} onSaved={() => { setShowNewBread(false); load(); }} existingCategories={categories} basketTypeOptions={basketTypes} />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(28,16,9,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 24 }}>
          <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 400, padding: "1.75rem", display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Broodsoort verwijderen</h2>
            <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
              Weet je zeker dat je <strong>{deleteTarget.name}</strong> permanent wil verwijderen?
            </p>
            <p style={{ fontSize: 12, color: "var(--text-subtle)", margin: 0, background: "var(--warn-bg)", padding: "8px 12px", borderRadius: 8 }}>
              Eerdere bestellingen blijven bestaan maar het broodsoort zelf verdwijnt. Dit kan niet ongedaan worden.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary" disabled={deleting}>Annuleren</button>
              <button onClick={confirmDelete} disabled={deleting}
                style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "var(--danger)", color: "white", cursor: "pointer", fontSize: 14, fontFamily: "var(--font-body)" }}>
                {deleting ? "Verwijderen…" : "Ja, verwijderen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
