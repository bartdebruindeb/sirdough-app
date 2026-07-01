import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getRoleFromRequest, requirePermission } from "@/server/middleware/authz";
import { prisma } from "@/server/config/db";
import { parseJson } from "@/server/lib/validation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// POST /api/invite — owner generates an invite link for a customer
const GenerateSchema = z.object({ customerId: z.string() });

export async function POST(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "customers:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const { customerId } = await parseJson(req, GenerateSchema);
    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId: tid } });
    if (!customer) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

    // No email required — the customer fills in their own email (as their login) when they open the link.

    // Invalidate old tokens for this customer
    await prisma.inviteToken.deleteMany({ where: { tenantId: tid, customerId } });

    // Generate new token valid for 7 days
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await prisma.inviteToken.create({
      data: { tenantId: tid, customerId, token, expiresAt },
    });

    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const inviteUrl = `${baseUrl}/uitnodiging?token=${token}`;

    return Response.json({ inviteUrl, email: customer.email });
  } catch (e) {
    return toResponse(e);
  }
}

const AcceptSchema = z.object({ token: z.string(), password: z.string().min(8), email: z.string().email().optional() });

// PUT /api/invite — set password (+ email for customers) (works for customers and workers)
export async function PUT(req: Request) {
  try {
    const input = await parseJson(req, AcceptSchema);

    const invite = await prisma.inviteToken.findUnique({ where: { token: input.token } });
    if (!invite) return Response.json({ error: "INVALID_TOKEN", message: "Ongeldige of verlopen uitnodigingslink." }, { status: 400 });
    if (invite.usedAt) return Response.json({ error: "USED_TOKEN", message: "Deze link is al gebruikt." }, { status: 400 });
    if (invite.expiresAt < new Date()) return Response.json({ error: "EXPIRED_TOKEN", message: "Link verlopen." }, { status: 400 });

    const passwordHash = await bcrypt.hash(input.password, 12);

    // Check if this is a worker invite (customerId is actually a userId)
    const workerUser = await prisma.user.findFirst({ where: { id: invite.customerId, role: { in: ["OWNER","ORDER_TABLET","BAKKER"] } } });
    if (workerUser) {
      await prisma.user.update({ where: { id: workerUser.id }, data: { passwordHash, active: true } });
      await prisma.inviteToken.update({ where: { token: input.token }, data: { usedAt: new Date() } });
      return Response.json({ ok: true, email: workerUser.email });
    }

    // Customer invite — email may not have been known when the invite was generated;
    // the customer states it themselves here and it becomes their login username.
    const customer = await prisma.customer.findFirst({ where: { id: invite.customerId } });
    if (!customer) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

    const email = (input.email ?? customer.email ?? "").trim().toLowerCase();
    if (!email) return Response.json({ error: "NO_EMAIL", message: "Vul een e-mailadres in." }, { status: 400 });

    const existingUser = await prisma.user.findFirst({ where: { tenantId: invite.tenantId, email } });
    if (existingUser) {
      const existingCustomer = await prisma.customer.findFirst({ where: { userId: existingUser.id } });
      if (existingCustomer && existingCustomer.id !== customer.id) {
        return Response.json({ error: "EMAIL_IN_USE", message: "Dit e-mailadres is al in gebruik door een andere klant." }, { status: 409 });
      }
    }

    const user = existingUser
      ? await prisma.user.update({ where: { id: existingUser.id }, data: { passwordHash, active: true, role: "CUSTOMER", name: customer.name } })
      : await prisma.user.create({
          data: { tenantId: invite.tenantId, email, name: customer.name, role: "CUSTOMER", passwordHash, active: true },
        });

    await prisma.customer.update({ where: { id: customer.id }, data: { userId: user.id, email } });
    await prisma.inviteToken.update({ where: { token: input.token }, data: { usedAt: new Date() } });
    return Response.json({ ok: true, email });
  } catch (e) {
    return toResponse(e);
  }
}

// GET /api/invite?token=xxx — validate a token (check if still valid)
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) return Response.json({ valid: false, message: "Geen token." });

    const invite = await prisma.inviteToken.findUnique({
      where: { token },
    });

    if (!invite) return Response.json({ valid: false, message: "Ongeldige link." });
    if (invite.usedAt) return Response.json({ valid: false, message: "Deze link is al gebruikt." });
    if (invite.expiresAt < new Date()) return Response.json({ valid: false, message: "Link verlopen." });

    // customerId may be a userId (worker invite) or a customerId (customer invite)
    const workerUser = await prisma.user.findFirst({ where: { id: invite.customerId } });
    if (workerUser) {
      return Response.json({ valid: true, email: workerUser.email, name: workerUser.name, type: "worker" });
    }
    const customer = await prisma.customer.findFirst({ where: { id: invite.customerId } });
    return Response.json({ valid: true, email: customer?.email, name: customer?.name, type: "customer" });
  } catch (e) {
    return toResponse(e);
  }
}
