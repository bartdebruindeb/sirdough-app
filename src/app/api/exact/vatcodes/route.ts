import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getAccessToken, getDivision, BASE } from "@/server/lib/exact";
import { prisma } from "@/server/config/db";

export const dynamic = "force-dynamic";

// GET /api/exact/vatcodes — lists every BTW code in the connected Exact administration
// (Code, Description, Percentage), so the 9%/laag-tarief code (bakeryConfig.exactVatCodeLow)
// can be read off directly instead of asking the owner to look it up in Exact's UI.
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== "OWNER") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const auth = await getAccessToken(tid);
    if (!auth) return Response.json({ error: "NOT_CONNECTED" }, { status: 400 });
    let division = auth.division;
    if (!division) {
      division = await getDivision(auth.token);
      await (prisma as any).exactToken.update({ where: { tenantId: tid }, data: { division } });
    }

    const res = await fetch(
      `${BASE}/api/v1/${division}/vat/VATCodes?$select=Code,Description,Percentage,Type`,
      { headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" } }
    );
    if (!res.ok) {
      const detail = await res.text();
      const scopeMatch = detail.match(/'([\w.]+)' scope/);
      return Response.json({
        error: scopeMatch ? "MISSING_SCOPE" : "EXACT_QUERY_FAILED",
        hint: scopeMatch ? `Voeg in de Exact App Centre de scope '${scopeMatch[1]}' toe, ontkoppel en koppel Exact opnieuw.` : undefined,
        detail,
      }, { status: scopeMatch ? 400 : 502 });
    }
    const data = await res.json();
    return Response.json({ division, vatCodes: data.d?.results ?? [] });
  } catch (e) { return toResponse(e); }
}
