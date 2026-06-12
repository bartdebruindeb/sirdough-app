import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getRoleFromRequest } from "@/server/middleware/authz";
import { prisma } from "@/server/config/db";
import { parseJson } from "@/server/lib/validation";
import { z } from "zod";

export const dynamic = "force-dynamic";

// GET — fetch exceptions for a recurring order (next 3 months)
export async function GET(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const tid = await resolveTenantId({ tenantId, tenantSlug });
    const url = new URL(req.url);
    const recurringOrderId = url.searchParams.get("recurringOrderId");
    if (!recurringOrderId) return Response.json({ exceptions: [] });

    const since = new Date();
    const until = new Date(); until.setMonth(until.getMonth() + 3);

    const exceptions = await prisma.recurringOrderException.findMany({
      where: { recurringOrderId, date: { gte: since, lte: until } },
      orderBy: { date: "asc" },
    });
    return Response.json({ exceptions: exceptions.map(e => ({
      id: e.id, date: e.date.toISOString().slice(0, 10), active: e.active,
    })) });
  } catch (e) { return toResponse(e); }
}

const SetExceptionSchema = z.object({
  recurringOrderId: z.string(),
  date: z.string(), // YYYY-MM-DD
  active: z.boolean(),
});

// POST — set or remove an exception for a specific date
export async function POST(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const tid = await resolveTenantId({ tenantId, tenantSlug });
    const input = await parseJson(req, SetExceptionSchema);

    // Verify recurring order belongs to this tenant
    const ro = await prisma.recurringOrder.findFirst({
      where: { id: input.recurringOrderId, tenantId: tid },
    });
    if (!ro) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

    const date = new Date(input.date + "T12:00:00Z");

    // If active matches the default (recurring order is active by default),
    // delete the exception (no override needed). Otherwise upsert.
    if (input.active === ro.active) {
      // Remove override — back to default
      await prisma.recurringOrderException.deleteMany({
        where: { recurringOrderId: input.recurringOrderId, date },
      });
    } else {
      await prisma.recurringOrderException.upsert({
        where: { recurringOrderId_date: { recurringOrderId: input.recurringOrderId, date } },
        create: { recurringOrderId: input.recurringOrderId, date, active: input.active },
        update: { active: input.active },
      });
    }

    return Response.json({ ok: true });
  } catch (e) { return toResponse(e); }
}
