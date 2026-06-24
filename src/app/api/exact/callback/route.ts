import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { exchangeCode } from "@/server/lib/exact";
import { resolveTenantId, getTenantFromRequest } from "@/server/config/tenant";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "OWNER") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/facturatie?exact=error", req.url));

  const { tenantId, tenantSlug } = getTenantFromRequest(req);
  const tid = await resolveTenantId({ tenantId, tenantSlug });

  await exchangeCode(tid, code);
  return NextResponse.redirect(new URL("/facturatie?exact=ok", req.url));
}
