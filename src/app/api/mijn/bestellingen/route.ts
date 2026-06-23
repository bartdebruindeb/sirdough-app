import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { prisma } from "@/server/config/db";
import { toResponse } from "@/server/lib/errors";
import { parseJson } from "@/server/lib/validation";
import { z } from "zod";

export const dynamic = "force-dynamic";

async function getCustomer(session: any) {
  const customerId = session?.user?.customerId as string | undefined;
  if (!customerId) throw new Error("UNAUTHORIZED");
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new Error("UNAUTHORIZED");
  return customer;
}

// GET /api/mijn/bestellingen — returns upcoming one-off orders + bread types
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const customer = await getCustomer(session);

    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);

    const [orders, breadTypes] = await Promise.all([
      prisma.oneOffOrder.findMany({
        where: {
          tenantId: customer.tenantId,
          customerId: customer.id,
          deliveryDate: { gte: new Date(from + "T00:00:00Z") },
        },
        include: { lines: { include: { breadType: true } } },
        orderBy: { deliveryDate: "asc" },
      }),
      prisma.breadType.findMany({
        where: { tenantId: customer.tenantId, customerOrderable: true, active: true },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

    return Response.json({ orders, breadTypes });
  } catch (e) { return toResponse(e); }
}

const PlaceOrderSchema = z.object({
  deliveryDate: z.string(),
  notes: z.string().optional(),
  lines: z.array(z.object({ breadTypeId: z.string(), quantity: z.number().int().positive() })),
});

// POST /api/mijn/bestellingen — place a one-off order
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const customer = await getCustomer(session);
    const input = await parseJson(req, PlaceOrderSchema);

    // Enforce 4am cutoff — customers cannot order past deadline
    const deliveryDate = new Date(input.deliveryDate + "T00:00:00");
    const cutoff = new Date(deliveryDate);
    cutoff.setDate(cutoff.getDate() - 1);
    cutoff.setHours(4, 0, 0, 0);
    if (new Date() >= cutoff) {
      return Response.json({ message: "De besteldeadline is verstreken." }, { status: 400 });
    }

    const order = await prisma.oneOffOrder.create({
      data: {
        tenantId: customer.tenantId,
        customerId: customer.id,
        deliveryDate: new Date(input.deliveryDate + "T12:00:00Z"),
        notes: input.notes ?? null,
        lines: { create: input.lines },
      },
      include: { lines: { include: { breadType: true } } },
    });

    return Response.json(order, { status: 201 });
  } catch (e) { return toResponse(e); }
}

// DELETE /api/mijn/bestellingen?id=xxx — cancel a one-off order
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const customer = await getCustomer(session);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "id required" }, { status: 400 });

    const order = await prisma.oneOffOrder.findFirst({ where: { id, customerId: customer.id } });
    if (!order) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

    // Enforce cutoff
    const cutoff = new Date(order.deliveryDate);
    cutoff.setDate(cutoff.getDate() - 1);
    cutoff.setHours(4, 0, 0, 0);
    if (new Date() >= cutoff) {
      return Response.json({ message: "De besteldeadline is verstreken." }, { status: 400 });
    }

    await prisma.oneOffOrder.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch (e) { return toResponse(e); }
}
