import { prisma } from "@/server/config/db";
import { toResponse } from "@/server/lib/errors";
import { getMijnContext } from "@/server/lib/mijnCustomer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { customerId } = await getMijnContext();

    const invoices = await (prisma as any).invoice.findMany({
      where: { customerId },
      orderBy: { periodStart: "desc" },
    });

    return Response.json({
      invoices: invoices.map((inv: any) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        periodStart: inv.periodStart.toISOString().slice(0, 10),
        periodEnd: inv.periodEnd.toISOString().slice(0, 10),
        totalAmountExcl: Number(inv.totalAmountExcl),
        vatPercent: inv.vatPercent,
        sentAt: inv.sentAt?.toISOString() ?? null,
      })),
    });
  } catch (e) { return toResponse(e); }
}
