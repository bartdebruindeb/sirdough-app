import { resolveTenantId } from "@/server/config/tenant";
import { storeTokens } from "@/server/lib/exact";

/**
 * Internal endpoint: receives Exact OAuth tokens handed off by the relay host after it
 * completes the code exchange (see /api/exact/relay-callback). Authenticated with a
 * shared-secret header, same pattern as CRON_SECRET/x-cron-secret in the daily cron route.
 * RELAY_SHARED_SECRET is unique per bakery — must match this tenant's entry in the
 * relay host's TENANT_REGISTRY.
 */
export async function POST(req: Request) {
  const secret = process.env.RELAY_SHARED_SECRET;
  if (!secret || req.headers.get("x-relay-secret") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tid = await resolveTenantId({ tenantId: process.env.TENANT_SLUG ?? "dev-tenant" });
  const data = await req.json();
  await storeTokens(tid, data);
  return new Response(null, { status: 204 });
}
