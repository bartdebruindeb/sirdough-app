import { prisma } from "@/server/config/db";
import { bakeryConfig } from "@/config/bakery.config";

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
 * infrastructure instead of a separate table, and lets the owner add one from the UI
 * (Winkel page) instead of editing bakery.config.ts and redeploying.
 *
 * One-time bootstrap: the bakery's own pickup point ("Ophalen Rotterdam") used to be a
 * hardcoded option tied to bakeryConfig.bakeryAddress with no Customer record at all.
 * If no shop with that name exists yet, create one from the config address so it keeps
 * working as a real, editable shop after cutover — this only ever runs once per tenant.
 */
export async function getShops(tenantId: string): Promise<Shop[]> {
  let shops = await (prisma as any).customer.findMany({
    where: { tenantId, isShop: true },
    orderBy: { name: "asc" },
    select: SHOP_SELECT,
  });

  const bakeryShopName = "Ophalen Rotterdam";
  if (bakeryConfig.bakeryAddress && !shops.some((s: Shop) => s.name === bakeryShopName)) {
    const created = await prisma.customer.create({
      data: {
        tenantId, name: bakeryShopName, address: bakeryConfig.bakeryAddress,
        lat: bakeryConfig.bakeryLat, lng: bakeryConfig.bakeryLng,
        isShop: true, active: true, discountPercent: 0,
      } as any,
      select: SHOP_SELECT,
    });
    shops = [...shops, created].sort((a: Shop, b: Shop) => a.name.localeCompare(b.name));
  }

  return shops;
}
