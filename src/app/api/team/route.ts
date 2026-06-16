import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getRoleFromRequest, requirePermission } from "@/server/middleware/authz";
import { prisma } from "@/server/config/db";
import { parseJson } from "@/server/lib/validation";
import { z } from "zod";
import crypto from "crypto";
import { bakeryConfig } from "@/config/bakery.config";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "customers:read");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const users = await prisma.user.findMany({
      where: { tenantId: tid, role: { in: ["OWNER","ORDER_TABLET","BAKKER"] } },
      orderBy: { name: "asc" },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    });

    // Never expose the protected admin's real email address to the client
    const mapped = users.map(u => {
      const isProtectedAdmin = u.email === bakeryConfig.protectedAdminEmail;
      return { ...u, email: isProtectedAdmin ? "—" : u.email, isProtectedAdmin };
    });

    return Response.json({ users: mapped });
  } catch (e) {
    return toResponse(e);
  }
}

const InviteWorkerSchema = z.object({
  id: z.string().optional(),
  email: z.string().email(),
  name: z.string().optional(),
  role: z.enum(["OWNER","ORDER_TABLET","BAKKER"]).default("BAKKER"),
});

export async function POST(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "customers:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, InviteWorkerSchema);

    // If an id is given (regenerating a link for an existing user from the
    // Team page), look up by id — this works even when the email shown to
    // the client is masked (protected admin account).
    let user = input.id
      ? await prisma.user.findFirst({ where: { id: input.id, tenantId: tid } })
      : await prisma.user.findFirst({ where: { tenantId: tid, email: input.email } });

    if (!user) {
      if (input.id) return Response.json({ message: "Gebruiker niet gevonden." }, { status: 404 });
      user = await prisma.user.create({
        data: { tenantId: tid, email: input.email, name: input.name, role: input.role, active: false },
      });
    }

    // Generate invite token (reuse InviteToken with customerId = user.id)
    await prisma.inviteToken.deleteMany({ where: { tenantId: tid, customerId: user.id } });
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
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
  role: z.enum(["OWNER","ORDER_TABLET","BAKKER"]).optional(),
});

export async function PATCH(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "customers:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, UpdateWorkerSchema);

    // Permanent admin account: never touchable, regardless of owner count.
    const wouldChange = input.active !== undefined || input.role !== undefined;
    if (wouldChange) {
      const target = await prisma.user.findFirst({ where: { id: input.id, tenantId: tid } });
      if (target?.email === bakeryConfig.protectedAdminEmail) {
        return Response.json({ message: "Dit account kan niet worden gewijzigd." }, { status: 400 });
      }
    }

    // Safety net: never allow the last active OWNER to be deactivated or
    // demoted to a different role — there must always be at least one
    // account that can manage the team.
    const wouldRemoveOwnerStatus =
      (input.active === false) || (input.role !== undefined && input.role !== "OWNER");

    if (wouldRemoveOwnerStatus) {
      const target = await prisma.user.findFirst({ where: { id: input.id, tenantId: tid } });
      if (target?.role === "OWNER" && target.active) {
        const activeOwners = await prisma.user.count({ where: { tenantId: tid, role: "OWNER", active: true } });
        if (activeOwners <= 1) {
          return Response.json({ message: "Er moet altijd minstens één actieve eigenaar zijn." }, { status: 400 });
        }
      }
    }

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

    // Safety net: never allow the last active OWNER to be deleted.
    const target = await prisma.user.findFirst({ where: { id, tenantId: tid } });
    if (target?.email === bakeryConfig.protectedAdminEmail) {
      return Response.json({ message: "Dit account kan niet worden verwijderd." }, { status: 400 });
    }
    if (target?.role === "OWNER" && target.active) {
      const activeOwners = await prisma.user.count({ where: { tenantId: tid, role: "OWNER", active: true } });
      if (activeOwners <= 1) {
        return Response.json({ message: "Er moet altijd minstens één actieve eigenaar zijn." }, { status: 400 });
      }
    }

    await prisma.user.deleteMany({ where: { id, tenantId: tid, role: { in: ["OWNER","ORDER_TABLET","BAKKER"] } } });
    return new Response(null, { status: 204 });
  } catch (e) { return toResponse(e); }
}
