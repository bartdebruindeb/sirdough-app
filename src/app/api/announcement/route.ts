import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getRoleFromRequest, requirePermission } from "@/server/middleware/authz";
import { prisma } from "@/server/config/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Anyone logged in can read the announcement
export async function GET(req: Request) {
  try {
    const { tenantId } = getTenantFromRequest(req);
    const tid = await resolveTenantId(tenantId);

    const announcement = await prisma.announcement.findFirst({
      where: { tenantId: tid },
      orderBy: { updatedAt: "desc" },
    });

    return Response.json({ message: announcement?.message ?? "", updatedAt: announcement?.updatedAt ?? null });
  } catch (e) {
    return toResponse(e);
  }
}

const SetSchema = z.object({ message: z.string().max(2000) });

// Only the owner can set/update the announcement
export async function PUT(req: Request) {
  try {
    const { tenantId } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "announcement:write");
    const tid = await resolveTenantId(tenantId);

    const body = await req.json();
    const input = SetSchema.parse(body);

    const existing = await prisma.announcement.findFirst({ where: { tenantId: tid } });

    const announcement = existing
      ? await prisma.announcement.update({ where: { id: existing.id }, data: { message: input.message } })
      : await prisma.announcement.create({ data: { tenantId: tid, message: input.message } });

    return Response.json({ message: announcement.message, updatedAt: announcement.updatedAt });
  } catch (e) {
    return toResponse(e);
  }
}
