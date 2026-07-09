import { prisma } from "@/server/config/db";

export type Shop = {
  id: string; name: string; address: string | null; postalCode: string | null; city: string | null;
  kvk: string | null; phone: string | null; email: string | null; lat: number | null; lng: number | null;
};

const SHOP_SELECT = {
  id: true, name: true, address: true, postalCode: true, city: true,
  kvk: true, phone: true, email: true, lat: true, lng: true,
} as const;

/**
 * Shops are Customer rows flagged isShop — reuses all existing address/KvK/invoicing
 * infrastructure instead of a separate table, and lets the owner add/rename/delete one
 * from the UI (Winkel page) instead of editing bakery.config.ts and redeploying.
 */
export async function getShops(tenantId: string): Promise<Shop[]> {
  return (prisma as any).customer.findMany({
    where: { tenantId, isShop: true },
    orderBy: { name: "asc" },
    select: SHOP_SELECT,
  });
}
