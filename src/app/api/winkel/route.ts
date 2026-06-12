import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getRoleFromRequest, requirePermission } from "@/server/middleware/authz";
import { prisma } from "@/server/config/db";
import { z } from "zod";
import { parseJson } from "@/server/lib/validation";

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

    // Bread types for column headers — include whether a recipe exists,
    // since all bread types with a recipe should be orderable in winkel
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
      breadTypes: breadTypes.map(bt => ({ id: bt.id, slug: bt.slug, name: bt.name, hasRecipe: !!bt.recipe })),
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
    const date = new Date(input.date + "T12:00:00Z");

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

    return Response.json(log, { status: 201 });
  } catch (e) {
    return toResponse(e);
  }
}
