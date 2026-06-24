import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { prisma } from "@/server/config/db";
import { toResponse } from "@/server/lib/errors";
import { sendOrderConfirmation } from "@/server/lib/email";

export const dynamic = "force-dynamic";

// POST /api/mijn/email-summary — send a summary of all upcoming orders
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const customerId = (session?.user as any)?.customerId as string | undefined;
    if (!customerId) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer?.email) return Response.json({ ok: false });

    const orders = await prisma.oneOffOrder.findMany({
      where: {
        customerId,
        deliveryDate: { gte: new Date() },
      },
      include: { lines: { include: { breadType: true } } },
      orderBy: { deliveryDate: "asc" },
    });

    if (orders.length === 0) return Response.json({ ok: true, sent: false });

    // Build combined lines summary (all upcoming orders)
    const allLines = orders.flatMap(o => {
      const dateLabel = o.deliveryDate.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
      return o.lines.map(l => ({ name: `${dateLabel}: ${l.breadType.name}`, quantity: l.quantity }));
    });

    await sendOrderConfirmation({
      to: customer.email,
      customerName: customer.name,
      deliveryDate: "komende bestellingen",
      lines: allLines,
      action: "updated",
    });

    return Response.json({ ok: true, sent: true });
  } catch (e) { return toResponse(e); }
}
