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

    const orders = await prisma.recurringOrder.findMany({
      where: { tenantId: tid },
      include: {
        customer: true,
        lines: { include: { breadType: { select: { id: true, name: true, slug: true, sortOrder: true } } } },
      },
      orderBy: [{ weekday: "asc" }, { customer: { name: "asc" } }],
    });

    const customers = await prisma.customer.findMany({
      where: { tenantId: tid, active: true },
      select: { id: true, name: true, city: true, preferredBread: true, discountPercent: true },
      orderBy: { name: "asc" },
    });

    return Response.json({ orders, customers });
  } catch (e) {
    return toResponse(e);
  }
}

const ToggleSchema = z.object({
  id: z.string(),
  active: z.boolean(),
});

export async function PATCH(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "orders:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, ToggleSchema);
    const order = await prisma.recurringOrder.updateMany({
      where: { id: input.id, tenantId: tid },
      data: { active: input.active },
    });
    return Response.json(order);
  } catch (e) {
    return toResponse(e);
  }
}

const UpsertRecurringSchema = z.object({
  customerId: z.string(),
  weekday: z.number().int().min(1).max(7),
  notes: z.string().optional(),
  pickupLocation: z.string().nullable().optional(),
  lines: z.array(z.object({
    breadTypeId: z.string(),
    quantity: z.number().int().min(0),
  })),
});

export async function POST(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "orders:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, UpsertRecurringSchema);
    const pickupData = input.pickupLocation !== undefined ? { pickupLocation: input.pickupLocation } : {};

    const ro = await (prisma as any).recurringOrder.upsert({
      where: { tenantId_customerId_weekday: { tenantId: tid, customerId: input.customerId, weekday: input.weekday } },
      create: { tenantId: tid, customerId: input.customerId, weekday: input.weekday, notes: input.notes, active: true, ...pickupData },
      update: { notes: input.notes, active: true, ...pickupData },
    });

    // Replace lines
    await prisma.recurringOrderLine.deleteMany({ where: { recurringOrderId: ro.id } });
    const activeLines = input.lines.filter(l => l.quantity > 0);
    if (activeLines.length > 0) {
      await prisma.recurringOrderLine.createMany({
        data: activeLines.map(l => ({ recurringOrderId: ro.id, breadTypeId: l.breadTypeId, quantity: l.quantity })),
      });
    }

    return Response.json(ro, { status: 201 });
  } catch (e) {
    return toResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "orders:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    // Delete lines + exceptions first, then order
    await prisma.recurringOrderLine.deleteMany({ where: { recurringOrderId: id } });
    await prisma.recurringOrderException.deleteMany({ where: { recurringOrderId: id } });
    await prisma.recurringOrder.deleteMany({ where: { id, tenantId: tid } });
    return new Response(null, { status: 204 });
  } catch (e) { return toResponse(e); }
}
