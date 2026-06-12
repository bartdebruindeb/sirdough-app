import type { Metadata } from "next";
import "./globals.css";
import { RoleProvider } from "@/lib/role-context";
import { AuthProvider } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import { bakeryConfig } from "@/config/bakery.config";

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
