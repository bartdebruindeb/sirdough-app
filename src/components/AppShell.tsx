"use client";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { CustomerShell } from "@/components/CustomerShell";
import { bakeryConfig } from "@/config/bakery.config";

const PUBLIC_PATHS = ["/login", "/uitnodiging"];

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
    </div>
  );
}
