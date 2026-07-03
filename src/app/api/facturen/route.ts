/**
 * GET  /api/facturen?week=YYYY-WNN  – list customers with uninvoiced orders that week
 * POST /api/facturen                – create the invoice (in Exact, if connected) and save
 *                                      its final PDF; does NOT email it — see /api/facturen/[id]
 *                                      for downloading and (re)sending by email as separate steps.
 */
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { prisma } from "@/server/config/db";
import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { createExactInvoice } from "@/server/lib/exact";
import { buildInvoiceHtml } from "@/server/lib/invoiceHtml";
import { buildPdfData, generateInvoicePdf } from "@/server/lib/invoicePdf";
import { z } from "zod";

export const dynamic = "force-dynamic";

function weekBounds(isoWeek: string): { start: Date; end: Date } {
  // isoWeek = "2025-W26"
  const [yearStr, wStr] = isoWeek.split("-W");
  const year = Number(yearStr), week = Number(wStr);
  // Jan 4 is always in week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // 1=Mon
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

function currentISOWeek(): string {
  const now = new Date();
  const day = now.getUTCDay() || 7;
  const thursday = new Date(now);
  thursday.setUTCDate(now.getUTCDate() - day + 4);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((thursday.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function previousISOWeek(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  const day = d.getUTCDay() || 7;
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() - day + 4);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((thursday.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== "OWNER") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const url = new URL(req.url);
    const week = url.searchParams.get("week") ?? previousISOWeek();
    const { start, end } = weekBounds(week);

    // Orders in that week
    const orders = await prisma.oneOffOrder.findMany({
      where: { tenantId: tid, deliveryDate: { gte: start, lte: end } },
      include: {
        customer: true,
        lines: { include: { breadType: true } },
      },
    });

    // Already invoiced order IDs this week
    const invoiced = await (prisma as any).invoice.findMany({
      where: { tenantId: tid, periodStart: { lte: end }, periodEnd: { gte: start } },
      include: { orders: true },
    });
    const invoicedOrderIds = new Set(invoiced.flatMap((inv: any) => inv.orders.map((o: any) => o.orderId)));

    // Group uninvoiced orders by customer
    const byCustomer = new Map<string, { customer: any; orders: any[] }>();
    for (const o of orders) {
      if (invoicedOrderIds.has(o.id)) continue;
      if (!byCustomer.has(o.customerId)) byCustomer.set(o.customerId, { customer: o.customer, orders: [] });
      byCustomer.get(o.customerId)!.orders.push(o);
    }

    const result = [...byCustomer.values()].map(({ customer, orders }) => {
      const discount = customer.discountPercent ?? 0;
      const lines = orders.flatMap((o: any) =>
        o.lines.map((l: any) => {
          const price = (l.breadType.price ? Number(l.breadType.price) : 0) * (1 - discount / 100);
          return { name: l.breadType.name, quantity: l.quantity, unitPrice: price, lineTotal: price * l.quantity, date: o.deliveryDate.toISOString().slice(0, 10) };
        })
      );
      const total = lines.reduce((s: number, l: any) => s + l.lineTotal, 0);
      return {
        customerId: customer.id,
        customerName: customer.name,
        customerEmail: customer.email,
        discountPercent: discount,
        lines,
        total,
        orderIds: orders.map((o: any) => o.id),
      };
    });

    return Response.json({ week, customers: result, invoiced: invoiced.map((inv: any) => ({ ...inv, orders: undefined })) });
  } catch (e) { return toResponse(e); }
}

const SendSchema = z.object({
  customerId: z.string(),
  orderIds: z.array(z.string()),
  week: z.string(),
  vatPercent: z.number().default(9),
  billingEntityId: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== "OWNER") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const tid = await resolveTenantId({ tenantId, tenantSlug });
    const input = SendSchema.parse(await req.json());

    const { start, end } = weekBounds(input.week);

    // Build PDF data (fetches tenant + customer + orders from DB)
    const pdfData = await buildPdfData(tid, input.customerId, input.orderIds, input.week, input.vatPercent, null, input.billingEntityId);
    const totalExcl = pdfData.totalExcl;
    const customer = { name: pdfData.customerName, email: pdfData.customerEmail };

    // Try Exact Online to get invoice number
    const exact = await createExactInvoice(tid, {
      customerId: input.customerId,
      customerName: pdfData.customerName,
      customerEmail: pdfData.customerEmail ?? "",
      invoiceDate: end.toISOString().slice(0, 10),
      lines: pdfData.deliveryGroups.flatMap(g => g.lines.map(l => ({
        description: `${l.description} (${g.date})`,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        breadTypeId: l.breadTypeId,
      }))),
      yourRef: `Week ${input.week}`,
    }).catch((e) => {
      console.error("Exact invoice creation threw (falling back to local invoice number):", e);
      return null;
    });

    const invoiceNumber = exact?.invoiceNumber ?? null;

    // Generate PDF with final invoice number
    const finalPdfData = await buildPdfData(tid, input.customerId, input.orderIds, input.week, input.vatPercent, invoiceNumber, input.billingEntityId);
    const pdfBuffer = await generateInvoicePdf(finalPdfData);
    const finalNumber = finalPdfData.invoiceNumber;

    // Save invoice record with PDF
    const invoice = await (prisma as any).invoice.create({
      data: {
        tenantId: tid,
        customerId: input.customerId,
        billingEntityId: input.billingEntityId ?? null,
        invoiceNumber: invoiceNumber,
        exactGuid: exact?.exactGuid ?? null,
        periodStart: start,
        periodEnd: end,
        totalAmountExcl: totalExcl,
        vatPercent: input.vatPercent,
        pdfData: pdfBuffer,
        orders: { create: input.orderIds.map(id => ({ orderId: id })) },
      },
    });

    // Invoice is created (in Exact, if connected) and the final PDF is saved — but not
    // emailed yet. Sending is now a separate step (POST /api/facturen/[id]), so the owner
    // can check the real invoice/customer number before it goes out.
    return Response.json({ ok: true, invoiceId: invoice.id, invoiceNumber: finalNumber });
  } catch (e) { return toResponse(e); }
}
