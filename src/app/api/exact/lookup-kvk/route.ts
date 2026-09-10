import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getAccessToken, getDivision, BASE } from "@/server/lib/exact";
import { prisma } from "@/server/config/db";

export const dynamic = "force-dynamic";

// GET /api/exact/lookup-kvk?kvk=76045587 — diagnostic only. Queries Exact directly for one
// KvK number, with NO local filtering (not even the IsSupplier exclusion), to answer
// definitively: is this account visible to our connection at all, and if so why didn't it
// show up in the customer typeahead (IsSupplier flag, wrong division, ...)?
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== "OWNER") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const url = new URL(req.url);
    const kvk = (url.searchParams.get("kvk") ?? "").trim();
    if (!kvk) return Response.json({ error: "kvk query param required" }, { status: 400 });

    const auth = await getAccessToken(tid);
    if (!auth) return Response.json({ error: "NOT_CONNECTED" }, { status: 400 });
    let division = auth.division;
    if (!division) {
      division = await getDivision(auth.token);
      await (prisma as any).exactToken.update({ where: { tenantId: tid }, data: { division } });
    }

    // substringof, not eq — Exact often stores the KvK with the 12-digit establishment
    // number appended or with spaces, so an exact match silently misses.
    const q = `${BASE}/api/v1/${division}/crm/Accounts?$filter=${encodeURIComponent(`substringof('${kvk}', ChamberOfCommerce)`)}&$select=ID,Code,Name,IsSupplier,ChamberOfCommerce,Status`;
    const res = await fetch(q, { headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" } });
    if (!res.ok) return Response.json({ error: "EXACT_QUERY_FAILED", detail: await res.text() }, { status: 502 });
    const data = await res.json();

    return Response.json({ division, results: data.d?.results ?? [] });
  } catch (e) { return toResponse(e); }
}
