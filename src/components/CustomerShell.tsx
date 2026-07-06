"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { bakeryConfig } from "@/config/bakery.config";
import { AddLocationModal } from "@/components/AddLocationModal";

const NAV = [
  { href: "/mijn-bestellingen", label: "Bestellingen",  icon: "◧" },
  { href: "/mijn-account",      label: "Mijn account",  icon: "◑" },
  { href: "/mijn-facturen",     label: "Facturen",       icon: "◰" },
];

export function CustomerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const name = (session?.user as any)?.name ?? session?.user?.email ?? "";
  const [banner, setBanner] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [locations, setLocations] = useState<{ id: string; name: string; city: string | null }[]>([]);
  const [selectedLoc, setSelectedLoc] = useState("");
  const [canAdd, setCanAdd] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    fetch("/api/announcement").then(r => r.json()).then(d => { if (d.message) setBanner(d.message); }).catch(() => {});
    fetch("/api/mijn/locations").then(r => r.json()).then(d => {
      setLocations(d.locations ?? []);
      setSelectedLoc(d.selected ?? "");
      setCanAdd(!!d.canAdd);
    }).catch(() => {});
  }, []);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // Switch active restaurant: persist the choice in a cookie (the server validates it
  // against this login's own locations) and reload so every page refetches scoped to it.
  function changeLocation(id: string) {
    if (id === selectedLoc) return;
    document.cookie = `mijn_location=${id}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  }
  // A new location becomes the active one right away.
  function onLocationAdded(id: string) {
    document.cookie = `mijn_location=${id}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  }
  // Shown for any customer (>=1 location): switch between locations and/or add one (max 3).
  const locationControls = locations.length > 0 ? (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {locations.length > 1 && (
        <select value={selectedLoc} onChange={e => changeLocation(e.target.value)}
          aria-label="Locatie kiezen"
          style={{ fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "1px solid #3c2a1e",
            background: "var(--sidebar-bg)", color: "var(--sidebar-active)", cursor: "pointer", maxWidth: 200 }}>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}{l.city ? ` — ${l.city}` : ""}</option>)}
        </select>
      )}
      {canAdd && (
        <button onClick={() => setAddOpen(true)} title="Locatie toevoegen"
          style={{ fontSize: 12, padding: "5px 9px", borderRadius: 6, border: "1px solid #3c2a1e",
            background: "transparent", color: "var(--sidebar-active)", cursor: "pointer", whiteSpace: "nowrap" }}>
          ＋ Locatie
        </button>
      )}
    </div>
  ) : null;

  async function handleLogout() {
    if (localStorage.getItem("pendingOrderEmail")) {
      localStorage.removeItem("pendingOrderEmail");
      await fetch("/api/mijn/email-summary", { method: "POST" }).catch(() => {});
    }
    signOut({ callbackUrl: "/login" });
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Top nav */}
      <header style={{
        background: "var(--sidebar-bg)", color: "var(--sidebar-text)",
        padding: "0 1.5rem", height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--sidebar-active)", whiteSpace: "nowrap" }}>
            {bakeryConfig.businessName}
          </span>
          <nav className="customer-nav-desktop" style={{ display: "flex", gap: 4 }}>
            {NAV.map(({ href, label, icon }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link key={href} href={href} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 7, fontSize: 13,
                  color: active ? "var(--sidebar-active)" : "var(--sidebar-text)",
                  background: active ? "rgba(255,255,255,0.1)" : "transparent",
                  textDecoration: "none", fontWeight: active ? 500 : 400,
                }}>
                  <span style={{ opacity: active ? 1 : 0.65 }}>{icon}</span> {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="customer-user-desktop" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {locationControls}
          <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>{name}</span>
          <button onClick={handleLogout}
            style={{ fontSize: 12, padding: "5px 10px", borderRadius: 6, border: "1px solid #3c2a1e",
              background: "transparent", color: "#9c8878", cursor: "pointer", fontFamily: "var(--font-body)" }}>
            Uitloggen
          </button>
        </div>
        <button
          className="customer-mobile-toggle"
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Menu openen"
          style={{ display: "none", background: "none", border: "none", color: "var(--sidebar-active)", fontSize: 22, cursor: "pointer", padding: 4 }}
        >
          {menuOpen ? "✕" : "☰"}
        </button>
      </header>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="customer-mobile-menu" style={{
          background: "var(--sidebar-bg)", borderTop: "1px solid #2c1a0e",
          position: "sticky", top: 56, zIndex: 19,
          display: "flex", flexDirection: "column", padding: "0.5rem",
        }}>
          {NAV.map(({ href, label, icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link key={href} href={href} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 7, fontSize: 14,
                color: active ? "var(--sidebar-active)" : "var(--sidebar-text)",
                background: active ? "rgba(255,255,255,0.1)" : "transparent",
                textDecoration: "none", fontWeight: active ? 500 : 400,
              }}>
                <span style={{ opacity: active ? 1 : 0.65 }}>{icon}</span> {label}
              </Link>
            );
          })}
          {locationControls && <div style={{ padding: "10px 12px" }}>{locationControls}</div>}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", marginTop: 4, borderTop: "1px solid #2c1a0e" }}>
            <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>{name}</span>
            <button onClick={handleLogout}
              style={{ fontSize: 12, padding: "5px 10px", borderRadius: 6, border: "1px solid #3c2a1e",
                background: "transparent", color: "#9c8878", cursor: "pointer", fontFamily: "var(--font-body)" }}>
              Uitloggen
            </button>
          </div>
        </div>
      )}

      {banner && (
        <div style={{
          background: "var(--accent-light)", borderBottom: "1px solid var(--accent)",
          padding: "10px 1.5rem", fontSize: 13, color: "var(--accent)",
          display: "flex", alignItems: "flex-start", gap: 10,
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>📢</span>
          <span style={{ whiteSpace: "pre-wrap" }}>{banner}</span>
        </div>
      )}

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "2rem 1.5rem" }}>
        {children}
      </main>

      {addOpen && <AddLocationModal onClose={() => setAddOpen(false)} onAdded={onLocationAdded} />}
    </div>
  );
}
