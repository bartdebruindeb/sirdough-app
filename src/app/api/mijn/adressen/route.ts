import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { prisma } from "@/server/config/db";
import { toResponse } from "@/server/lib/errors";
import { parseJson } from "@/server/lib/validation";
import { z } from "zod";

export const dynamic = "force-dynamic";

async function getCustomerId(session: any): Promise<string> {
  const id = session?.user?.customerId as string | undefined;
  if (!id) throw new Error("UNAUTHORIZED");
  return id;
}

const AddressSchema = z.object({
  label:      z.string().min(1).default("Locatie"),
  street:     z.string().min(1),
  postalCode: z.string().min(1),
  city:       z.string().min(1),
  isDefault:  z.boolean().default(false),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const customerId = await getCustomerId(session);
    const input = await parseJson(req, AddressSchema);

    if (input.isDefault) {
      await (prisma as any).customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
    }
    const addr = await (prisma as any).customerAddress.create({ data: { customerId, ...input } });
    return Response.json(addr, { status: 201 });
  } catch (e) { return toResponse(e); }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const customerId = await getCustomerId(session);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "id required" }, { status: 400 });

    const input = await parseJson(req, AddressSchema.partial());
    if (input.isDefault) {
      await (prisma as any).customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
    }
    const addr = await (prisma as any).customerAddress.updateMany({ where: { id, customerId }, data: input });
    return Response.json(addr);
  } catch (e) { return toResponse(e); }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const customerId = await getCustomerId(session);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    await (prisma as any).customerAddress.deleteMany({ where: { id, customerId } });
    return new Response(null, { status: 204 });
  } catch (e) { return toResponse(e); }
}
