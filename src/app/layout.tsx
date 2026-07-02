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
  // Reject any host that doesn't match this deployment's own subdomain (NEXTAUTH_URL).
  // e.g. NEXTAUTH_URL=https://meneerleffers.sirdough.com → only that host is valid.
  // With multiple bakeries as separate deployments on the same VPS, this is what stops
  // a misconfigured nginx route (or someone hitting the port directly) from serving one
  // bakery's app/data under another bakery's — or the bare — domain.
  const nextAuthUrl = process.env.NEXTAUTH_URL;
  if (nextAuthUrl) {
    const validHost = new URL(nextAuthUrl).hostname; // "meneerleffers.sirdough.com"
    const incomingHost = (headers().get("host") ?? "").split(":")[0]; // strip port if any
    // Allow bare localhost/loopback through — internal health checks and nginx's own
    // proxy_pass to 127.0.0.1:<port> shouldn't be blocked; real traffic always arrives
    // with the actual Host header set (see nginx proxy_set_header Host $host).
    const isLocal = incomingHost === "" || incomingHost === "localhost" || incomingHost === "127.0.0.1";
    if (!isLocal && incomingHost !== validHost) {
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
