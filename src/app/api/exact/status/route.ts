import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { exactConnected } from "@/server/lib/exact";
import { resolveTenantId, getTenantFromRequest } from "@/server/config/tenant";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "OWNER") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { tenantId, tenantSlug } = getTenantFromRequest(req);
  const tid = await resolveTenantId({ tenantId, tenantSlug });
  const connected = await exactConnected(tid);
  return Response.json({ connected });
}
