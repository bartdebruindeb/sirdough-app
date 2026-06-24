import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getRoleFromRequest, requirePermission } from "@/server/middleware/authz";
import { prisma } from "@/server/config/db";
import { bakeryConfig } from "@/config/bakery.config";

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

    // City route order
    const cityRoutes = await prisma.cityRoute.findMany({
      where: { tenantId: tid },
      orderBy: { sortOrder: "asc" },
    });
    const cityOrder: Record<string, number> = {};
    for (const c of cityRoutes) cityOrder[c.city] = c.sortOrder;

    // Bread types for column headers
    const breadTypes = await prisma.breadType.findMany({
      where: { tenantId: tid, active: true },
      orderBy: { sortOrder: "asc" },
    });

    // Recurring orders for this weekday
    const recurring = await prisma.recurringOrder.findMany({
      where: { tenantId: tid, weekday, active: true },
      include: { customer: true, lines: { include: { breadType: true } } },
    });

    // One-off orders for this date
    const oneOff = await prisma.oneOffOrder.findMany({
      where: { tenantId: tid, deliveryDate: { gte: startOfDay, lte: endOfDay } },
      include: { customer: true, lines: { include: { breadType: true } } },
    });

    // Pre-load shop customers for pickup address resolution
    const shopCustomers = new Map<string, { city: string; address: string; lat: number | null; lng: number | null }>();
    for (const shopCfg of bakeryConfig.shops) {
      const sc = await prisma.customer.findFirst({ where: { tenantId: tid, name: shopCfg.name } });
      if (sc) shopCustomers.set(shopCfg.name, { city: sc.city ?? shopCfg.name, address: sc.address ?? shopCfg.name, lat: sc.lat, lng: sc.lng });
    }

    // Merge into per-customer delivery rows
    // Key = customerId for normal orders, customerId+"@"+pickupLocation for pickup orders (separate row per shop)
    const deliveryMap = new Map<string, {
      customerId: string; name: string; city: string; address: string; cityOrder: number;
      notes: string; isShop: boolean; lat: number | null; lng: number | null;
      quantities: Record<string, number>; pickupLocation: string | null;
    }>();

    const addOrder = (key: string, customerId: string, name: string, city: string, address: string, notes: string, isShop: boolean, lines: { breadTypeId: string; quantity: number }[], pickupLocation: string | null, lat?: number | null, lng?: number | null) => {
      if (!deliveryMap.has(key)) {
        deliveryMap.set(key, {
          customerId, name, city, address,
          cityOrder: cityOrder[city] ?? 99,
          notes, isShop, pickupLocation,
          lat: lat ?? null, lng: lng ?? null,
          quantities: {},
        });
      }
      const row = deliveryMap.get(key)!;
      for (const l of lines) {
        row.quantities[l.breadTypeId] = (row.quantities[l.breadTypeId] ?? 0) + l.quantity;
      }
    };

    for (const ro of recurring) {
      addOrder(
        ro.customerId,
        ro.customerId, ro.customer.name, ro.customer.city ?? "",
        ro.customer.address ?? "", ro.notes ?? "", false,
        ro.lines.map(l => ({ breadTypeId: l.breadTypeId, quantity: l.quantity })),
        null,
        ro.customer.lat, ro.customer.lng,
      );
    }
    for (const oo of oneOff) {
      const pickup = (oo as any).pickupLocation as string | null;
      if (pickup) {
        // Pickup order: delivery destination is the shop, show with customer name + pickup badge
        const shop = shopCustomers.get(pickup);
        const shopCity = shop?.city ?? pickup;
        const key = oo.customerId + "@" + pickup;
        addOrder(
          key,
          oo.customerId, oo.customer.name, shopCity,
          shop?.address ?? pickup, oo.notes ?? "", false,
          oo.lines.map(l => ({ breadTypeId: l.breadTypeId, quantity: l.quantity })),
          pickup,
          shop?.lat, shop?.lng,
        );
      } else {
        addOrder(
          oo.customerId,
          oo.customerId, oo.customer.name, oo.customer.city ?? "",
          oo.customer.address ?? "", oo.notes ?? "", false,
          oo.lines.map(l => ({ breadTypeId: l.breadTypeId, quantity: l.quantity })),
          null,
          oo.customer.lat, oo.customer.lng,
        );
      }
    }

    // Add winkel shops from per-shop winkel templates (driven by bakery.config.ts)
    for (const shopCfg of bakeryConfig.shops) {
      const shopCustomer = await prisma.customer.findFirst({ where: { tenantId: tid, name: shopCfg.name } });
      if (!shopCustomer) continue;

      const winkelRows = await prisma.winkelTemplate.findMany({
        where: { tenantId: tid, shopName: shopCfg.name, weekday },
        include: { breadType: true },
      });
      const lines = winkelRows.map(r => ({ breadTypeId: r.breadTypeId, quantity: r.quantity }))
        .filter(l => l.quantity > 0);
      if (lines.length > 0) {
        addOrder(shopCustomer.id, shopCustomer.id, shopCfg.name, shopCustomer.city ?? shopCfg.name,
          shopCustomer.address ?? shopCfg.name, "", true, lines, null, shopCustomer.lat, shopCustomer.lng);
      }
    }

    // Sort: shops first (by city order), then horeca by city order, then name
    const rows = Array.from(deliveryMap.values()).sort((a, b) => {
      if (a.isShop !== b.isShop) return a.isShop ? -1 : 1;
      if (a.cityOrder !== b.cityOrder) return a.cityOrder - b.cityOrder;
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
