import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { buildInvoiceHtml } from "@/server/lib/invoiceHtml";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "OWNER") return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const customerName = url.searchParams.get("name") ?? "Bakkerij De Vries";
  const invoiceNumber = url.searchParams.get("nr") ?? "DBK-PREVIEW";

  const html = buildInvoiceHtml({
    customerName,
    invoiceNumber,
    week: "2025-W26",
    lines: [
      { description: "Sesam 1,5kg (ma 23 jun)", quantity: 4, unitPrice: 6.5, lineTotal: 26.0 },
      { description: "Boeren 1kg (ma 23 jun)", quantity: 2, unitPrice: 4.8, lineTotal: 9.6 },
      { description: "Volkoren 1kg (wo 25 jun)", quantity: 3, unitPrice: 4.8, lineTotal: 14.4 },
      { description: "Spelt 750g (vr 27 jun)", quantity: 6, unitPrice: 3.9, lineTotal: 23.4 },
    ],
    totalExcl: 73.4,
    vatPercent: 9,
  });

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
