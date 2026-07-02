import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { exchangeCode } from "@/server/lib/exact";
import { resolveTenantId, getTenantFromRequest } from "@/server/config/tenant";
import { NextResponse } from "next/server";

function clearStateCookie(res: NextResponse) {
  res.cookies.set("exact_oauth_state", "", { maxAge: 0, path: "/" });
  return res;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "OWNER") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // CSRF check: state must match what /api/exact/connect stored in the cookie
  const cookieState = req.headers.get("cookie")?.match(/exact_oauth_state=([^;]+)/)?.[1];
  if (!code || !state || !cookieState || state !== cookieState) {
    return clearStateCookie(NextResponse.redirect(new URL("/facturatie?exact=error", req.url)));
  }

  const { tenantId, tenantSlug } = getTenantFromRequest(req);
  const tid = await resolveTenantId({ tenantId, tenantSlug });

  try {
    await exchangeCode(tid, code);
    return clearStateCookie(NextResponse.redirect(new URL("/facturatie?exact=ok", req.url)));
  } catch {
    return clearStateCookie(NextResponse.redirect(new URL("/facturatie?exact=error", req.url)));
  }
}
