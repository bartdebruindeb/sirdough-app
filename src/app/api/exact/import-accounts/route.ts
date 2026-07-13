import { getServerSession } from "next-auth";
import { authOptions } from "@/server/config/auth";
import { prisma } from "@/server/config/db";
import { getTenantFromRequest, resolveTenantId } from "@/server/config/tenant";
import { toResponse } from "@/server/lib/errors";
import { listExactAccounts } from "@/server/lib/exact";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Normalize a name for matching: lowercase, collapse whitespace, trim. Deliberately loose
// enough to match "Café De Hoek " to "café de hoek", but not so loose it merges distinct
// names — anything ambiguous (2+ Exact accounts with the same name) is flagged, not guessed.
function normName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// GET /api/exact/import-accounts — preview: match Sirdough customers to Exact accounts by
// name and report what WOULD be linked. Writes nothing.
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== "OWNER") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const accounts = await listExactAccounts(tid);
    const byName = new Map<string, typeof accounts>();
    for (const a of accounts) {
      const k = normName(a.name);
      if (!k) continue;
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k)!.push(a);
    }

    const customers = await prisma.customer.findMany({
      where: { tenantId: tid },
      select: { id: true, name: true, kvk: true, exactAccountId: true },
      orderBy: { name: "asc" },
    });

    const matches: {
      customerId: string; customerName: string; currentKvk: string | null; alreadyLinked: boolean;
      exactAccountId: string; exactCustomerCode: string | null; exactName: string; exactKvk: string | null;
    }[] = [];
    const ambiguous: { customerName: string; count: number }[] = [];
    const unmatched: string[] = [];

    for (const c of customers) {
      const hits = byName.get(normName(c.name)) ?? [];
      if (hits.length === 1) {
        const a = hits[0];
        matches.push({
          customerId: c.id, customerName: c.name, currentKvk: c.kvk, alreadyLinked: !!c.exactAccountId,
          exactAccountId: a.id, exactCustomerCode: a.code, exactName: a.name, exactKvk: a.kvk,
        });
      } else if (hits.length > 1) {
        ambiguous.push({ customerName: c.name, count: hits.length });
      } else {
        unmatched.push(c.name);
      }
    }

    return Response.json({ matches, ambiguous, unmatched, exactAccountCount: accounts.length });
  } catch (e) { return toResponse(e); }
}

const ApplySchema = z.object({
  links: z.array(z.object({
    customerId: z.string(),
    exactAccountId: z.string(),
    exactCustomerCode: z.string().nullable().optional(),
    kvk: z.string().nullable().optional(),
  })),
});

// POST /api/exact/import-accounts — apply the confirmed links: set the Exact account GUID
// on each customer, and fill KvK only where it's still empty (never overwrite the owner's).
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== "OWNER") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const { tenantId, tenantSlug } = getTenantFromRequest(req);
    const tid = await resolveTenantId({ tenantId, tenantSlug });

    const { links } = ApplySchema.parse(await req.json());
    let updated = 0;
    for (const l of links) {
      const c = await prisma.customer.findFirst({ where: { id: l.customerId, tenantId: tid }, select: { id: true, kvk: true } });
      if (!c) continue;
      await prisma.customer.update({
        where: { id: c.id },
        data: {
          exactAccountId: l.exactAccountId,
          exactCustomerCode: l.exactCustomerCode ?? null,
          ...(!c.kvk && l.kvk ? { kvk: l.kvk } : {}),
        },
      });
      updated++;
    }
    return Response.json({ ok: true, updated });
  } catch (e) { return toResponse(e); }
}
