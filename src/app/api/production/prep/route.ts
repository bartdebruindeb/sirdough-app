import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getRoleFromRequest, requirePermission } from "@/server/middleware/authz";
import { getPrepSchedule } from "@/server/modules/production/production.service";

export const dynamic = "force-dynamic";

// GET /api/production/prep?date=YYYY-MM-DD — what to prepare on that one day for phased doughs (all waves that are in progress)
export async function GET(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "production:read");
    const date = new URL(req.url).searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const days = await getPrepSchedule(await resolveTenantId({ tenantId, tenantSlug }), date, 1);
    return Response.json({ days });
  } catch (e) {
    return toResponse(e);
  }
}
