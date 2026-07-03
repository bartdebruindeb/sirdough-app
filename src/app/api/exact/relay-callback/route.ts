import { exchangeCodeForTokens, verifyState } from "@/server/lib/exact";
import { NextResponse } from "next/server";

/**
 * Exact only allows one registered redirect URI per app registration. This endpoint is
 * that single redirect_uri, reached via the apex domain (nginx routes only this one path
 * at the apex to whichever deployment hosts the relay — see DEPLOYMENT.md). It exchanges
 * the code for tokens, then hands them off to the correct bakery's own deployment over a
 * server-to-server call, so each bakery still only ever stores tokens in its own DB.
 *
 * Only meaningfully active on the relay-host deployment (TENANT_REGISTRY configured).
 * On every other deployment this 404s harmlessly if ever misrouted.
 */
export async function GET(req: Request) {
  const registryRaw = process.env.TENANT_REGISTRY;
  const domainSuffix = process.env.TENANT_DOMAIN_SUFFIX ?? ".sirdough.com";
  if (!registryRaw) return Response.json({ error: "NOT_A_RELAY_HOST" }, { status: 501 });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return Response.json({ error: "MISSING_PARAMS" }, { status: 400 });

  const verified = verifyState(state);
  if (!verified) return Response.json({ error: "INVALID_STATE" }, { status: 401 });

  let registry: Record<string, { receiveUrl: string; secret: string }>;
  try {
    registry = JSON.parse(registryRaw);
  } catch {
    return Response.json({ error: "BAD_TENANT_REGISTRY" }, { status: 500 });
  }
  const entry = registry[verified.tenant];
  const errorRedirect = NextResponse.redirect(`https://${verified.tenant}${domainSuffix}/facturatie?exact=error`);
  if (!entry) return errorRedirect;

  try {
    const tokens = await exchangeCodeForTokens(code);
    const res = await fetch(entry.receiveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-relay-secret": entry.secret },
      body: JSON.stringify(tokens),
    });
    if (!res.ok) return errorRedirect;
  } catch {
    return errorRedirect;
  }

  return NextResponse.redirect(`https://${verified.tenant}${domainSuffix}/facturatie?exact=ok`);
}
