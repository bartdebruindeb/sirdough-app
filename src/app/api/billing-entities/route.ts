import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { prisma } from "@/server/config/db";
import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

async function getOwnerTid(req: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "OWNER") throw new Error("UNAUTHORIZED");
  const { tenantId, tenantSlug } = getTenantFromRequest(req);
  return resolveTenantId({ tenantId, tenantSlug });
}

export async function GET(req: Request) {
  try {
    const tid = await getOwnerTid(req);
    const entities = await (prisma as any).billingEntity.findMany({ where: { tenantId: tid }, orderBy: { isDefault: "desc" } });
    return Response.json({ entities });
  } catch (e) { return toResponse(e); }
}

const EntitySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  companyAddress: z.string().optional().nullable(),
  companyPostal: z.string().optional().nullable(),
  companyCity: z.string().optional().nullable(),
  kvk: z.string().optional().nullable(),
  btwNumber: z.string().optional().nullable(),
  iban: z.string().optional().nullable(),
  bic: z.string().optional().nullable(),
  companyPhone: z.string().optional().nullable(),
  companyEmail: z.string().optional().nullable(),
  companyWebsite: z.string().optional().nullable(),
  paymentTermDays: z.number().int().default(30),
  paymentCondition: z.string().default("30 dagen"),
  isDefault: z.boolean().default(false),
});

export async function POST(req: Request) {
  try {
    const tid = await getOwnerTid(req);
    const data = EntitySchema.parse(await req.json());
    // If setting as default, unset others
    if (data.isDefault) await (prisma as any).billingEntity.updateMany({ where: { tenantId: tid }, data: { isDefault: false } });
    const entity = await (prisma as any).billingEntity.create({ data: { ...data, id: undefined, tenantId: tid } });
    return Response.json({ entity }, { status: 201 });
  } catch (e) { return toResponse(e); }
}

export async function PATCH(req: Request) {
  try {
    const tid = await getOwnerTid(req);
    const data = EntitySchema.parse(await req.json());
    const { id, ...rest } = data;
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    if (rest.isDefault) await (prisma as any).billingEntity.updateMany({ where: { tenantId: tid, id: { not: id } }, data: { isDefault: false } });
    const entity = await (prisma as any).billingEntity.update({ where: { id, tenantId: tid }, data: rest });
    return Response.json({ entity });
  } catch (e) { return toResponse(e); }
}

export async function DELETE(req: Request) {
  try {
    const tid = await getOwnerTid(req);
    const { id } = await req.json();
    await (prisma as any).billingEntity.delete({ where: { id, tenantId: tid } });
    return Response.json({ ok: true });
  } catch (e) { return toResponse(e); }
}
