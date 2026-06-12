import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getRoleFromRequest, requirePermission } from "@/server/middleware/authz";
import { prisma } from "@/server/config/db";
import { z } from "zod";
import { parseJson } from "@/server/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "delivery:read");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const routes = await prisma.cityRoute.findMany({
      where: { tenantId: tid },
      orderBy: { sortOrder: "asc" },
    });
    return Response.json({ routes });
  } catch (e) {
    return toResponse(e);
  }
}

const UpdateRoutesSchema = z.array(z.object({
  city: z.string(),
  sortOrder: z.number(),
}));

export async function PUT(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "delivery:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const routes = await parseJson(req, UpdateRoutesSchema);
    for (const r of routes) {
      await prisma.cityRoute.upsert({
        where: { tenantId_city: { tenantId: tid, city: r.city } },
        update: { sortOrder: r.sortOrder },
        create: { tenantId: tid, city: r.city, sortOrder: r.sortOrder },
      });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return toResponse(e);
  }
}
