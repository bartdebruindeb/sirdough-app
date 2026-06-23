import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { prisma } from "@/server/config/db";
import { toResponse } from "@/server/lib/errors";
import { parseJson } from "@/server/lib/validation";
import { sendOrderConfirmation, sendRecurringOrderConfirmation } from "@/server/lib/email";
import { z } from "zod";

const WEEKDAYS = ["","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];

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

    const [orders, breadTypes, recurring] = await Promise.all([
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
      prisma.recurringOrder.findMany({
        where: { tenantId: customer.tenantId, customerId: customer.id, active: true },
        include: { lines: { include: { breadType: true } } },
        orderBy: { weekday: "asc" },
      }),
    ]);

    return Response.json({ orders, breadTypes, recurring });
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

    const dateLabel = new Date(input.deliveryDate + "T12:00:00Z").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
    sendOrderConfirmation({
      to: customer.email!,
      customerName: customer.name,
      deliveryDate: dateLabel,
      lines: order.lines.map(l => ({ name: l.breadType.name, quantity: l.quantity })),
      action: "placed",
    }).catch(() => {});

    return Response.json(order, { status: 201 });
  } catch (e) { return toResponse(e); }
}

const UpdateRecurringSchema = z.object({
  recurringOrderId: z.string(),
  lines: z.array(z.object({ breadTypeId: z.string(), quantity: z.number().int().min(0) })),
});

// PATCH /api/mijn/bestellingen — update recurring order quantities
export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const customer = await getCustomer(session);
    const input = await parseJson(req, UpdateRecurringSchema);

    const order = await prisma.recurringOrder.findFirst({
      where: { id: input.recurringOrderId, customerId: customer.id },
    });
    if (!order) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

    // Check cutoff: next occurrence of this weekday
    const now = new Date();
    const dayDiff = (order.weekday - (now.getDay() || 7) + 7) % 7 || 7;
    const nextDate = new Date(now);
    nextDate.setDate(nextDate.getDate() + dayDiff);
    const cutoff = new Date(nextDate);
    cutoff.setDate(cutoff.getDate() - 1);
    cutoff.setHours(4, 0, 0, 0);
    if (now >= cutoff) {
      return Response.json({ message: "De besteldeadline is verstreken." }, { status: 400 });
    }

    // Upsert each line
    for (const line of input.lines) {
      if (line.quantity === 0) {
        await prisma.recurringOrderLine.deleteMany({
          where: { recurringOrderId: input.recurringOrderId, breadTypeId: line.breadTypeId },
        });
      } else {
        await prisma.recurringOrderLine.upsert({
          where: { recurringOrderId_breadTypeId: { recurringOrderId: input.recurringOrderId, breadTypeId: line.breadTypeId } },
          create: { recurringOrderId: input.recurringOrderId, breadTypeId: line.breadTypeId, quantity: line.quantity },
          update: { quantity: line.quantity },
        });
      }
    }

    // Fetch updated lines for email
    const updated = await prisma.recurringOrder.findFirst({
      where: { id: input.recurringOrderId },
      include: { lines: { include: { breadType: true } } },
    });
    sendRecurringOrderConfirmation({
      to: customer.email!,
      customerName: customer.name,
      weekday: WEEKDAYS[order.weekday],
      lines: (updated?.lines ?? []).filter(l => l.quantity > 0).map(l => ({ name: l.breadType.name, quantity: l.quantity })),
    }).catch(() => {});

    return Response.json({ ok: true });
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
