/**
 * Diagnostic: prints this tenant's real Exact VAT codes and G/L accounts, so
 * createExactInvoice can be updated to use values that actually exist in this
 * administration instead of guessed placeholders.
 *
 * Run on the deployment that's connected to Exact:
 *   npx tsx scripts/exact-list-codes.ts
 */
import { resolveTenantId } from "../src/server/config/tenant";
import { BASE, getAccessToken, getDivision } from "../src/server/lib/exact";

async function main() {
  const tid = await resolveTenantId({ tenantId: process.env.TENANT_SLUG ?? "dev-tenant" });

  const auth = await getAccessToken(tid);
  if (!auth) {
    console.error(`No Exact connection found for tenantId=${tid}. Connect via /facturatie first.`);
    process.exit(1);
  }
  const division = auth.division ?? (await getDivision(auth.token));
  console.log(`Division: ${division}\n`);

  const get = async (path: string) => {
    const res = await fetch(`${BASE}/api/v1/${division}${path}`, {
      headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      console.error(`GET ${path} failed: ${await res.text()}`);
      return [];
    }
    const data = await res.json();
    return data.d?.results ?? [];
  };

  console.log("── VAT codes ──────────────────────────────");
  const vatCodes = await get("/vat/VATCodes?$select=Code,Description,VATPercentage");
  for (const v of vatCodes) console.log(`${v.Code}\t${v.VATPercentage}%\t${v.Description}`);

  console.log("\n── G/L accounts (revenue-ish, first 30) ────");
  const glAccounts = await get("/financial/GLAccounts?$select=Code,Description,Type&$top=200");
  const revenueish = glAccounts.filter((g: any) => /omzet|verkoop|revenue|sales/i.test(g.Description ?? ""));
  for (const g of (revenueish.length ? revenueish : glAccounts).slice(0, 30)) {
    console.log(`${g.Code}\t${g.Description}\t(Type ${g.Type})`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
