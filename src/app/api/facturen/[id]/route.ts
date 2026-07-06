/** GET /api/facturen/[id] — serve stored PDF; POST — resend email; DELETE — remove invoice (+ Exact, if linked) */
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { prisma } from "@/server/config/db";
import { Resend } from "resend";
import { toResponse } from "@/server/lib/errors";
import { deleteExactInvoice } from "@/server/lib/exact";
import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const customerId = (session?.user as any)?.customerId;
  const customerIds: string[] = (session?.user as any)?.customerIds ?? (customerId ? [customerId] : []);
  if (!role && customerIds.length === 0) return new Response("Unauthorized", { status: 401 });

  const tid = await resolveTenantId(getTenantFromRequest(req));
  const invoice = await (prisma as any).invoice.findUnique({ where: { id: params.id } });
  if (!invoice || invoice.tenantId !== tid) return new Response("Not found", { status: 404 });

  // Owner/baker can see any invoice; a customer can see any of their own locations' invoices.
  if (role !== "OWNER" && role !== "BAKKER" && !customerIds.includes(invoice.customerId)) {
    return new Response("Forbidden", { status: 403 });
  }

  if (!invoice.pdfData) return new Response("PDF not yet generated", { status: 404 });

  const number = invoice.invoiceNumber ?? invoice.id.slice(-6).toUpperCase();
  return new Response(invoice.pdfData as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="factuur-${number}.pdf"`,
    },
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== "OWNER") return new Response("Unauthorized", { status: 401 });

    const tid = await resolveTenantId(getTenantFromRequest(req));
    const invoice = await (prisma as any).invoice.findUnique({
      where: { id: params.id },
      include: { customer: { select: { name: true, email: true } } },
    });
    if (!invoice || invoice.tenantId !== tid) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    if (!invoice.pdfData) return Response.json({ error: "NO_PDF" }, { status: 400 });

    const to = invoice.customer?.email;
    if (!to) return Response.json({ error: "NO_EMAIL" }, { status: 400 });

    const key = process.env.RESEND_API_KEY;
    if (!key) return Response.json({ error: "RESEND_NOT_CONFIGURED" }, { status: 500 });

    const from = process.env.RESEND_FROM ?? "Digital Bakery <onboarding@resend.dev>";
    const number = invoice.invoiceNumber ?? `DBK-${invoice.id.slice(-6).toUpperCase()}`;
    const excl = Number(invoice.totalAmountExcl);
    const vat = excl * (Number(invoice.vatPercent) / 100);
    const total = excl + vat;

    const resend = new Resend(key);
    await resend.emails.send({
      from,
      to,
      subject: `Factuur ${number} – Digital Bakery`,
      html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
        <p style="font-size:18px;font-weight:700">Digital Bakery</p>
        <p>Beste ${invoice.customer?.name ?? "klant"},</p>
        <p>Bijgaand (opnieuw) de factuur ${number}.</p>
        <p style="font-size:15px;font-weight:700">Totaal te voldoen: € ${total.toFixed(2).replace(".", ",")}</p>
        <p style="font-size:12px;color:#999">De factuur is als bijlage toegevoegd aan deze e-mail.</p>
      </div>`,
      attachments: [{ filename: `factuur-${number}.pdf`, content: Buffer.from(invoice.pdfData) }],
    });

    await (prisma as any).invoice.update({ where: { id: params.id }, data: { sentAt: new Date() } });
    return Response.json({ ok: true, sentTo: to });
  } catch (e) { return toResponse(e); }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== "OWNER") return new Response("Unauthorized", { status: 401 });

    const tid = await resolveTenantId(getTenantFromRequest(req));
    const invoice = await (prisma as any).invoice.findUnique({ where: { id: params.id } });
    if (!invoice || invoice.tenantId !== tid) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

    // Only draft (unprocessed) invoices can be deleted in Exact — a rejection here
    // (e.g. already booked) blocks the local delete too, so the two stay in sync
    // instead of silently drifting apart.
    if (invoice.exactGuid) {
      try {
        await deleteExactInvoice(invoice.tenantId, invoice.exactGuid);
      } catch (e: any) {
        return Response.json({ error: "EXACT_DELETE_FAILED", detail: e?.message ?? String(e) }, { status: 409 });
      }
    }

    await (prisma as any).invoice.delete({ where: { id: params.id } });
    return Response.json({ ok: true });
  } catch (e) { return toResponse(e); }
}
