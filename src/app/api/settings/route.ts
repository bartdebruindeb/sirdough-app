import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getRoleFromRequest, requirePermission } from "@/server/middleware/authz";
import { prisma } from "@/server/config/db";
import { parseJson } from "@/server/lib/validation";
import { z } from "zod";
import { bakeryConfig } from "@/config/bakery.config";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "orders:read");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tid },
      select: { closedWeekdays: true, bakeryAddress: true, bakeryLat: true, bakeryLng: true },
    });
    const closedWeekdays = (tenant?.closedWeekdays ?? "1,7")
      .split(",").filter(Boolean).map(Number);

    return Response.json({
      closedWeekdays,
      bakeryAddress: tenant?.bakeryAddress ?? bakeryConfig.bakeryAddress,
      bakeryLat: tenant?.bakeryLat ?? bakeryConfig.bakeryLat,
      bakeryLng: tenant?.bakeryLng ?? bakeryConfig.bakeryLng,
    });
  } catch (e) {
    return toResponse(e);
  }
}

const UpdateSettingsSchema = z.object({
  closedWeekdays: z.array(z.number().int().min(1).max(7)).optional(),
  bakeryAddress: z.string().optional(),
  bakeryLat: z.number().optional(),
  bakeryLng: z.number().optional(),
});

export async function POST(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "recipes:write"); // owner only
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, UpdateSettingsSchema);
    const data: Record<string, unknown> = {};
    if (input.closedWeekdays !== undefined) data.closedWeekdays = input.closedWeekdays.join(",");
    if (input.bakeryAddress !== undefined) data.bakeryAddress = input.bakeryAddress;
    if (input.bakeryLat !== undefined) data.bakeryLat = input.bakeryLat;
    if (input.bakeryLng !== undefined) data.bakeryLng = input.bakeryLng;

    await prisma.tenant.update({ where: { id: tid }, data });

    return Response.json({ ok: true });
  } catch (e) {
    return toResponse(e);
  }
}
