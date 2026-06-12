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

    // Merge into per-customer delivery rows
    const deliveryMap = new Map<string, {
      customerId: string; name: string; city: string; address: string; cityOrder: number;
      notes: string; isShop: boolean;
      quantities: Record<string, number>;
    }>();

    const addOrder = (customerId: string, name: string, city: string, address: string, notes: string, isShop: boolean, lines: { breadTypeId: string; quantity: number }[]) => {
      const key = customerId;
      if (!deliveryMap.has(key)) {
        deliveryMap.set(key, {
          customerId, name, city, address,
          cityOrder: cityOrder[city] ?? 99,
          notes, isShop,
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
        ro.customerId, ro.customer.name, ro.customer.city ?? "",
        ro.customer.address ?? "", ro.notes ?? "", false,
        ro.lines.map(l => ({ breadTypeId: l.breadTypeId, quantity: l.quantity }))
      );
    }
    for (const oo of oneOff) {
      addOrder(
        oo.customerId, oo.customer.name, oo.customer.city ?? "",
        oo.customer.address ?? "", oo.notes ?? "", false,
        oo.lines.map(l => ({ breadTypeId: l.breadTypeId, quantity: l.quantity }))
      );
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
        addOrder(shopCustomer.id, shopCfg.name, shopCustomer.city ?? shopCfg.name,
          shopCustomer.address ?? shopCfg.name, "", true, lines);
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
