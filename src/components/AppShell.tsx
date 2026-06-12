"use client";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";

// Pages that should render full-screen without the staff sidebar
const NO_SIDEBAR_PATHS = ["/login", "/uitnodiging", "/mijn-bestellingen"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const cleanPath = pathname.replace("/digitalbakery", "") || "/";
  const hideSidebar = NO_SIDEBAR_PATHS.some(p => cleanPath === p || cleanPath.startsWith(p + "/"));

  if (hideSidebar) {
    return <main style={{ minHeight: "100vh" }}>{children}</main>;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main style={{ flex: 1, marginLeft: 220, minHeight: "100vh", overflow: "auto" }}>
        {children}
      </main>
    </div>
  );
}
