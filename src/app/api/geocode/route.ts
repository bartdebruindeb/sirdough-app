import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { getRoleFromRequest, requirePermission } from "@/server/middleware/authz";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const role = await getRoleFromRequest(req);
    requirePermission(role, "recipes:write");
    await resolveTenantId({ tenantId, tenantSlug });

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q");
    if (!q) return Response.json({ error: "Missing q" }, { status: 400 });

    const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(q)}&rows=1&fl=id,weergavenaam,centroide_ll`;
    const res = await fetch(url);
    const data = await res.json();
    const doc = data?.response?.docs?.[0];
    if (!doc) return Response.json({ error: "Niet gevonden" }, { status: 404 });

    // centroide_ll is "POINT(lng lat)"
    const match = doc.centroide_ll?.match(/POINT\(([^ ]+) ([^ )]+)\)/);
    if (!match) return Response.json({ error: "Geen coördinaten" }, { status: 404 });

    return Response.json({
      address: doc.weergavenaam,
      lat: parseFloat(match[2]),
      lng: parseFloat(match[1]),
    });
  } catch (e) {
    return toResponse(e);
  }
}
