import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { prisma } from "@/server/config/db";
import { AppError, toResponse } from "@/server/lib/errors";
import { parseJson } from "@/server/lib/validation";
import { geocodeAddress } from "@/server/lib/geocode";
import { getMijnContext } from "@/server/lib/mijnCustomer";
import { z } from "zod";

export const dynamic = "force-dynamic";

// A customer may add up to this many locations themselves (own KvK/address per location).
const MAX_LOCATIONS = 3;

// GET /api/mijn/locations — the restaurants this login can order for, plus the active one.
export async function GET() {
  try {
    const { customerId, customerIds } = await getMijnContext();
    const locations = await prisma.customer.findMany({
      where: { id: { in: customerIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, city: true },
    });
    return Response.json({ locations, selected: customerId, canAdd: customerIds.length < MAX_LOCATIONS });
  } catch (e) { return toResponse(e); }
}

const CreateLocationSchema = z.object({
  name:       z.string().min(1),
  address:    z.string().min(1),
  postalCode: z.string().min(1),
  city:       z.string().min(1),
  kvk:        z.string().optional(),
  phone:      z.string().optional(),
});

// POST /api/mijn/locations — a customer adds a new location under their own login.
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId   = (session?.user as any)?.id as string | undefined;
    const tenantId = (session?.user as any)?.tenantId as string | undefined;
    if (!userId || !tenantId) throw new AppError("Niet ingelogd", 401, "UNAUTHENTICATED");

    // Tenant + owner are taken from the session, never the client — a customer can only
    // create a location under their own login and tenant. Cap the count server-side.
    const count = await prisma.customer.count({ where: { userId } });
    if (count >= MAX_LOCATIONS) {
      return Response.json({ error: "LIMIT", message: `Je kunt maximaal ${MAX_LOCATIONS} locaties toevoegen.` }, { status: 400 });
    }

    const input = await parseJson(req, CreateLocationSchema);
    const coords = await geocodeAddress(input.address, input.postalCode, input.city).catch(() => null);

    const created = await prisma.customer.create({
      data: {
        tenantId,
        userId,
        name: input.name.trim(),
        address: input.address,
        postalCode: input.postalCode,
        city: input.city,
        kvk: input.kvk || null,
        phone: input.phone || null,
        discountPercent: 0, // owner-controlled — never set from the customer side
        active: true,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      },
      select: { id: true },
    });

    return Response.json({ ok: true, id: created.id }, { status: 201 });
  } catch (e) { return toResponse(e); }
}
