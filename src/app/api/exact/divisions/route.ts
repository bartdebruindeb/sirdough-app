import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getAccessToken, getDivision, BASE } from "@/server/lib/exact";
import { prisma } from "@/server/config/db";

export const dynamic = "force-dynamic";

// GET /api/exact/divisions — diagnostic. Lists every administration (division) this
// connected Exact identity has access to, and which one we're currently reading/writing
// (exactToken.division). Use this to find the administration that actually holds the
// bakery's real clients when the cached division looks wrong (see lookup-kvk finding
// nothing for a KvK the owner insists exists).
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== "OWNER") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const auth = await getAccessToken(tid);
    if (!auth) return Response.json({ error: "NOT_CONNECTED" }, { status: 400 });
    let currentDivision = auth.division;
    if (!currentDivision) {
      currentDivision = await getDivision(auth.token);
      await (prisma as any).exactToken.update({ where: { tenantId: tid }, data: { division: currentDivision } });
    }

    // system/Divisions needs a valid division in the URL path to call at all, but returns
    // every division the identity can access, not just that one.
    const res = await fetch(
      `${BASE}/api/v1/${currentDivision}/system/Divisions?$select=Code,Description,Country,Currency`,
      { headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" } }
    );
    if (!res.ok) return Response.json({ error: "EXACT_QUERY_FAILED", detail: await res.text() }, { status: 502 });
    const data = await res.json();

    return Response.json({ currentDivision, divisions: data.d?.results ?? [] });
  } catch (e) { return toResponse(e); }
}

// POST /api/exact/divisions { division: number } — switch which administration this
// connection reads/writes, once the correct one is identified from the GET list above.
// Every future customer match, invoice creation, and GL/item lookup uses this division
// from then on.
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== "OWNER") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const { division } = await req.json();
    if (typeof division !== "number") return Response.json({ error: "division (number) required" }, { status: 400 });

    const auth = await getAccessToken(tid);
    if (!auth) return Response.json({ error: "NOT_CONNECTED" }, { status: 400 });

    // Confirm the identity actually has access to this division before switching —
    // refuses a typo'd or inaccessible number instead of silently breaking the connection.
    const check = await fetch(
      `${BASE}/api/v1/${division}/system/Divisions?$select=Code&$filter=${encodeURIComponent(`Code eq ${division}`)}`,
      { headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" } }
    );
    if (!check.ok) return Response.json({ error: "DIVISION_NOT_ACCESSIBLE", detail: await check.text() }, { status: 400 });

    await (prisma as any).exactToken.update({ where: { tenantId: tid }, data: { division } });
    return Response.json({ ok: true, division });
  } catch (e) { return toResponse(e); }
}
