"use client";
import { useRole } from "@/lib/role-context";
import { useEffect, useRef, useState } from "react";


type RecipeFlour  = { id: string; name: string; percentage: number; sortOrder: number };
type RecipeTopping = { id: string; name: string; gramsPerLoaf: number; waterRatio?: number; requiresKoking: boolean };
type Recipe = {
  waterPct: number; desemPct: number; zoutPct: number; inwasPct: number;
  doughWeightPerLoaf: number; mixerGroup: string; notes?: string;
  flourLines: RecipeFlour[]; toppings: RecipeTopping[];
};
type BreadType = { id: string; name: string; slug: string; category: string; sortOrder: number; weightGrams: number; basketType: string; basketStyle?: string | null; showInProduction?: boolean; imageFile?: string | null; recipe: Recipe | null };

function kg(g: number) { return g >= 1000 ? `${(g/1000).toFixed(2).replace(/\.?0+$/,"")} kg` : `${Math.round(g)} g`; }

function RecipeWorkerView({ bt, qty }: { bt: BreadType; qty: number }) {
  const r = bt.recipe;
  if (!r) return <p style={{ color: "var(--text-subtle)", fontSize: 13, fontStyle: "italic" }}>Geen recept</p>;
  const n = qty || 1;
  const totalDough = n * r.doughWeightPerLoaf;
  const totalPct = 100 + r.waterPct + r.desemPct + r.zoutPct + r.inwasPct;
  const flourTotal = (totalDough / totalPct) * 100;

  return (
    <div style={{ fontSize: 13 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
        <tbody>
          {r.flourLines.map(f => (
            <tr key={f.id} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "7px 0", color: "var(--text-muted)" }}>{f.name}</td>
              <td style={{ padding: "7px 0", textAlign: "right", fontWeight: 500 }}>{kg(flourTotal * f.percentage / 100)}</td>
            </tr>
          ))}
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <td style={{ padding: "7px 0", color: "var(--text-muted)" }}>Water</td>
            <td style={{ padding: "7px 0", textAlign: "right", fontWeight: 500 }}>{kg(flourTotal * r.waterPct / 100)}</td>
          </tr>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <td style={{ padding: "7px 0", color: "var(--text-muted)" }}>Desem</td>
            <td style={{ padding: "7px 0", textAlign: "right", fontWeight: 500 }}>{kg(flourTotal * r.desemPct / 100)}</td>
          </tr>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <td style={{ padding: "7px 0", color: "var(--text-muted)" }}>Zout</td>
            <td style={{ padding: "7px 0", textAlign: "right", fontWeight: 500 }}>{kg(flourTotal * r.zoutPct / 100)}</td>
          </tr>
          {r.inwasPct > 0 && (
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "7px 0", color: "var(--text-muted)" }}>Inwas</td>
              <td style={{ padding: "7px 0", textAlign: "right", fontWeight: 500 }}>{kg(flourTotal * r.inwasPct / 100)}</td>
            </tr>
          )}
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

function RecipeOwnerEdit({ bt, onSaved, allCategories, allBreadTypes, basketTypeOptions }: { bt: BreadType; onSaved: () => void; allCategories: string[]; allBreadTypes: BreadType[]; basketTypeOptions: string[] }) {
  const r = bt.recipe;
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

  const flourSum = flourLines.reduce((s, f) => s + f.percentage, 0);
  const totalPct = 100 + waterPct + desemPct + zoutPct + inwasPct;

  async function save() {
    setSaving(true);
    if (basketType !== bt.basketType || category !== bt.category || basketStyle !== (bt.basketStyle ?? "") || showInProduction !== (bt.showInProduction ?? true) || mixerGroup !== ((bt as any).mixerGroup ?? "")) {
      await fetch("/api/bread-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-role": "OWNER" },
        body: JSON.stringify({ id: bt.id, basketType, basketStyle: basketStyle || null, category, showInProduction, mixerGroup: mixerGroup || null }),
      });
    }
    await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": "OWNER" },
      body: JSON.stringify({
        breadTypeId: bt.id, waterPct, desemPct, zoutPct, inwasPct,
        doughWeightPerLoaf: doughWeight, notes,
        flourLines: flourLines.map((f, i) => ({ ...f, sortOrder: i })),
        toppings: r?.toppings ?? [],
      }),
    });
    setSaving(false);
    onSaved();
  }

  const inputStyle = { border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 13, background: "var(--surface)", width: "80px" };

  return (
    <div style={{ fontSize: 13 }}>
      {/* Baker's percentages */}
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
                <input type="number" min={0} onKeyDown={e=>{if(["e","E","-","+"].includes(e.key))e.preventDefault()}} value={f.percentage} onChange={e => setFlourLines(fl => fl.map((x,j) => j===i ? {...x,percentage:parseFloat(e.target.value)||0} : x))}
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
                <input type="number" onKeyDown={e=>{if(["e","E","-","+"].includes(e.key))e.preventDefault()}} step="0.5" value={val} onChange={e => setter(parseFloat(e.target.value)||0)} style={inputStyle} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div>
          <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Deeggewicht / brood (g)</label>
          <input type="number" onKeyDown={e=>{if(["e","E","-","+"].includes(e.key))e.preventDefault()}} value={doughWeight} onChange={e => setDough(parseFloat(e.target.value)||0)} style={{ ...inputStyle, width: "100%" }} />
        </div>
        <div>
          {/* total% removed — auto-computed from water+desem+zout+inwas+100 */}
        </div>
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
        <label style={{ fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4, marginTop: 10 }}>Samenvoegen in mixer met</label>
        <select value={mixerGroup} onChange={e => setMixerGroup(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
          <option value="">— eigen mixergroep —</option>
          {allBreadTypes
            .filter(b => b.category === bt.category && b.id !== bt.id)
            .map(b => <option key={b.id} value={b.slug}>{b.name}</option>)
          }
        </select>
        <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>Manden blijven apart geteld.</span>
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
  const allCats = [...new Set(["boeren","mand","baguette","spelt","volkoren","rogge","zoet",...existingCategories])];
  const [name, setName] = useState("");
  const [category, setCategory] = useState("boeren");
  const [newCat, setNewCat] = useState("");
  const [addingCat, setAddingCat] = useState(false);
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
          {addingCat?(
            <div style={{display:"flex",gap:8,flexDirection:"column"}}>
              <div style={{display:"flex",gap:8}}>
                <input value={newCat} onChange={e=>setNewCat(e.target.value)} style={{...inp,flex:1}} placeholder="Naam nieuwe categorie" autoFocus
                  onKeyDown={e=>{if(e.key==="Enter"&&newCat.trim()){setCategory(newCat.trim().toLowerCase());setAddingCat(false);}}} />
                <button onClick={()=>{if(newCat.trim()){setCategory(newCat.trim().toLowerCase());setAddingCat(false);}}} className="btn-primary" style={{fontSize:13,padding:"8px 12px"}}>OK</button>
                <button onClick={()=>setAddingCat(false)} className="btn-secondary" style={{fontSize:13}}>✕</button>
              </div>
              <p style={{fontSize:11,color:"var(--text-subtle)",margin:0}}>De categorie wordt aangemaakt zodra je dit broodtype opslaat.</p>
            </div>
          ):(
            <div style={{display:"flex",gap:8}}>
              <select value={category} onChange={e=>setCategory(e.target.value)} style={{...inp,flex:1}}>
                {allCats.map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
              </select>
              <button onClick={()=>setAddingCat(true)} className="btn-secondary" style={{fontSize:13,padding:"8px 10px",whiteSpace:"nowrap"}}>+ Nieuw</button>
            </div>
          )}
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

  const imgSrc = bt.imageFile ? `/brood/${bt.imageFile}?t=${Date.now()}` : null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 1rem" }}>
      {imgSrc
        ? <img src={imgSrc} alt="" style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 6, border: "1px solid var(--border)", background: "#f5f0eb" }} />
        : <div style={{ width: 36, height: 36, borderRadius: 6, border: "1px dashed var(--border)", background: "var(--surface-2)" }} />
      }
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="btn-secondary"
        style={{ fontSize: 11, padding: "4px 10px" }}
      >
        {uploading ? "…" : imgSrc ? "Wijzig foto" : "Foto uploaden"}
      </button>
    </div>
  );
}

export default function ReceptenPage() {
  const { role, can } = useRole();
  const isOwner = role === "OWNER";
  const [breadTypes, setBreadTypes] = useState<BreadType[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [qty] = useState(1);
  const [editMode, setEditMode] = useState<Record<string, boolean>>({});
  const [showNewBread, setShowNewBread] = useState(false);
  const [showCatManager, setShowCatManager] = useState(false);
  const [showBasketManager, setShowBasketManager] = useState(false);
  const [basketTypes, setBasketTypes] = useState<string[]>(["750 gram","rond","1 kg","1,5 kg"]);
  const [newBasketName, setNewBasketName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<BreadType | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    setLoading(true);
    fetch("/api/recipes", { headers: { "x-role": role ?? "" } })
      .then(r => r.json())
      .then(d => { setBreadTypes(d.breadTypes ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  async function loadSettings() {
    const d = await fetch("/api/settings", { headers: { "x-role": role ?? "" } }).then(r => r.json()).catch(() => ({}));
    if (d.basketTypes?.length) setBasketTypes(d.basketTypes);
  }

  async function saveBasketTypes(types: string[]) {
    setBasketTypes(types);
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json", "x-role": role ?? "" }, body: JSON.stringify({ basketTypes: types }) });
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

  const categories = [...new Set(breadTypes.map(b => b.category))];

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

      {/* Category manager */}
      {showCatManager && isOwner && (
        <div className="card" style={{ padding: "1.25rem 1.5rem", marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, marginBottom: "0.75rem" }}>Categorieën</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {categories.map(cat => {
              const count = breadTypes.filter(b => b.category === cat).length;
              return (
                <div key={cat} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px" }}>
                  <span style={{ fontSize: 13 }}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
                  <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>({count})</span>
                  {count === 0 && (
                    <button
                      onClick={async () => { /* categories auto-disappear when empty */ }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: 14, padding: 0 }}
                      title="Categorie is al leeg — verdwijnt automatisch"
                    >×</button>
                  )}
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: "var(--text-subtle)", margin: "8px 0 0" }}>
            Categorieën verdwijnen automatisch als alle broodsoorten erin verwijderd zijn.
          </p>
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
                return (
                  <div key={bt.id} className="card" style={{ overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <button onClick={() => setExpanded(isOpen ? null : bt.id)} style={{
                        flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "1rem 1.25rem", background: "none", border: "none", cursor: "pointer", textAlign: "left",
                      }}>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: 16 }}>{bt.name}</span>
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
                          ? <RecipeOwnerEdit bt={bt} allCategories={categories} allBreadTypes={breadTypes} basketTypeOptions={basketTypes} onSaved={() => { setEditMode(m => ({ ...m, [bt.id]: false })); load(); }} />
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
