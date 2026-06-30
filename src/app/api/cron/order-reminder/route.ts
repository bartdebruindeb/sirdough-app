import { prisma } from "@/server/config/db";
import { resolveTenantId } from "@/server/config/tenant";
import { sendOrderReminder } from "@/server/lib/email";

// Call daily at 00:00 from VPS cron:
//   0 0 * * * curl -s -H "x-cron-secret: $CRON_SECRET" https://yourdomain.nl/api/cron/order-reminder
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("x-cron-secret") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tid = await resolveTenantId({ tenantId: process.env.TENANT_SLUG ?? "dev-tenant" });

  // Target: delivery date = today + 2 days
  const target = new Date();
  target.setUTCDate(target.getUTCDate() + 2);
  const targetDate = target.toISOString().slice(0, 10);
  const targetWeekday = target.getUTCDay() === 0 ? 7 : target.getUTCDay(); // 1=Mon..7=Sun

  const WEEKDAYS = ["","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];
  const formattedDate = target.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });

  let sent = 0;

  // One-off orders for target date
  const startOfDay = `${targetDate}T00:00:00.000Z`;
  const endOfDay   = `${targetDate}T23:59:59.999Z`;
  const oneOffs = await prisma.oneOffOrder.findMany({
    where: { tenantId: tid, deliveryDate: { gte: startOfDay, lte: endOfDay } },
    include: {
      customer: true,
      lines: { include: { breadType: true } },
    },
  });

  for (const order of oneOffs) {
    const email = order.customer.email;
    if (!email) continue;
    const lines = order.lines
      .filter((l: { quantity: number }) => l.quantity > 0)
      .map((l: { breadType: { name: string }; quantity: number }) => ({ name: l.breadType.name, quantity: l.quantity }));
    if (lines.length === 0) continue;
    await sendOrderReminder({ to: email, customerName: order.customer.name, deliveryDate: formattedDate, lines });
    sent++;
  }

  // Recurring orders for target weekday
  const recurring = await prisma.recurringOrder.findMany({
    where: { tenantId: tid, weekday: targetWeekday, active: true },
    include: {
      customer: true,
      lines: { include: { breadType: true } },
    },
  });

  // Deduplicate: skip customers already emailed from one-off
  const emailedCustomerIds = new Set(oneOffs.map((o: { customerId: string }) => o.customerId));

  for (const order of recurring) {
    if (emailedCustomerIds.has(order.customerId)) continue;
    const email = order.customer.email;
    if (!email) continue;
    const lines = order.lines
      .filter((l: { quantity: number }) => l.quantity > 0)
      .map((l: { breadType: { name: string }; quantity: number }) => ({ name: l.breadType.name, quantity: l.quantity }));
    if (lines.length === 0) continue;
    await sendOrderReminder({ to: email, customerName: order.customer.name, deliveryDate: formattedDate, lines });
    sent++;
  }

  return Response.json({ ok: true, targetDate, sent });
}
