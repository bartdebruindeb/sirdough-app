/** GET /api/facturen/[id] — serve stored PDF; POST — resend email */
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { prisma } from "@/server/config/db";
import { Resend } from "resend";
import { toResponse } from "@/server/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const customerId = (session?.user as any)?.customerId;
  if (!role && !customerId) return new Response("Unauthorized", { status: 401 });

  const invoice = await (prisma as any).invoice.findUnique({ where: { id: params.id } });
  if (!invoice) return new Response("Not found", { status: 404 });

  // Owner can see any invoice; customer can only see their own
  if (role !== "OWNER" && role !== "BAKKER" && invoice.customerId !== customerId) {
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

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== "OWNER") return new Response("Unauthorized", { status: 401 });

    const invoice = await (prisma as any).invoice.findUnique({
      where: { id: params.id },
      include: { customer: { select: { name: true, email: true } } },
    });
    if (!invoice) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
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
