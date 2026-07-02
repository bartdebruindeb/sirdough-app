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
    requirePermission(role, "delivery:read");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    if (!date) return Response.json({ error: "date required" }, { status: 400 });

    const statuses = await prisma.deliveryStatus.findMany({
      where: {
        tenantId: tid,
        date: { gte: new Date(date + "T00:00:00Z"), lte: new Date(date + "T23:59:59Z") },
      },
      include: { customer: { select: { name: true, city: true } } },
      orderBy: { inBusAt: "asc" },
    });

    return Response.json({
      statuses: statuses.map(s => ({
        customerId: s.customerId,
        customerName: s.customer.name,
        customerCity: s.customer.city,
        inBusAt:      s.inBusAt?.toISOString()      ?? null,
        deliveredAt:  s.deliveredAt?.toISOString()  ?? null,
        pakbonSentAt: s.pakbonSentAt?.toISOString() ?? null,
      })),
    });
  } catch (e) { return toResponse(e); }
}

const ActionSchema = z.object({
  date:       z.string(),
  customerId: z.string(),
  action:     z.enum(["in_bus", "removed_from_bus", "delivered", "undelivered"]),
  at:         z.string().optional(), // explicit inBusAt override, used to persist a specific bus order/sequence
});

export async function POST(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "delivery:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, ActionSchema);
    const date = new Date(input.date + "T12:00:00Z");
    const now = new Date();

    // Reverting after pakbon was sent is allowed (the client confirms with the driver first),
    // but resets pakbonSentAt so a corrected re-delivery goes through the pakbon flow again.
    const data: { inBusAt?: Date | null; deliveredAt?: Date | null; pakbonSentAt?: Date | null } = {};
    if (input.action === "in_bus")            { data.inBusAt = input.at ? new Date(input.at) : now; }
    if (input.action === "removed_from_bus")  { data.inBusAt = null; data.deliveredAt = null; data.pakbonSentAt = null; }
    if (input.action === "delivered")         { data.deliveredAt = now; }
    if (input.action === "undelivered")       { data.deliveredAt = null; data.pakbonSentAt = null; }

    await prisma.deliveryStatus.upsert({
      where: { tenantId_date_customerId: { tenantId: tid, date, customerId: input.customerId } },
      create: { tenantId: tid, date, customerId: input.customerId, ...data },
      update: data,
    });

    return Response.json({ ok: true });
  } catch (e) { return toResponse(e); }
}
