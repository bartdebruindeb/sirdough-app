import type { Metadata } from "next";
import "./globals.css";
import { RoleProvider } from "@/lib/role-context";
import { AuthProvider } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import { bakeryConfig } from "@/config/bakery.config";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: bakeryConfig.productName,
  description: "Bakkerij beheer — productie, recepten, bestellingen",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reject unknown subdomains: compare incoming host to the subdomain in NEXTAUTH_URL.
  // e.g. NEXTAUTH_URL=https://meneerleffers.sirdough.com → only that subdomain is valid.
  const nextAuthUrl = process.env.NEXTAUTH_URL;
  if (nextAuthUrl) {
    const validHost = new URL(nextAuthUrl).hostname; // "meneerleffers.sirdough.com"
    const incomingHost = (headers().get("host") ?? "").split(":")[0]; // strip port if any
    const isSubdomain = incomingHost.split(".").length >= 3;
    if (isSubdomain && incomingHost !== validHost) {
      redirect("https://sirdough.com");
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
