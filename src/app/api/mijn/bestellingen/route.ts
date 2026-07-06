import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { prisma } from "@/server/config/db";
import { toResponse } from "@/server/lib/errors";
import { parseJson } from "@/server/lib/validation";
import { getMijnContext } from "@/server/lib/mijnCustomer";
import { bakeryConfig } from "@/config/bakery.config";
import { z } from "zod";

export const dynamic = "force-dynamic";

async function getCustomer(_session: any) {
  // The active location, validated against this login's own set — see getMijnContext.
  const { customerId } = await getMijnContext();
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new Error("UNAUTHORIZED");
  return customer;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isCutoffPassed(deliveryDate: Date): boolean {
  // Cutoff = orderCutoffHour Amsterdam time on day before delivery (DST-safe)
  const prev = new Date(deliveryDate);
  prev.setUTCDate(prev.getUTCDate() - 1);
  prev.setUTCHours(12, 0, 0, 0); // midday for stable DST probe
  const fmt = (tz: string) => parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(prev));
  const offsetHours = fmt("Europe/Amsterdam") - fmt("UTC");
  const cutoff = new Date(prev);
  cutoff.setUTCHours(bakeryConfig.orderCutoffHour - offsetHours, 0, 0, 0);
  return new Date() >= cutoff;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const customer = await getCustomer(session);

    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);

    const sixtyDaysAgo = new Date(); sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const [orders, breadTypes, recurring, pastOrders, tenant, deliveryStatuses, invoiceOrders] = await Promise.all([
      prisma.oneOffOrder.findMany({
        where: {
          tenantId: customer.tenantId,
          customerId: customer.id,
          deliveryDate: { gte: new Date(from + "T00:00:00Z") },
        },
        include: { lines: { include: { breadType: true } } },
        orderBy: { deliveryDate: "asc" },
      }),
      (prisma as any).breadType.findMany({
        where: { tenantId: customer.tenantId, customerOrderable: true, active: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.recurringOrder.findMany({
        where: { tenantId: customer.tenantId, customerId: customer.id },
        include: {
          lines: { include: { breadType: true } },
          exceptions: { where: { date: { gte: sixtyDaysAgo } }, orderBy: { date: "asc" } },
        },
        orderBy: { weekday: "asc" },
      }),
      prisma.oneOffOrder.findMany({
        where: {
          tenantId: customer.tenantId,
          customerId: customer.id,
          deliveryDate: { lt: new Date(from + "T00:00:00Z"), gte: sixtyDaysAgo },
        },
        include: { lines: { include: { breadType: true } } },
        orderBy: { deliveryDate: "desc" },
      }),
      (prisma as any).tenant.findUnique({ where: { id: customer.tenantId }, select: { closedWeekdays: true, minDeliveryAmount: true } }),
      prisma.deliveryStatus.findMany({
        where: { tenantId: customer.tenantId, customerId: customer.id, date: { gte: sixtyDaysAgo } },
        select: { date: true, deliveredAt: true },
      }),
      (prisma as any).invoiceOrder.findMany({
        where: { invoice: { tenantId: customer.tenantId, customerId: customer.id } },
        include: { invoice: { select: { invoiceNumber: true } } },
      }),
    ]);

    const closedWeekdays = ((tenant as any)?.closedWeekdays ?? "").split(",").map(Number).filter(Boolean);
    const minDeliveryAmount = (tenant as any)?.minDeliveryAmount ? Number((tenant as any).minDeliveryAmount) : null;

    const serializedOrders = orders.map(o => ({ ...o, deliveryDate: toDateStr(o.deliveryDate) }));
    const serializedPast   = pastOrders.map(o => ({ ...o, deliveryDate: toDateStr(o.deliveryDate) }));
    const serializedRec    = recurring.map(r => ({
      ...r,
      exceptions: r.exceptions.map((e: any) => ({ ...e, date: toDateStr(e.date) })),
    }));

    const breadTypesWithPrice = breadTypes.map((b: any) => ({
      ...b,
      price: b.price ? Number(b.price) : null,
    }));

    // Build delivery time map: dateStr → "HH:MM" in Amsterdam local time (this runs
    // server-side, so getUTCHours()/getUTCMinutes() would show raw UTC/GMT instead of
    // Dutch wall-clock time — Intl's timeZone option handles the CET/CEST DST switch).
    const deliveryTimeMap: Record<string, string> = {};
    const timeFmt = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hour12: false });
    for (const ds of deliveryStatuses) {
      if (ds.deliveredAt) {
        const dateStr = toDateStr(ds.date);
        deliveryTimeMap[dateStr] = timeFmt.format(new Date(ds.deliveredAt));
      }
    }

    // Build invoice number map: orderId → invoiceNumber
    const invoiceNumberMap: Record<string, string> = {};
    for (const io of invoiceOrders) {
      if (io.invoice?.invoiceNumber) invoiceNumberMap[io.orderId] = io.invoice.invoiceNumber;
    }

    return Response.json({
      orders: serializedOrders,
      breadTypes: breadTypesWithPrice,
      recurring: serializedRec,
      pastOrders: serializedPast,
      closedWeekdays,
      minDeliveryAmount,
      discountPercent: (customer as any).discountPercent ?? 0,
      deliveryTimeMap,
      invoiceNumberMap,
      // For the order-form map: where a bezorgen order goes (the customer's own address).
      deliveryLat: customer.lat ?? null,
      deliveryLng: customer.lng ?? null,
      deliveryLabel: [customer.address, customer.postalCode, customer.city].filter(Boolean).join(", "),
    });
  } catch (e) { return toResponse(e); }
}

const PlaceOrderSchema = z.object({
  deliveryDate: z.string(),
  notes: z.string().optional(),
  deliveryAddressId: z.string().optional(),
  pickupLocation: z.string().optional(),
  lines: z.array(z.object({ breadTypeId: z.string(), quantity: z.number().int().positive() })),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const customer = await getCustomer(session);
    const input = await parseJson(req, PlaceOrderSchema);

    const deliveryDate = new Date(input.deliveryDate + "T12:00:00Z");
    if (isCutoffPassed(deliveryDate)) {
      return Response.json({ message: "De besteldeadline is verstreken." }, { status: 400 });
    }

    const order = await (prisma as any).oneOffOrder.create({
      data: {
        tenantId: customer.tenantId,
        customerId: customer.id,
        deliveryDate,
        notes: input.notes ?? null,
        deliveryAddressId: input.deliveryAddressId ?? null,
        pickupLocation: input.pickupLocation ?? null,
        lines: { create: input.lines },
      },
      include: { lines: { include: { breadType: true } } },
    });

    // No immediate confirmation email — the client schedules a debounced summary
    // email (/api/mijn/email-summary) instead, so multiple edits in a session
    // result in one email rather than one per change.
    return Response.json({ ...order, deliveryDate: toDateStr(order.deliveryDate) }, { status: 201 });
  } catch (e) { return toResponse(e); }
}

const UpdateOneOffSchema = z.object({
  id: z.string(),
  notes: z.string().optional(),
  deliveryAddressId: z.string().nullable().optional(),
  lines: z.array(z.object({ breadTypeId: z.string(), quantity: z.number().int().min(0) })),
});

const UpdateRecurringSchema = z.object({
  recurringOrderId: z.string(),
  lines: z.array(z.object({ breadTypeId: z.string(), quantity: z.number().int().min(0) })),
  pickupLocation: z.string().nullable().optional(),
});

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const customer = await getCustomer(session);
    const body = await req.json();

    // Toggle recurring order active/inactive
    if (body.recurringOrderId && typeof body.active === "boolean") {
      await prisma.recurringOrder.updateMany({
        where: { id: body.recurringOrderId, customerId: customer.id },
        data: { active: body.active },
      });
      return Response.json({ ok: true });
    }

    // Skip or unskip a specific date
    if (body.recurringOrderId && body.skipDate) {
      const skipDate = new Date(body.skipDate + "T12:00:00Z");
      if (body.unskip) {
        await prisma.recurringOrderException.deleteMany({
          where: { recurringOrderId: body.recurringOrderId, date: skipDate },
        });
      } else {
        await prisma.recurringOrderException.upsert({
          where: { recurringOrderId_date: { recurringOrderId: body.recurringOrderId, date: skipDate } },
          create: { recurringOrderId: body.recurringOrderId, date: skipDate, active: false },
          update: { active: false },
        });
      }
      return Response.json({ ok: true });
    }

    // Route to one-off or recurring update based on payload
    if (body.recurringOrderId) {
      const input = UpdateRecurringSchema.parse(body);
      const order = await prisma.recurringOrder.findFirst({
        where: { id: input.recurringOrderId, customerId: customer.id },
        include: { lines: true },
      });
      if (!order) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

      // UTC throughout — must match the date construction used everywhere else
      // (isCutoffPassed, the "Deze week" display), or the stored exception date
      // silently mismatches the displayed date and the skip filter never matches.
      const now = new Date();
      const nowIsoDay = now.getUTCDay() === 0 ? 7 : now.getUTCDay();
      const dayDiff = (order.weekday - nowIsoDay + 7) % 7 || 7;
      const nextDate = new Date(now);
      nextDate.setUTCDate(nextDate.getUTCDate() + dayDiff);
      nextDate.setUTCHours(12, 0, 0, 0);

      // If this week's occurrence is already past its deadline, freeze it exactly as it
      // currently is (via a one-off substitute + skip exception) so it stays unaffected,
      // then apply the requested changes to the template starting the week after.
      let appliesFrom: string | null = null;
      if (isCutoffPassed(nextDate)) {
        const alreadyFrozen = await prisma.recurringOrderException.findUnique({
          where: { recurringOrderId_date: { recurringOrderId: order.id, date: nextDate } },
        });
        if (!alreadyFrozen) {
          const currentLines = order.lines.filter(l => l.quantity > 0).map(l => ({ breadTypeId: l.breadTypeId, quantity: l.quantity }));
          if (currentLines.length > 0) {
            const existingOneOff = await prisma.oneOffOrder.findFirst({
              where: { tenantId: customer.tenantId, customerId: customer.id, deliveryDate: nextDate },
            });
            if (!existingOneOff) {
              await (prisma as any).oneOffOrder.create({
                data: {
                  tenantId: customer.tenantId, customerId: customer.id, deliveryDate: nextDate,
                  notes: "Vaste bestelling (behouden — aanpassing geldt vanaf volgende week)",
                  pickupLocation: (order as any).pickupLocation ?? null,
                  lines: { create: currentLines },
                },
              });
            }
          }
          await prisma.recurringOrderException.upsert({
            where: { recurringOrderId_date: { recurringOrderId: order.id, date: nextDate } },
            create: { recurringOrderId: order.id, date: nextDate, active: false },
            update: { active: false },
          });
        }
        appliesFrom = toDateStr(nextDate);
      }

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
      if (input.pickupLocation !== undefined) {
        await (prisma as any).recurringOrder.update({ where: { id: order.id }, data: { pickupLocation: input.pickupLocation } });
      }

      // No immediate confirmation email — the client schedules a debounced summary instead.
      return Response.json({ ok: true, appliesFrom });
    }

    // One-off order edit
    const input = UpdateOneOffSchema.parse(body);
    const order = await prisma.oneOffOrder.findFirst({ where: { id: input.id, customerId: customer.id } });
    if (!order) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    if (isCutoffPassed(order.deliveryDate)) {
      return Response.json({ message: "De besteldeadline is verstreken." }, { status: 400 });
    }

    // Delete existing lines and recreate
    await prisma.oneOffOrderLine.deleteMany({ where: { oneOffId: input.id } });
    const updated = await (prisma as any).oneOffOrder.update({
      where: { id: input.id },
      data: { notes: input.notes ?? order.notes, lines: { create: input.lines.filter((l: any) => l.quantity > 0) } },
      include: { lines: { include: { breadType: true } } },
    });

    // No immediate confirmation email — the client schedules a debounced summary instead.
    return Response.json({ ...updated, deliveryDate: toDateStr(updated.deliveryDate) });
  } catch (e) { return toResponse(e); }
}

const CreateRecurringSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  lines: z.array(z.object({ breadTypeId: z.string(), quantity: z.number().int().min(0) })),
  pickupLocation: z.string().optional(),
});

// PUT /api/mijn/bestellingen — create a new recurring order for a weekday
export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const customer = await getCustomer(session);
    const input = await parseJson(req, CreateRecurringSchema);

    const existing = await prisma.recurringOrder.findFirst({
      where: { tenantId: customer.tenantId, customerId: customer.id, weekday: input.weekday },
    });
    if (existing) return Response.json({ error: "CONFLICT", message: "Er bestaat al een vaste bestelling voor deze dag." }, { status: 409 });

    const order = await (prisma as any).recurringOrder.create({
      data: {
        tenantId: customer.tenantId,
        customerId: customer.id,
        weekday: input.weekday,
        active: true,
        pickupLocation: input.pickupLocation ?? null,
        lines: {
          create: input.lines.filter(l => l.quantity > 0),
        },
      },
      include: { lines: { include: { breadType: true } } },
    });

    return Response.json(order, { status: 201 });
  } catch (e) { return toResponse(e); }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const customer = await getCustomer(session);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const type = url.searchParams.get("type"); // "recurring" or omit for one-off
    if (!id) return Response.json({ error: "id required" }, { status: 400 });

    if (type === "recurring") {
      await prisma.recurringOrder.deleteMany({ where: { id, customerId: customer.id } });
      return new Response(null, { status: 204 });
    }

    const order = await prisma.oneOffOrder.findFirst({ where: { id, customerId: customer.id } });
    if (!order) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

    if (isCutoffPassed(order.deliveryDate)) {
      return Response.json({ message: "De besteldeadline is verstreken." }, { status: 400 });
    }

    await prisma.oneOffOrder.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch (e) { return toResponse(e); }
}
