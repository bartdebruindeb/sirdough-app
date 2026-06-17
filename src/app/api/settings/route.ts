import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getRoleFromRequest, requirePermission } from "@/server/middleware/authz";
import { prisma } from "@/server/config/db";
import { parseJson } from "@/server/lib/validation";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "orders:read");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const tenant = await prisma.tenant.findUnique({ where: { id: tid }, select: { closedWeekdays: true } });
    const closedWeekdays = (tenant?.closedWeekdays ?? "1,7")
      .split(",").filter(Boolean).map(Number);

    return Response.json({ closedWeekdays });
  } catch (e) {
    return toResponse(e);
  }
}

const UpdateSettingsSchema = z.object({
  closedWeekdays: z.array(z.number().int().min(1).max(7)),
});

export async function POST(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "recipes:write"); // owner only
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, UpdateSettingsSchema);
    await prisma.tenant.update({
      where: { id: tid },
      data: { closedWeekdays: input.closedWeekdays.join(",") },
    });

    return Response.json({ ok: true });
  } catch (e) {
    return toResponse(e);
  }
}
