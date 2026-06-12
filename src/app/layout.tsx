import type { Metadata } from "next";
import "./globals.css";
import { RoleProvider } from "@/lib/role-context";
import { AuthProvider } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import { bakeryConfig } from "@/config/bakery.config";

// This is an authenticated, per-user application — never statically cache
// pages. Without this, Next.js prerenders pages like "/" at build time and
// serves the SAME cached HTML (with a 1-year Cache-Control) to every
// visitor regardless of login state, which is both a security issue and
// breaks the login redirect.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: bakeryConfig.productName,
  description: "Bakkerij beheer — productie, recepten, bestellingen",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        <AuthProvider>
          <RoleProvider>
            <AppShell>{children}</AppShell>
          </RoleProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
