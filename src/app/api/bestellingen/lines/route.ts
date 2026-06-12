import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getRoleFromRequest, requirePermission } from "@/server/middleware/authz";
import { prisma } from "@/server/config/db";
import { parseJson } from "@/server/lib/validation";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UpdateLinesSchema = z.object({
  orderId: z.string(),
  lines: z.array(z.object({
    breadTypeId: z.string(),
    quantity: z.number().int().min(0),
  })),
});

// PUT — replace all lines for an order
export async function PUT(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "orders:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, UpdateLinesSchema);

    // Verify order belongs to this tenant
    const order = await prisma.oneOffOrder.findFirst({ where: { id: input.orderId, tenantId: tid } });
    if (!order) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

    // Replace all lines
    await prisma.oneOffOrderLine.deleteMany({ where: { oneOffId: input.orderId } });
    const activeLines = input.lines.filter(l => l.quantity > 0);
    if (activeLines.length > 0) {
      await prisma.oneOffOrderLine.createMany({
        data: activeLines.map(l => ({ oneOffId: input.orderId, breadTypeId: l.breadTypeId, quantity: l.quantity })),
      });
    }

    return Response.json({ ok: true });
  } catch (e) {
    return toResponse(e);
  }
}
