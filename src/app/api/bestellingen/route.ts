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

    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to   = url.searchParams.get("to");
    const customerId = url.searchParams.get("customerId");

    const orders = await prisma.oneOffOrder.findMany({
      where: {
        tenantId: tid,
        ...(customerId ? { customerId } : {}),
        ...(!customerId && (from || to) ? {
          deliveryDate: {
            ...(from ? { gte: new Date(from + "T00:00:00Z") } : {}),
            ...(to   ? { lte: new Date(to   + "T23:59:59Z") } : {}),
          },
        } : {}),
      },
      include: {
        customer: true,
        lines: { include: { breadType: true } },
      },
      orderBy: { deliveryDate: "asc" },
    });

    // Include delivery addresses so staff can pick which one an order ships to when a
    // customer has several branches billed under the same KvK (see mijn-account's
    // "Bezorgadressen" — this is the staff-side equivalent for placing an order for them).
    const customers = await (prisma as any).customer.findMany({
      where: { tenantId: tid, active: true },
      include: { deliveryAddresses: { orderBy: [{ isDefault: "desc" }, { id: "asc" }] } },
      orderBy: { name: "asc" },
    });

    const breadTypes = await prisma.breadType.findMany({
      where: { tenantId: tid, active: true },
      orderBy: { sortOrder: "asc" },
    });

    const tenant = await (prisma as any).tenant.findUnique({ where: { id: tid }, select: { minDeliveryAmount: true } });
    const minDeliveryAmount = tenant?.minDeliveryAmount != null ? Number(tenant.minDeliveryAmount) : null;

    return Response.json({
      orders, customers, minDeliveryAmount,
      breadTypes: breadTypes.map(bt => ({ ...bt, price: (bt as any).price != null ? Number((bt as any).price) : null })),
    });
  } catch (e) {
    return toResponse(e);
  }
}

const CreateOrderSchema = z.object({
  customerId: z.string(),
  deliveryDate: z.string(),
  notes: z.string().optional(),
  pickupLocation: z.string().optional(),
  deliveryAddressId: z.string().optional(),
  lines: z.array(z.object({
    breadTypeId: z.string(),
    quantity: z.number().int().positive(),
  })).min(1),
});

export async function POST(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "orders:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, CreateOrderSchema);

    // A chosen delivery address must actually belong to this customer — otherwise an
    // order could end up pointing at another customer's address.
    if (input.deliveryAddressId) {
      const addr = await (prisma as any).customerAddress.findFirst({
        where: { id: input.deliveryAddressId, customerId: input.customerId },
      });
      if (!addr) return Response.json({ message: "Bezorgadres hoort niet bij deze klant." }, { status: 400 });
    }

    const order = await (prisma as any).oneOffOrder.create({
      data: {
        tenantId: tid,
        customerId: input.customerId,
        deliveryDate: new Date(input.deliveryDate + "T12:00:00Z"),
        notes: input.notes ?? null,
        pickupLocation: input.pickupLocation ?? null,
        deliveryAddressId: input.deliveryAddressId ?? null,
        lines: {
          create: input.lines.map(l => ({
            breadTypeId: l.breadTypeId,
            quantity: l.quantity,
          })),
        },
      },
      include: { customer: true, lines: { include: { breadType: true } } },
    });
    return Response.json(order, { status: 201 });
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

    await prisma.oneOffOrder.deleteMany({ where: { id, tenantId: tid } });
    return new Response(null, { status: 204 });
  } catch (e) {
    return toResponse(e);
  }
}
