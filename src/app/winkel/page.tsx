"use client";
import { useRole } from "@/lib/role-context";
import React, { useEffect, useState, useCallback } from "react";
import { useUndoStack } from "@/hooks/useUndoStack";
import { isCutoffPassed } from "@/lib/cutoff";
import { BreadTypeAvailabilityManager } from "@/components/BreadTypeAvailabilityManager";

const MAX_WEEKS_AHEAD = 4;
const WEEKDAYS_SHORT = ["", "Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const WEEKDAYS_FULL  = ["", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];

type BreadType = { id: string; slug: string; name: string; hasRecipe?: boolean; customerOrderable: boolean; winkelOrderable: boolean; availableWeekdays: string | null };
type LogEntry  = {
  id: string; date: string;
  quantities: Record<string, number>;
  weatherTemp: number | null; weatherCode: number | null;
  weatherIcon: { icon: string; label: string } | null;
};
// A shop is a Customer row flagged isShop — owner-manageable here on Winkel instead of
// hardcoded in bakery.config.ts, so adding one updates the customer pickup selector,
// Bezorgen, and invoicing all at once with no code change or redeploy.
type Shop = {
  id: string; name: string; address: string | null; postalCode: string | null; city: string | null;
  kvk: string | null; phone: string | null; email: string | null; lat: number | null; lng: number | null;
};
type WinkelData = {
  logs: LogEntry[];
  breadTypes: BreadType[];
  templateByWeekday: Record<number, Record<string, number>>;
};

const winkelInp: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 7, padding: "7px 10px",
  fontSize: 13, background: "var(--surface)", width: "100%",
};
const winkelLabel: React.CSSProperties = {
  fontSize: 11, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 4,
};

function parseHuisnr(addr: string) {
  const m = addr.match(/(\d+)\s*([a-zA-Z]?)$/);
  return { huisnummer: m?.[1] ?? "", huisletter: m?.[2] ?? "" };
}

// PDOK — same structured postcode+huisnummer lookup used everywhere else in the app
// (mijn-account, klanten's CustomerForm). Deliberately NOT the loose free-text
// fallback chain klanten's bulk geocode button uses — that's what once resolved a
// shop's street name to the wrong city entirely.
async function pdokLookup(postcode: string, huisnummer: string, huisletter: string) {
  try {
    const pc = postcode.replace(/\s/g, "").toUpperCase();
    const params = new URLSearchParams({ q: "*", fq: "type:adres", fl: "straatnaam,woonplaatsnaam,centroide_ll", rows: "1" });
    params.append("fq", `postcode:${pc}`);
    params.append("fq", `huisnummer:${huisnummer}`);
    if (huisletter) params.append("fq", `huisletter:${huisletter}`);
    const res = await fetch(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const doc = data.response?.docs?.[0];
    if (!doc) return null;
    return { straat: doc.straatnaam as string, stad: doc.woonplaatsnaam as string };
  } catch {
    return null;
  }
}

// Read view + editable form for a shop's own address/KvK/contact — this address is what
// Bezorgen uses as the shop's delivery/route stop, and what the customer order-form map
// shows for "Afhalen <shop>". Editing here (structured lookup) instead of via Klanten's
// bulk geocode button is what keeps it from silently drifting to the wrong city.
// Modal (not an always-visible card) so the shop's address/KvK/contact form doesn't
// take up permanent space on the page — it's rarely touched once set up correctly.
// Includes a shop switcher so you can jump to a different shop's details without
// closing and reopening — switching re-keys the modal (see the call site) so its
// fields reset to that shop's own data.
function ShopDetailsModal({ shop, shops, onSwitchShop, onClose, onChanged }: {
  shop: Shop; shops: Shop[]; onSwitchShop: (name: string) => void; onClose: () => void; onChanged: () => void;
}) {
  const [kvk, setKvk]     = useState(shop.kvk ?? "");
  const [phone, setPhone] = useState(shop.phone ?? "");
  const [email, setEmail] = useState(shop.email ?? "");
  const [postcode, setPostcode] = useState(shop.postalCode ?? "");
  const { huisnummer: hn0, huisletter: hl0 } = parseHuisnr(shop.address ?? "");
  const [huisnummer, setHuisnummer] = useState(hn0);
  const [huisletter, setHuisletter] = useState(hl0);
  const [foundStraat, setFoundStraat] = useState(shop.address ?? "");
  const [foundStad, setFoundStad]     = useState(shop.city ?? "");
  const [lookupStatus, setLookupStatus] = useState<"idle" | "looking" | "found" | "fail">(shop.address ? "found" : "idle");
  const [saving, setSaving] = useState(false);

  async function doLookup() {
    if (!postcode.trim() || !huisnummer.trim()) return;
    setLookupStatus("looking");
    const result = await pdokLookup(postcode, huisnummer, huisletter);
    if (result) { setFoundStraat(`${result.straat} ${huisnummer}${huisletter}`.trim()); setFoundStad(result.stad); setLookupStatus("found"); }
    else setLookupStatus("fail");
  }
  async function save() {
    setSaving(true);
    await fetch("/api/shops", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: shop.id, kvk, phone, email,
        ...(lookupStatus === "found" && { address: foundStraat, postalCode: postcode.toUpperCase(), city: foundStad }),
      }),
    });
    setSaving(false); onChanged(); onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,16,9,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 24 }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 460, padding: "1.75rem", display: "flex", flexDirection: "column", gap: 4, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10 }}>
          {shops.length > 1 ? (
            <select value={shop.name} onChange={e => onSwitchShop(e.target.value)}
              style={{ fontSize: 16, fontWeight: 600, border: "none", background: "transparent", color: "var(--text)", cursor: "pointer" }}>
              {shops.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          ) : (
            <h2 style={{ margin: 0, fontSize: 18 }}>{shop.name}</h2>
          )}
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--text-subtle)" }}>×</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={winkelLabel}>E-mailadres</label>
            <input value={email} onChange={e => setEmail(e.target.value)} style={winkelInp} placeholder="winkel@bedrijf.nl" />
          </div>
          <div>
            <label style={winkelLabel}>Telefoonnummer</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} style={winkelInp} placeholder="+31 6 ..." />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={winkelLabel}>KvK-nummer</label>
            <input value={kvk} onChange={e => setKvk(e.target.value)} style={winkelInp} placeholder="12345678" />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 70px", gap: 8, marginBottom: 8 }}>
          <div>
            <label style={winkelLabel}>Postcode</label>
            <input value={postcode} onChange={e => { setPostcode(e.target.value); setLookupStatus("idle"); }} style={winkelInp} placeholder="2514 CE" />
          </div>
          <div>
            <label style={winkelLabel}>Huisnummer</label>
            <input value={huisnummer} onChange={e => { setHuisnummer(e.target.value); setLookupStatus("idle"); }} style={winkelInp} placeholder="16" />
          </div>
          <div>
            <label style={winkelLabel}>Toev.</label>
            <input value={huisletter} onChange={e => { setHuisletter(e.target.value); setLookupStatus("idle"); }} style={winkelInp} placeholder="A" />
          </div>
        </div>
        <button type="button" onClick={doLookup} disabled={lookupStatus === "looking" || !postcode.trim() || !huisnummer.trim()}
          className="btn-secondary" style={{ fontSize: 12, padding: "6px 12px", marginBottom: 10, alignSelf: "flex-start" }}>
          {lookupStatus === "looking" ? "Zoeken..." : "Zoek adres"}
        </button>
        {lookupStatus === "found" && (
          <div style={{ padding: "8px 12px", background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13, marginBottom: 10 }}>
            <span style={{ color: "var(--success)", marginRight: 8 }}>✓</span>{foundStraat}, {postcode.toUpperCase()} {foundStad}
          </div>
        )}
        {lookupStatus === "fail" && <p style={{ color: "var(--danger)", fontSize: 13, margin: "0 0 10px" }}>Adres niet gevonden. Controleer postcode en huisnummer.</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 13 }}>Annuleer</button>
          <button onClick={save} disabled={saving} className="btn-primary" style={{ fontSize: 13 }}>{saving ? "Opslaan..." : "Opslaan"}</button>
        </div>
      </div>
    </div>
  );
}

// Add a brand-new shop/pickup location. Immediately usable everywhere shops are listed
// (customer pickup selector, staff order pickup, Bezorgen, Winkel production) since
// they all read the same isShop-flagged Customer rows via getShops().
function AddShopModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName]   = useState("");
  const [email, setEmail] = useState("");
  const [kvk, setKvk]     = useState("");
  const [phone, setPhone] = useState("");
  const [postcode, setPostcode]     = useState("");
  const [huisnummer, setHuisnummer] = useState("");
  const [huisletter, setHuisletter] = useState("");
  const [foundStraat, setFoundStraat] = useState("");
  const [foundStad, setFoundStad]     = useState("");
  const [lookupStatus, setLookupStatus] = useState<"idle" | "looking" | "found" | "fail">("idle");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  async function doLookup() {
    if (!postcode.trim() || !huisnummer.trim()) return;
    setLookupStatus("looking");
    const result = await pdokLookup(postcode, huisnummer, huisletter);
    if (result) { setFoundStraat(`${result.straat} ${huisnummer}${huisletter}`.trim()); setFoundStad(result.stad); setLookupStatus("found"); }
    else setLookupStatus("fail");
  }
  async function save() {
    if (!name.trim()) { setError("Vul een naam in."); return; }
    if (lookupStatus !== "found") { setError("Zoek eerst het adres op."); return; }
    setSaving(true); setError("");
    const res = await fetch("/api/shops", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(), email, kvk, phone,
        address: foundStraat, postalCode: postcode.toUpperCase(), city: foundStad,
      }),
    });
    setSaving(false);
    if (res.ok) onAdded();
    else { const d = await res.json().catch(() => ({})); setError(d.message ?? "Toevoegen mislukt."); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,16,9,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 24 }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 460, padding: "1.75rem", display: "flex", flexDirection: "column", gap: 4, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Nieuwe winkel</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--text-subtle)" }}>×</button>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={winkelLabel}>Naam *</label>
          <input value={name} onChange={e => setName(e.target.value)} style={winkelInp} placeholder="Winkel Utrecht" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={winkelLabel}>E-mailadres</label>
            <input value={email} onChange={e => setEmail(e.target.value)} style={winkelInp} placeholder="winkel@bedrijf.nl" />
          </div>
          <div>
            <label style={winkelLabel}>Telefoonnummer</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} style={winkelInp} placeholder="+31 6 ..." />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={winkelLabel}>KvK-nummer</label>
            <input value={kvk} onChange={e => setKvk(e.target.value)} style={winkelInp} placeholder="12345678" />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 70px", gap: 8, marginBottom: 8 }}>
          <div>
            <label style={winkelLabel}>Postcode</label>
            <input value={postcode} onChange={e => { setPostcode(e.target.value); setLookupStatus("idle"); }} style={winkelInp} placeholder="2514 CE" />
          </div>
          <div>
            <label style={winkelLabel}>Huisnummer</label>
            <input value={huisnummer} onChange={e => { setHuisnummer(e.target.value); setLookupStatus("idle"); }} style={winkelInp} placeholder="16" />
          </div>
          <div>
            <label style={winkelLabel}>Toev.</label>
            <input value={huisletter} onChange={e => { setHuisletter(e.target.value); setLookupStatus("idle"); }} style={winkelInp} placeholder="A" />
          </div>
        </div>
        <button type="button" onClick={doLookup} disabled={lookupStatus === "looking" || !postcode.trim() || !huisnummer.trim()}
          className="btn-secondary" style={{ fontSize: 12, padding: "6px 12px", marginBottom: 10, alignSelf: "flex-start" }}>
          {lookupStatus === "looking" ? "Zoeken..." : "Zoek adres"}
        </button>
        {lookupStatus === "found" && (
          <div style={{ padding: "8px 12px", background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13, marginBottom: 10 }}>
            <span style={{ color: "var(--success)", marginRight: 8 }}>✓</span>{foundStraat}, {postcode.toUpperCase()} {foundStad}
          </div>
        )}
        {lookupStatus === "fail" && <p style={{ color: "var(--danger)", fontSize: 13, margin: "0 0 10px" }}>Adres niet gevonden. Controleer postcode en huisnummer.</p>}
        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: "0 0 10px" }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 13 }}>Annuleer</button>
          <button onClick={save} disabled={saving} className="btn-primary" style={{ fontSize: 13 }}>{saving ? "Toevoegen..." : "Toevoegen"}</button>
        </div>
      </div>
    </div>
  );
}

function getWeekday(date: string) {
  const d = new Date(date + "T12:00:00Z");
  const j = d.getUTCDay();
  return j === 0 ? 7 : j;
}

function wmoIcon(code: number) {
  if (code === 0) return "☀️";
  if (code <= 2)  return "⛅";
  if (code <= 3)  return "☁️";
  if (code <= 49) return "🌫️";
  if (code <= 59) return "🌦️";
  if (code <= 69) return "🌧️";
  if (code <= 79) return "❄️";
  if (code <= 82) return "🌧️";
  if (code <= 99) return "⛈️";
  return "🌤️";
}

async function fetchWeather(lat: number, lon: number, date: string) {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max&timezone=Europe/Amsterdam&start_date=${date}&end_date=${date}`
    );
    const data = await res.json();
    const code = data.daily?.weathercode?.[0];
    const temp = data.daily?.temperature_2m_max?.[0];
    if (code == null || temp == null) return null;
    return { temp: Math.round(temp), code, icon: wmoIcon(code) };
  } catch { return null; }
}

/** Returns ISO date strings for Tue–Sat of the week that is `offset` weeks from now. */
function getWeekDays(offset: number): string[] {
  const now = new Date();
  const dow = now.getUTCDay(); // 0=Sun
  // Monday of current week
  const daysToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(now);
  mon.setUTCDate(now.getUTCDate() + daysToMon + offset * 7);
  // Tue=+1 … Sat=+5
  return [1, 2, 3, 4, 5].map(i => {
    const d = new Date(mon);
    d.setUTCDate(mon.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function shortName(name: string) {
  return name.replace("Boeren ", "B.").replace(" KG", "kg")
    .replace("Baguette 0.5 kg", "Baguette").replace("Baguette Kaas/Peper", "B.Kaas/P")
    .replace("Gekiemde Rogge", "G.Rogge").replace("Morning buns", "Buns");
}

function formatDay(date: string) {
  const d = new Date(date + "T12:00:00Z");
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

export default function WinkelPage() {
  const { role } = useRole();
  const today = new Date().toISOString().slice(0, 10);

  const [shops, setShops]               = useState<Shop[]>([]);
  const [shopsLoading, setShopsLoading] = useState(true);
  const [selectedShop, setSelectedShop] = useState("");
  const [weekOffset, setWeekOffset]     = useState(0);
  const [shopData, setShopData]         = useState<WinkelData | null>(null);
  const [loading, setLoading]           = useState(true);
  const [showShopDetails, setShowShopDetails] = useState(false);
  const [showAddShop, setShowAddShop]   = useState(false);

  // ── Load shops (owner-managed here — no more hardcoded bakery.config.ts list) ──
  const loadShops = useCallback(() => {
    fetch("/api/shops", { headers: { "x-role": role ?? "" } })
      .then(r => r.json())
      .then(d => {
        const list: Shop[] = d.shops ?? [];
        setShops(list);
        // Default to the first shop, and re-pick if the currently selected one
        // disappeared (shouldn't normally happen, but keeps the tab valid).
        setSelectedShop(prev => (prev && list.some(s => s.name === prev)) ? prev : (list[0]?.name ?? ""));
      })
      .catch(() => {})
      .finally(() => setShopsLoading(false));
  }, [role]);
  useEffect(() => { loadShops(); }, [loadShops]);

  // editQtys: date → slug → quantity
  const [editQtys, setEditQtys, undoEditQtys, canUndoEditQtys] = useUndoStack<Record<string, Record<string, number>>>({});
  const [saving, setSaving]         = useState<string | null>(null); // date being saved
  const [savedDates, setSavedDates] = useState<string[]>([]);
  const [savingAll, setSavingAll]   = useState(false);

  // BreadTypeManager visibility toggle
  const [showBreadMgr, setShowBreadMgr] = useState(false);

  // History filter
  const [histFrom, setHistFrom] = useState("");
  const [histTo, setHistTo]     = useState("");

  // Weather per date
  const [weathers, setWeathers] = useState<Record<string, { temp: number; icon: string } | null>>({});

  const weekDays = getWeekDays(weekOffset);

  // ── Load shop data ────────────────────────────────────────────────────────
  const load = useCallback(() => {
    if (!selectedShop) return;
    setLoading(true);
    fetch(`/api/winkel?shop=${encodeURIComponent(selectedShop)}&days=60`, {
      headers: { "x-role": role ?? "" },
    })
      .then(r => r.json())
      .then(d => { setShopData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedShop, role]);

  useEffect(() => { load(); }, [load]);

  // ── Prefill edit quantities whenever shop data or week changes ────────────
  useEffect(() => {
    if (!shopData?.logs) return;
    const newQtys: Record<string, Record<string, number>> = {};
    for (const date of weekDays) {
      const wd = getWeekday(date);
      const existing = shopData.logs.find(l => l.date === date);
      if (existing) {
        newQtys[date] = { ...(existing.quantities as Record<string, number>) };
      } else {
        const template = shopData.templateByWeekday[wd] ?? {};
        const q: Record<string, number> = {};
        for (const bt of shopData.breadTypes) q[bt.slug] = template[bt.id] ?? 0;
        newQtys[date] = q;
      }
    }
    setEditQtys(newQtys);
    setSavedDates([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopData, weekOffset]);

  // ── Fetch weather for the week's dates ───────────────────────────────────
  useEffect(() => {
    const shop = shops.find(s => s.name === selectedShop);
    if (!shop?.lat || !shop?.lng) return;
    const newW: Record<string, { temp: number; icon: string } | null> = {};
    Promise.all(
      weekDays.map(date =>
        fetchWeather(shop.lat!, shop.lng!, date).then(w => { newW[date] = w; })
      )
    ).then(() => setWeathers({ ...newW }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShop, weekOffset, shops]);

  // ── Save a single day ─────────────────────────────────────────────────────
  async function saveDay(date: string) {
    if (isCutoffPassed(date)) return;
    const qty = editQtys[date] ?? {};
    const w   = weathers[date];
    setSaving(date);
    await fetch("/api/winkel", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify({
        shopName: selectedShop, date, quantities: qty,
        weatherTemp: w?.temp, weatherCode: undefined,
      }),
    });
    setSaving(null);
    setSavedDates(prev => [...prev.filter(d => d !== date), date]);
    setTimeout(() => setSavedDates(prev => prev.filter(d => d !== date)), 3000);
    load();
  }

  async function saveAll() {
    setSavingAll(true);
    for (const date of weekDays) {
      await saveDay(date);
    }
    setSavingAll(false);
  }

  // ── Copy last week's quantities into the currently viewed week (unsaved until "Alles opslaan") ──
  function copyLastWeek() {
    const prevWeekDays = getWeekDays(weekOffset - 1);
    setEditQtys(prev => {
      const next = { ...prev };
      weekDays.forEach((date, i) => {
        if (isCutoffPassed(date)) return;
        const prevLog = shopData?.logs.find(l => l.date === prevWeekDays[i]);
        if (prevLog) next[date] = { ...(prevLog.quantities as Record<string, number>) };
      });
      return next;
    });
  }

  // ── Active bread types ────────────────────────────────────────────────────
  const allBreadTypes = shopData?.breadTypes ?? [];
  const activeBreadTypes = allBreadTypes.filter(bt =>
    bt.winkelOrderable ||
    Object.values(shopData?.templateByWeekday ?? {}).some(wk => (wk[bt.id] ?? 0) > 0) ||
    (shopData?.logs ?? []).some(l => ((l.quantities as any)[bt.slug] ?? 0) > 0)
  );

  // ── History: logs sorted, filtered by time range ─────────────────────────
  const historyLogs = [...(shopData?.logs ?? [])]
    .filter(l => (!histFrom || l.date >= histFrom) && (!histTo || l.date <= histTo))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!shopsLoading && shops.length === 0) {
    return (
      <div style={{ padding: "2rem 2.5rem" }}>
        <h1 style={{ fontSize: 28, marginBottom: "1.5rem" }}>Winkel productie</h1>
        <div className="card" style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-subtle)" }}>
          <p style={{ margin: "0 0 14px" }}>Nog geen winkels.</p>
          {role === "OWNER" && (
            <button onClick={() => setShowAddShop(true)} className="btn-primary" style={{ fontSize: 13 }}>+ Nieuwe winkel</button>
          )}
        </div>
        {showAddShop && <AddShopModal onClose={() => setShowAddShop(false)} onAdded={() => { setShowAddShop(false); loadShops(); }} />}
      </div>
    );
  }

  const currentShop = shops.find(s => s.name === selectedShop) ?? null;

  return (
    <div style={{ padding: "2rem 2.5rem", maxWidth: 1300 }}>
      <h1 style={{ fontSize: 28, marginBottom: "1.25rem" }}>Winkel productie</h1>

      {/* ── Shop selector, with "+ Nieuwe winkel" and "Winkeldetails wijzigen" on the
          same row, pushed to the right. ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {shops.map(shop => (
          <button
            key={shop.id}
            onClick={() => setSelectedShop(shop.name)}
            className={selectedShop === shop.name ? "btn-primary" : "btn-secondary"}
            style={{ fontSize: 14, padding: "8px 20px" }}
          >
            {shop.name}
          </button>
        ))}
        {role === "OWNER" && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={() => setShowAddShop(true)} className="btn-secondary" style={{ fontSize: 13 }}>
              + Nieuwe winkel
            </button>
            {currentShop && (
              <button onClick={() => setShowShopDetails(true)} className="btn-secondary" style={{ fontSize: 13 }}>
                🏪 Winkeldetails wijzigen
              </button>
            )}
          </div>
        )}
      </div>

      {showAddShop && (
        <AddShopModal onClose={() => setShowAddShop(false)} onAdded={() => { setShowAddShop(false); loadShops(); }} />
      )}
      {showShopDetails && currentShop && (
        <ShopDetailsModal
          key={currentShop.id}
          shop={currentShop}
          shops={shops}
          onSwitchShop={setSelectedShop}
          onClose={() => setShowShopDetails(false)}
          onChanged={loadShops}
        />
      )}

      {loading ? (
        <p style={{ color: "var(--text-subtle)" }}>Laden…</p>
      ) : (
        <>
          {/* ── Beheer broodtypen ── */}
          {role === "OWNER" && allBreadTypes.length > 0 && (
            <>
              <button onClick={() => setShowBreadMgr(v => !v)} className="btn-secondary" style={{ fontSize: 12, alignSelf: "flex-start" }}>
                {showBreadMgr ? "▲ Verberg broodsoorten" : "▼ Beheer broodsoorten"}
              </button>
              {showBreadMgr && <BreadTypeAvailabilityManager breadTypes={allBreadTypes} onChanged={load} />}
            </>
          )}

          {/* ── Week navigator ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <button onClick={() => setWeekOffset(w => w - 1)} className="btn-secondary" style={{ padding: "7px 12px" }}>← Vorige week</button>
            <button onClick={() => setWeekOffset(0)} className="btn-secondary" style={{ fontSize: 13 }}>
              {weekOffset === 0 ? "▸ Deze week" : "Terug naar deze week"}
            </button>
            <button onClick={() => setWeekOffset(w => Math.min(MAX_WEEKS_AHEAD, w + 1))} disabled={weekOffset >= MAX_WEEKS_AHEAD}
              className="btn-secondary" style={{ padding: "7px 12px", opacity: weekOffset >= MAX_WEEKS_AHEAD ? 0.5 : 1 }}>
              Volgende week →
            </button>
            <span style={{ fontSize: 13, color: "var(--text-muted)", marginLeft: 4 }}>
              {formatDay(weekDays[0])} – {formatDay(weekDays[4])}
            </span>
            <button onClick={copyLastWeek} className="btn-secondary" style={{ fontSize: 12, padding: "7px 12px", marginLeft: "auto" }}
              title="Vult de aantallen van vorige week in — pas daarna aan en klik Alles opslaan">
              📋 Kopieer planning van vorige week
            </button>
          </div>

          {/* ── Week table ── */}
          <div className="card" style={{ overflow: "auto", marginBottom: 32 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--surface-2)", borderBottom: "2px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "10px 14px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11, textTransform: "uppercase", whiteSpace: "nowrap", minWidth: 120 }}>
                    Broodsoort
                  </th>
                  {weekDays.map(date => {
                    const wd = getWeekday(date);
                    const isToday = date === today;
                    const w = weathers[date];
                    const locked = isCutoffPassed(date);
                    return (
                      <th key={date} style={{
                        textAlign: "center", padding: "8px 10px",
                        color: locked ? "var(--text-subtle)" : isToday ? "var(--accent)" : "var(--text-subtle)",
                        fontWeight: isToday ? 700 : 500,
                        fontSize: 12, minWidth: 100,
                        borderLeft: "1px solid var(--border)",
                      }}>
                        <div>{WEEKDAYS_SHORT[wd]} {formatDay(date)} {locked && <span title="Deadline verstreken — vergrendeld">🔒</span>}</div>
                        {w && <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2 }}>{w.icon} {w.temp}°</div>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {activeBreadTypes.map((bt, bi) => (
                  <tr key={bt.id} style={{ borderTop: "1px solid var(--border)", background: bi % 2 === 0 ? "transparent" : "var(--surface-2)" }}>
                    <td style={{ padding: "6px 14px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {shortName(bt.name)}
                    </td>
                    {weekDays.map(date => {
                      const qty = editQtys[date]?.[bt.slug] ?? 0;
                      const locked = isCutoffPassed(date);
                      return (
                        <td key={date} style={{ padding: "4px 6px", borderLeft: "1px solid var(--border)", textAlign: "right" }}>
                          <input
                            type="number"
                            disabled={locked}
                            onKeyDown={e => { if (["e","E","-","+",","].includes(e.key)) e.preventDefault(); }}
                            min={0} max={999}
                            value={qty || ""}
                            placeholder="0"
                            onChange={e => {
                              const v = Math.min(999, parseInt(e.target.value) || 0);
                              setEditQtys(prev => ({
                                ...prev,
                                [date]: { ...(prev[date] ?? {}), [bt.slug]: v },
                              }));
                            }}
                            style={{
                              width: "100%", minWidth: 60,
                              border: "1px solid var(--border)", borderRadius: 5,
                              padding: "4px 6px", fontSize: 13, fontWeight: 600,
                              background: locked ? "var(--surface-2)" : "var(--surface)", textAlign: "right",
                              color: locked ? "var(--text-subtle)" : "inherit",
                              cursor: locked ? "not-allowed" : "text",
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {/* Totals row */}
                <tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface-2)" }}>
                  <td style={{ padding: "8px 14px", fontWeight: 600, fontSize: 12, color: "var(--text-subtle)", textTransform: "uppercase" }}>Totaal</td>
                  {weekDays.map(date => {
                    const total = activeBreadTypes.reduce((s, bt) => s + (editQtys[date]?.[bt.slug] ?? 0), 0);
                    return (
                      <td key={date} style={{ padding: "8px 6px", borderLeft: "1px solid var(--border)", textAlign: "right", fontWeight: 700, color: "var(--accent)" }}>
                        {total || "—"}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── Single save button ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button onClick={saveAll} disabled={savingAll} className="btn-primary" style={{ fontSize: 13, padding: "9px 24px" }}>
              {savingAll ? "Opslaan…" : "Alles opslaan"}
            </button>
            <button onClick={undoEditQtys} disabled={!canUndoEditQtys} className="btn-secondary" style={{ fontSize: 13, padding: "9px 16px" }}
              title="Ongedaan maken (max 5 stappen)">
              ↩ Ongedaan
            </button>
            {savedDates.length > 0 && !savingAll && (
              <span style={{ fontSize: 12, color: "var(--success)", fontWeight: 600 }}>✓ Opgeslagen!</span>
            )}
            {weekDays.some(d => isCutoffPassed(d)) && (
              <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>🔒 Dagen na de besteldeadline zijn vergrendeld en worden niet opgeslagen.</span>
            )}
          </div>

          {/* ── History ── */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: "1rem", flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 17, margin: 0 }}>Geschiedenis ({selectedShop})</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <input type="date" value={histFrom} onChange={e => setHistFrom(e.target.value)}
                  style={{ border: "1px solid var(--border)", borderRadius: 7, padding: "5px 9px", fontSize: 12, background: "var(--surface)" }} />
                <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>—</span>
                <input type="date" value={histTo} onChange={e => setHistTo(e.target.value)}
                  style={{ border: "1px solid var(--border)", borderRadius: 7, padding: "5px 9px", fontSize: 12, background: "var(--surface)" }} />
                {(histFrom || histTo) && (
                  <button onClick={() => { setHistFrom(""); setHistTo(""); }} className="btn-secondary" style={{ fontSize: 11, padding: "4px 8px" }}>✕</button>
                )}
              </div>
            </div>
            <style>{`@media(max-width:700px){.winkel-hist-table{display:none!important;}.winkel-hist-cards{display:flex!important;}}`}</style>
            {historyLogs.length === 0 ? (
              <div className="card" style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-subtle)", fontSize: 13 }}>
                Nog geen producties opgeslagen.
              </div>
            ) : (
              <>
              <div className="winkel-hist-table card" style={{ overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 500 }}>
                  <thead>
                    <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ textAlign: "left", padding: "8px 14px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11, textTransform: "uppercase", whiteSpace: "nowrap" }}>Datum</th>
                      <th style={{ textAlign: "center", padding: "8px 6px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11 }}>Weer</th>
                      {activeBreadTypes.map(bt => (
                        <th key={bt.id} style={{ textAlign: "right", padding: "8px 6px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 10, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                          {shortName(bt.name)}
                        </th>
                      ))}
                      <th style={{ textAlign: "right", padding: "8px 14px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11 }}>Totaal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...historyLogs].reverse().map((log, i) => {
                      const wd = getWeekday(log.date);
                      const d  = new Date(log.date + "T12:00:00Z");
                      const label = d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
                      const total = activeBreadTypes.reduce((s, bt) => s + ((log.quantities as any)[bt.slug] ?? 0), 0);
                      const isSat = wd === 6;
                      const isToday = log.date === today;
                      return (
                        <tr key={log.id} style={{
                          borderTop: i > 0 ? "1px solid var(--border)" : "none",
                          background: isToday ? "var(--accent-light)" : isSat ? "var(--surface-2)" : "transparent",
                        }}>
                          <td style={{ padding: "6px 14px", whiteSpace: "nowrap", fontWeight: isSat || isToday ? 600 : 400, color: isToday ? "var(--accent)" : "inherit" }}>
                            {label}
                          </td>
                          <td style={{ padding: "6px 6px", textAlign: "center", fontSize: 14 }}>
                            {log.weatherIcon?.icon ?? "—"}
                            {log.weatherTemp != null && <span style={{ fontSize: 11, color: "var(--text-subtle)", marginLeft: 2 }}>{Math.round(log.weatherTemp)}°</span>}
                          </td>
                          {activeBreadTypes.map(bt => {
                            const q = (log.quantities as any)[bt.slug] ?? 0;
                            return (
                              <td key={bt.id} style={{ padding: "6px 6px", textAlign: "right" }}>
                                {q > 0 ? <span style={{ fontWeight: 500 }}>{q}</span> : <span style={{ color: "var(--border-strong)" }}>—</span>}
                              </td>
                            );
                          })}
                          <td style={{ padding: "6px 14px", textAlign: "right", fontWeight: 700, color: "var(--accent)" }}>{total}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="winkel-hist-cards" style={{ display: "none", flexDirection: "column", gap: 8 }}>
                {[...historyLogs].reverse().map((log) => {
                  const d = new Date(log.date + "T12:00:00Z");
                  const label = d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "short" });
                  const total = activeBreadTypes.reduce((s, bt) => s + ((log.quantities as any)[bt.slug] ?? 0), 0);
                  const nonZero = activeBreadTypes.filter(bt => ((log.quantities as any)[bt.slug] ?? 0) > 0);
                  return (
                    <div key={log.id} className="card" style={{ padding: "10px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
                        <span style={{ fontWeight: 700, color: "var(--accent)", fontSize: 14 }}>{total} stuks</span>
                      </div>
                      {log.weatherIcon?.icon && (
                        <div style={{ fontSize: 12, color: "var(--text-subtle)", marginBottom: 4 }}>
                          {log.weatherIcon.icon} {log.weatherTemp != null && `${Math.round(log.weatherTemp)}°C`}
                        </div>
                      )}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {nonZero.map(bt => (
                          <span key={bt.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 7px", fontSize: 11 }}>
                            {shortName(bt.name)}: <b>{(log.quantities as any)[bt.slug]}</b>
                          </span>
                        ))}
                        {nonZero.length === 0 && <span style={{ color: "var(--text-subtle)", fontSize: 12 }}>Leeg</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
