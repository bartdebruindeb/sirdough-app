/** GET /api/facturen/[id] — serve stored PDF for a sent invoice */
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { prisma } from "@/server/config/db";

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
