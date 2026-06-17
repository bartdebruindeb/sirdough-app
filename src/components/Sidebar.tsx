"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useRole, ROLE_LABELS, ROLE_ICONS, AppRole } from "@/lib/role-context";
import { bakeryConfig } from "@/config/bakery.config";
import { ALL_NAV } from "@/lib/nav";

const ROLE_COLORS: Record<AppRole, string> = {
  OWNER:        "#b45309",
  ORDER_TABLET: "#0369a1",
  BAKKER:       "#15803d",
};

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { role, canAccess, userName, loading } = useRole();
  const pathname = usePathname();

  // Defense in depth: AppShell only renders Sidebar when authenticated,
  // but guard here too in case Sidebar is ever used elsewhere.
  if (!role) return null;

  // Strip basepath prefix if any
  const cleanPath = pathname.replace("", "") || "/";

  const visibleNav = ALL_NAV.filter(item => canAccess(item.href));

  return (
    <aside className={`app-sidebar ${open ? "open" : ""}`} style={{
      width: 220, background: "var(--sidebar-bg)", color: "var(--sidebar-text)",
      display: "flex", flexDirection: "column", padding: 0, flexShrink: 0,
      position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 10,
    }}>
      {/* Logo + mobile close button */}
      <div style={{ padding: "1.75rem 1.5rem 1.25rem", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--sidebar-active)", margin: 0 }}>
            {bakeryConfig.businessName}
          </p>
          <p style={{ fontSize: 11, color: "var(--text-subtle)", margin: "3px 0 0" }}>
            {bakeryConfig.tagline}
          </p>
        </div>
        <button onClick={onClose} className="sidebar-close" aria-label="Menu sluiten"
          style={{ display: "none", background: "none", border: "none", color: "var(--sidebar-text)", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: 4 }}>
          ✕
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "0 0.625rem", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        {visibleNav.map(({ href, label, icon }) => {
          const isActive = cleanPath === href || (href !== "/" && cleanPath.startsWith(href));
          return (
            <Link key={href} href={href} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 12px", borderRadius: 8,
              color: isActive ? "var(--sidebar-active)" : "var(--sidebar-text)",
              background: isActive ? "rgba(255,255,255,0.1)" : "transparent",
              textDecoration: "none", fontSize: 14, fontWeight: isActive ? 500 : 400,
            }}>
              <span style={{ fontSize: 15, opacity: isActive ? 1 : 0.65 }}>{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Logged-in user + role */}
      <div style={{ padding: "1rem 1rem 1.25rem", borderTop: "1px solid #2c1a0e" }}>
        {loading ? (
          <p style={{ fontSize: 12, color: "var(--text-subtle)" }}>Laden…</p>
        ) : (
          <>
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
              background: "rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 10px",
            }}>
              <span style={{ fontSize: 16 }}>{ROLE_ICONS[role]}</span>
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: "var(--sidebar-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {userName ?? "Niet ingelogd"}
                </p>
                <p style={{ fontSize: 10, margin: 0, color: ROLE_COLORS[role] }}>
                  {ROLE_LABELS[role]}
                </p>
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              style={{
                width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #3c2a1e",
                background: "transparent", color: "#9c8878", cursor: "pointer", fontSize: 12,
                fontFamily: "var(--font-body)",
              }}
            >
              Uitloggen
            </button>
          </>
        )}
      </div>

      <style>{`
        nav a:hover { background: rgba(255,255,255,0.08) !important; color: var(--sidebar-active) !important; }
        @media (max-width: 860px) {
          .sidebar-close { display: block !important; }
        }
      `}</style>
    </aside>
  );
}
