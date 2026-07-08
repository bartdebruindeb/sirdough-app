import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getRoleFromRequest, requirePermission } from "@/server/middleware/authz";
import { prisma } from "@/server/config/db";
import { getShops } from "@/server/lib/shops";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "delivery:read");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const url = new URL(req.url);
    const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const weekday = getWeekday(date);

    const startOfDay = new Date(date + "T00:00:00Z");
    const endOfDay   = new Date(date + "T23:59:59Z");

    const [cityRoutes, breadTypes, recurring, oneOff] = await Promise.all([
      prisma.cityRoute.findMany({ where: { tenantId: tid }, orderBy: { sortOrder: "asc" } }),
      prisma.breadType.findMany({ where: { tenantId: tid, active: true }, orderBy: { sortOrder: "asc" } }),
      prisma.recurringOrder.findMany({
        where: { tenantId: tid, weekday, active: true },
        include: { customer: true, lines: { include: { breadType: true } } },
      }),
      prisma.oneOffOrder.findMany({
        where: { tenantId: tid, deliveryDate: { gte: startOfDay, lte: endOfDay } },
        include: { customer: true, lines: { include: { breadType: true } } },
      }),
    ]);
    const cityOrder: Record<string, number> = {};
    for (const c of cityRoutes) cityOrder[c.city] = c.sortOrder;

    // Pre-load shops for pickup address resolution — every shop is now a real,
    // owner-managed Customer row (Winkel page), including the bakery's own pickup
    // point, so there's no separate "is this the bakery pickup" special case anymore.
    const shopList = await getShops(tid);
    const shopNames = shopList.map(s => s.name);
    const shopCustomers = new Map(shopList.map(sc => [
      sc.name, {
        city: sc.city ?? sc.name, address: sc.address ?? sc.name, id: sc.id,
        lat: sc.lat, lng: sc.lng,
        postalCode: sc.postalCode ?? null, email: sc.email ?? null, phone: sc.phone ?? null,
      },
    ]));

    // Merge into per-customer delivery rows
    // Key = customerId for normal orders, customerId+"@"+pickupLocation for pickup orders (separate row per shop)
    const deliveryMap = new Map<string, {
      customerId: string; name: string; city: string; address: string; cityOrder: number;
      notes: string; isShop: boolean; lat: number | null; lng: number | null;
      postalCode: string | null; email: string | null; phone: string | null;
      quantities: Record<string, number>; pickupLocation: string | null;
    }>();

    const addOrder = (
      key: string, customerId: string, name: string, city: string, address: string, notes: string, isShop: boolean,
      lines: { breadTypeId: string; quantity: number }[], pickupLocation: string | null, lat?: number | null, lng?: number | null,
      postalCode?: string | null, email?: string | null, phone?: string | null,
    ) => {
      if (!deliveryMap.has(key)) {
        deliveryMap.set(key, {
          customerId, name, city, address,
          cityOrder: cityOrder[city] ?? 99,
          notes, isShop, pickupLocation,
          lat: lat ?? null, lng: lng ?? null,
          postalCode: postalCode ?? null, email: email ?? null, phone: phone ?? null,
          quantities: {},
        });
      }
      const row = deliveryMap.get(key)!;
      for (const l of lines) {
        row.quantities[l.breadTypeId] = (row.quantities[l.breadTypeId] ?? 0) + l.quantity;
      }
    };

    for (const ro of recurring) {
      const pickup = (ro as any).pickupLocation as string | null;
      if (pickup) {
        const shop = shopCustomers.get(pickup);
        const key = ro.customerId + "@" + pickup;
        addOrder(
          key,
          ro.customerId, ro.customer.name, shop?.city ?? pickup,
          shop?.address ?? pickup, ro.notes ?? "", false,
          ro.lines.map(l => ({ breadTypeId: l.breadTypeId, quantity: l.quantity })),
          pickup,
          shop?.lat, shop?.lng,
          ro.customer.postalCode, ro.customer.email, ro.customer.phone,
        );
      } else {
        addOrder(
          ro.customerId,
          ro.customerId, ro.customer.name, ro.customer.city ?? "",
          ro.customer.address ?? "", ro.notes ?? "", false,
          ro.lines.map(l => ({ breadTypeId: l.breadTypeId, quantity: l.quantity })),
          null,
          ro.customer.lat, ro.customer.lng,
          ro.customer.postalCode, ro.customer.email, ro.customer.phone,
        );
      }
    }
    for (const oo of oneOff) {
      const pickup = (oo as any).pickupLocation as string | null;
      if (pickup) {
        // Pickup order: delivery destination is the shop, show with customer name + pickup badge
        const shop = shopCustomers.get(pickup);
        const key = oo.customerId + "@" + pickup;
        addOrder(
          key,
          oo.customerId, oo.customer.name, shop?.city ?? pickup,
          shop?.address ?? pickup, oo.notes ?? "", false,
          oo.lines.map(l => ({ breadTypeId: l.breadTypeId, quantity: l.quantity })),
          pickup,
          shop?.lat, shop?.lng,
          oo.customer.postalCode, oo.customer.email, oo.customer.phone,
        );
      } else {
        addOrder(
          oo.customerId,
          oo.customerId, oo.customer.name, oo.customer.city ?? "",
          oo.customer.address ?? "", oo.notes ?? "", false,
          oo.lines.map(l => ({ breadTypeId: l.breadTypeId, quantity: l.quantity })),
          null,
          oo.customer.lat, oo.customer.lng,
          oo.customer.postalCode, oo.customer.email, oo.customer.phone,
        );
      }
    }

    // Add winkel shops from per-shop winkel templates (driven by bakery.config.ts)
    const [allWinkelRows] = await Promise.all([
      prisma.winkelTemplate.findMany({
        where: { tenantId: tid, shopName: { in: shopNames }, weekday },
        include: { breadType: true },
      }),
    ]);
    const winkelByShop = new Map<string, typeof allWinkelRows>();
    for (const r of allWinkelRows) {
      if (!winkelByShop.has(r.shopName)) winkelByShop.set(r.shopName, []);
      winkelByShop.get(r.shopName)!.push(r);
    }
    for (const shopName of shopNames) {
      const shopCustomer = shopCustomers.get(shopName);
      if (!shopCustomer) continue;
      const lines = (winkelByShop.get(shopName) ?? [])
        .map(r => ({ breadTypeId: r.breadTypeId, quantity: r.quantity }))
        .filter(l => l.quantity > 0);
      if (lines.length > 0) {
        addOrder(shopCustomer.id, shopCustomer.id, shopName, shopCustomer.city,
          shopCustomer.address, "", true, lines, null, shopCustomer.lat, shopCustomer.lng,
          shopCustomer.postalCode, shopCustomer.email, shopCustomer.phone);
      }
    }

    // Sort: shops first, then by city order (configured CityRoute, else alphabetical city), then name
    const rows = Array.from(deliveryMap.values()).sort((a, b) => {
      if (a.isShop !== b.isShop) return a.isShop ? -1 : 1;
      if (a.cityOrder !== b.cityOrder) return a.cityOrder - b.cityOrder;
      const cityCmp = a.city.localeCompare(b.city);
      if (cityCmp !== 0) return cityCmp;
      return a.name.localeCompare(b.name);
    });

    return Response.json({
      date,
      breadTypes: breadTypes.map(bt => ({ id: bt.id, name: bt.name, slug: bt.slug })),
      cityRoutes: cityRoutes.map(c => ({ city: c.city, sortOrder: c.sortOrder })),
      rows,
      role,
    });
  } catch (e) {
    return toResponse(e);
  }
}

function getWeekday(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00Z");
  const jsDay = d.getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}
