import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getRoleFromRequest, requirePermission } from "@/server/middleware/authz";
import { prisma } from "@/server/config/db";
import { z } from "zod";
import { parseJson } from "@/server/lib/validation";
import { isCutoffPassed } from "@/lib/cutoff";

export const dynamic = "force-dynamic";

// WMO weather code → emoji + label
function weatherIcon(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: "☀️", label: "Helder" };
  if (code <= 2) return { icon: "⛅", label: "Halfbewolkt" };
  if (code <= 3) return { icon: "☁️", label: "Bewolkt" };
  if (code <= 49) return { icon: "🌫️", label: "Mist" };
  if (code <= 59) return { icon: "🌦️", label: "Motregen" };
  if (code <= 69) return { icon: "🌧️", label: "Regen" };
  if (code <= 79) return { icon: "❄️", label: "Sneeuw" };
  if (code <= 82) return { icon: "🌧️", label: "Buien" };
  if (code <= 99) return { icon: "⛈️", label: "Onweer" };
  return { icon: "🌤️", label: "" };
}

export async function GET(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "production:read");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const url = new URL(req.url);
    const shopName = url.searchParams.get("shop") ?? "Winkel Delft";
    const daysBack = parseInt(url.searchParams.get("days") ?? "35");

    // Last N days of logs
    const since = new Date();
    since.setDate(since.getDate() - daysBack);

    const logs = await prisma.winkelLog.findMany({
      where: { tenantId: tid, shopName, date: { gte: since } },
      orderBy: { date: "desc" },
    });

    // Bread types for column headers
    const breadTypes = await prisma.breadType.findMany({
      where: { tenantId: tid, active: true },
      orderBy: { sortOrder: "asc" },
      include: { recipe: { select: { id: true } } },
    });

    // Weekly template for this shop
    const shop = url.searchParams.get("shop") ?? "Winkel Delft";
    const templates = await prisma.winkelTemplate.findMany({
      where: { tenantId: tid, shopName: shop },
      include: { breadType: true },
    });
    // Group template by weekday
    const templateByWeekday: Record<number, Record<string, number>> = {};
    for (const t of templates) {
      if (!templateByWeekday[t.weekday]) templateByWeekday[t.weekday] = {};
      templateByWeekday[t.weekday][t.breadTypeId] = t.quantity;
    }

    return Response.json({
      logs: logs.map(l => ({
        id: l.id,
        date: l.date.toISOString().slice(0, 10),
        quantities: l.quantities,
        weatherTemp: l.weatherTemp,
        weatherCode: l.weatherCode,
        weatherIcon: l.weatherCode != null ? weatherIcon(l.weatherCode) : null,
      })),
      breadTypes: breadTypes.map(bt => ({ id: bt.id, slug: bt.slug, name: bt.name, hasRecipe: !!bt.recipe, customerOrderable: bt.customerOrderable, winkelOrderable: bt.winkelOrderable, availableWeekdays: bt.availableWeekdays })),
      templateByWeekday,
    });
  } catch (e) {
    return toResponse(e);
  }
}

const SaveSchema = z.object({
  shopName: z.string(),
  date: z.string(),
  quantities: z.record(z.string(), z.number()),
  weatherTemp: z.number().optional(),
  weatherCode: z.number().optional(),
});

export async function POST(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "production:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, SaveSchema);
    if (isCutoffPassed(input.date)) {
      return Response.json({ error: "CUTOFF_PASSED", message: "De besteldeadline voor deze dag is al verstreken — aanpassen kan niet meer." }, { status: 403 });
    }
    const date = new Date(input.date + "T12:00:00Z");

    // Fetch before upsert so we can compute the delta for next-week propagation
    const existingLog = await prisma.winkelLog.findUnique({
      where: { tenantId_shopName_date: { tenantId: tid, shopName: input.shopName, date } },
    });

    const log = await prisma.winkelLog.upsert({
      where: { tenantId_shopName_date: { tenantId: tid, shopName: input.shopName, date } },
      create: {
        tenantId: tid,
        shopName: input.shopName,
        date,
        quantities: input.quantities,
        weatherTemp: input.weatherTemp,
        weatherCode: input.weatherCode,
      },
      update: {
        quantities: input.quantities,
        weatherTemp: input.weatherTemp,
        weatherCode: input.weatherCode,
      },
    });

    // Propagate delta to next week's same day when updating an existing log
    if (existingLog) {
      const oldQty = existingLog.quantities as Record<string, number>;
      const newQty = input.quantities as Record<string, number>;
      const delta: Record<string, number> = {};
      let hasDelta = false;
      for (const slug of Object.keys(newQty)) {
        const d = (newQty[slug] ?? 0) - (oldQty[slug] ?? 0);
        if (d !== 0) { delta[slug] = d; hasDelta = true; }
      }
      if (hasDelta) {
        const nextDate = new Date(date);
        nextDate.setUTCDate(nextDate.getUTCDate() + 7);
        const wd = nextDate.getUTCDay() === 0 ? 7 : nextDate.getUTCDay();

        const [nextLog, templates] = await Promise.all([
          prisma.winkelLog.findUnique({ where: { tenantId_shopName_date: { tenantId: tid, shopName: input.shopName, date: nextDate } } }),
          prisma.winkelTemplate.findMany({ where: { tenantId: tid, shopName: input.shopName, weekday: wd }, include: { breadType: { select: { slug: true } } } }),
        ]);

        const templateQty: Record<string, number> = {};
        for (const t of templates) templateQty[t.breadType.slug] = t.quantity;

        const baseQty: Record<string, number> = nextLog ? { ...(nextLog.quantities as Record<string, number>) } : { ...templateQty };
        const nextQty: Record<string, number> = { ...baseQty };
        for (const slug of Object.keys(delta)) {
          nextQty[slug] = Math.max(0, (nextQty[slug] ?? 0) + delta[slug]);
        }

        await prisma.winkelLog.upsert({
          where: { tenantId_shopName_date: { tenantId: tid, shopName: input.shopName, date: nextDate } },
          create: { tenantId: tid, shopName: input.shopName, date: nextDate, quantities: nextQty },
          update: { quantities: nextQty },
        });
      }
    }

    return Response.json(log, { status: 201 });
  } catch (e) {
    return toResponse(e);
  }
}
