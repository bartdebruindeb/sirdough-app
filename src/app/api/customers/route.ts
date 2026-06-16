import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getRoleFromRequest, requirePermission } from "@/server/middleware/authz";
import { prisma } from "@/server/config/db";
import { parseJson } from "@/server/lib/validation";
import { z } from "zod";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "customers:read");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const url = new URL(req.url);
    const sortBy = url.searchParams.get("sort") ?? "name"; // "name" | "city"

    const customers = await prisma.customer.findMany({
      where: { tenantId: tid },
      include: { user: { select: { id: true, email: true, active: true } } },
      orderBy: sortBy === "city"
        ? [{ city: "asc" }, { name: "asc" }]
        : [{ name: "asc" }],
    });

    return Response.json({ customers });
  } catch (e) {
    return toResponse(e);
  }
}

const CreateCustomerSchema = z.object({
  name: z.string().min(1),
  city: z.string().optional(),
  address: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  notes: z.string().optional(),
  preferredBread: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "customers:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, CreateCustomerSchema);
    const normalizedName = input.name.trim();
    const duplicate = await prisma.customer.findFirst({
      where: { tenantId: tid, name: { equals: normalizedName, mode: "insensitive" } },
    });
    if (duplicate) {
      return Response.json({ error: "CONFLICT", message: `Er bestaat al een klant met de naam "${duplicate.name}".` }, { status: 409 });
    }
    const customer = await prisma.customer.create({
      data: {
        tenantId: tid,
        name: normalizedName,
        city: input.city || null,
        address: input.address || null,
        email: input.email || null,
        phone: input.phone || null,
        notes: input.notes || null,
        preferredBread: input.preferredBread || null,
      },
    });
    return Response.json(customer, { status: 201 });
  } catch (e) {
    return toResponse(e);
  }
}

const UpdateCustomerSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  notes: z.string().optional(),
  preferredBread: z.string().optional(),
  active: z.boolean().optional(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
});

export async function PATCH(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "customers:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, UpdateCustomerSchema);
    const { id, ...data } = input;

    const customer = await prisma.customer.updateMany({
      where: { id, tenantId: tid },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.city !== undefined && { city: data.city || null }),
        ...(data.address !== undefined && { address: data.address || null }),
        ...(data.email !== undefined && { email: data.email || null }),
        ...(data.phone !== undefined && { phone: data.phone || null }),
        ...(data.notes !== undefined && { notes: data.notes || null }),
        ...(data.preferredBread !== undefined && { preferredBread: data.preferredBread || null }),
        ...(data.active !== undefined && { active: data.active }),
        ...(data.lat !== undefined && { lat: data.lat }),
        ...(data.lng !== undefined && { lng: data.lng }),
      },
    });
    return Response.json(customer);
  } catch (e) {
    return toResponse(e);
  }
}

// Create a login account for a customer using their email
const CreateAccountSchema = z.object({
  customerId: z.string(),
  password: z.string().min(8),
});

export async function PUT(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "customers:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, CreateAccountSchema);

    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, tenantId: tid },
    });
    if (!customer) return Response.json({ error: "NOT_FOUND", message: "Customer not found" }, { status: 404 });
    if (!customer.email) return Response.json({ error: "BAD_REQUEST", message: "Customer has no email address" }, { status: 400 });

    const passwordHash = await bcrypt.hash(input.password, 12);

    // Create or update user account
    let user = await prisma.user.findFirst({
      where: { tenantId: tid, email: customer.email },
    });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, active: true, role: "CUSTOMER" },
      });
    } else {
      user = await prisma.user.create({
        data: {
          tenantId: tid,
          email: customer.email,
          name: customer.name,
          role: "CUSTOMER",
          passwordHash,
          active: true,
        },
      });
    }

    // Link user to customer
    await prisma.customer.update({
      where: { id: customer.id },
      data: { userId: user.id },
    });

    return Response.json({ ok: true, email: customer.email });
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

    const force = url.searchParams.get("force") === "1";

    const hasOrders    = await prisma.oneOffOrder.count({ where: { customerId: id, tenantId: tid } });
    const hasRecurring = await prisma.recurringOrder.count({ where: { customerId: id, tenantId: tid } });

    // Without force flag, return info so the UI can show a warning
    if ((hasOrders > 0 || hasRecurring > 0) && !force) {
      return Response.json({ needsConfirm: true, hasOrders, hasRecurring });
    }

    // Hard delete — cascade related records first
    await prisma.deliveryStatus.deleteMany({ where: { customerId: id, tenantId: tid } });
    await prisma.deliveryNote.deleteMany({ where: { customerId: id, tenantId: tid } });
    await prisma.oneOffOrder.deleteMany({ where: { customerId: id, tenantId: tid } });
    await prisma.recurringOrder.deleteMany({ where: { customerId: id, tenantId: tid } });
    await prisma.customer.deleteMany({ where: { id, tenantId: tid } });
    return Response.json({ deleted: true });
  } catch (e) {
    return toResponse(e);
  }
}
