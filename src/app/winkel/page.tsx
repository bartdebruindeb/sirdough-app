"use client";
import { useRole } from "@/lib/role-context";
import { bakeryConfig, SHOP_NAMES } from "@/config/bakery.config";
import React, { useEffect, useState, useCallback } from "react";

const SHOPS = SHOP_NAMES;
const WEEKDAYS_SHORT = ["", "Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const WEEKDAYS_FULL  = ["", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];

const SHOP_COORDS: Record<string, { lat: number; lon: number }> =
  Object.fromEntries(bakeryConfig.shops.map(s => [s.name, { lat: s.lat, lon: s.lon }]));

type BreadType = { id: string; slug: string; name: string; hasRecipe?: boolean };
type LogEntry  = {
  id: string; date: string;
  quantities: Record<string, number>;
  weatherTemp: number | null; weatherCode: number | null;
  weatherIcon: { icon: string; label: string } | null;
};
type WinkelData = {
  logs: LogEntry[];
  breadTypes: BreadType[];
  templateByWeekday: Record<number, Record<string, number>>;
};

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

  const [selectedShop, setSelectedShop] = useState(SHOPS[0] ?? "");
  const [weekOffset, setWeekOffset]     = useState(0);
  const [shopData, setShopData]         = useState<WinkelData | null>(null);
  const [loading, setLoading]           = useState(true);

  // editQtys: date → slug → quantity
  const [editQtys, setEditQtys]     = useState<Record<string, Record<string, number>>>({});
  const [saving, setSaving]         = useState<string | null>(null); // date being saved
  const [savedDates, setSavedDates] = useState<string[]>([]);

  // Weather per date
  const [weathers, setWeathers] = useState<Record<string, { temp: number; icon: string } | null>>({});

  const weekDays = getWeekDays(weekOffset);

  // ── Load shop data ────────────────────────────────────────────────────────
  const load = useCallback(() => {
    if (!selectedShop) return;
    setLoading(true);
    fetch(`/digitalbakery/api/winkel?shop=${encodeURIComponent(selectedShop)}&days=60`, {
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
    const coords = SHOP_COORDS[selectedShop];
    if (!coords) return;
    const newW: Record<string, { temp: number; icon: string } | null> = {};
    Promise.all(
      weekDays.map(date =>
        fetchWeather(coords.lat, coords.lon, date).then(w => { newW[date] = w; })
      )
    ).then(() => setWeathers({ ...newW }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShop, weekOffset]);

  // ── Save a single day ─────────────────────────────────────────────────────
  async function saveDay(date: string) {
    const qty = editQtys[date] ?? {};
    const w   = weathers[date];
    setSaving(date);
    await fetch("/digitalbakery/api/winkel", {
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

  // ── Active bread types ────────────────────────────────────────────────────
  const allBreadTypes = shopData?.breadTypes ?? [];
  const activeBreadTypes = allBreadTypes.filter(bt =>
    bt.hasRecipe ||
    Object.values(shopData?.templateByWeekday ?? {}).some(wk => (wk[bt.id] ?? 0) > 0) ||
    (shopData?.logs ?? []).some(l => ((l.quantities as any)[bt.slug] ?? 0) > 0)
  );

  // ── History: logs sorted oldest-first, grouped to show context ───────────
  const historyLogs = [...(shopData?.logs ?? [])].sort((a, b) => a.date.localeCompare(b.date));

  if (SHOPS.length === 0) {
    return (
      <div style={{ padding: "2rem 2.5rem" }}>
        <h1 style={{ fontSize: 28, marginBottom: "1.5rem" }}>Winkel productie</h1>
        <div className="card" style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-subtle)" }}>
          Geen winkels geconfigureerd. Voeg shops toe in <code>src/config/bakery.config.ts</code>.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem 2.5rem", maxWidth: 1300 }}>
      <h1 style={{ fontSize: 28, marginBottom: "1.25rem" }}>Winkel productie</h1>

      {/* ── Shop selector ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {SHOPS.map(shop => (
          <button
            key={shop}
            onClick={() => setSelectedShop(shop)}
            className={selectedShop === shop ? "btn-primary" : "btn-secondary"}
            style={{ fontSize: 14, padding: "8px 20px" }}
          >
            {shop}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: "var(--text-subtle)" }}>Laden…</p>
      ) : (
        <>
          {/* ── Week navigator ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <button onClick={() => setWeekOffset(w => w - 1)} className="btn-secondary" style={{ padding: "7px 12px" }}>← Vorige week</button>
            <button onClick={() => setWeekOffset(0)} className="btn-secondary" style={{ fontSize: 13 }}>
              {weekOffset === 0 ? "▸ Deze week" : "Terug naar deze week"}
            </button>
            {weekOffset < 0 && (
              <button onClick={() => setWeekOffset(w => w + 1)} className="btn-secondary" style={{ padding: "7px 12px" }}>Volgende week →</button>
            )}
            <span style={{ fontSize: 13, color: "var(--text-muted)", marginLeft: 4 }}>
              {formatDay(weekDays[0])} – {formatDay(weekDays[4])}
            </span>
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
                    return (
                      <th key={date} style={{
                        textAlign: "center", padding: "8px 10px",
                        color: isToday ? "var(--accent)" : "var(--text-subtle)",
                        fontWeight: isToday ? 700 : 500,
                        fontSize: 12, minWidth: 100,
                        borderLeft: "1px solid var(--border)",
                      }}>
                        <div>{WEEKDAYS_SHORT[wd]} {formatDay(date)}</div>
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
                      return (
                        <td key={date} style={{ padding: "4px 6px", borderLeft: "1px solid var(--border)", textAlign: "right" }}>
                          <input
                            type="number"
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
                              background: "var(--surface)", textAlign: "right",
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
                {/* Save buttons row */}
                <tr style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 14px" }} />
                  {weekDays.map(date => (
                    <td key={date} style={{ padding: "6px 6px", borderLeft: "1px solid var(--border)", textAlign: "center" }}>
                      {savedDates.includes(date) ? (
                        <span style={{ fontSize: 12, color: "var(--success)", fontWeight: 600 }}>✓ Opgeslagen!</span>
                      ) : (
                        <button
                          onClick={() => saveDay(date)}
                          disabled={saving === date}
                          className="btn-primary"
                          style={{ fontSize: 11, padding: "5px 12px" }}
                        >
                          {saving === date ? "…" : "Opslaan"}
                        </button>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── History ── */}
          <div>
            <h2 style={{ fontSize: 17, marginBottom: "1rem" }}>Geschiedenis ({selectedShop})</h2>
            {historyLogs.length === 0 ? (
              <div className="card" style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-subtle)", fontSize: 13 }}>
                Nog geen producties opgeslagen.
              </div>
            ) : (
              <div className="card" style={{ overflow: "auto" }}>
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
            )}
          </div>
        </>
      )}
    </div>
  );
}
