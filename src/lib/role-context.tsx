"use client";
import React, { createContext, useContext } from "react";
import { useSession } from "next-auth/react";

export type AppRole = "OWNER" | "ORDER_TABLET" | "BAKKER" | "BEZORGER";

export const ROLE_LABELS: Record<AppRole, string> = {
  OWNER:        "Eigenaar",
  ORDER_TABLET: "Order Tablet",
  BAKKER:       "Bakker",
  BEZORGER:     "Bezorger",
};

export const ROLE_ICONS: Record<AppRole, string> = {
  OWNER:        "👑",
  ORDER_TABLET: "📋",
  BAKKER:       "🥖",
  BEZORGER:     "🚐",
};

// Pages each role can access
export const ROLE_PAGES: Record<AppRole, string[]> = {
  OWNER:        ["/", "/productie", "/recepten", "/winkel", "/bestellingen", "/logboek", "/bezorgen", "/klanten", "/team", "/facturatie"],
  ORDER_TABLET: ["/", "/productie", "/bestellingen", "/logboek", "/bezorgen"],
  BAKKER:       ["/", "/productie", "/bestellingen", "/logboek", "/bezorgen"],
  BEZORGER:     ["/", "/bestellingen", "/logboek", "/bezorgen"],
};

// Permissions per role (mirrors src/server/config/rbac.ts — keep in sync)
export type Permission =
  | "orders:read" | "orders:write" | "orders:write_recurring"
  | "production:read" | "production:write"
  | "recipes:read" | "recipes:write"
  | "customers:read" | "customers:write"
  | "invoicing:read"
  | "delivery:read" | "delivery:write" | "delivery:note";

export const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  OWNER: [
    "orders:read","orders:write","orders:write_recurring",
    "production:read","production:write",
    "recipes:read","recipes:write",
    "customers:read","customers:write",
    "invoicing:read",
    "delivery:read","delivery:write","delivery:note",
  ],
  ORDER_TABLET: [
    "orders:read","orders:write","orders:write_recurring",
    "production:read",
    "delivery:read",
    "customers:read",
  ],
  BAKKER: [
    "orders:read",
    "production:read",
    "delivery:read",
    "customers:read",
  ],
  BEZORGER: [
    "orders:read",
    "delivery:read","delivery:write","delivery:note",
    "customers:read",
  ],
};

export function hasPermission(role: AppRole, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}

const RoleContext = createContext<{
  role: AppRole;
  can: (perm: Permission) => boolean;
  canAccess: (path: string) => boolean;
  userName: string | null;
  loading: boolean;
}>({
  role: "OWNER",
  can: () => true,
  canAccess: () => true,
  userName: null,
  loading: false,
});

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  const sessionRole = (session?.user as any)?.role as string | undefined;
  const role: AppRole = (sessionRole && sessionRole !== "CUSTOMER" ? sessionRole : "OWNER") as AppRole;
  const userName = (session?.user as any)?.name ?? session?.user?.email ?? null;

  const can = (perm: Permission) => hasPermission(role, perm);
  const canAccess = (path: string) => {
    const pages = ROLE_PAGES[role] ?? [];
    return pages.some(p => path === p || (path.startsWith(p) && p !== "/"));
  };

  return (
    <RoleContext.Provider value={{ role, can, canAccess, userName, loading: status === "loading" }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
