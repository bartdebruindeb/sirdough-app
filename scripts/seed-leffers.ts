import { PrismaClient, Role } from "@prisma/client";
const prisma = new PrismaClient();

// Bread slug → column index mapping (0-based from Boeren KL)
const SLUGS = [
  "boeren-kl","boeren-gr","boeren-15kg","baguette","baguette-kaas",
  "bollen","sesam","sesam-15kg","zaden","zaden-15kg","volkoren",
  "gekiemde-rogge","olijf","morning-buns","spelt","rozijn",
  "kaneel-buns","kardemom-buns",
];

async function main() {
  console.log("🍞 Seeding Meneer Leffers...");

  // ── Tenant ────────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: "meneer-leffers" },
    update: {},
    create: { name: "Meneer Leffers", slug: "meneer-leffers", plan: "starter" },
  });
  const tid = tenant.id;

  // ── Users ─────────────────────────────────────────────────────────────────
  const owner = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tid, email: "owner@meneerleffers.nl" } },
    update: {},
    create: { tenantId: tid, email: "owner@meneerleffers.nl", name: "Eigenaar", role: Role.OWNER },
  });
  const worker = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tid, email: "worker@meneerleffers.nl" } },
    update: {},
    create: { tenantId: tid, email: "worker@meneerleffers.nl", name: "Bakker", role: Role.BAKKER },
  });

  // Generate one-time setup links so the owner/worker can set their password
  // and log in for the first time. Same mechanism as Team page invites.
  const crypto = await import("crypto");
  async function makeSetupLink(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.passwordHash) return null; // already has a password — skip
    await prisma.inviteToken.deleteMany({ where: { tenantId: tid, customerId: userId } });
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.inviteToken.create({ data: { tenantId: tid, customerId: userId, token, expiresAt } });
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000/digitalbakery";
    return `${baseUrl}/uitnodiging?token=${token}&type=worker`;
  }

  // ── Dough types ───────────────────────────────────────────────────────────────
  const doughData = [
    { slug:"boeren",   name:"Boerenmix",    waterPct:71.5, desemPct:15, zoutPct:2,   inwasPct:6,
      flours:[{name:"Tarwebloem (GRBR)",percentage:75},{name:"Volkoren tarwe",percentage:9},{name:"Volkoren rogge",percentage:3},{name:"Molino Tipo 0",percentage:13}] },
    { slug:"baguette", name:"Baguettedeeg", waterPct:62,   desemPct:15, zoutPct:2,   inwasPct:4,
      flours:[{name:"Tarwebloem",percentage:55},{name:"T65",percentage:45}] },
    { slug:"spelt",    name:"Spelt",         waterPct:77,   desemPct:16, zoutPct:2,   inwasPct:0,
      flours:[{name:"Speltbloem",percentage:50},{name:"Volkoren spelt",percentage:50}] },
    { slug:"volkoren", name:"Volkoren",      waterPct:73,   desemPct:17, zoutPct:2,   inwasPct:0,
      flours:[{name:"Volkoren tarwemeel",percentage:100}] },
    { slug:"rogge",    name:"Rogge",         waterPct:118,  desemPct:40, zoutPct:4.5, inwasPct:0,
      flours:[{name:"Volkoren spelt",percentage:80},{name:"Rogge",percentage:20}] },
  ];
  const doughTypes: Record<string,string> = {};
  for (const d of doughData) {
    const dt = await prisma.doughType.upsert({
      where:{ tenantId_slug:{ tenantId:tid, slug:d.slug } },
      update:{ waterPct:d.waterPct, desemPct:d.desemPct, zoutPct:d.zoutPct, inwasPct:d.inwasPct },
      create:{ tenantId:tid, slug:d.slug, name:d.name, waterPct:d.waterPct, desemPct:d.desemPct, zoutPct:d.zoutPct, inwasPct:d.inwasPct },
    });
    await prisma.doughFlour.deleteMany({ where:{ doughTypeId:dt.id } });
    await prisma.doughFlour.createMany({ data:d.flours.map((f,i)=>({ doughTypeId:dt.id, name:f.name, percentage:f.percentage, sortOrder:i })) });
    doughTypes[d.slug] = dt.id;
  }
  const breadDoughMap: Record<string,string> = {
    "boeren-kl":"boeren","boeren-gr":"boeren","boeren-15kg":"boeren",
    "sesam":"boeren","sesam-15kg":"boeren","zaden":"boeren","zaden-15kg":"boeren",
    "olijf":"boeren","rozijn":"boeren","morning-buns":"boeren",
    "baguette":"baguette","baguette-kaas":"baguette","bollen":"baguette",
    "spelt":"spelt","volkoren":"volkoren","gekiemde-rogge":"rogge",
  };

  // ── Bread types ───────────────────────────────────────────────────────────
  const breadData = [
    { slug: "boeren-kl",      name: "Boeren KL",          category: "boeren",   weightGrams: 750,  sortOrder: 1,  customerOrderable: true },
    { slug: "boeren-gr",      name: "Boeren GR",           category: "boeren",   weightGrams: 1000, sortOrder: 2,  customerOrderable: true },
    { slug: "boeren-15kg",    name: "Boeren 1,5 KG",       category: "boeren",   weightGrams: 1500, sortOrder: 3,  customerOrderable: true },
    { slug: "sesam",          name: "Sesam",                category: "boeren",   weightGrams: 1000, sortOrder: 4,  customerOrderable: true },
    { slug: "sesam-15kg",     name: "Sesam 1,5 KG",        category: "boeren",   weightGrams: 1500, sortOrder: 5,  customerOrderable: true },
    { slug: "zaden",          name: "Zaden",                category: "boeren",   weightGrams: 1000, sortOrder: 6,  customerOrderable: true },
    { slug: "zaden-15kg",     name: "Zaden 1,5 KG",        category: "boeren",   weightGrams: 1500, sortOrder: 7,  customerOrderable: true },
    { slug: "olijf",          name: "Olijf",                category: "boeren",   weightGrams: 1000, sortOrder: 8,  customerOrderable: true },
    { slug: "rozijn",         name: "Rozijn",               category: "boeren",   weightGrams: 1000, sortOrder: 9,  customerOrderable: true },
    { slug: "morning-buns",   name: "Morning buns",         category: "zoet",     weightGrams: 202,  sortOrder: 10, customerOrderable: false },
    { slug: "baguette",       name: "Baguette 0.5 kg",      category: "baguette", weightGrams: 500,  sortOrder: 11, customerOrderable: true },
    { slug: "baguette-kaas",  name: "Baguette Kaas/Peper",  category: "baguette", weightGrams: 500,  sortOrder: 12, customerOrderable: true },
    { slug: "bollen",         name: "Bollen",               category: "baguette", weightGrams: 250,  sortOrder: 13, customerOrderable: false },
    { slug: "spelt",          name: "Spelt",                category: "spelt",    weightGrams: 830,  sortOrder: 14, customerOrderable: true },
    { slug: "volkoren",       name: "Volkoren",             category: "volkoren", weightGrams: 1000, sortOrder: 15, customerOrderable: true },
    { slug: "gekiemde-rogge", name: "Gekiemde Rogge",       category: "rogge",    weightGrams: 1000, sortOrder: 16, customerOrderable: true },
  ];

  const breads: Record<string, string> = {};
  for (const b of breadData) {
    const bt = await prisma.breadType.upsert({
      where: { tenantId_slug: { tenantId: tid, slug: b.slug } },
      update: { name: b.name, sortOrder: b.sortOrder, doughTypeId: doughTypes[breadDoughMap[b.slug] ?? ''] ?? undefined },
      create: { tenantId: tid, name: b.name, slug: b.slug, category: b.category, weightGrams: b.weightGrams, sortOrder: b.sortOrder, customerOrderable: b.customerOrderable, doughTypeId: doughTypes[breadDoughMap[b.slug] ?? ''] ?? undefined },
    });
    breads[b.slug] = bt.id;
  }

  // ── Recipes ───────────────────────────────────────────────────────────────
  const boerenBase = { waterPct: 71.5, desemPct: 15, zoutPct: 2, inwasPct: 6, mixerGroup: "boeren" };
  const boerenFlours = [
    { name: "Tarwebloem (GRBR)", percentage: 75, sortOrder: 0 },
    { name: "Volkoren tarwe",    percentage: 9,  sortOrder: 1 },
    { name: "Volkoren rogge",    percentage: 3,  sortOrder: 2 },
    { name: "Molino Tipo 0",     percentage: 13, sortOrder: 3 },
  ];

  async function upsertRecipe(slug: string, data: any, flourLines: any[], toppings: any[] = []) {
    const breadTypeId = breads[slug];
    if (!breadTypeId) return;
    const r = await prisma.recipe.upsert({
      where: { breadTypeId },
      create: { tenantId: tid, breadTypeId, ...data },
      update: data,
    });
    await prisma.recipeFlour.deleteMany({ where: { recipeId: r.id } });
    await prisma.recipeFlour.createMany({ data: flourLines.map(f => ({ recipeId: r.id, ...f })) });
    await prisma.recipeTopping.deleteMany({ where: { recipeId: r.id } });
    if (toppings.length) await prisma.recipeTopping.createMany({ data: toppings.map(t => ({ recipeId: r.id, ...t })) });
  }

  await upsertRecipe("boeren-kl",   { ...boerenBase, doughWeightPerLoaf: 758,  notes: "Klein 750g. 26+13 min." }, boerenFlours);
  await upsertRecipe("boeren-gr",   { ...boerenBase, doughWeightPerLoaf: 1010, notes: "Groot 1kg. 26+13 min." }, boerenFlours);
  await upsertRecipe("boeren-15kg", { ...boerenBase, doughWeightPerLoaf: 1515, notes: "Horeca 1,5kg." }, boerenFlours);
  await upsertRecipe("sesam",       { ...boerenBase, doughWeightPerLoaf: 1010, notes: "Sesam coating water x0.2" }, boerenFlours, [{ name: "Sesam (geroosterd)", gramsPerLoaf: 34, waterRatio: 0.2, sortOrder: 0 }]);
  await upsertRecipe("sesam-15kg",  { ...boerenBase, doughWeightPerLoaf: 1515 }, boerenFlours, [{ name: "Sesam (geroosterd)", gramsPerLoaf: 34, waterRatio: 0.2, sortOrder: 0 }]);
  await upsertRecipe("zaden",       { ...boerenBase, doughWeightPerLoaf: 1010, notes: "Zadenmix coating water x0.3" }, boerenFlours, [{ name: "Zadenmix (geroosterd)", gramsPerLoaf: 40, waterRatio: 0.3, sortOrder: 0 }]);
  await upsertRecipe("zaden-15kg",  { ...boerenBase, doughWeightPerLoaf: 1515 }, boerenFlours, [{ name: "Zadenmix (geroosterd)", gramsPerLoaf: 40, waterRatio: 0.3, sortOrder: 0 }]);
  await upsertRecipe("olijf",       { ...boerenBase, doughWeightPerLoaf: 1010, notes: "Olijven zwart + groen + rozemarijn" }, boerenFlours, [
    { name: "Olijven zwart", gramsPerLoaf: 62.5, sortOrder: 0 },
    { name: "Olijven groen", gramsPerLoaf: 62.5, sortOrder: 1 },
    { name: "Rozemarijn",    gramsPerLoaf: 2,    sortOrder: 2 },
  ]);
  await upsertRecipe("rozijn", { ...boerenBase, doughWeightPerLoaf: 1010, notes: "Rozijnen + kaneel wellen" }, boerenFlours, [
    { name: "Rozijnen", gramsPerLoaf: 90, requiresKoking: true, waterRatio: 0.9, sortOrder: 0 },
    { name: "Kaneel",   gramsPerLoaf: 7,  sortOrder: 1 },
  ]);
  // Morning buns = plain boeren dough, 800g loaf cut in 4 pieces before baking
  // System counts in pieces; 1 piece = 808g ÷ 4 = 202g dough (incl. 1%)
  await upsertRecipe("morning-buns", {
    ...boerenBase,
    doughWeightPerLoaf: 202,
    mixerGroup: "boeren",
    notes: "800g boerenmix per loaf, gesneden in 4 stuks vlak voor bakken. 1 stuk = 202g deeg.",
  }, boerenFlours);
  await upsertRecipe("baguette",      { waterPct: 62, desemPct: 15, zoutPct: 2, inwasPct: 4, doughWeightPerLoaf: 505, mixerGroup: "baguette", notes: "500g +1%. 20+1 min." }, [
    { name: "Tarwebloem", percentage: 55, sortOrder: 0 },
    { name: "T65",        percentage: 45, sortOrder: 1 },
  ]);
  await upsertRecipe("baguette-kaas", { waterPct: 62, desemPct: 15, zoutPct: 2, inwasPct: 4, doughWeightPerLoaf: 505, mixerGroup: "baguette" }, [
    { name: "Tarwebloem", percentage: 55, sortOrder: 0 },
    { name: "T65",        percentage: 45, sortOrder: 1 },
  ]);
  await upsertRecipe("bollen",        { waterPct: 62, desemPct: 15, zoutPct: 2, inwasPct: 4, doughWeightPerLoaf: 253, mixerGroup: "baguette" }, [
    { name: "Tarwebloem", percentage: 55, sortOrder: 0 },
    { name: "T65",        percentage: 45, sortOrder: 1 },
  ]);
  await upsertRecipe("spelt",    { waterPct: 77, desemPct: 16, zoutPct: 2, inwasPct: 0, doughWeightPerLoaf: 838, mixerGroup: "spelt",    notes: "830g +1%. 25+23 min." }, [
    { name: "Speltbloem",     percentage: 50, sortOrder: 0 },
    { name: "Volkoren spelt", percentage: 50, sortOrder: 1 },
  ]);
  await upsertRecipe("volkoren", { waterPct: 73, desemPct: 17, zoutPct: 2, inwasPct: 0, doughWeightPerLoaf: 1010, mixerGroup: "volkoren", notes: "1kg +1%. Met de hand mengen." }, [
    { name: "Volkoren tarwemeel", percentage: 100, sortOrder: 0 },
  ]);
  await upsertRecipe("gekiemde-rogge", { waterPct: 118, desemPct: 40, zoutPct: 4.5, inwasPct: 0, doughWeightPerLoaf: 1010, mixerGroup: "rogge", notes: "1kg +1%. Guinness 40%." }, [
    { name: "Volkoren spelt", percentage: 80, sortOrder: 0 },
    { name: "Rogge",          percentage: 20, sortOrder: 1 },
  ], [
    { name: "Gekiemde rogge",   gramsPerLoaf: 130, sortOrder: 0 },
    { name: "Zonnebloempitten", gramsPerLoaf: 11,  sortOrder: 1 },
    { name: "Lijnzaad",         gramsPerLoaf: 50,  sortOrder: 2 },
    { name: "Sesamzaad",        gramsPerLoaf: 26,  sortOrder: 3 },
    { name: "Pompoenpitten",    gramsPerLoaf: 11,  sortOrder: 4 },
  ]);

  // ── Winkel templates (from Winkel productie per dag sheet) ────────────────
  // Two "customers" representing the two shops
  const winkelDelft = await prisma.customer.upsert({
    where: { id: "winkel-delft" },
    update: {},
    create: { id: "winkel-delft", tenantId: tid, name: "Winkel Delft", city: "Delft", notes: "Eigen winkel Delft" },
  });
  const winkelDH = await prisma.customer.upsert({
    where: { id: "winkel-dh" },
    update: {},
    create: { id: "winkel-dh", tenantId: tid, name: "Winkel Den Haag", city: "Den Haag", notes: "Eigen winkel Den Haag" },
  });

  // Winkel Delft — per weekday (2=Di, 3=Wo, 4=Do, 5=Vr, 6=Za)
  type WD = [number, Record<string,number>];
  const delftTemplate: WD[] = [
    [2, { "boeren-gr":26,  "boeren-15kg":42, "baguette":30, "sesam":20, "zaden":22, "volkoren":22, "olijf":22, "morning-buns":32, "spelt":20 }],
    [3, { "boeren-gr":24,  "boeren-15kg":30, "baguette":30, "sesam":20, "zaden":22, "olijf":22,    "morning-buns":32, "spelt":20 }],
    [4, { "boeren-gr":24,  "boeren-15kg":38, "baguette":30, "sesam":16, "zaden":22, "volkoren":22, "olijf":30, "morning-buns":32, "spelt":20 }],
    [5, { "boeren-gr":24,  "boeren-15kg":56, "baguette":40, "sesam":26, "zaden":28, "volkoren":24, "morning-buns":32, "spelt":20, "kaneel-buns":10 }],
    [6, { "boeren-kl":40, "boeren-gr":100, "boeren-15kg":70, "baguette":70, "baguette-kaas":35, "sesam":38, "zaden":40, "olijf":40, "rozijn":14, "morning-buns":72, "spelt":28, "volkoren":40 }],
  ];
  const dhTemplate: WD[] = [
    [2, { "boeren-gr":20,  "boeren-15kg":38, "baguette":20, "sesam":10, "zaden":16, "volkoren":20, "olijf":22, "morning-buns":20 }],
    [3, { "boeren-gr":12,  "boeren-15kg":20, "baguette":20, "sesam":10, "zaden":12, "volkoren":20, "morning-buns":20 }],
    [4, { "boeren-gr":18,  "boeren-15kg":34, "baguette":20, "sesam":10, "zaden":14, "volkoren":20, "olijf":30, "morning-buns":20 }],
    [5, { "boeren-gr":10,  "boeren-15kg":28, "baguette":20, "sesam":10, "zaden":12, "volkoren":20, "morning-buns":24, "kaneel-buns":5 }],
    [6, { "boeren-kl":26, "boeren-gr":34, "boeren-15kg":30, "baguette":30, "baguette-kaas":15, "sesam":16, "zaden":20, "olijf":18, "rozijn":5, "morning-buns":32, "volkoren":0 }],
  ];

  for (const [weekday, qtys] of delftTemplate) {
    for (const [slug, qty] of Object.entries(qtys)) {
      const breadTypeId = breads[slug];
      if (!breadTypeId) continue;
      await prisma.winkelTemplate.upsert({
        where: { tenantId_shopName_breadTypeId_weekday: { tenantId: tid, shopName: "Winkel Delft", breadTypeId, weekday } },
        update: { quantity: qty },
        create: { tenantId: tid, shopName: "Winkel Delft", breadTypeId, weekday, quantity: qty },
      });
    }
  }

  for (const [weekday, qtys] of dhTemplate) {
    for (const [slug, qty] of Object.entries(qtys)) {
      const breadTypeId = breads[slug];
      if (!breadTypeId) continue;
      await prisma.winkelTemplate.upsert({
        where: { tenantId_shopName_breadTypeId_weekday: { tenantId: tid, shopName: "Winkel Den Haag", breadTypeId, weekday } },
        update: { quantity: qty },
        create: { tenantId: tid, shopName: "Winkel Den Haag", breadTypeId, weekday, quantity: qty },
      });
    }
  }

  // ── Customers (horeca) ────────────────────────────────────────────────────
  // Cities with delivery order (sortOrder = route sequence)
  const cityOrder: Record<string, number> = {
    "Delft": 1, "Den Haag": 2, "Scheveningen": 3, "Voorburg": 4,
    "Rotterdam": 5, "Rotterdam / Delft": 6, "De Lier": 7, "Den Hoorn": 8,
  };

  const customerData = [
    // Delft
    { name: "LOT",                    city: "Delft",             address: "Voldersgracht 5, 2611 EM Delft",                    notes: "" },
    { name: "Vakwerk",                city: "Delft",             address: "Prof. Snijdersstraat 2, 2628 RA Delft",             notes: "" },
    { name: "Azurite",                city: "Delft",             address: "Kromstraat 5, 2611 GH Delft",                       notes: "3 focaccia" },
    { name: "Barsil",                 city: "Delft",             address: "Brabantse Turfmarkt 65, 2611 CJ Delft",             notes: "" },
    { name: "Cafë Johannes",          city: "Delft",             address: "Brabantse Turfmarkt 25, 2611 CG Delft",             notes: "" },
    { name: "Cozy Homemade Food",     city: "Delft",             address: "Choorstraat 26, 2611 JA Delft",                     notes: "" },
    { name: "Flow",                   city: "Delft",             address: "Groene Haven 302, 2611 JE Delft",                   notes: "" },
    { name: "Gaia",                   city: "Delft",             address: "Brabantse Turfmarkt 51, 2611 CJ Delft",             notes: "" },
    { name: "Hanno",                  city: "Delft",             address: "Grote Markt 8, 2611 GW Delft",                     notes: "" },
    { name: "Rode Rozen & Tortillas", city: "Delft",             address: "Phoenixstraat 62, 2611 AM Delft",                   notes: "" },
    { name: "The Social Hub",         city: "Delft",             address: "Phoenixstraat 47, 2611 AL Delft",                   notes: "" },
    { name: "Delfts Brouwhuis",       city: "Delft",             address: "Burgwal 45, 2611 GG Delft",                         notes: "" },
    // Den Haag
    { name: "Barbarossa",             city: "Den Haag",          address: "Zwarte Pad 61, 2586 ZZ Den Haag",                  notes: "" },
    { name: "Bar Bowie",              city: "Den Haag",          address: "Regentesselaan 24A, 2562 CS Den Haag",              notes: "" },
    { name: "Baardman",               city: "Den Haag",          address: "Frederikstraat 251, 2514 LL Den Haag",              notes: "" },
    { name: "Bayonne restaurant",     city: "Den Haag",          address: "Frederikstraat 551, 2514 LT Den Haag",              notes: "" },
    { name: "Bodegon",                city: "Den Haag",          address: "Stationsweg 36, 2515 BN Den Haag",                  notes: "ophalen DH" },
    { name: "Boomhuttenclub",         city: "Den Haag",          address: "Theresiastraat 35, 2593 AC Den Haag",               notes: "Bezorgen winkel DH" },
    { name: "Buza",                   city: "Den Haag",          address: "Valkenbosplein 12, 2526 TH Den Haag",               notes: "light breads" },
    { name: "Caipi Cafe",             city: "Den Haag",          address: "Prins Hendrikstraat 40, 2518 HZ Den Haag",          notes: "" },
    { name: "Cafe Drie",              city: "Den Haag",          address: "Torenstraat 3, 2513 BS Den Haag",                   notes: "" },
    { name: "De Coterie",             city: "Den Haag",          address: "Javastraat 54, 2585 AT Den Haag",                   notes: "" },
    { name: "Franklin",               city: "Den Haag",          address: "Denneweg 97, 2514 CB Den Haag",                     notes: "" },
    { name: "Kantoor1643",            city: "Den Haag",          address: "Kerkplein 1643, 2514 AM Den Haag",                  notes: "" },
    { name: "Niah brunch",            city: "Den Haag",          address: "Torenstraat 37, 2513 BT Den Haag",                  notes: "" },
    { name: "Palmette",               city: "Den Haag",          address: "Plaats 27, 2513 AA Den Haag",                       notes: "" },
    { name: "Plenty",                 city: "Den Haag",          address: "Nieuwe Schoolstraat 12, 2514 HZ Den Haag",          notes: "" },
    { name: "Vienna",                 city: "Den Haag",          address: "Spui 247, 2511 BJ Den Haag",                        notes: "gesneden verpakt" },
    { name: "Walter Benedict",        city: "Den Haag",          address: "Denneweg 69A, 2514 CB Den Haag",                    notes: "" },
    { name: "Jacob's bar & grill",    city: "Den Haag",          address: "Prins Hendrikstraat 101, 2518 JD Den Haag",         notes: "" },
    // Scheveningen
    { name: "Het puntje",             city: "Scheveningen",      address: "Dr. Lelykade 5, 2583 CL Scheveningen",              notes: "" },
    // Voorburg
    { name: "Central Park",           city: "Voorburg",          address: "Parkweg 2, 2271 AJ Voorburg",                       notes: "" },
    // Rotterdam
    { name: "Blend Artwork",          city: "Rotterdam",         address: "Nieuwe Binnenweg 130B, 3015 BC Rotterdam",          notes: "" },
    { name: "Booon",                  city: "Rotterdam",         address: "Proveniersstraat 31, 3033 CG Rotterdam",            notes: "" },
    { name: "BROOD VOOR RDAM",        city: "Rotterdam",         address: "Mathenesserlaan 210, 3021 HK Rotterdam",            notes: "1 spelt Stumpf" },
    { name: "De Wilde mossel",        city: "Rotterdam",         address: "Middellandplein 8, 3021 BH Rotterdam",              notes: "" },
    { name: "Diepnoord",              city: "Rotterdam",         address: "Diepeveen 30, 3034 KJ Rotterdam",                   notes: "" },
    { name: "Giraffe Coffeeroasters", city: "Rotterdam",         address: "Ratelaarweg 11, 3053 JP Rotterdam",                 notes: "gesneden" },
    { name: "Heroine",                city: "Rotterdam",         address: "Kipstraat 12, 3011 RT Rotterdam",                   notes: "" },
    { name: "Joelia",                 city: "Rotterdam",         address: "Maashaven Zuidzijde 2, 3081 AE Rotterdam",          notes: "pakbon mee" },
    { name: "Le Frique",              city: "Rotterdam",         address: "Nieuwe Binnenweg 44, 3015 BA Rotterdam",            notes: "" },
    { name: "Louise",                 city: "Rotterdam",         address: "Aert van Nesstraat 27, 3012 CA Rotterdam",          notes: "" },
    { name: "Morgan en Mees",         city: "Rotterdam",         address: "Mathenesserlaan 145, 3014 HA Rotterdam",            notes: "" },
    { name: "Putaine",                city: "Rotterdam",         address: "Antoine Platekade 996, 3072 ME Rotterdam",          notes: "" },
    { name: "Stumpf & van Dongen",    city: "Rotterdam",         address: "Nieuwe Binnenweg 49, 3015 BA Rotterdam",            notes: "" },
    { name: "Supernova Hotel",        city: "Rotterdam",         address: "Schiekade 100, 3032 AK Rotterdam",                  notes: "" },
    { name: "Wijnbar Proef",          city: "Rotterdam",         address: "Haringvliet 95, 3011 TH Rotterdam",                 notes: "" },
    { name: "Bar Pulpo",              city: "Rotterdam",         address: "Witte de Withstraat 18, 3012 BP Rotterdam",         notes: "" },
    // Rotterdam / Delft
    { name: "Meneer Leffers",         city: "Rotterdam / Delft", address: "Joan Muyskenweg 22, 2900 AR Rotterdam",             notes: "Monday bread" },
    // De Lier
    { name: "De Bongaard",            city: "De Lier",           address: "Woerdlaan 14, 2678 NB De Lier",                     notes: "" },
    // Den Hoorn
    { name: "De Pizzeria",            city: "Den Hoorn",         address: "Dijkshoornseweg 100, 2635 EK Den Hoorn",            notes: "" },
    { name: "Piece of Cake",          city: "Den Hoorn",         address: "Dijkshoornseweg 137, 2635 EL Den Hoorn",            notes: "" },
  ];

  const customers: Record<string, string> = {};
  for (const c of customerData) {
    const existing = await prisma.customer.findFirst({ where: { tenantId: tid, name: c.name } });
    const cust = existing ?? await prisma.customer.create({ data: { tenantId: tid, name: c.name, city: c.city, notes: c.notes, address: (c as any).address } });
    customers[c.name] = cust.id;
  }

  // ── Vaste bestellingen (from Vaste bestellingen sheet, TRUE rows only) ────
  type RO = { customer: string; weekday: number; lines: Record<string, number>; notes?: string };
  const recurring: RO[] = [
    { customer: "Baardman",           weekday: 2, lines: { "boeren-gr": 19 } },
    { customer: "Bar Bowie",          weekday: 2, lines: { "boeren-15kg": 14 } },
    { customer: "Bar Bowie",          weekday: 4, lines: { "boeren-15kg": 14 } },
    { customer: "Bar Bowie",          weekday: 5, lines: { "boeren-15kg": 18 } },
    { customer: "Bar Bowie",          weekday: 6, lines: { "boeren-15kg": 18 } },
    { customer: "Bar Pulpo",          weekday: 5, lines: { "sesam": 8, "zaden": 7 } },
    { customer: "Bayonne restaurant", weekday: 5, lines: { "boeren-15kg": 22 } },
    { customer: "Blend Artwork",      weekday: 6, lines: { "sesam": 9 } },
    { customer: "Boomhuttenclub",     weekday: 2, lines: { "boeren-gr": 1, "boeren-15kg": 4, "sesam-15kg": 2, "zaden": 1 }, notes: "Bezorgen winkel DH" },
    { customer: "Boomhuttenclub",     weekday: 5, lines: { "boeren-gr": 1, "boeren-15kg": 4, "sesam-15kg": 2, "zaden": 1, "rozijn": 1, "kaneel-buns": 3, "kardemom-buns": 3 }, notes: "Bezorgen winkel DH" },
    { customer: "BROOD VOOR RDAM",    weekday: 2, lines: { "boeren-gr": 6 }, notes: "1 spelt Stumpf" },
    { customer: "BROOD VOOR RDAM",    weekday: 3, lines: { "boeren-gr": 6 }, notes: "1 spelt Stumpf" },
    { customer: "BROOD VOOR RDAM",    weekday: 4, lines: { "boeren-gr": 6 }, notes: "1 spelt Stumpf" },
    { customer: "BROOD VOOR RDAM",    weekday: 5, lines: { "boeren-gr": 8 }, notes: "1 spelt Stumpf" },
    { customer: "Buza",               weekday: 6, lines: { "boeren-kl": 17 }, notes: "light breads" },
    { customer: "Buza",               weekday: 2, lines: { "boeren-kl": 13 }, notes: "light breads" },
    { customer: "Cafë Johannes",      weekday: 3, lines: { "boeren-15kg": 11 } },
    { customer: "Cafë Johannes",      weekday: 5, lines: { "boeren-15kg": 13 } },
    { customer: "De Coterie",         weekday: 2, lines: { "boeren-15kg": 10 } },
    { customer: "De Pizzeria",        weekday: 4, lines: { "baguette-kaas": 30 } },
    { customer: "Delfts Brouwhuis",   weekday: 2, lines: { "boeren-gr": 9 } },
    { customer: "Delfts Brouwhuis",   weekday: 4, lines: { "boeren-gr": 18 } },
    { customer: "Delfts Brouwhuis",   weekday: 6, lines: { "boeren-gr": 18 } },
    { customer: "Diepnoord",          weekday: 6, lines: { "boeren-gr": 10 } },
    { customer: "Diepnoord",          weekday: 4, lines: { "boeren-gr": 15 } },
    { customer: "Heroine",            weekday: 4, lines: { "boeren-gr": 30 } },
    { customer: "Le Frique",          weekday: 6, lines: { "boeren-gr": 2 } },
    { customer: "Meneer Leffers",     weekday: 6, lines: { "boeren-15kg": 1 }, notes: "Monday bread" },
    { customer: "Meneer Leffers",     weekday: 5, lines: { "boeren-kl": 2 }, notes: "Olga yoga" },
    { customer: "Palmette",           weekday: 2, lines: { "boeren-15kg": 12 } },
    { customer: "Palmette",           weekday: 4, lines: { "boeren-15kg": 12 } },
    { customer: "Palmette",           weekday: 5, lines: { "boeren-15kg": 18 } },
    { customer: "Piece of Cake",      weekday: 4, lines: { "boeren-15kg": 12 } },
    { customer: "Supernova Hotel",    weekday: 3, lines: { "boeren-gr": 9 } },
    { customer: "Vakwerk",            weekday: 2, lines: { "boeren-15kg": 20 } },
    { customer: "Vakwerk",            weekday: 4, lines: { "boeren-15kg": 20 } },
    { customer: "Walter Benedict",    weekday: 4, lines: { "boeren-15kg": 10 } },
    { customer: "Walter Benedict",    weekday: 5, lines: { "boeren-15kg": 10 } },
    { customer: "Walter Benedict",    weekday: 6, lines: { "boeren-15kg": 10 } },
    { customer: "Walter Benedict",    weekday: 2, lines: { "boeren-15kg": 10 } },
    { customer: "Bodegon",            weekday: 3, lines: { "boeren-gr": 8, "baguette": 3 }, notes: "pick up DH" },
    { customer: "Bodegon",            weekday: 4, lines: { "boeren-gr": 8, "baguette": 3 }, notes: "pick up DH" },
    { customer: "Bodegon",            weekday: 5, lines: { "boeren-gr": 12, "baguette": 8 }, notes: "pick up DH" },
    { customer: "Bodegon",            weekday: 6, lines: { "boeren-gr": 20, "baguette": 12, "sesam-15kg": 2, "olijf": 2 }, notes: "pick up DH" },
  ];

  for (const r of recurring) {
    const customerId = customers[r.customer];
    if (!customerId) { console.warn(`  ⚠ Customer not found: ${r.customer}`); continue; }
    const ro = await prisma.recurringOrder.upsert({
      where: { tenantId_customerId_weekday: { tenantId: tid, customerId, weekday: r.weekday } },
      update: { active: true, notes: r.notes },
      create: { tenantId: tid, customerId, weekday: r.weekday, notes: r.notes },
    });
    for (const [slug, qty] of Object.entries(r.lines)) {
      const breadTypeId = breads[slug];
      if (!breadTypeId) continue;
      await prisma.recurringOrderLine.upsert({
        where: { recurringOrderId_breadTypeId: { recurringOrderId: ro.id, breadTypeId } },
        update: { quantity: qty },
        create: { recurringOrderId: ro.id, breadTypeId, quantity: qty },
      });
    }
  }


  // ── City delivery route order ─────────────────────────────────────────────
  const cities = [
    { city: "Delft",              sortOrder: 1 },
    { city: "Den Haag",           sortOrder: 2 },
    { city: "Scheveningen",       sortOrder: 3 },
    { city: "Voorburg",           sortOrder: 4 },
    { city: "Rotterdam",          sortOrder: 5 },
    { city: "Rotterdam / Delft",  sortOrder: 6 },
    { city: "De Lier",            sortOrder: 7 },
    { city: "Den Hoorn",          sortOrder: 8 },
  ];
  for (const c of cities) {
    await prisma.cityRoute.upsert({
      where: { tenantId_city: { tenantId: tid, city: c.city } },
      update: { sortOrder: c.sortOrder },
      create: { tenantId: tid, ...c },
    });
  }

  console.log("✓ Meneer Leffers seed complete");
  console.log(`  Tenant: ${tenant.slug}`);
  console.log(`  Bread types: ${breadData.length}`);
  console.log(`  Customers: ${customerData.length}`);
  console.log(`  Recurring orders: ${recurring.length}`);

  // Print one-time setup links so the first login is possible
  const ownerLink = await makeSetupLink(owner.id);
  const workerLink = await makeSetupLink(worker.id);
  console.log("");
  console.log("── First-time login setup ──────────────────────────────");
  if (ownerLink) console.log(`  Owner (${owner.email}):  ${ownerLink}`);
  else console.log(`  Owner (${owner.email}): already has a password — log in normally.`);
  if (workerLink) console.log(`  Worker (${worker.email}): ${workerLink}`);
  else console.log(`  Worker (${worker.email}): already has a password — log in normally.`);
  console.log("Open these links to set a password, then log in at /digitalbakery/login");
  console.log("───────────────────────────────────────────────────────");
}

main().catch(console.error).finally(() => prisma.$disconnect());

// This line is intentionally empty - city routes are seeded below in the main function
