import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getRoleFromRequest, requirePermission } from "@/server/middleware/authz";
import { prisma } from "@/server/config/db";
import { parseJson } from "@/server/lib/validation";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "recipes:read");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const doughTypes = await prisma.doughType.findMany({
      where: { tenantId: tid },
      include: {
        flourLines: { orderBy: { sortOrder: "asc" } },
        breadTypes: { where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, slug: true } },
      },
      orderBy: { name: "asc" },
    });
    return Response.json({ doughTypes });
  } catch (e) { return toResponse(e); }
}

const UpsertDoughSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  slug: z.string().min(1),
  notes: z.string().optional(),
  waterPct: z.number(),
  desemPct: z.number(),
  zoutPct: z.number(),
  inwasPct: z.number(),
  flourLines: z.array(z.object({ name: z.string(), percentage: z.number(), sortOrder: z.number().default(0) })),
});

export async function POST(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "recipes:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, UpsertDoughSchema);

    const dt = await prisma.$transaction(async tx => {
      const d = input.id
        ? await tx.doughType.update({ where: { id: input.id }, data: { name: input.name, notes: input.notes, waterPct: input.waterPct, desemPct: input.desemPct, zoutPct: input.zoutPct, inwasPct: input.inwasPct } })
        : await tx.doughType.create({ data: { tenantId: tid, name: input.name, slug: input.slug, notes: input.notes, waterPct: input.waterPct, desemPct: input.desemPct, zoutPct: input.zoutPct, inwasPct: input.inwasPct } });
      await tx.doughFlour.deleteMany({ where: { doughTypeId: d.id } });
      await tx.doughFlour.createMany({ data: input.flourLines.map(f => ({ doughTypeId: d.id, ...f })) });
      return d;
    });

    return Response.json(dt, { status: 201 });
  } catch (e) { return toResponse(e); }
}
