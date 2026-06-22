import type { Metadata } from "next";
import "./globals.css";
import { RoleProvider } from "@/lib/role-context";
import { AuthProvider } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import { bakeryConfig } from "@/config/bakery.config";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/server/config/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: bakeryConfig.productName,
  description: "Bakkerij beheer — productie, recepten, bestellingen",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // If TENANT_SLUG is set, we're in single-tenant mode — no subdomain check needed
  if (!process.env.TENANT_SLUG) {
    const host = headers().get("host") ?? "";
    const parts = host.split(".");
    // Only check subdomains (e.g. kangaroo.sirdough.com → parts = ["kangaroo","sirdough","com"])
    if (parts.length >= 3) {
      const slug = parts[0];
      const tenant = await prisma.tenant.findUnique({ where: { slug } });
      if (!tenant) {
        redirect("https://sirdough.com");
      }
    }
  }

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
