/**
 * POST /api/facturen/generate
 * Generates a PDF preview for a customer/week without saving anything.
 * Returns the PDF directly so the owner can review before sending.
 */
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { prisma } from "@/server/config/db";
import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { buildPdfData, generateInvoicePdf } from "@/server/lib/invoicePdf";
import { z } from "zod";

export const dynamic = "force-dynamic";

const Schema = z.object({
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
    if (role !== "OWNER") return new Response("Unauthorized", { status: 401 });

    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const tid = await resolveTenantId({ tenantId, tenantSlug });
    const input = Schema.parse(await req.json());

    const data = await buildPdfData(tid, input.customerId, input.orderIds, input.week, input.vatPercent, null, input.billingEntityId);
    const pdf = await generateInvoicePdf(data);

    return new Response(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="preview-factuur.pdf"`,
      },
    });
  } catch (e) { return toResponse(e); }
}
