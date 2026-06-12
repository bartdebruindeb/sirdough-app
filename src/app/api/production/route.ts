import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getRoleFromRequest, requirePermission } from "@/server/middleware/authz";
import { getProductionPlan } from "@/server/modules/production/production.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "production:read");

    const url = new URL(req.url);
    const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

    // Resolve to real tenant.id
    const resolvedTenantId = await resolveTenantId({ tenantId, tenantSlug });

    const plan = await getProductionPlan(resolvedTenantId, date);
    return Response.json(plan);
  } catch (e) {
    return toResponse(e);
  }
}
