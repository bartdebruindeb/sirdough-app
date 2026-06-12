import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { parseJson } from "@/server/lib/validation";
import { getRoleFromRequest, requirePermission } from "@/server/middleware/authz";
import { prisma } from "@/server/config/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "recipes:read");

    const resolvedTenantId = await resolveTenantId({ tenantId, tenantSlug });

    const breadTypes = await prisma.breadType.findMany({
      where: { tenantId: resolvedTenantId, active: true },
      include: {
        recipe: {
          include: { flourLines: { orderBy: { sortOrder: "asc" } }, toppings: { orderBy: { sortOrder: "asc" } } },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    return Response.json({ breadTypes, role });
  } catch (e) {
    return toResponse(e);
  }
}

const RecipeUpdateSchema = z.object({
  breadTypeId: z.string(),
  waterPct: z.number(),
  desemPct: z.number(),
  zoutPct: z.number(),
  inwasPct: z.number(),
  doughWeightPerLoaf: z.number(),
  notes: z.string().optional(),
  mixerGroup: z.string().optional(),
  flourLines: z.array(z.object({ name: z.string(), percentage: z.number(), sortOrder: z.number().default(0) })),
  toppings: z.array(z.object({
    name: z.string(), gramsPerLoaf: z.number(),
    requiresKoking: z.boolean().default(false), waterRatio: z.number().optional(), sortOrder: z.number().default(0),
  })).default([]),
});

export async function POST(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "recipes:write");

    const resolvedTenantId = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, RecipeUpdateSchema);

    const recipe = await prisma.$transaction(async (tx) => {
      const r = await tx.recipe.upsert({
        where: { breadTypeId: input.breadTypeId },
        create: {
          tenantId: resolvedTenantId,
          breadTypeId: input.breadTypeId,
          waterPct: input.waterPct, desemPct: input.desemPct,
          zoutPct: input.zoutPct, inwasPct: input.inwasPct,
          doughWeightPerLoaf: input.doughWeightPerLoaf,
          notes: input.notes, mixerGroup: input.mixerGroup ?? "boeren",
        },
        update: {
          waterPct: input.waterPct, desemPct: input.desemPct,
          zoutPct: input.zoutPct, inwasPct: input.inwasPct,
          doughWeightPerLoaf: input.doughWeightPerLoaf,
          notes: input.notes, mixerGroup: input.mixerGroup ?? "boeren",
        },
      });
      await tx.recipeFlour.deleteMany({ where: { recipeId: r.id } });
      await tx.recipeFlour.createMany({ data: input.flourLines.map(f => ({ recipeId: r.id, ...f })) });
      await tx.recipeTopping.deleteMany({ where: { recipeId: r.id } });
      if (input.toppings?.length)
        await tx.recipeTopping.createMany({ data: input.toppings.map(t => ({ recipeId: r.id, ...t })) });
      return r;
    });

    return Response.json(recipe, { status: 201 });
  } catch (e) {
    return toResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "recipes:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });
    const url = new URL(req.url);
    const breadTypeId = url.searchParams.get("breadTypeId");
    if (!breadTypeId) return Response.json({ error: "breadTypeId required" }, { status: 400 });
    await prisma.recipe.deleteMany({ where: { breadTypeId, tenantId: tid } });
    return new Response(null, { status: 204 });
  } catch (e) { return toResponse(e); }
}
