import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { exactAuthUrl, signState } from "@/server/lib/exact";
import { getTenantFromRequest } from "@/server/config/tenant";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "OWNER") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // The OAuth redirect_uri is a single, shared relay endpoint (Exact only allows one
  // per app registration), so CSRF state must be self-verifying rather than a cookie —
  // the callback lands on a different domain than the one that started the flow.
  const { tenantSlug } = getTenantFromRequest(req);
  const state = signState(tenantSlug ?? "dev-tenant");
  return NextResponse.redirect(exactAuthUrl(state));
}
