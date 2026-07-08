import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getRoleFromRequest, requirePermission } from "@/server/middleware/authz";
import { getShops } from "@/server/lib/shops";
import { geocodeAddress } from "@/server/lib/geocode";
import { prisma } from "@/server/config/db";
import { parseJson } from "@/server/lib/validation";
import { z } from "zod";

export const dynamic = "force-dynamic";

// GET /api/shops — every shop/pickup location for this tenant, owner-manageable on Winkel.
export async function GET(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "production:read");
    const tid = await resolveTenantId({ tenantId, tenantSlug });
    const shops = await getShops(tid);
    return Response.json({ shops });
  } catch (e) { return toResponse(e); }
}

const CreateShopSchema = z.object({
  name:       z.string().min(1),
  address:    z.string().min(1),
  postalCode: z.string().min(1),
  city:       z.string().min(1),
  kvk:        z.string().optional(),
  phone:      z.string().optional(),
  email:      z.string().email().optional().or(z.literal("")),
});

// POST /api/shops — add a new shop, immediately usable everywhere shops are listed
// (customer pickup selector, Bezorgen, Winkel production, invoicing eligibility) since
// they all read the same isShop-flagged Customer rows.
export async function POST(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "customers:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, CreateShopSchema);

    const duplicate = await prisma.customer.findFirst({
      where: { tenantId: tid, name: { equals: input.name.trim(), mode: "insensitive" } },
    });
    if (duplicate) {
      return Response.json({ message: `Er bestaat al een klant/winkel met de naam "${duplicate.name}".` }, { status: 409 });
    }

    const coords = await geocodeAddress(input.address, input.postalCode, input.city).catch(() => null);

    const shop = await prisma.customer.create({
      data: {
        tenantId: tid, name: input.name.trim(), address: input.address,
        postalCode: input.postalCode, city: input.city,
        kvk: input.kvk || null, phone: input.phone || null, email: input.email || null,
        isShop: true, active: true, discountPercent: 0,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      } as any,
    });

    return Response.json({ ok: true, id: shop.id }, { status: 201 });
  } catch (e) { return toResponse(e); }
}

const UpdateShopSchema = z.object({
  id:         z.string(),
  name:       z.string().min(1).optional(),
  address:    z.string().min(1).optional(),
  postalCode: z.string().min(1).optional(),
  city:       z.string().min(1).optional(),
  kvk:        z.string().optional(),
  phone:      z.string().optional(),
  email:      z.string().email().optional().or(z.literal("")),
});

// PATCH /api/shops — edit an existing shop's own address/KvK/contact.
export async function PATCH(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "customers:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const input = await parseJson(req, UpdateShopSchema);

    // Must be a real shop belonging to this tenant — never a general customer rename.
    const existing = await (prisma as any).customer.findFirst({ where: { id: input.id, tenantId: tid, isShop: true } });
    if (!existing) return Response.json({ message: "Winkel niet gevonden." }, { status: 404 });

    if (input.name !== undefined && input.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
      // WinkelTemplate/WinkelLog and Bezorgen's pickup matching are keyed by shop NAME
      // (a string, not this row's id) — a duplicate name would make two shops
      // indistinguishable there, so block it same as creating a new shop would.
      const duplicate = await prisma.customer.findFirst({
        where: { tenantId: tid, name: { equals: input.name.trim(), mode: "insensitive" }, NOT: { id: input.id } },
      });
      if (duplicate) return Response.json({ message: `Er bestaat al een klant/winkel met de naam "${duplicate.name}".` }, { status: 409 });
    }

    const addressChanged = input.address !== undefined && input.postalCode !== undefined && input.city !== undefined;
    const coords = addressChanged
      ? await geocodeAddress(input.address!, input.postalCode!, input.city!).catch(() => null)
      : null;

    const newName = input.name?.trim();
    const renaming = newName !== undefined && newName !== existing.name;

    // A rename must carry over WinkelTemplate/WinkelLog history, which is keyed by the
    // shop's NAME (not this row's id) — otherwise renaming "silently" detaches a shop
    // from its own production templates and logged history.
    await prisma.$transaction([
      prisma.customer.update({
        where: { id: input.id },
        data: {
          ...(newName !== undefined && { name: newName }),
          ...(input.address !== undefined && { address: input.address }),
          ...(input.postalCode !== undefined && { postalCode: input.postalCode }),
          ...(input.city !== undefined && { city: input.city }),
          ...(input.kvk !== undefined && { kvk: input.kvk || null }),
          ...(input.phone !== undefined && { phone: input.phone || null }),
          ...(input.email !== undefined && { email: input.email || null }),
          ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        },
      }),
      ...(renaming ? [
        prisma.winkelTemplate.updateMany({ where: { tenantId: tid, shopName: existing.name }, data: { shopName: newName! } }),
        prisma.winkelLog.updateMany({ where: { tenantId: tid, shopName: existing.name }, data: { shopName: newName! } }),
      ] : []),
    ]);

    return Response.json({ ok: true });
  } catch (e) { return toResponse(e); }
}

// DELETE /api/shops?id= — remove a shop. Confirmed client-side first (the Winkel page
// shows a browser confirm() before calling this). Any linked orders/invoices/winkel
// history blocks the delete via the FK constraint, surfaced as a clear message instead
// of a raw 500 — deleting a shop with real history should be a deliberate, separate
// cleanup, not an accidental one-click loss of that data.
export async function DELETE(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "customers:write");
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ message: "id is verplicht." }, { status: 400 });

    const shop = await (prisma as any).customer.findFirst({ where: { id, tenantId: tid, isShop: true } });
    if (!shop) return Response.json({ message: "Winkel niet gevonden." }, { status: 404 });

    try {
      await prisma.customer.delete({ where: { id } });
    } catch {
      return Response.json({
        message: "Deze winkel heeft nog bestellingen, facturen of geschiedenis en kan niet zomaar verwijderd worden.",
      }, { status: 409 });
    }

    return Response.json({ ok: true });
  } catch (e) { return toResponse(e); }
}
