import { prisma } from "@/server/config/db";
import { toResponse } from "@/server/lib/errors";
import { parseJson } from "@/server/lib/validation";
import { geocodeAddress } from "@/server/lib/geocode";
import { getMijnContext } from "@/server/lib/mijnCustomer";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Resolves which location this request manages addresses for. Defaults to the active
// location, but the account page needs to manage a NON-active location's addresses too
// (e.g. editing "Restaurant B" while "Restaurant A" is the active order-taking location)
// — so an explicit ?customerId= is honoured, but ONLY when it's in this login's own set.
// Same IDOR boundary as getMijnContext, just parameterized instead of cookie-only.
async function getCustomerId(req?: Request): Promise<string> {
  const { customerId, customerIds } = await getMijnContext();
  const requested = req ? new URL(req.url).searchParams.get("customerId") : null;
  if (requested && customerIds.includes(requested)) return requested;
  return customerId;
}

const AddressSchema = z.object({
  label:      z.string().min(1).default("Locatie"),
  street:     z.string().min(1),
  postalCode: z.string().min(1),
  city:       z.string().min(1),
  isDefault:  z.boolean().default(false),
});

async function syncDefaultAddressToCustomer(customerId: string, addr: { street: string; postalCode: string; city: string }) {
  // Geocode in the background so the route map / distance sorting stays accurate
  // without the owner having to manually click "Locatie" in Klanten afterwards.
  const coords = await geocodeAddress(addr.street, addr.postalCode, addr.city);
  await prisma.customer.update({
    where: { id: customerId },
    data: {
      address: addr.street, postalCode: addr.postalCode, city: addr.city,
      ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
    },
  });
}

// GET /api/mijn/adressen[?customerId=] — delivery addresses for a location (multiple
// addresses can share one Customer/KvK — e.g. several branches invoiced together).
export async function GET(req: Request) {
  try {
    const customerId = await getCustomerId(req);
    const addresses = await (prisma as any).customerAddress.findMany({
      where: { customerId },
      orderBy: [{ isDefault: "desc" }, { id: "asc" }],
    });
    return Response.json({ addresses });
  } catch (e) { return toResponse(e); }
}

export async function POST(req: Request) {
  try {
    const customerId = await getCustomerId(req);
    const input = await parseJson(req, AddressSchema);

    if (input.isDefault) {
      await (prisma as any).customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
    }
    const addr = await (prisma as any).customerAddress.create({ data: { customerId, ...input } });
    if (input.isDefault) await syncDefaultAddressToCustomer(customerId, input);
    return Response.json(addr, { status: 201 });
  } catch (e) { return toResponse(e); }
}

export async function PATCH(req: Request) {
  try {
    const customerId = await getCustomerId(req);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "id required" }, { status: 400 });

    const input = await parseJson(req, AddressSchema.partial());
    if (input.isDefault) {
      await (prisma as any).customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
    }
    await (prisma as any).customerAddress.updateMany({ where: { id, customerId }, data: input });

    // Sync to Customer record if this address is (or became) the default
    const updated = await (prisma as any).customerAddress.findFirst({ where: { id, customerId } });
    if (updated?.isDefault) await syncDefaultAddressToCustomer(customerId, updated);

    return Response.json(updated);
  } catch (e) { return toResponse(e); }
}

export async function DELETE(req: Request) {
  try {
    const customerId = await getCustomerId(req);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    await (prisma as any).customerAddress.deleteMany({ where: { id, customerId } });
    return new Response(null, { status: 204 });
  } catch (e) { return toResponse(e); }
}
