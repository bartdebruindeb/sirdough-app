"use client";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { bakeryConfig } from "@/config/bakery.config";

// Pages that should render full-screen without the staff sidebar,
// and that unauthenticated visitors are allowed to see.
const PUBLIC_PATHS = ["/login", "/uitnodiging", "/mijn-bestellingen"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  const cleanPath = pathname.replace("", "") || "/";
  const isPublic = PUBLIC_PATHS.some(p => cleanPath === p || cleanPath.startsWith(p + "/"));

  // Close the mobile menu whenever the route changes
  useEffect(() => { setMenuOpen(false); }, [cleanPath]);

  // Safety net: if there's no session and we're not on a public page,
  // send the visitor to /login. Middleware handles this for normal
  // routes, but doesn't run for paths outside basePath (e.g. someone
  // visiting the bare domain) — this catches that case too.
  useEffect(() => {
    if (status === "unauthenticated" && !isPublic) {
      router.replace("/login");
    }
  }, [status, isPublic, router]);

  if (isPublic) {
    return <main style={{ minHeight: "100vh" }}>{children}</main>;
  }

  // While checking session, or if unauthenticated (redirect in flight),
  // show nothing rather than a flash of the full owner sidebar.
  if (status !== "authenticated") {
    return <main style={{ minHeight: "100vh" }} />;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Mobile top bar with hamburger */}
      <div className="mobile-topbar">
        <button onClick={() => setMenuOpen(true)} aria-label="Menu openen">☰</button>
        <span className="mobile-title">{bakeryConfig.productName}</span>
      </div>

      {/* Dark backdrop, closes menu on tap */}
      <div className={`sidebar-backdrop ${menuOpen ? "open" : ""}`} onClick={() => setMenuOpen(false)} />

      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <main className="app-main" style={{ flex: 1, marginLeft: 220, minHeight: "100vh", overflow: "auto" }}>
        {children}
      </main>
    </div>
  );
}
