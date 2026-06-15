"use client";
import { useRole } from "@/lib/role-context";
import { bakeryConfig, SHOP_NAMES } from "@/config/bakery.config";
import React, { useEffect, useState, useCallback } from "react";

const SHOPS = SHOP_NAMES;
const WEEKDAYS = ["", "Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const WEEKDAYS_FULL = ["", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];

// Shop coordinates for weather lookups (from bakery.config.ts)
const SHOP_COORDS: Record<string, { lat: number; lon: number }> =
  Object.fromEntries(bakeryConfig.shops.map(s => [s.name, { lat: s.lat, lon: s.lon }]));

type BreadType = { id: string; slug: string; name: string; hasRecipe?: boolean };
type LogEntry = {
  id: string;
  date: string;
  quantities: Record<string, number>;
  weatherTemp: number | null;
  weatherCode: number | null;
  weatherIcon: { icon: string; label: string } | null;
};
type WinkelData = {
  logs: LogEntry[];
  breadTypes: BreadType[];
  templateByWeekday: Record<number, Record<string, number>>;
};
type Weather = { temp: number; code: number; icon: string; label: string };

function getWeekday(date: string) {
  const d = new Date(date + "T12:00:00Z");
  const j = d.getUTCDay();
  return j === 0 ? 7 : j;
}

function wmoIcon(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 2) return "⛅";
  if (code <= 3) return "☁️";
  if (code <= 49) return "🌫️";
  if (code <= 59) return "🌦️";
  if (code <= 69) return "🌧️";
  if (code <= 79) return "❄️";
  if (code <= 82) return "🌧️";
  if (code <= 99) return "⛈️";
  return "🌤️";
}

async function fetchWeather(lat: number, lon: number, date: string): Promise<Weather | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max&timezone=Europe/Amsterdam&start_date=${date}&end_date=${date}`;
    const res = await fetch(url);
    const data = await res.json();
    const code = data.daily?.weathercode?.[0];
    const temp = data.daily?.temperature_2m_max?.[0];
    if (code == null || temp == null) return null;
    return { temp: Math.round(temp), code, icon: wmoIcon(code), label: "" };
  } catch { return null; }
}

export default function WinkelPage() {
  const { role } = useRole();
  const today = new Date().toISOString().slice(0, 10);
  const [shopsData, setShopsData] = useState<(WinkelData | null)[]>(SHOPS.map(() => null));
  const [loading, setLoading] = useState(true);

  // Editor state — one quantity map per shop
  const [editDate, setEditDate] = useState(today);
  const [editQtys, setEditQtys] = useState<Record<string, number>[]>(SHOPS.map(() => ({})));
  const [weather, setWeather] = useState<Weather | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedShop, setSavedShop] = useState<string|null>(null);

  function shiftDate(days: number) {
    const d = new Date(editDate + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    setEditDate(d.toISOString().slice(0, 10));
  }

  const load = useCallback(() => {
    setLoading(true);
    Promise.all(
      SHOPS.map(shop => fetch(`/digitalbakery/api/winkel?shop=${encodeURIComponent(shop)}`, { headers: { "x-role": role ?? "" } }).then(r => r.json()))
    ).then(results => {
      setShopsData(results); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // When editDate changes, prefill all shops
  useEffect(() => {
    if (!shopsData[0]) return;
    const wd = getWeekday(editDate);
    const newQtys = shopsData.map(d => {
      if (!d) return {};
      const existing = d.logs.find(l => l.date === editDate);
      if (existing) return existing.quantities as Record<string,number>;
      const template = d.templateByWeekday[wd] ?? {};
      const qty: Record<string,number> = {};
      for (const bt of d.breadTypes) qty[bt.slug] = template[bt.id] ?? 0;
      return qty;
    });
    setEditQtys(newQtys);

    if (SHOPS.length > 0) {
      const coords = SHOP_COORDS[SHOPS[0]];
      if (coords) fetchWeather(coords.lat, coords.lon, editDate).then(setWeather);
    }
    setSavedShop(null);
  }, [editDate, shopsData]);

  async function saveShop(shopName: string, qty: Record<string,number>) {
    setSaving(true);
    await fetch("/digitalbakery/api/winkel", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role ?? "" },
      body: JSON.stringify({ shopName, date: editDate, quantities: qty, weatherTemp: weather?.temp, weatherCode: weather?.code }),
    });
    setSaving(false);
    setSavedShop(shopName);
    setTimeout(() => setSavedShop(null), 3000);
    load();
  }

  // Active bread types: union across all shops
  const breadTypes = shopsData[0]?.breadTypes ?? [];
  // All bread types with a recipe are orderable for winkel — plus any
  // already in use (template/log) even if their recipe was later removed
  const activeBreadTypes = breadTypes.filter(bt =>
    bt.hasRecipe ||
    shopsData.some(d =>
      Object.values(d?.templateByWeekday ?? {}).some(wk => (wk[bt.id] ?? 0) > 0) ||
      (d?.logs ?? []).some(l => ((l.quantities as any)[bt.slug] ?? 0) > 0)
    )
  );

  const wd = getWeekday(editDate);

  // Shop editor component
  function ShopEditor({ shopName, qty, setQty }: { shopName: string; qty: Record<string,number>; setQty: (q: Record<string,number>)=>void }) {
    const total = Object.values(qty).reduce((s,v) => s+(v||0), 0);
    return (
      <div className="card" style={{ padding: "1.25rem 1.5rem", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ fontSize: 16, margin: 0 }}>{shopName}</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {savedShop === shopName && <span style={{ fontSize: 12, color: "var(--success)" }}>✓</span>}
            <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>Totaal: {total}</span>
            <button onClick={() => saveShop(shopName, qty)} disabled={saving} className="btn-primary" style={{ fontSize: 12, padding: "6px 14px" }}>
              Opslaan
            </button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
          {activeBreadTypes.map(bt => (
            <div key={bt.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 9px" }}>
              <label style={{ fontSize: 10, color: "var(--text-subtle)", textTransform: "uppercase", display: "block", marginBottom: 3 }}>
                {bt.name.replace("Boeren ","B.").replace(" KG","kg")}
              </label>
              <input type="number" onKeyDown={e=>{if(["e","E","-","+"].includes(e.key))e.preventDefault()}} min={0} max={999} value={qty[bt.slug] ?? ""}
                onChange={e => setQty(prev => ({ ...prev, [bt.slug]: Math.min(999, parseInt(e.target.value) || 0) }))}
                placeholder="0"
                style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 5, padding: "4px 6px", fontSize: 14, fontWeight: 600, background: "var(--surface)", textAlign: "right" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem 2.5rem", maxWidth: 1200 }}>
      <h1 style={{ fontSize: 28, marginBottom: "1.5rem" }}>Winkel productie</h1>

      {/* Date nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <button onClick={() => shiftDate(-1)} className="btn-secondary" style={{ padding: "8px 12px" }}>←</button>
        <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="input" style={{ width: 150 }} />
        <button onClick={() => shiftDate(1)} className="btn-secondary" style={{ padding: "8px 12px" }}>→</button>
        <button onClick={() => setEditDate(today)} className="btn-secondary">Vandaag</button>
        <span style={{ fontSize: 13, color: "var(--text-muted)", marginLeft: 8 }}>{WEEKDAYS_FULL[wd]}</span>
        {weather && (
          <span style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
            <span style={{ fontSize: 18 }}>{weather.icon}</span>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{weather.temp}°C</span>
          </span>
        )}
      </div>

      {loading ? (
        <p style={{ color: "var(--text-subtle)" }}>Laden…</p>
      ) : SHOPS.length === 0 ? (
        <div className="card" style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-subtle)" }}>
          Geen winkels geconfigureerd. Voeg shops toe in <code>src/config/bakery.config.ts</code>.
        </div>
      ) : (
        <>
          {/* Editors — responsive grid, 1 column on narrow screens, fits N shops */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 28 }}>
            {SHOPS.map((shopName, i) => (
              <ShopEditor
                key={shopName}
                shopName={shopName}
                qty={editQtys[i] ?? {}}
                setQty={(q) => setEditQtys(arr => arr.map((x, j) => j === i ? q : x))}
              />
            ))}
          </div>

          {/* ── Register ── */}
          <div>
            <h2 style={{ fontSize: 17, marginBottom: "1rem" }}>Register afgelopen maand</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
              {SHOPS.map((shopName, i) => {
                const shopData = shopsData[i];
                return (
                  <div key={shopName}>
                    <h3 style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 8 }}>{shopName}</h3>
                    {!shopData || shopData.logs.length === 0 ? (
                      <div className="card" style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-subtle)", fontSize: 13 }}>Nog geen producties opgeslagen.</div>
                    ) : (
                      <div className="card" style={{ overflow: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 400 }}>
                          <thead>
                            <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                              <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11, textTransform: "uppercase", whiteSpace: "nowrap" }}>Datum</th>
                              <th style={{ textAlign: "center", padding: "8px 8px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11 }}>Weer</th>
                              <th style={{ textAlign: "right", padding: "8px 8px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11 }}>°C</th>
                              {activeBreadTypes.map(bt => (
                                <th key={bt.id} style={{ textAlign: "right", padding: "8px 8px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 10, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                                  {bt.name.replace("Boeren ","B.").replace(" KG","kg")}
                                </th>
                              ))}
                              <th style={{ textAlign: "right", padding: "8px 12px", color: "var(--text-subtle)", fontWeight: 500, fontSize: 11 }}>Totaal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {shopData.logs.map((log, i2) => {
                              const wd2 = getWeekday(log.date);
                              const d = new Date(log.date + "T12:00:00Z");
                              const label = d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
                              const total = activeBreadTypes.reduce((s, bt) => s + ((log.quantities as any)[bt.slug] ?? 0), 0);
                              const isSat = wd2 === 6;
                              return (
                                <tr key={log.id} style={{ borderTop: i2 > 0 ? "1px solid var(--border)" : "none", background: isSat ? "var(--surface-2)" : "transparent" }}>
                                  <td style={{ padding: "7px 12px", whiteSpace: "nowrap", fontWeight: isSat ? 600 : 400 }}>
                                    {WEEKDAYS[wd2]} {label}
                                  </td>
                                  <td style={{ padding: "7px 8px", textAlign: "center", fontSize: 14 }}>{log.weatherIcon?.icon ?? "—"}</td>
                                  <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-muted)" }}>{log.weatherTemp != null ? `${Math.round(log.weatherTemp)}°` : "—"}</td>
                                  {activeBreadTypes.map(bt => {
                                    const qty2 = (log.quantities as any)[bt.slug] ?? 0;
                                    return <td key={bt.id} style={{ padding: "7px 8px", textAlign: "right" }}>
                                      {qty2 > 0 ? <span style={{ fontWeight: 500 }}>{qty2}</span> : <span style={{ color: "var(--border-strong)" }}>—</span>}
                                    </td>;
                                  })}
                                  <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 600, color: "var(--accent)" }}>{total}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
