import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getRoleFromRequest, requirePermission } from "@/server/middleware/authz";
import { prisma } from "@/server/config/db";

export const dynamic = "force-dynamic";

function getWeekday(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00Z");
  const j = d.getUTCDay();
  return j === 0 ? 7 : j;
}

export async function GET(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "invoicing:read");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const url = new URL(req.url);
    const customerId = url.searchParams.get("customerId");
    const from = url.searchParams.get("from");
    const to   = url.searchParams.get("to");

    if (!customerId || !from || !to) {
      return Response.json({ error: "customerId, from, to required" }, { status: 400 });
    }

    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId: tid } });
    if (!customer) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

    const breadTypes = await prisma.breadType.findMany({
      where: { tenantId: tid, active: true },
      orderBy: { sortOrder: "asc" },
    });

    type DeliveryLine = { breadTypeId: string; breadTypeName: string; quantity: number };
    const deliveryMap = new Map<string, DeliveryLine[]>();

    const isWinkel = (customer as any).isShop;

    if (isWinkel) {
      // Expand winkel template + logs into daily deliveries
      const shopName = customer.name; // e.g. "Winkel Delft" or any configured shop name

      // Get template for this shop
      const templates = await prisma.winkelTemplate.findMany({
        where: { tenantId: tid, shopName },
        include: { breadType: true },
      });
      const templateByWeekday = new Map<number, { breadTypeId: string; name: string; quantity: number }[]>();
      for (const t of templates) {
        if (!templateByWeekday.has(t.weekday)) templateByWeekday.set(t.weekday, []);
        templateByWeekday.get(t.weekday)!.push({ breadTypeId: t.breadTypeId, name: t.breadType.name, quantity: t.quantity });
      }

      // Get saved winkel logs for date range
      const logs = await prisma.winkelLog.findMany({
        where: {
          tenantId: tid, shopName,
          date: { gte: new Date(from + "T00:00:00Z"), lte: new Date(to + "T23:59:59Z") },
        },
        orderBy: { date: "asc" },
      });
      const logsByDate = new Map<string, Record<string, number>>();
      for (const l of logs) {
        logsByDate.set(l.date.toISOString().slice(0, 10), l.quantities as Record<string, number>);
      }

      // Walk every day in range, using log if available else template
      const fromDate = new Date(from + "T12:00:00Z");
      const toDate   = new Date(to   + "T12:00:00Z");
      const d = new Date(fromDate);
      while (d <= toDate) {
        const dateStr = d.toISOString().slice(0, 10);
        const wd = getWeekday(dateStr);
        const templateLines = templateByWeekday.get(wd) ?? [];
        if (templateLines.length > 0) {
          const logQtys = logsByDate.get(dateStr);
          const lines: DeliveryLine[] = [];
          if (logQtys) {
            // Use saved log quantities
            for (const bt of breadTypes) {
              const qty = logQtys[bt.slug] ?? 0;
              if (qty > 0) lines.push({ breadTypeId: bt.id, breadTypeName: bt.name, quantity: qty });
            }
          } else {
            // Use template
            for (const tl of templateLines) {
              if (tl.quantity > 0) lines.push({ breadTypeId: tl.breadTypeId, breadTypeName: tl.name, quantity: tl.quantity });
            }
          }
          if (lines.length > 0) deliveryMap.set(dateStr, lines);
        }
        d.setUTCDate(d.getUTCDate() + 1);
      }
    } else {
      // Regular horeca customer: one-off + recurring
      const oneOffOrders = await prisma.oneOffOrder.findMany({
        where: {
          tenantId: tid, customerId,
          deliveryDate: { gte: new Date(from + "T00:00:00Z"), lte: new Date(to + "T23:59:59Z") },
        },
        include: { lines: { include: { breadType: true } } },
        orderBy: { deliveryDate: "asc" },
      });

      const recurringOrders = await prisma.recurringOrder.findMany({
        where: { tenantId: tid, customerId },
        include: {
          lines: { include: { breadType: true } },
          exceptions: {
            where: { date: { gte: new Date(from + "T00:00:00Z"), lte: new Date(to + "T23:59:59Z") } },
          },
        },
      });

      // Expand recurring
      const fromDate = new Date(from + "T12:00:00Z");
      const toDate   = new Date(to   + "T12:00:00Z");
      for (const ro of recurringOrders) {
        if (!ro.active && ro.exceptions.filter(e => e.active).length === 0) continue;
        const d = new Date(fromDate);
        while (d <= toDate) {
          const wd = getWeekday(d.toISOString().slice(0, 10));
          if (wd === ro.weekday) {
            const dateStr = d.toISOString().slice(0, 10);
            const exception = ro.exceptions.find(e => e.date.toISOString().slice(0, 10) === dateStr);
            const active = exception ? exception.active : ro.active;
            if (active && ro.lines.length > 0) {
              if (!deliveryMap.has(dateStr)) deliveryMap.set(dateStr, []);
              for (const l of ro.lines) {
                const ex = deliveryMap.get(dateStr)!.find(x => x.breadTypeId === l.breadTypeId);
                if (ex) ex.quantity += l.quantity;
                else deliveryMap.get(dateStr)!.push({ breadTypeId: l.breadTypeId, breadTypeName: l.breadType.name, quantity: l.quantity });
              }
            }
          }
          d.setUTCDate(d.getUTCDate() + 1);
        }
      }

      for (const oo of oneOffOrders) {
        const date = oo.deliveryDate.toISOString().slice(0, 10);
        if (!deliveryMap.has(date)) deliveryMap.set(date, []);
        for (const l of oo.lines) {
          const ex = deliveryMap.get(date)!.find(x => x.breadTypeId === l.breadTypeId);
          if (ex) ex.quantity += l.quantity;
          else deliveryMap.get(date)!.push({ breadTypeId: l.breadTypeId, breadTypeName: l.breadType.name, quantity: l.quantity });
        }
      }
    }

    // Fetch delivery notes for this customer in this date range
    const deliveryNotes = await prisma.deliveryNote.findMany({
      where: {
        tenantId: tid, customerId,
        date: { gte: new Date(from + "T00:00:00Z"), lte: new Date(to + "T23:59:59Z") },
      },
    });
    const notesByDate = new Map<string, string>();
    for (const dn of deliveryNotes) notesByDate.set(dn.date.toISOString().slice(0, 10), dn.note);

    const rows = Array.from(deliveryMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, lines]) => ({ date, lines, deliveryNote: notesByDate.get(date) }));

    // Include dates with only a delivery note (no order lines)
    for (const [date, note] of Array.from(notesByDate)) {
      if (!deliveryMap.has(date)) {
        rows.push({ date, lines: [], deliveryNote: note });
      }
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));

    const totals: Record<string, number> = {};
    for (const row of rows) {
      for (const l of row.lines) {
        totals[l.breadTypeId] = (totals[l.breadTypeId] ?? 0) + l.quantity;
      }
    }

    return Response.json({
      customer,
      from, to,
      rows,
      totals,
      breadTypes: breadTypes.map(bt => ({ id: bt.id, name: bt.name, slug: bt.slug })),
    });
  } catch (e) {
    return toResponse(e);
  }
}
