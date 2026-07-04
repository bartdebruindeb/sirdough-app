import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { prisma } from "@/server/config/db";
import { toResponse } from "@/server/lib/errors";
import { parseJson } from "@/server/lib/validation";
import { z } from "zod";

export const dynamic = "force-dynamic";

async function getCustomer(session: any) {
  const customerId = (session?.user as any)?.customerId as string | undefined;
  if (!customerId) throw new Error("UNAUTHORIZED");
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new Error("UNAUTHORIZED");
  return customer;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const customer = await getCustomer(session);
    return Response.json({
      name:       customer.name,
      email:      customer.email,
      phone:      customer.phone ?? "",
      address:    customer.address ?? "",
      postalCode: customer.postalCode ?? "",
      city:       customer.city ?? "",
      kvk:        (customer as any).kvk ?? "",
    });
  } catch (e) { return toResponse(e); }
}

const UpdateAccountSchema = z.object({
  name:       z.string().min(1).optional(),
  phone:      z.string().optional(),
  address:    z.string().optional(),
  postalCode: z.string().optional(),
  city:       z.string().optional(),
  kvk:        z.string().optional(),
});

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const customer = await getCustomer(session);
    const input = await parseJson(req, UpdateAccountSchema);
    await prisma.customer.update({ where: { id: customer.id }, data: input });
    return Response.json({ ok: true });
  } catch (e) { return toResponse(e); }
}
