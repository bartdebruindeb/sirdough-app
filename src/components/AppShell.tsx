"use client";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { CustomerShell } from "@/components/CustomerShell";
import { bakeryConfig } from "@/config/bakery.config";

const PUBLIC_PATHS = ["/login", "/uitnodiging", "/privacy"];

// Owner-only pop-up when a previously working Exact connection has lapsed (Exact's refresh
// token dies after 30 days unused). "Later" hides it for this browser session only.
function ExactReconnectPrompt() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try { if (sessionStorage.getItem("exact-reconnect-dismissed")) return; } catch {}
    fetch("/api/exact/status").then(r => r.json()).then(d => setShow(!!d.expired)).catch(() => {});
  }, []);
  if (!show) return null;
  const dismiss = () => { try { sessionStorage.setItem("exact-reconnect-dismissed", "1"); } catch {} setShow(false); };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="card" role="dialog" aria-modal="true" aria-labelledby="exact-reconnect-title" style={{ maxWidth: 420, padding: "1.5rem" }}>
        <h2 id="exact-reconnect-title" style={{ fontSize: 17, marginTop: 0 }}>Exact Online opnieuw koppelen</h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          De koppeling met Exact is verlopen. Facturen worden pas weer naar Exact gestuurd, en klanten
          uit Exact pas weer gevonden, nadat je opnieuw inlogt bij Exact.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={dismiss} className="btn-secondary" style={{ fontSize: 13 }}>Later</button>
          <a href="/api/exact/connect" className="btn-primary" style={{ fontSize: 13, textDecoration: "none" }}>Opnieuw koppelen</a>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  const cleanPath = pathname.replace("", "") || "/";
  const isPublic = PUBLIC_PATHS.some(p => cleanPath === p || cleanPath.startsWith(p + "/"));
  const isCustomerPath = cleanPath.startsWith("/mijn-");
  const role = (session?.user as any)?.role as string | undefined;
  const isCustomer = role === "CUSTOMER";

  useEffect(() => { setMenuOpen(false); }, [cleanPath]);

  useEffect(() => {
    if (status === "unauthenticated" && !isPublic) {
      router.replace("/login");
    }
  }, [status, isPublic, router]);

  if (isPublic) {
    return <main style={{ minHeight: "100vh" }}>{children}</main>;
  }

  if (status !== "authenticated") {
    return <main style={{ minHeight: "100vh" }} />;
  }

  // Customer portal layout
  if (isCustomer || isCustomerPath) {
    return <CustomerShell>{children}</CustomerShell>;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <div className="mobile-topbar">
        <button onClick={() => setMenuOpen(true)} aria-label="Menu openen">☰</button>
        <span className="mobile-title">{bakeryConfig.productName}</span>
      </div>
      <div className={`sidebar-backdrop ${menuOpen ? "open" : ""}`} onClick={() => setMenuOpen(false)} />
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <main className="app-main" style={{ flex: 1, marginLeft: 220, minHeight: "100vh", overflow: "auto" }}>
        {children}
      </main>
      {role === "OWNER" && <ExactReconnectPrompt />}
    </div>
  );
}
