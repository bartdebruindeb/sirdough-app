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
    requirePermission(role, "production:read");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    if (!date) return Response.json({ error: "date required" }, { status: 400 });

    const batches = await prisma.productionBatch.findMany({
      where: {
        tenantId: tid,
        productionDate: {
          gte: new Date(date + "T00:00:00Z"),
          lte: new Date(date + "T23:59:59Z"),
        },
      },
      orderBy: [{ mixerGroup: "asc" }, { batchNumber: "asc" }],
    });

    return Response.json({
      batches: batches.map(b => ({
        id: b.id,
        mixerGroup: b.mixerGroup,
        groupLabel: b.groupLabel,
        batchNumber: b.batchNumber,
        totalLoaves: b.totalLoaves,
        status: b.status,
        notes: b.notes ?? null,
        startedAt:  b.startedAt?.toISOString()  ?? null,
        rijzenAt:   b.rijzenAt?.toISOString()    ?? null,
        voorvormAt: b.voorvormAt?.toISOString()  ?? null,
        eindvormAt: b.eindvormAt?.toISOString()  ?? null,
        klaarAt:    b.klaarAt?.toISOString()     ?? null,
      })),
    });
  } catch (e) { return toResponse(e); }
}

// POST — replace all batches for a production date
const BatchItemSchema = z.object({
  mixerGroup:  z.string(),
  groupLabel:  z.string(),
  batchNumber: z.number().int().positive(),
  totalLoaves: z.number().int().min(0),
  notes:       z.string().optional(),
});
const CreateBatchesSchema = z.object({
  date:    z.string(),
  batches: z.array(BatchItemSchema),
});

export async function POST(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "production:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, CreateBatchesSchema);
    const productionDate = new Date(input.date + "T12:00:00Z");

    // Replace existing batches for this date
    await prisma.productionBatch.deleteMany({
      where: {
        tenantId: tid,
        productionDate: {
          gte: new Date(input.date + "T00:00:00Z"),
          lte: new Date(input.date + "T23:59:59Z"),
        },
      },
    });
    await prisma.productionBatch.createMany({
      data: input.batches.map(b => ({
        tenantId: tid,
        productionDate,
        mixerGroup:  b.mixerGroup,
        groupLabel:  b.groupLabel,
        batchNumber: b.batchNumber,
        totalLoaves: b.totalLoaves,
        status: "todo",
        notes: b.notes ?? null,
      })),
    });

    return Response.json({ ok: true }, { status: 201 });
  } catch (e) { return toResponse(e); }
}

// PATCH — advance status of a single batch
const PatchBatchSchema = z.object({
  id:     z.string(),
  status: z.enum(["todo", "in_mixer", "rijzen", "voorvormen", "eindvormen", "klaar"]),
});

export async function PATCH(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "production:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, PatchBatchSchema);
    const now = new Date();

    const data: Record<string, unknown> = { status: input.status, updatedAt: now };
    if (input.status === "in_mixer")    data.startedAt  = now;
    if (input.status === "rijzen")      data.rijzenAt   = now;
    if (input.status === "voorvormen")  data.voorvormAt = now;
    if (input.status === "eindvormen")  data.eindvormAt = now;
    if (input.status === "klaar")       data.klaarAt    = now;

    await prisma.productionBatch.updateMany({
      where: { id: input.id, tenantId: tid },
      data,
    });

    return Response.json({ ok: true });
  } catch (e) { return toResponse(e); }
}
