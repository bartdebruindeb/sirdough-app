import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { listExactAccounts } from "@/server/lib/exact";

export const dynamic = "force-dynamic";

// GET /api/exact/accounts — every Exact CRM account (customers only, suppliers filtered
// out — see listExactAccounts), for the KvK/name typeahead on the Klanten customer form.
// Returns [] if Exact isn't connected, so the form just shows no suggestions rather than
// erroring.
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== "OWNER") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const tid = await resolveTenantId({ tenantId, tenantSlug });
    const accounts = await listExactAccounts(tid);
    return Response.json({ accounts: accounts.sort((a, b) => a.name.localeCompare(b.name)) });
  } catch (e) { return toResponse(e); }
}
