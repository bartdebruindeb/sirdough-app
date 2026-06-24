/**
 * GET  /api/facturen?week=YYYY-WNN  – list customers with uninvoiced orders that week
 * POST /api/facturen                – create + send invoice for a customer/week
 */
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { prisma } from "@/server/config/db";
import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { createExactInvoice } from "@/server/lib/exact";
import { buildInvoiceHtml } from "@/server/lib/invoiceHtml";
import { buildPdfData, generateInvoicePdf } from "@/server/lib/invoicePdf";
import { Resend } from "resend";
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
      customerName: pdfData.customerName,
      customerEmail: pdfData.customerEmail ?? "",
      invoiceDate: end.toISOString().slice(0, 10),
      lines: pdfData.deliveryGroups.flatMap(g => g.lines.map(l => ({
        description: `${l.description} (${g.date})`,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      }))),
      yourRef: `Week ${input.week}`,
    }).catch(() => null);

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

    // Send email with PDF attachment
    if (pdfData.customerEmail) {
      await sendInvoiceEmail({
        to: pdfData.customerEmail,
        customerName: pdfData.customerName,
        invoiceNumber: finalNumber,
        week: input.week,
        pdfBuffer,
        totalExcl,
        vatPercent: input.vatPercent,
      });
      await (prisma as any).invoice.update({ where: { id: invoice.id }, data: { sentAt: new Date() } });
    }

    return Response.json({ ok: true, invoiceId: invoice.id, invoiceNumber: finalNumber, sentTo: pdfData.customerEmail ?? null });
  } catch (e) { return toResponse(e); }
}

async function sendInvoiceEmail(opts: {
  to: string;
  customerName: string;
  invoiceNumber: string;
  week: string;
  pdfBuffer: Buffer;
  totalExcl: number;
  vatPercent: number;
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.warn("RESEND_API_KEY not set — invoice email skipped"); return; }
  const from = process.env.RESEND_FROM ?? "Digital Bakery <onboarding@resend.dev>";
  const vat = opts.totalExcl * (opts.vatPercent / 100);
  const total = opts.totalExcl + vat;
  const [year, wn] = opts.week.split("-W");

  const html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
    <p style="font-size:18px;font-weight:700">Digital Bakery</p>
    <p>Beste ${opts.customerName},</p>
    <p>Bijgaand de factuur voor week ${wn} van ${year}.</p>
    <p style="font-size:15px;font-weight:700">Totaal te voldoen: € ${(total).toFixed(2).replace(".", ",")}</p>
    <p style="font-size:12px;color:#999">De factuur is als bijlage toegevoegd aan deze e-mail.</p>
  </div>`;

  const resend = new Resend(key);
  await resend.emails.send({
    from,
    to: opts.to,
    subject: `Factuur ${opts.invoiceNumber} – Digital Bakery`,
    html,
    attachments: [{
      filename: `factuur-${opts.invoiceNumber}.pdf`,
      content: opts.pdfBuffer,
    }],
  });
}
