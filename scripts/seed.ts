import { PrismaClient, Role } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("🍞 Seeding Digital Bakery...");

  // ── Tenant ──────────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: "meneer-leffers" },
    update: {},
    create: { name: "Meneer Leffers", slug: "meneer-leffers", plan: "starter" },
  });
  const tid = tenant.id;

  // ── Users ────────────────────────────────────────────────────────────────────
  const owner = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tid, email: "owner@meneerleffers.nl" } },
    update: {},
    create: { tenantId: tid, email: "owner@meneerleffers.nl", name: "Eigenaar", role: Role.OWNER },
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tid, email: "worker@meneerleffers.nl" } },
    update: {},
    create: { tenantId: tid, email: "worker@meneerleffers.nl", name: "Bakker", role: Role.BAKKER },
  });

  // ── Bread types ───────────────────────────────────────────────────────────────
  const breadData = [
    { slug: "boeren-kl",      name: "Boeren KL",       category: "boeren",   weightGrams: 750,  sortOrder: 1 },
    { slug: "boeren-gr",      name: "Boeren GR",        category: "boeren",   weightGrams: 1000, sortOrder: 2 },
    { slug: "boeren-15kg",    name: "Boeren 1,5 KG",    category: "boeren",   weightGrams: 1500, sortOrder: 3 },
    { slug: "sesam",          name: "Sesam",             category: "boeren",   weightGrams: 1000, sortOrder: 4 },
    { slug: "sesam-15kg",     name: "Sesam 1,5 KG",     category: "boeren",   weightGrams: 1500, sortOrder: 5 },
    { slug: "zaden",          name: "Zaden",             category: "boeren",   weightGrams: 1000, sortOrder: 6 },
    { slug: "zaden-15kg",     name: "Zaden 1,5 KG",     category: "boeren",   weightGrams: 1500, sortOrder: 7 },
    { slug: "olijf",          name: "Olijf",             category: "boeren",   weightGrams: 1000, sortOrder: 8 },
    { slug: "rozijn",         name: "Rozijn",            category: "boeren",   weightGrams: 1000, sortOrder: 9 },
    { slug: "morning-buns",   name: "Morning buns",      category: "buns",     weightGrams: 100,  sortOrder: 10 },
    { slug: "kaneel-buns",    name: "Kaneel buns",       category: "buns",     weightGrams: 100,  sortOrder: 11 },
    { slug: "kardemom-buns",  name: "Kardemom buns",     category: "buns",     weightGrams: 100,  sortOrder: 12 },
    { slug: "baguette",       name: "Baguette",          category: "baguette", weightGrams: 500,  sortOrder: 13 },
    { slug: "baguette-kaas",  name: "Baguette Kaas/Peper", category: "baguette", weightGrams: 500, sortOrder: 14 },
    { slug: "bollen",         name: "Bollen",            category: "baguette", weightGrams: 250,  sortOrder: 15 },
    { slug: "spelt",          name: "Spelt",             category: "spelt",    weightGrams: 830,  sortOrder: 16 },
    { slug: "volkoren",       name: "Volkoren",          category: "volkoren", weightGrams: 1000, sortOrder: 17 },
    { slug: "rogge-lijnzaad", name: "Rogge-lijnzaad",   category: "rogge",    weightGrams: 840,  sortOrder: 18 },
    { slug: "gekiemde-rogge", name: "Gekiemde rogge",   category: "rogge",    weightGrams: 1000, sortOrder: 19 },
  ];

  const breads: Record<string, string> = {};
  for (const b of breadData) {
    const bt = await prisma.breadType.upsert({
      where: { tenantId_slug: { tenantId: tid, slug: b.slug } },
      update: { name: b.name, sortOrder: b.sortOrder },
      create: { tenantId: tid, ...b },
    });
    breads[b.slug] = bt.id;
  }

  // ── Recipes ───────────────────────────────────────────────────────────────────
  // Boerenmix (KL, GR, 1.5KG share same base recipe, different weights)
  async function upsertRecipe(breadSlug: string, data: any, flourLines: any[], toppings: any[] = []) {
    const breadTypeId = breads[breadSlug];
    if (!breadTypeId) return;
    const existing = await prisma.recipe.findUnique({ where: { breadTypeId } });
    const recipe = existing
      ? await prisma.recipe.update({ where: { breadTypeId }, data })
      : await prisma.recipe.create({ data: { tenantId: tid, breadTypeId, ...data } });

    await prisma.recipeFlour.deleteMany({ where: { recipeId: recipe.id } });
    await prisma.recipeFlour.createMany({
      data: flourLines.map((f, i) => ({ recipeId: recipe.id, ...f, sortOrder: i })),
    });
    await prisma.recipeTopping.deleteMany({ where: { recipeId: recipe.id } });
    if (toppings.length) {
      await prisma.recipeTopping.createMany({
        data: toppings.map((t, i) => ({ recipeId: recipe.id, ...t, sortOrder: i })),
      });
    }
  }

  const boerenBase = { waterPct: 71.5, desemPct: 15, zoutPct: 2, inwasPct: 6, mixerGroup: "boeren" };
  const boerenFlours = [
    { name: "Tarwebloem (GRBR)", percentage: 75 },
    { name: "Volkoren tarwe",    percentage: 9 },
    { name: "Volkoren rogge",    percentage: 3 },
    { name: "Molino Tipo 0",     percentage: 13 },
  ];

  await upsertRecipe("boeren-kl",   { ...boerenBase, doughWeightPerLoaf: 750,  notes: "Klein brood 750g. 26 min stoom, ~13 min zonder. 36-41 min totaal." }, boerenFlours);
  await upsertRecipe("boeren-gr",   { ...boerenBase, doughWeightPerLoaf: 1000, notes: "Groot brood 1kg. 26 min stoom, ~13 min zonder. 36-41 min totaal." }, boerenFlours);
  await upsertRecipe("boeren-15kg", { ...boerenBase, doughWeightPerLoaf: 1500, notes: "Horeca 1,5kg. 26 min stoom, ~13 min zonder." }, boerenFlours);

  await upsertRecipe("sesam", { ...boerenBase, doughWeightPerLoaf: 1000, notes: "Sesam coating: sesam + water x0.2" }, boerenFlours, [
    { name: "Sesam (geroosterd)", gramsPerLoaf: 34, waterRatio: 0.2 },
  ]);
  await upsertRecipe("sesam-15kg", { ...boerenBase, doughWeightPerLoaf: 1500, notes: "Sesam 1,5kg" }, boerenFlours, [
    { name: "Sesam (geroosterd)", gramsPerLoaf: 34, waterRatio: 0.2 },
  ]);
  await upsertRecipe("zaden", { ...boerenBase, doughWeightPerLoaf: 1000, notes: "Zadenmix coating: zadenmix + water x0.3" }, boerenFlours, [
    { name: "Zadenmix (geroosterd)", gramsPerLoaf: 40, waterRatio: 0.3 },
  ]);
  await upsertRecipe("zaden-15kg", { ...boerenBase, doughWeightPerLoaf: 1500, notes: "Zaden 1,5kg" }, boerenFlours, [
    { name: "Zadenmix (geroosterd)", gramsPerLoaf: 40, waterRatio: 0.3 },
  ]);
  await upsertRecipe("olijf", { ...boerenBase, doughWeightPerLoaf: 1000, notes: "Olijven zwart + groen + rozemarijn" }, boerenFlours, [
    { name: "Olijven zwart",         gramsPerLoaf: 62.5 },
    { name: "Olijven groen",         gramsPerLoaf: 62.5 },
    { name: "Rozemarijn (gedroogd)", gramsPerLoaf: 2 },
  ]);
  await upsertRecipe("rozijn", { ...boerenBase, doughWeightPerLoaf: 1000, notes: "Rozijnen wellen in kokend water" }, boerenFlours, [
    { name: "Rozijnen",  gramsPerLoaf: 90, requiresKoking: true, waterRatio: 0.9 },
    { name: "Kaneel",    gramsPerLoaf: 7 },
  ]);

  await upsertRecipe("baguette", {
    waterPct: 62, desemPct: 15, zoutPct: 2, inwasPct: 4,
    doughWeightPerLoaf: 500, mixerGroup: "baguette",
    notes: "500g. Koud na preshapen, volgende dag rollen. 20 min stoom, ~1 min zonder.",
  }, [
    { name: "Tarwebloem", percentage: 55 },
    { name: "T65",        percentage: 45 },
  ]);

  await upsertRecipe("spelt", {
    waterPct: 77, desemPct: 16, zoutPct: 2, inwasPct: 0,
    doughWeightPerLoaf: 830, mixerGroup: "spelt",
    notes: "Zout direct erbij. 830g in blikken. 25 min stoom, ~23 min zonder.",
  }, [
    { name: "Speltbloem",    percentage: 50 },
    { name: "Volkoren spelt", percentage: 50 },
  ]);

  await upsertRecipe("volkoren", {
    waterPct: 73, desemPct: 17, zoutPct: 2, inwasPct: 0,
    doughWeightPerLoaf: 1000, mixerGroup: "volkoren",
    notes: "Zout direct erbij, met de hand mengen. 1e vouw na 40 min. 1kg ovale manden.",
  }, [{ name: "Volkoren tarwemeel", percentage: 100 }]);

  await upsertRecipe("gekiemde-rogge", {
    waterPct: 118, desemPct: 40, zoutPct: 4.5, inwasPct: 0,
    doughWeightPerLoaf: 1000, mixerGroup: "rogge",
    notes: "Guinness 40%. Gekiemde rogge 105%. 1kg blikken. 20 min stoom 270C, ~80 min zonder.",
  }, [
    { name: "Volkoren spelt", percentage: 80 },
    { name: "Rogge",          percentage: 20 },
  ], [
    { name: "Gekiemde rogge",   gramsPerLoaf: 130 },
    { name: "Zonnebloempitten", gramsPerLoaf: 11.25 },
    { name: "Lijnzaad",         gramsPerLoaf: 50 },
    { name: "Sesamzaad",        gramsPerLoaf: 26 },
    { name: "Pompoenpitten",    gramsPerLoaf: 11.25 },
  ]);

  // ── Winkel template (from page 11 of orders PDF) ──────────────────────────────
  // weekday: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  const winkelData: { slug: string; quantities: [number, number][] }[] = [
    { slug: "boeren-kl",      quantities: [[2,12],[3,12],[4,12],[5,16],[6,18]] },
    { slug: "boeren-gr",      quantities: [[2,18],[3,14],[4,11],[5,19],[6,34]] },
    { slug: "sesam",          quantities: [[2,10],[3,10],[4,9], [5,20],[6,22]] },
    { slug: "zaden",          quantities: [[2,12],[3,10],[4,12],[5,21],[6,23]] },
    { slug: "olijf",          quantities: [[3,8], [4,8], [6,12]] },
    { slug: "rozijn",         quantities: [[3,8], [4,8], [6,8]]  },
    { slug: "spelt",          quantities: [[2,12],[3,12],[4,12],[5,12],[6,24]] },
    { slug: "volkoren",       quantities: [[2,12],[4,6], [5,16]] },
    { slug: "baguette",       quantities: [[2,35],[3,35],[4,35],[5,35],[6,60]] },
    { slug: "morning-buns",   quantities: [[2,6], [3,6], [4,6], [5,8], [6,16]] },
    { slug: "gekiemde-rogge", quantities: [[3,20]] },
    { slug: "rogge-lijnzaad", quantities: [[3,12],[4,12]] },
  ];

  for (const { slug, quantities } of winkelData) {
    const breadTypeId = breads[slug];
    if (!breadTypeId) continue;
    for (const [weekday, quantity] of quantities) {
      await prisma.winkelTemplate.upsert({
        where: { tenantId_shopName_breadTypeId_weekday: { tenantId: tid, shopName: "Winkel Delft", breadTypeId, weekday } },
        update: { quantity },
        create: { tenantId: tid, shopName: "Winkel Delft", breadTypeId, weekday, quantity },
      });
    }
  }

  // ── Customers ──────────────────────────────────────────────────────────────────
  const customerData = [
    { name: "Klant 1", city: "Utrecht" },
    { name: "Klant 2", city: "Rotterdam" },
    { name: "Klant 3", city: "Rotterdam" },
    { name: "Klant 4", city: "Gouda" },
    { name: "Klant 5", city: "Utrecht" },
    { name: "Klant 6", city: "Utrecht" },
    { name: "Klant 7", city: "Gouda" },
  ];
  const customers: Record<string, string> = {};
  for (const c of customerData) {
    const existing = await prisma.customer.findFirst({ where: { tenantId: tid, name: c.name } });
    const cust = existing ?? await prisma.customer.create({ data: { tenantId: tid, ...c } });
    customers[c.name] = cust.id;
  }

  // ── Recurring orders (vaste bestellingen) ─────────────────────────────────────
  // From the AANVINKEN sheet: Klant 6 Tue (20 Boeren GR), Klant 5 Wed (20 Boeren GR),
  // Klant 3 Thu (15 Boeren 1.5KG), Klant 4 Fri (15 Boeren 1.5KG), Klant 1 Sat (15 Boeren 1.5KG)
  const recurringData = [
    { customer: "Klant 6", weekday: 2, lines: [{ slug: "boeren-gr", qty: 20 }] },
    { customer: "Klant 5", weekday: 3, lines: [{ slug: "boeren-gr", qty: 20 }] },
    { customer: "Klant 6", weekday: 3, lines: [{ slug: "boeren-gr", qty: 0  }] }, // often 0 but kept in system
    { customer: "Klant 3", weekday: 4, lines: [{ slug: "boeren-15kg", qty: 15 }] },
    { customer: "Klant 4", weekday: 5, lines: [{ slug: "boeren-15kg", qty: 15 }] },
    { customer: "Klant 1", weekday: 6, lines: [{ slug: "boeren-15kg", qty: 15 }] },
  ];

  for (const r of recurringData) {
    const customerId = customers[r.customer];
    if (!customerId) continue;
    const ro = await prisma.recurringOrder.upsert({
      where: { tenantId_customerId_weekday: { tenantId: tid, customerId, weekday: r.weekday } },
      update: { active: true },
      create: { tenantId: tid, customerId, weekday: r.weekday },
    });
    for (const line of r.lines) {
      const breadTypeId = breads[line.slug];
      if (!breadTypeId) continue;
      await prisma.recurringOrderLine.upsert({
        where: { recurringOrderId_breadTypeId: { recurringOrderId: ro.id, breadTypeId } },
        update: { quantity: line.qty },
        create: { recurringOrderId: ro.id, breadTypeId, quantity: line.qty },
      });
    }
  }

  console.log("✓ Seed complete");
  console.log(`  Tenant: ${tenant.slug}`);
  console.log(`  Bread types: ${breadData.length}`);
  console.log(`  Customers: ${customerData.length}`);
  console.log(`  Recurring orders: ${recurringData.length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
