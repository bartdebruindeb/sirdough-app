import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { prisma } from "@/server/config/db";
import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const COMPANY_FIELDS = ["companyName","companyAddress","companyPostal","companyCity","kvk","btwNumber","iban","bic","companyPhone","companyEmail","companyWebsite","paymentTermDays","paymentCondition"] as const;

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== "OWNER") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const tid = await resolveTenantId({ tenantId, tenantSlug });
    const tenant = await (prisma as any).tenant.findUnique({ where: { id: tid }, select: Object.fromEntries(COMPANY_FIELDS.map(f => [f, true])) });
    return Response.json(tenant ?? {});
  } catch (e) { return toResponse(e); }
}

const Schema = z.object({
  companyName: z.string().optional(),
  companyAddress: z.string().optional(),
  companyPostal: z.string().optional(),
  companyCity: z.string().optional(),
  kvk: z.string().optional(),
  btwNumber: z.string().optional(),
  iban: z.string().optional(),
  bic: z.string().optional(),
  companyPhone: z.string().optional(),
  companyEmail: z.string().optional(),
  companyWebsite: z.string().optional(),
  paymentTermDays: z.number().optional(),
  paymentCondition: z.string().optional(),
});

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== "OWNER") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const tid = await resolveTenantId({ tenantId, tenantSlug });
    const data = Schema.parse(await req.json());
    await (prisma as any).tenant.update({ where: { id: tid }, data });
    return Response.json({ ok: true });
  } catch (e) { return toResponse(e); }
}
