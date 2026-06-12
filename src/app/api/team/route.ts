import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getRoleFromRequest, requirePermission } from "@/server/middleware/authz";
import { prisma } from "@/server/config/db";
import { parseJson } from "@/server/lib/validation";
import { z } from "zod";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "customers:read");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const users = await prisma.user.findMany({
      where: { tenantId: tid, role: { in: ["OWNER","ORDER_TABLET","BAKKER","BEZORGER"] } },
      orderBy: { name: "asc" },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    });

    return Response.json({ users });
  } catch (e) {
    return toResponse(e);
  }
}

const InviteWorkerSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  role: z.enum(["OWNER","ORDER_TABLET","BAKKER","BEZORGER"]).default("BAKKER"),
});

export async function POST(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "customers:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, InviteWorkerSchema);

    // Create user if not exists
    let user = await prisma.user.findFirst({ where: { tenantId: tid, email: input.email } });
    if (!user) {
      user = await prisma.user.create({
        data: { tenantId: tid, email: input.email, name: input.name, role: input.role, active: false },
      });
    }

    // Generate invite token (reuse InviteToken with customerId = user.id)
    await prisma.inviteToken.deleteMany({ where: { tenantId: tid, customerId: user.id } });
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.inviteToken.create({ data: { tenantId: tid, customerId: user.id, token, expiresAt } });

    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000/digitalbakery";
    const inviteUrl = `${baseUrl}/uitnodiging?token=${token}&type=worker`;

    return Response.json({ inviteUrl, email: input.email }, { status: 201 });
  } catch (e) {
    return toResponse(e);
  }
}

const UpdateWorkerSchema = z.object({
  id: z.string(),
  active: z.boolean().optional(),
  role: z.enum(["OWNER","ORDER_TABLET","BAKKER","BEZORGER"]).optional(),
});

export async function PATCH(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "customers:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, UpdateWorkerSchema);
    await prisma.user.updateMany({
      where: { id: input.id, tenantId: tid },
      data: {
        ...(input.active !== undefined && { active: input.active }),
        ...(input.role !== undefined && { role: input.role }),
      },
    });
    return Response.json({ ok: true });
  } catch (e) {
    return toResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "customers:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    await prisma.user.deleteMany({ where: { id, tenantId: tid, role: { in: ["OWNER","ORDER_TABLET","BAKKER","BEZORGER"] } } });
    return new Response(null, { status: 204 });
  } catch (e) { return toResponse(e); }
}
