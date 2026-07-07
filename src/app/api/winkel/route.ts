import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getRoleFromRequest, requirePermission } from "@/server/middleware/authz";
import { prisma } from "@/server/config/db";
import { z } from "zod";
import { parseJson } from "@/server/lib/validation";
import { isCutoffPassed } from "@/lib/cutoff";
import { geocodeAddress } from "@/server/lib/geocode";
import { bakeryConfig } from "@/config/bakery.config";

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

    // The shop's own Customer record (address/KvK/etc) — shops are managed here now,
    // not on Klanten, so the owner can see + edit them alongside production.
    const shopCustomer = await (prisma as any).customer.findFirst({
      where: { tenantId: tid, name: shopName },
      select: { address: true, postalCode: true, city: true, kvk: true, phone: true, email: true, lat: true, lng: true },
    });

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
      shopCustomer,
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

const UpdateShopSchema = z.object({
  shopName:   z.string(),
  address:    z.string().min(1).optional(),
  postalCode: z.string().min(1).optional(),
  city:       z.string().min(1).optional(),
  kvk:        z.string().optional(),
  phone:      z.string().optional(),
  email:      z.string().email().optional().or(z.literal("")),
});

// PATCH /api/winkel — edit a shop's own address/KvK/contact details. Shops are Customer
// records but are managed here (not on Klanten) so this always uses the same reliable
// structured PDOK lookup as the rest of the app, not a loose free-text geocode fallback
// that can match a same-named street in the wrong city entirely.
export async function PATCH(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "customers:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, UpdateShopSchema);

    // Scoped to actually-configured shops only — not a general customer-rename endpoint.
    if (!bakeryConfig.shops.some(s => s.name === input.shopName)) {
      return Response.json({ message: "Onbekende winkel." }, { status: 400 });
    }

    const addressChanged = input.address !== undefined && input.postalCode !== undefined && input.city !== undefined;
    const coords = addressChanged
      ? await geocodeAddress(input.address!, input.postalCode!, input.city!).catch(() => null)
      : null;

    const data = {
      ...(input.address !== undefined && { address: input.address }),
      ...(input.postalCode !== undefined && { postalCode: input.postalCode }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.kvk !== undefined && { kvk: input.kvk || null }),
      ...(input.phone !== undefined && { phone: input.phone || null }),
      ...(input.email !== undefined && { email: input.email || null }),
      ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
    };

    const existing = await prisma.customer.findFirst({ where: { tenantId: tid, name: input.shopName } });
    if (existing) {
      await prisma.customer.update({ where: { id: existing.id }, data });
    } else {
      // Fresh deployment where the seed script hasn't created this shop's Customer row
      // yet — create it so the page still works instead of failing silently.
      await prisma.customer.create({ data: { tenantId: tid, name: input.shopName, ...data } });
    }

    return Response.json({ ok: true });
  } catch (e) {
    return toResponse(e);
  }
}
