import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getAccessToken, getDivision, BASE } from "@/server/lib/exact";
import { prisma } from "@/server/config/db";

export const dynamic = "force-dynamic";

// GET /api/exact/divisions — lists every administration (division) this connected identity
// can access, plus which one is currently in use. Listing needs the
// organization.administration read scope; if the app registration doesn't have it yet,
// this says so with the fix instead of a raw error. Add that scope in the Exact App
// Centre, then Ontkoppel + Koppel Exact again to re-consent.
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

    const res = await fetch(
      `${BASE}/api/v1/${currentDivision}/system/Divisions?$select=Code,Description,Country,Currency`,
      { headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" } }
    );
    if (!res.ok) {
      const detail = await res.text();
      const scopeIssue = detail.includes("organization.administration");
      return Response.json({
        currentDivision,
        error: scopeIssue ? "MISSING_SCOPE" : "EXACT_QUERY_FAILED",
        hint: scopeIssue
          ? "Voeg in de Exact App Centre de scope 'organization → administration (Lezen)' toe, klik dan op Facturatie op Ontkoppel en opnieuw Koppel Exact om opnieuw toestemming te geven."
          : undefined,
        detail,
      }, { status: scopeIssue ? 400 : 502 });
    }
    const data = await res.json();
    return Response.json({ currentDivision, divisions: data.d?.results ?? [] });
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
