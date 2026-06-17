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
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const breadTypes = await prisma.breadType.findMany({
      where: { tenantId: tid, active: true },
      orderBy: { sortOrder: "asc" },
    });
    return Response.json({ breadTypes });
  } catch (e) {
    return toResponse(e);
  }
}

const CreateBreadTypeSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers and dashes"),
  category: z.string().min(1),
  weightGrams: z.number().positive().default(1000),
  basketType: z.string().optional(),
  basketStyle: z.string().optional().nullable(),
  showInProduction: z.boolean().optional().default(true),
  sortOrder: z.number().int().default(99),
});

export async function POST(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "recipes:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, CreateBreadTypeSchema);

    // Check slug uniqueness
    const existing = await prisma.breadType.findUnique({
      where: { tenantId_slug: { tenantId: tid, slug: input.slug } },
    });
    if (existing) {
      return Response.json({ error: "CONFLICT", message: "Slug already exists" }, { status: 409 });
    }

    const bt = await prisma.breadType.create({
      data: { tenantId: tid, ...input },
    });
    return Response.json(bt, { status: 201 });
  } catch (e) {
    return toResponse(e);
  }
}

const PatchBreadTypeSchema = z.object({
  id: z.string(),
  customerOrderable: z.boolean().optional(),
  active: z.boolean().optional(),
  name: z.string().optional(),
  sortOrder: z.number().optional(),
  category: z.string().optional(),
  basketType: z.string().optional(),
  basketStyle: z.string().optional().nullable(),
  weightGrams: z.number().optional(),
  showInProduction: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "recipes:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });
    const input = await parseJson(req, PatchBreadTypeSchema);
    const { id, ...data } = input;
    await prisma.breadType.updateMany({ where: { id, tenantId: tid }, data });
    return Response.json({ ok: true });
  } catch (e) { return toResponse(e); }
}

export async function DELETE(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "recipes:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    // Check for related order lines — soft-delete if any exist
    const [oneOffCount, recurringCount] = await Promise.all([
      prisma.oneOffOrderLine.count({ where: { breadTypeId: id } }),
      prisma.recurringOrderLine.count({ where: { breadTypeId: id } }),
    ]);
    if (oneOffCount > 0 || recurringCount > 0) {
      await prisma.breadType.updateMany({ where: { id, tenantId: tid }, data: { active: false } });
      return Response.json({ deleted: false, deactivated: true });
    }
    // Hard delete — remove FK dependents first
    await prisma.productionDayLine.deleteMany({ where: { breadTypeId: id } });
    await prisma.recipe.deleteMany({ where: { breadTypeId: id } });
    await prisma.breadType.deleteMany({ where: { id, tenantId: tid } });
    return Response.json({ deleted: true });
  } catch (e) { return toResponse(e); }
}
