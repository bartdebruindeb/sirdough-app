import { prisma } from "@/server/config/db";
import { resolveTenantId, getTenantFromRequest } from "@/server/config/tenant";
import { sendPakbon } from "@/server/lib/email";
import { z } from "zod";

export async function POST(req: Request) {
  const { tenantId, tenantSlug } = getTenantFromRequest(req);
  const tid = await resolveTenantId({ tenantId, tenantSlug });

  const body = await req.json();
  const { customerId, date, deliveredLines } = z.object({
    customerId: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    deliveredLines: z.array(z.object({
      breadTypeId: z.string(),
      name: z.string(),
      orderedQty: z.number().int().min(0),
      deliveredQty: z.number().int().min(0),
    })).optional(),
  }).parse(body);

  const [customer, tenant] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId } }),
    prisma.tenant.findUnique({ where: { id: tid } }),
  ]);
  if (!customer || customer.tenantId !== tid) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const tenantName = tenant?.name ?? "De bakkerij";

  const email = customer.email;
  if (!email) return Response.json({ error: "Klant heeft geen e-mailadres" }, { status: 400 });

  const startOfDay = `${date}T00:00:00.000Z`;
  const endOfDay   = `${date}T23:59:59.999Z`;

  // Find or determine the actual lines to send
  let lines: { name: string; quantity: number }[] = [];
  let deviations: { name: string; ordered: number; delivered: number }[] = [];

  if (deliveredLines && deliveredLines.length > 0) {
    lines = deliveredLines
      .filter(l => l.deliveredQty > 0)
      .map(l => ({ name: l.name, quantity: l.deliveredQty }));
    deviations = deliveredLines
      .filter(l => l.deliveredQty !== l.orderedQty)
      .map(l => ({ name: l.name, ordered: l.orderedQty, delivered: l.deliveredQty }));

    // Update the order so customer only pays for what was delivered
    const existingOrder = await prisma.oneOffOrder.findFirst({
      where: { tenantId: tid, customerId, deliveryDate: { gte: startOfDay, lte: endOfDay } },
    });

    if (existingOrder) {
      // Update each line in place
      for (const dl of deliveredLines) {
        await prisma.oneOffOrderLine.upsert({
          where: { oneOffId_breadTypeId: { oneOffId: existingOrder.id, breadTypeId: dl.breadTypeId } },
          update: { quantity: dl.deliveredQty },
          create: { oneOffId: existingOrder.id, breadTypeId: dl.breadTypeId, quantity: dl.deliveredQty },
        });
      }
      // Add deviation note to the order
      if (deviations.length > 0) {
        const devNote = "Afwijking bezorging: " + deviations.map(d => `${d.name} besteld ${d.ordered} / geleverd ${d.delivered}`).join(", ");
        await prisma.oneOffOrder.update({
          where: { id: existingOrder.id },
          data: { notes: devNote },
        });
      }
    } else {
      // No one-off order exists — create one from the delivered quantities (recurring order customer)
      const deliveryDate = new Date(date + "T12:00:00Z");
      const newOrder = await prisma.oneOffOrder.create({
        data: {
          tenantId: tid,
          customerId,
          deliveryDate,
          notes: deviations.length > 0
            ? "Afwijking bezorging: " + deviations.map(d => `${d.name} besteld ${d.ordered} / geleverd ${d.delivered}`).join(", ")
            : null,
        },
      });
      for (const dl of deliveredLines.filter(l => l.deliveredQty > 0)) {
        await prisma.oneOffOrderLine.create({
          data: { oneOffId: newOrder.id, breadTypeId: dl.breadTypeId, quantity: dl.deliveredQty },
        });
      }
    }
  } else {
    // Fallback: no deliveredLines provided, use order as-is
    const order = await prisma.oneOffOrder.findFirst({
      where: { tenantId: tid, customerId, deliveryDate: { gte: startOfDay, lte: endOfDay } },
      include: { lines: { include: { breadType: true } } },
    });
    if (order) {
      lines = order.lines
        .filter((l: { quantity: number }) => l.quantity > 0)
        .map((l: { breadType: { name: string }; quantity: number }) => ({ name: l.breadType.name, quantity: l.quantity }));
    } else {
      const d = new Date(date + "T12:00:00Z");
      const weekday = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
      const recurr = await prisma.recurringOrder.findFirst({
        where: { tenantId: tid, customerId, weekday, active: true },
        include: { lines: { include: { breadType: true } } },
      });
      if (recurr) {
        lines = recurr.lines
          .filter((l: { quantity: number }) => l.quantity > 0)
          .map((l: { breadType: { name: string }; quantity: number }) => ({ name: l.breadType.name, quantity: l.quantity }));
      }
    }
  }

  if (lines.length === 0) return Response.json({ error: "Geen orderregels gevonden" }, { status: 400 });

  const formattedDate = new Date(date + "T12:00:00Z").toLocaleDateString("nl-NL", {
    weekday: "long", day: "numeric", month: "long",
  });

  await sendPakbon({ to: email, customerName: customer.name, deliveryDate: formattedDate, tenantName, lines, deviations });

  // Pakbon sent = delivery is final; can no longer be reverted (see /api/delivery-status)
  const statusDate = new Date(date + "T12:00:00Z");
  const now = new Date();
  await prisma.deliveryStatus.upsert({
    where: { tenantId_date_customerId: { tenantId: tid, date: statusDate, customerId } },
    create: { tenantId: tid, date: statusDate, customerId, deliveredAt: now, pakbonSentAt: now },
    update: { deliveredAt: now, pakbonSentAt: now },
  });

  return Response.json({ ok: true });
}
