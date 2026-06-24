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
    requirePermission(role, "customers:read");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const [breadTypes, tenant] = await Promise.all([
      (prisma as any).breadType.findMany({
        where: { tenantId: tid, active: true },
        select: { id: true, name: true, sortOrder: true, price: true },
        orderBy: { sortOrder: "asc" },
      }),
      (prisma as any).tenant.findUnique({ where: { id: tid }, select: { minDeliveryAmount: true } }),
    ]);

    return Response.json({
      breadTypes: breadTypes.map((b: any) => ({ ...b, price: b.price ? Number(b.price) : null })),
      minDeliveryAmount: tenant?.minDeliveryAmount ? Number(tenant.minDeliveryAmount) : null,
    });
  } catch (e) { return toResponse(e); }
}

const PatchPrijslijstSchema = z.object({
  prices: z.array(z.object({ id: z.string(), price: z.number().min(0).nullable() })).optional(),
  minDeliveryAmount: z.number().min(0).nullable().optional(),
});

export async function PATCH(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "customers:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, PatchPrijslijstSchema);

    const ops: Promise<any>[] = [];

    if (input.prices) {
      for (const { id, price } of input.prices) {
        ops.push((prisma as any).breadType.updateMany({
          where: { id, tenantId: tid },
          data: { price: price ?? null },
        }));
      }
    }

    if (input.minDeliveryAmount !== undefined) {
      ops.push((prisma as any).tenant.update({
        where: { id: tid },
        data: { minDeliveryAmount: input.minDeliveryAmount ?? null },
      }));
    }

    await Promise.all(ops);
    return Response.json({ ok: true });
  } catch (e) { return toResponse(e); }
}
