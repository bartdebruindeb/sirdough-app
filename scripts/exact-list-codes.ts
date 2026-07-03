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

  console.log("── VAT codes: /vat/VATCodes ──");
  const vatRes = await fetch(`${BASE}/api/v1/${division}/vat/VATCodes?$top=50`, {
    headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" },
  });
  console.log(`status: ${vatRes.status}`);
  console.log(await vatRes.text());

  console.log("\n── VAT codes: /read/financial/VATCodes (reference/system namespace) ──");
  const vatReadRes = await fetch(`${BASE}/api/v1/${division}/read/financial/VATCodes?$top=50`, {
    headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" },
  });
  console.log(`status: ${vatReadRes.status}`);
  console.log(await vatReadRes.text());

  console.log("\n── All 'Omzet' G/L accounts (any rate) ────");
  const glAccounts = await get("/financial/GLAccounts?$select=Code,Description,Type&$top=200");
  const revenueish = glAccounts.filter((g: any) => /omzet/i.test(g.Description ?? ""));
  for (const g of revenueish) console.log(`${g.Code}\t${g.Description}\t(Type ${g.Type})`);

  console.log("\n── Item groups ──");
  const itemGroups = await get("/logistics/ItemGroups?$select=ID,Code,Description&$top=50");
  for (const g of itemGroups) console.log(`${g.ID}\t${g.Code}\t${g.Description}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
