import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getRoleFromRequest, requirePermission } from "@/server/middleware/authz";
import { prisma } from "@/server/config/db";
import { bakeryConfig } from "@/config/bakery.config";

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
    requirePermission(role, "orders:read");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? "2020-01-01";
    // Default to 3 months in future for one-off, today for recurring cutoff
    const today = new Date().toISOString().slice(0, 10);
    const futureDate = new Date(); futureDate.setMonth(futureDate.getMonth() + 3);
    const to = url.searchParams.get("to") ?? futureDate.toISOString().slice(0, 10);
    const filterCustomerId = url.searchParams.get("customerId") ?? null;

    const breadTypes = await prisma.breadType.findMany({
      where: { tenantId: tid, active: true },
      orderBy: { sortOrder: "asc" },
    });

    // All one-off orders (past + future)
    const oneOffOrders = await prisma.oneOffOrder.findMany({
      where: {
        tenantId: tid,
        deliveryDate: {
          gte: new Date(from + "T00:00:00Z"),
          lte: new Date(to + "T23:59:59Z"),
        },
        ...(filterCustomerId && { customerId: filterCustomerId }),
      },
      include: { customer: true, lines: { include: { breadType: true } } },
      orderBy: { deliveryDate: "desc" },
    });

    // Past recurring deliveries — expand into actual dates up to today
    const recurringOrders = await prisma.recurringOrder.findMany({
      where: { tenantId: tid, ...(filterCustomerId && { customerId: filterCustomerId }) },
      include: {
        customer: true,
        lines: { include: { breadType: true } },
        exceptions: true,
      },
    });

    type LogEntry = {
      type: "eenmalig" | "vast" | "winkel";
      date: string;
      customerName: string;
      customerId: string;
      city: string | null;
      notes: string | null;
      deliveryNote?: string;
      inBusAt?: string | null;
      deliveredAt?: string | null;
      lines: { breadTypeId: string; breadTypeName: string; quantity: number }[];
    };

    const entries: LogEntry[] = [];

    // Add one-off orders
    for (const oo of oneOffOrders) {
      entries.push({
        type: "eenmalig",
        date: oo.deliveryDate.toISOString().slice(0, 10),
        customerName: oo.customer.name,
        customerId: oo.customerId,
        city: oo.customer.city,
        notes: oo.notes,
        lines: oo.lines.map(l => ({ breadTypeId: l.breadTypeId, breadTypeName: l.breadType.name, quantity: l.quantity })),
      });
    }

    // Expand past recurring into dates (from start to today)
    const fromDate = new Date(from + "T12:00:00Z");
    const toDatePast = new Date(today + "T12:00:00Z"); // only past recurring

    for (const ro of recurringOrders) {
      if (ro.lines.length === 0) continue;
      const d = new Date(fromDate);
      while (d <= toDatePast) {
        const wd = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
        if (wd === ro.weekday) {
          const dateStr = d.toISOString().slice(0, 10);
          const exception = ro.exceptions.find(e => e.date.toISOString().slice(0, 10) === dateStr);
          const active = exception ? exception.active : ro.active;
          if (active) {
            entries.push({
              type: "vast",
              date: dateStr,
              customerName: ro.customer.name,
              customerId: ro.customerId,
              city: ro.customer.city,
              notes: ro.notes,
              lines: ro.lines.map(l => ({ breadTypeId: l.breadTypeId, breadTypeName: l.breadType.name, quantity: l.quantity })),
            });
          }
        }
        d.setUTCDate(d.getUTCDate() + 1);
      }
    }

    // Add winkel shop deliveries (past dates only) — driven by bakery.config.ts
    for (const shopCfg of bakeryConfig.shops) {
      const shopCustomer = await prisma.customer.findFirst({ where: { tenantId: tid, name: shopCfg.name } });
      if (shopCustomer && (!filterCustomerId || filterCustomerId === shopCustomer.id)) {
        await addWinkelEntries(tid, shopCfg.name, shopCustomer.id, shopCustomer.city, fromDate, toDatePast, entries);
      }
    }

    // Merge delivery notes
    const deliveryNotes = await prisma.deliveryNote.findMany({
      where: {
        tenantId: tid,
        date: { gte: new Date(from + "T00:00:00Z"), lte: new Date(to + "T23:59:59Z") },
      },
    });
    for (const dn of deliveryNotes) {
      const dateStr = dn.date.toISOString().slice(0, 10);
      const entry = entries.find(e => e.date === dateStr && e.customerId === dn.customerId);
      if (entry) {
        entry.deliveryNote = dn.note;
      } else {
        const customer = await prisma.customer.findFirst({ where: { id: dn.customerId } });
        entries.push({
          type: "winkel", date: dateStr, customerName: customer?.name ?? "?",
          customerId: dn.customerId, city: customer?.city ?? null, notes: null,
          lines: [], deliveryNote: dn.note,
        });
      }
    }

    // Merge delivery timestamps
    const deliveryStatuses = await prisma.deliveryStatus.findMany({
      where: {
        tenantId: tid,
        date: { gte: new Date(from + "T00:00:00Z"), lte: new Date(to + "T23:59:59Z") },
      },
    });
    for (const ds of deliveryStatuses) {
      const dateStr = ds.date.toISOString().slice(0, 10);
      for (const entry of entries.filter(e => e.date === dateStr && e.customerId === ds.customerId)) {
        entry.inBusAt     = ds.inBusAt?.toISOString()     ?? null;
        entry.deliveredAt = ds.deliveredAt?.toISOString() ?? null;
      }
    }

    // Sort by date desc
    entries.sort((a, b) => b.date.localeCompare(a.date));

    return Response.json({
      entries,
      breadTypes: breadTypes.map(bt => ({ id: bt.id, name: bt.name, slug: bt.slug, sortOrder: bt.sortOrder })),
    });
  } catch (e) {
    return toResponse(e);
  }
}

// Helper to expand winkel shop deliveries into log entries
async function addWinkelEntries(
  tid: string,
  shopName: string,
  customerId: string,
  city: string | null,
  fromDate: Date,
  toDate: Date,
  entries: any[]
) {
  const templates = await prisma.winkelTemplate.findMany({
    where: { tenantId: tid, shopName },
    include: { breadType: true },
  });
  const templateByWeekday = new Map<number, { breadTypeId: string; name: string; quantity: number }[]>();
  for (const t of templates) {
    if (!templateByWeekday.has(t.weekday)) templateByWeekday.set(t.weekday, []);
    templateByWeekday.get(t.weekday)!.push({ breadTypeId: t.breadTypeId, name: t.breadType.name, quantity: t.quantity });
  }

  const logs = await prisma.winkelLog.findMany({
    where: { tenantId: tid, shopName, date: { gte: fromDate, lte: toDate } },
  });
  const logsByDate = new Map<string, Record<string, number>>();
  for (const l of logs) logsByDate.set(l.date.toISOString().slice(0, 10), l.quantities as Record<string, number>);

  const breadTypes = await prisma.breadType.findMany({ where: { tenantId: tid, active: true }, orderBy: { sortOrder: "asc" } });

  const d = new Date(fromDate);
  while (d <= toDate) {
    const dateStr = d.toISOString().slice(0, 10);
    const jsDay = d.getUTCDay();
    const wd = jsDay === 0 ? 7 : jsDay;
    const templateLines = templateByWeekday.get(wd) ?? [];
    if (templateLines.length > 0) {
      const logQtys = logsByDate.get(dateStr);
      const lines: { breadTypeId: string; breadTypeName: string; quantity: number }[] = [];
      if (logQtys) {
        for (const bt of breadTypes) {
          const qty = logQtys[bt.slug] ?? 0;
          if (qty > 0) lines.push({ breadTypeId: bt.id, breadTypeName: bt.name, quantity: qty });
        }
      } else {
        for (const tl of templateLines) {
          if (tl.quantity > 0) lines.push({ breadTypeId: tl.breadTypeId, breadTypeName: tl.name, quantity: tl.quantity });
        }
      }
      if (lines.length > 0) {
        entries.push({ type: "winkel", date: dateStr, customerName: shopName, customerId, city, notes: null, lines });
      }
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
}
