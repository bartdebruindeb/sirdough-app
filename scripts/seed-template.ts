// ─────────────────────────────────────────────────────────────────────────────
// SEED TEMPLATE — for a new bakery deployment (shop-only, no horeca/delivery)
//
// HOW TO USE:
// 1. Copy this file to scripts/seed-<bakeryname>.ts
// 2. Fill in BAKERY, SHOP, BREAD_TYPES, DOUGH_TYPES, WINKEL_TEMPLATE below
// 3. Add a script to package.json:  "seed:<bakeryname>": "ts-node scripts/seed-<bakeryname>.ts"
// 4. Set TENANT_SLUG in .env to match BAKERY.slug below
// 5. Run: npm run seed:<bakeryname>
//
// This template assumes ONE shop, no recurring horeca customers, and no
// delivery routes. If the bakery later gets horeca customers, use the Klanten
// page in the app to add them — no need to touch this seed again.
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient, Role } from "@prisma/client";
const prisma = new PrismaClient();

// ── 1. BAKERY ──────────────────────────────────────────────────────────────────
const BAKERY = {
  name: "Nieuwe Bakkerij",       // Display name
  slug: "nieuwe-bakkerij",       // Must be unique, used as TENANT_SLUG
  ownerEmail: "owner@nieuwebakkerij.nl",
  workerEmail: "bakker@nieuwebakkerij.nl",
};

// ── 2. SHOP ────────────────────────────────────────────────────────────────────
// One shop = one Customer record + one set of winkel templates.
// For multiple shops, duplicate the SHOP block and the WINKEL_TEMPLATE section.
const SHOP = {
  name: "Winkel",                // Appears in Winkel page, facturatie, logboek
  city: "Stad",
  address: "Straatnaam 1, 1234 AB Stad",
};

// ── 3. DOUGH TYPES ────────────────────────────────────────────────────────────
// Shared base recipes. Add or remove as needed for this bakery's range.
// percentages are baker's percentages (flour = 100%).
const DOUGH_TYPES = [
  { slug: "boeren", name: "Boerenmix", waterPct: 71.5, desemPct: 15, zoutPct: 2, inwasPct: 6,
    flours: [
      { name: "Tarwebloem", percentage: 80 },
      { name: "Volkoren tarwe", percentage: 20 },
    ] },
  { slug: "baguette", name: "Baguettedeeg", waterPct: 62, desemPct: 15, zoutPct: 2, inwasPct: 4,
    flours: [
      { name: "Tarwebloem", percentage: 55 },
      { name: "T65", percentage: 45 },
    ] },
];

// ── 4. BREAD TYPES ────────────────────────────────────────────────────────────
// doughTypeSlug links to DOUGH_TYPES above (omit for breads with their own recipe).
// weightGrams = dough weight per loaf INCLUDING the 1% residue factor
// (e.g. a 750g loaf → 758g).
const BREAD_TYPES = [
  { slug: "boeren-kl", name: "Boeren KL",  category: "boeren",   weightGrams: 758,  sortOrder: 1, customerOrderable: true,  doughTypeSlug: "boeren" },
  { slug: "boeren-gr", name: "Boeren GR",  category: "boeren",   weightGrams: 1010, sortOrder: 2, customerOrderable: true,  doughTypeSlug: "boeren" },
  { slug: "baguette",  name: "Baguette",   category: "baguette", weightGrams: 505,  sortOrder: 3, customerOrderable: true,  doughTypeSlug: "baguette" },
  // Add more bread types here...
];

// ── 5. WINKEL TEMPLATE ────────────────────────────────────────────────────────
// Default daily production quantities per weekday (1=Mon ... 7=Sun).
// Only include weekdays/breads the shop actually opens for.
// These are starting defaults — adjust anytime from the Winkel page.
const WINKEL_TEMPLATE: Record<number, Record<string, number>> = {
  1: { "boeren-kl": 10, "boeren-gr": 15, "baguette": 20 }, // Monday
  2: { "boeren-kl": 10, "boeren-gr": 15, "baguette": 20 }, // Tuesday
  3: { "boeren-kl": 10, "boeren-gr": 15, "baguette": 20 }, // Wednesday
  4: { "boeren-kl": 10, "boeren-gr": 15, "baguette": 20 }, // Thursday
  5: { "boeren-kl": 12, "boeren-gr": 18, "baguette": 25 }, // Friday
  6: { "boeren-kl": 15, "boeren-gr": 20, "baguette": 30 }, // Saturday
  // 7: Sunday — leave out if closed
};

// ─────────────────────────────────────────────────────────────────────────────
// SEED LOGIC — usually no need to edit below this line
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🍞 Seeding ${BAKERY.name}...`);

  // Tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: BAKERY.slug },
    update: {},
    create: { name: BAKERY.name, slug: BAKERY.slug, plan: "starter" },
  });
  const tid = tenant.id;

  // Users
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tid, email: BAKERY.ownerEmail } },
    update: {},
    create: { tenantId: tid, email: BAKERY.ownerEmail, name: "Eigenaar", role: Role.OWNER },
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tid, email: BAKERY.workerEmail } },
    update: {},
    create: { tenantId: tid, email: BAKERY.workerEmail, name: "Bakker", role: Role.BAKKER },
  });

  // Shop as a Customer (so it can receive winkel templates + appear in facturatie/logboek)
  const shopCustomer = await prisma.customer.upsert({
    where: { id: `${BAKERY.slug}-shop` },
    update: { name: SHOP.name, city: SHOP.city, address: SHOP.address },
    create: {
      id: `${BAKERY.slug}-shop`,
      tenantId: tid,
      name: SHOP.name,
      city: SHOP.city,
      address: SHOP.address,
      active: true,
    },
  });

  // Dough types
  const doughTypeIds: Record<string, string> = {};
  for (const d of DOUGH_TYPES) {
    const dt = await prisma.doughType.upsert({
      where: { tenantId_slug: { tenantId: tid, slug: d.slug } },
      update: { waterPct: d.waterPct, desemPct: d.desemPct, zoutPct: d.zoutPct, inwasPct: d.inwasPct },
      create: { tenantId: tid, slug: d.slug, name: d.name, waterPct: d.waterPct, desemPct: d.desemPct, zoutPct: d.zoutPct, inwasPct: d.inwasPct },
    });
    await prisma.doughFlour.deleteMany({ where: { doughTypeId: dt.id } });
    await prisma.doughFlour.createMany({
      data: d.flours.map((f, i) => ({ doughTypeId: dt.id, name: f.name, percentage: f.percentage, sortOrder: i })),
    });
    doughTypeIds[d.slug] = dt.id;
  }

  // Bread types
  const breadTypeIds: Record<string, string> = {};
  for (const b of BREAD_TYPES) {
    const doughTypeId = b.doughTypeSlug ? doughTypeIds[b.doughTypeSlug] : undefined;
    const bt = await prisma.breadType.upsert({
      where: { tenantId_slug: { tenantId: tid, slug: b.slug } },
      update: { name: b.name, sortOrder: b.sortOrder, doughTypeId, doughWeightPerLoaf: b.weightGrams },
      create: {
        tenantId: tid, name: b.name, slug: b.slug, category: b.category,
        weightGrams: b.weightGrams, sortOrder: b.sortOrder,
        customerOrderable: b.customerOrderable, doughTypeId,
        doughWeightPerLoaf: b.weightGrams,
      },
    });
    breadTypeIds[b.slug] = bt.id;
  }

  // Winkel template
  for (const [weekdayStr, qtys] of Object.entries(WINKEL_TEMPLATE)) {
    const weekday = parseInt(weekdayStr);
    for (const [slug, qty] of Object.entries(qtys)) {
      const breadTypeId = breadTypeIds[slug];
      if (!breadTypeId) {
        console.warn(`  ⚠ Unknown bread slug "${slug}" in WINKEL_TEMPLATE — skipping`);
        continue;
      }
      await prisma.winkelTemplate.upsert({
        where: { tenantId_shopName_breadTypeId_weekday: { tenantId: tid, shopName: SHOP.name, breadTypeId, weekday } },
        update: { quantity: qty },
        create: { tenantId: tid, shopName: SHOP.name, breadTypeId, weekday, quantity: qty },
      });
    }
  }

  console.log(`✅ Done. Tenant slug: "${BAKERY.slug}" — set TENANT_SLUG="${BAKERY.slug}" in .env`);
  console.log(`   ${BREAD_TYPES.length} bread types, ${DOUGH_TYPES.length} dough types, 1 shop ("${SHOP.name}")`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
