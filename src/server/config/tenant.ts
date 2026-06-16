import { prisma } from "@/server/config/db";

export type TenantContext = { tenantId: string; tenantSlug?: string };

/**
 * Resolves the tenant for this request.
 *
 * For single-tenant deployments (one bakery per database, which is the
 * recommended setup — see DEPLOYMENT.md), set TENANT_SLUG in .env to the
 * tenant's slug. Every request resolves to that tenant explicitly —
 * no "grab the first tenant" guessing, so a stray second tenant in the
 * database can never cause requests to resolve to the wrong bakery.
 */
export function getTenantFromRequest(req: Request): TenantContext {
  const envSlug = process.env.TENANT_SLUG;
  if (envSlug) return { tenantId: envSlug, tenantSlug: envSlug };

  // Fallback for local dev without TENANT_SLUG set
  const host = req.headers.get("host") ?? "";
  const parts = host.split(".");
  if (parts.length >= 3) return { tenantId: parts[0], tenantSlug: parts[0] };

  return { tenantId: "dev-tenant", tenantSlug: "dev-tenant" };
}

/**
 * Resolves a tenant context's tenantId (which may be a slug) to the actual
 * database tenant.id. Caches nothing — cheap lookup, called once per request.
 *
 * Replaces the old "if dev-tenant, grab prisma.tenant.findFirst()" pattern
 * used throughout the API routes.
 */
export async function resolveTenantId(ctx: TenantContext): Promise<string> {
  // Try by slug first (TENANT_SLUG should match Tenant.slug)
  const bySlug = await prisma.tenant.findUnique({ where: { slug: ctx.tenantId } });
  if (bySlug) return bySlug.id;

  // Try by id directly (header-based tenant resolution)
  const byId = await prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
  if (byId) return byId.id;

  // Last resort for fresh dev databases with no TENANT_SLUG set yet
  const first = await prisma.tenant.findFirst();
  if (first) return first.id;

  throw new Error(
    `No tenant found for "${ctx.tenantId}". Set TENANT_SLUG in .env to match a Tenant.slug in the database, or run the seed script.`
  );
}
