import { prisma } from "@/server/config/db";

function getWeekday(dateStr: string): number {
  const j = new Date(dateStr + "T12:00:00Z").getUTCDay();
  return j === 0 ? 7 : j;
}

export type ShopDayLines = { date: string; lines: { breadTypeId: string; breadTypeName: string; quantity: number }[] };

/**
 * Expands a shop's WinkelTemplate (baseline quantity per weekday) + WinkelLog (saved
 * actuals for a specific date, which take priority over the template when present)
 * into per-day delivery lines for a date range. Shops never get OneOffOrder rows —
 * their bread flows through winkel production tracking instead — so this is how their
 * invoiceable quantities are derived for /api/facturen.
 */
export async function buildShopDeliveryLines(tenantId: string, shopName: string, start: Date, end: Date): Promise<ShopDayLines[]> {
  const breadTypes = await prisma.breadType.findMany({ where: { tenantId, active: true } });

  const templates = await prisma.winkelTemplate.findMany({
    where: { tenantId, shopName },
    include: { breadType: true },
  });
  const templateByWeekday = new Map<number, { breadTypeId: string; breadTypeName: string; quantity: number }[]>();
  for (const t of templates) {
    if (!templateByWeekday.has(t.weekday)) templateByWeekday.set(t.weekday, []);
    templateByWeekday.get(t.weekday)!.push({ breadTypeId: t.breadTypeId, breadTypeName: t.breadType.name, quantity: t.quantity });
  }

  const logs = await prisma.winkelLog.findMany({
    where: { tenantId, shopName, date: { gte: start, lte: end } },
  });
  const logsByDate = new Map<string, Record<string, number>>();
  for (const l of logs) logsByDate.set(l.date.toISOString().slice(0, 10), l.quantities as Record<string, number>);

  const result: ShopDayLines[] = [];
  const d = new Date(start);
  while (d <= end) {
    const dateStr = d.toISOString().slice(0, 10);
    const templateLines = templateByWeekday.get(getWeekday(dateStr)) ?? [];
    if (templateLines.length > 0) {
      const logQtys = logsByDate.get(dateStr);
      const lines: { breadTypeId: string; breadTypeName: string; quantity: number }[] = [];
      if (logQtys) {
        for (const bt of breadTypes) {
          const qty = logQtys[bt.slug] ?? 0;
          if (qty > 0) lines.push({ breadTypeId: bt.id, breadTypeName: bt.name, quantity: qty });
        }
      } else {
        for (const tl of templateLines) if (tl.quantity > 0) lines.push(tl);
      }
      if (lines.length > 0) result.push({ date: dateStr, lines });
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return result;
}
