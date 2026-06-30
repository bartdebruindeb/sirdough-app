import { prisma } from "@/server/config/db";
import { resolveTenantId, getTenantFromRequest } from "@/server/config/tenant";
import { sendPakbon } from "@/server/lib/email";
import { z } from "zod";

export async function POST(req: Request) {
  const { tenantId, tenantSlug } = getTenantFromRequest(req);
  const tid = await resolveTenantId({ tenantId, tenantSlug });

  const body = await req.json();
  const { customerId, date } = z.object({
    customerId: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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

  // Collect lines from one-off order for this date
  const startOfDay = `${date}T00:00:00.000Z`;
  const endOfDay   = `${date}T23:59:59.999Z`;

  const order = await prisma.oneOffOrder.findFirst({
    where: { tenantId: tid, customerId, deliveryDate: { gte: startOfDay, lte: endOfDay } },
    include: { lines: { include: { breadType: true } } },
  });

  let lines: { name: string; quantity: number }[] = [];

  if (order) {
    lines = order.lines
      .filter((l: { quantity: number }) => l.quantity > 0)
      .map((l: { breadType: { name: string }; quantity: number }) => ({ name: l.breadType.name, quantity: l.quantity }));
  } else {
    // Fall back to recurring order for this weekday
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

  if (lines.length === 0) return Response.json({ error: "Geen orderregels gevonden" }, { status: 400 });

  const formattedDate = new Date(date + "T12:00:00Z").toLocaleDateString("nl-NL", {
    weekday: "long", day: "numeric", month: "long",
  });

  await sendPakbon({ to: email, customerName: customer.name, deliveryDate: formattedDate, tenantName, lines });

  return Response.json({ ok: true });
}
