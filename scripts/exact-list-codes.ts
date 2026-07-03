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

  console.log("── VAT codes (raw, no $select — field names unknown) ──");
  const vatCodes = await get("/vat/VATCodes?$top=50");
  for (const v of vatCodes) console.log(JSON.stringify(v));

  console.log("\n── All 'Omzet' G/L accounts (any rate) ────");
  const glAccounts = await get("/financial/GLAccounts?$select=Code,Description,Type&$top=200");
  const revenueish = glAccounts.filter((g: any) => /omzet/i.test(g.Description ?? ""));
  for (const g of revenueish) console.log(`${g.Code}\t${g.Description}\t(Type ${g.Type})`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
