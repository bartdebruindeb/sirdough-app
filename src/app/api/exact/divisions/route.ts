import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getAccessToken, getDivision, BASE } from "@/server/lib/exact";
import { prisma } from "@/server/config/db";

export const dynamic = "force-dynamic";

// GET /api/exact/divisions — diagnostic. Just reports which administration (division) this
// connection currently reads/writes. Listing *all* accessible divisions needs the
// organization.administration scope, which the app registration doesn't have — get the
// right division number from Exact Online's own UI instead (it's in the URL while
// browsing an administration, and under Instellingen → Mijn Exact Online → Abonnementen).
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
    return Response.json({ currentDivision });
  } catch (e) { return toResponse(e); }
}

// POST /api/exact/divisions { division: number } — switch which administration this
// connection reads/writes. Every future customer match, invoice creation, and GL/item
// lookup uses this division from then on.
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

    // Verify the identity can actually reach this division before switching — probe with
    // crm/Accounts (already in the app's scope, unlike system/Divisions), so a typo'd or
    // inaccessible number is refused instead of silently breaking every Exact call.
    const check = await fetch(
      `${BASE}/api/v1/${division}/crm/Accounts?$top=1&$select=ID`,
      { headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" } }
    );
    if (!check.ok) return Response.json({ error: "DIVISION_NOT_ACCESSIBLE", detail: await check.text() }, { status: 400 });

    await (prisma as any).exactToken.update({ where: { tenantId: tid }, data: { division } });
    return Response.json({ ok: true, division });
  } catch (e) { return toResponse(e); }
}
