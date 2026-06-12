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
    requirePermission(role, "delivery:read");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to   = url.searchParams.get("to");
    const customerId = url.searchParams.get("customerId");

    const notes = await prisma.deliveryNote.findMany({
      where: {
        tenantId: tid,
        ...(customerId && { customerId }),
        ...(from || to ? {
          date: {
            ...(from ? { gte: new Date(from + "T00:00:00Z") } : {}),
            ...(to   ? { lte: new Date(to   + "T23:59:59Z") } : {}),
          },
        } : {}),
      },
      include: { customer: { select: { id: true, name: true, city: true } } },
      orderBy: { date: "desc" },
    });

    return Response.json({ notes: notes.map(n => ({
      id: n.id,
      date: n.date.toISOString().slice(0, 10),
      customerId: n.customerId,
      customerName: n.customer.name,
      customerCity: n.customer.city,
      note: n.note,
      createdAt: n.createdAt.toISOString(),
    })) });
  } catch (e) { return toResponse(e); }
}

const CreateNoteSchema = z.object({
  customerId: z.string(),
  date: z.string(),
  note: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "delivery:note");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, CreateNoteSchema);
    const note = await prisma.deliveryNote.create({
      data: {
        tenantId: tid,
        customerId: input.customerId,
        date: new Date(input.date + "T12:00:00Z"),
        note: input.note,
      },
      include: { customer: { select: { id: true, name: true, city: true } } },
    });

    return Response.json({ id: note.id, date: note.date.toISOString().slice(0, 10), note: note.note }, { status: 201 });
  } catch (e) { return toResponse(e); }
}

export async function DELETE(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "delivery:note");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "id required" }, { status: 400 });

    await prisma.deliveryNote.deleteMany({ where: { id, tenantId: tid } });
    return new Response(null, { status: 204 });
  } catch (e) { return toResponse(e); }
}
