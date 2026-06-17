import { prisma } from "@/server/config/db";
import { bakeryConfig } from "@/config/bakery.config";

export type FlourComponent = { name: string; percentage: number };
export type Topping = { name: string; gramsPerLoaf: number; waterRatio?: number | null };

export type BreadLine = {
  breadTypeId: string;
  slug: string;
  name: string;
  category: string;
  sortOrder: number;
  basketType: string | null;
  basketStyle: string | null;
  winkelQty: number;
  winkelDelftQty: number;
  winkelDHQty: number;
  horecaQty: number;
  totalQty: number;
  doughWeightTotal: number;
  flourWeightTotal: number;
  toppingWeightPerLoaf: number;
  toppings: Topping[];
  isBoerenMixPart: boolean;
};

export type RecipeInfo = {
  waterPct: number; desemPct: number; zoutPct: number; inwasPct: number;
  flourLines: FlourComponent[];
};

export type MixerGroup = {
  group: string;
  label: string;
  totalLoaves: number;
  totalDoughKg: number;        // total dough including fillings
  totalDoughNoFillingsKg: number; // dough without fillings (base deeg)
  flourWeightKg: number;
  recipe: RecipeInfo | null;
  lines: BreadLine[];
};

export type ProductionPlan = {
  tenantId: string;
  productionDate: string;
  deliveryDate: string;
  weekday: number;
  breadLines: BreadLine[];
  mixerGroups: MixerGroup[];
  notes: string;
};

function getWeekday(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00Z");
  const jsDay = d.getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

export async function getProductionPlan(tenantId: string, productionDate: string): Promise<ProductionPlan> {
  const weekday = getWeekday(productionDate);
  // Productie = dag vóór bakken/bezorgen. Deeg 18u in koeling.
  const bakkDate = new Date(productionDate + "T12:00:00Z");
  bakkDate.setUTCDate(bakkDate.getUTCDate() + 1);
  const deliveryDate = bakkDate.toISOString().slice(0, 10);
  const deliveryWeekday = getWeekday(deliveryDate);

  const breadTypes = await prisma.breadType.findMany({
    where: { tenantId, active: true, showInProduction: true },
    include: {
      doughType: { include: { flourLines: { orderBy: { sortOrder: "asc" } } } },
      recipe: {
        include: {
          flourLines: { orderBy: { sortOrder: "asc" } },
          toppings:   { orderBy: { sortOrder: "asc" } },
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  // Winkel quantities: prefer WinkelLog for delivery date if saved, else fall back to template
  const winkelLogs = await prisma.winkelLog.findMany({
    where: {
      tenantId,
      date: {
        gte: new Date(deliveryDate + "T00:00:00Z"),
        lte: new Date(deliveryDate + "T23:59:59Z"),
      },
    },
  });

  const slugToId: Record<string, string> = {};
  for (const bt of breadTypes) slugToId[bt.slug] = bt.id;

  // Get winkel templates for each configured shop
  const shopTemplates = await Promise.all(
    bakeryConfig.shops.map(shop =>
      prisma.winkelTemplate.findMany({ where: { tenantId, shopName: shop.name, weekday: deliveryWeekday } })
    )
  );

  // Per-shop quantity maps, keyed by shop name
  const winkelByShop: Record<string, Record<string, number>> = {};
  for (const shop of bakeryConfig.shops) winkelByShop[shop.name] = {};
  const winkelMap: Record<string, number> = {};

  if (winkelLogs.length > 0) {
    for (const log of winkelLogs) {
      const quantities = log.quantities as Record<string, number>;
      if (!winkelByShop[log.shopName]) winkelByShop[log.shopName] = {};
      for (const [slug, qty] of Object.entries(quantities)) {
        const btId = slugToId[slug];
        if (!btId) continue;
        winkelMap[btId] = (winkelMap[btId] ?? 0) + qty;
        winkelByShop[log.shopName][btId] = (winkelByShop[log.shopName][btId] ?? 0) + qty;
      }
    }
  } else {
    bakeryConfig.shops.forEach((shop, i) => {
      for (const row of shopTemplates[i]) {
        winkelByShop[shop.name][row.breadTypeId] = (winkelByShop[shop.name][row.breadTypeId] ?? 0) + row.quantity;
        winkelMap[row.breadTypeId] = (winkelMap[row.breadTypeId] ?? 0) + row.quantity;
      }
    });
  }

  // Backwards-compat: first two configured shops map to Delft/DH columns
  // (used by the aantallen table — for bakeries with 1 or >2 shops, extra
  // shop totals are still included in winkelMap/winkelQty totals above)
  const shopNames = bakeryConfig.shops.map(s => s.name);
  const winkelDelftMap = winkelByShop[shopNames[0]] ?? {};
  const winkelDHMap = winkelByShop[shopNames[1]] ?? {};

  // Recurring orders for the delivery weekday — check exceptions for this specific date
  const recurringOrders = await prisma.recurringOrder.findMany({
    where: { tenantId, weekday: deliveryWeekday, active: true },
    include: {
      lines: true,
      exceptions: {
        where: {
          date: {
            gte: new Date(deliveryDate + "T00:00:00Z"),
            lte: new Date(deliveryDate + "T23:59:59Z"),
          },
        },
      },
    },
  });

  // Filter out recurring orders that have an exception (active: false) for this date
  const activeRecurring = recurringOrders.filter(ro => {
    const exception = ro.exceptions[0];
    if (!exception) return true; // no exception = use default (active)
    return exception.active; // exception overrides
  });
  const oneOffOrders = await prisma.oneOffOrder.findMany({
    where: {
      tenantId,
      deliveryDate: {
        gte: new Date(deliveryDate + "T00:00:00Z"),
        lte: new Date(deliveryDate + "T23:59:59Z"),
      },
    },
    include: { lines: true },
  });

  const horecaMap: Record<string, number> = {};
  for (const ro of activeRecurring)
    for (const l of ro.lines) horecaMap[l.breadTypeId] = (horecaMap[l.breadTypeId] ?? 0) + l.quantity;
  for (const oo of oneOffOrders)
    for (const l of oo.lines) horecaMap[l.breadTypeId] = (horecaMap[l.breadTypeId] ?? 0) + l.quantity;

  // Kaneel/kardemom buns made elsewhere — exclude from deeg calculator
  // Morning buns ARE boerenmix (202g/piece) — included via recipe
  const BUNS_SLUGS = new Set(["kaneel-buns","kardemom-buns"]);

  const breadLines: BreadLine[] = breadTypes.map((bt) => {
    const winkelQty = winkelMap[bt.id] ?? 0;
    const horecaQty = horecaMap[bt.id] ?? 0;
    const totalQty  = winkelQty + horecaQty;
    const recipe = bt.recipe;

    // Use doughType percentages if linked, otherwise fall back to recipe
    const pctSource = bt.doughType ?? recipe;
    const waterPct = pctSource?.waterPct ?? 71.5;
    const desemPct = pctSource?.desemPct ?? 15;
    const zoutPct  = pctSource?.zoutPct  ?? 2;
    const inwasPct = pctSource?.inwasPct ?? 6;

    // Use recipe's doughWeightPerLoaf (set per bread: 758 for KL, 1010 for GR, 1515 for 1.5kg, 500 for baguette etc.)
    // Fall back to weightGrams if no recipe
    const doughWeightPerLoaf = recipe?.doughWeightPerLoaf ?? bt.weightGrams;
    const toppingWeightPerLoaf = recipe?.toppings.reduce((s, t) => s + t.gramsPerLoaf, 0) ?? 0;
    const doughWeightTotal = totalQty * doughWeightPerLoaf;
    const totalPct = 100 + waterPct + desemPct + zoutPct + inwasPct;
    const flourWeightTotal = totalQty > 0 ? (doughWeightTotal / totalPct) * 100 : 0;

    // Flour lines: prefer doughType's, else recipe's
    const flourLines = bt.doughType?.flourLines ?? recipe?.flourLines ?? [];

    return {
      breadTypeId: bt.id,
      slug: bt.slug,
      name: bt.name,
      category: bt.category,
      sortOrder: bt.sortOrder,
      basketType: bt.basketType ?? null,
      basketStyle: bt.basketStyle ?? null,
      winkelQty,
      winkelDelftQty: winkelDelftMap[bt.id] ?? 0,
      winkelDHQty: winkelDHMap[bt.id] ?? 0,
      horecaQty,
      totalQty,
      doughWeightTotal,
      flourWeightTotal,
      toppingWeightPerLoaf,
      isBoerenMixPart: false,
      toppings: (recipe?.toppings ?? []).map(t => ({
        name: t.name,
        gramsPerLoaf: t.gramsPerLoaf,
        waterRatio: t.waterRatio,
      })),
    };
  });

  // Group by mixer group, carry recipe info
  const groupLabels: Record<string, string> = {
    boeren: "Boerenmix", baguette: "Baguettedeeg",
    spelt: "Spelt", volkoren: "Volkoren", rogge: "Rogge", buns: "Buns",
  };

  const groupMap = new Map<string, { lines: BreadLine[]; recipe: RecipeInfo | null }>();
  for (const line of breadLines) {
    const bt = breadTypes.find(b => b.id === line.breadTypeId);
    // Skip buns — not in deeg calculator
    if (BUNS_SLUGS.has(line.slug)) continue;
    // Use doughType slug as group if linked, else recipe mixerGroup
    const group = bt?.doughType?.slug ?? bt?.recipe?.mixerGroup ?? line.category;
    if (!groupMap.has(group)) {
      // Build RecipeInfo: prefer doughType, fallback to recipe
      const dt = bt?.doughType;
      const r  = bt?.recipe;
      const recipeInfo: RecipeInfo | null = (dt || r) ? {
        waterPct:   dt?.waterPct  ?? r?.waterPct  ?? 71.5,
        desemPct:   dt?.desemPct  ?? r?.desemPct  ?? 15,
        zoutPct:    dt?.zoutPct   ?? r?.zoutPct   ?? 2,
        inwasPct:   dt?.inwasPct  ?? r?.inwasPct  ?? 6,
        flourLines: (dt?.flourLines ?? r?.flourLines ?? []).map(f => ({ name: f.name, percentage: f.percentage })),
      } : null;
      groupMap.set(group, { lines: [], recipe: recipeInfo });
    }
    groupMap.get(group)!.lines.push(line);
  }

  const mixerGroups: MixerGroup[] = Array.from(groupMap.entries())
    .filter(([, { lines }]) => lines.some(l => l.totalQty > 0))
    .map(([group, { lines, recipe }]) => {
      // Only count lines that have actual dough weight (exclude buns with no recipe)
      const activeLines = lines.filter(l => l.doughWeightTotal > 0 || l.totalQty === 0);
      const totalDoughKg = activeLines.reduce((s, l) => s + l.doughWeightTotal, 0) / 1000;
      const totalToppingKg = activeLines.reduce((s, l) => s + l.toppingWeightPerLoaf * l.totalQty, 0) / 1000;
      const flourWeightKg = activeLines.reduce((s, l) => s + l.flourWeightTotal, 0) / 1000;
      return {
        group,
        label: groupLabels[group] ?? group,
        totalLoaves: activeLines.filter(l => l.doughWeightTotal > 0).reduce((s, l) => s + l.totalQty, 0),
        totalDoughKg,
        totalDoughNoFillingsKg: totalDoughKg - totalToppingKg,
        flourWeightKg,
        recipe,
        lines,
      };
    });

  return { tenantId, productionDate, deliveryDate, weekday, breadLines, mixerGroups, notes: "" };
}

export async function getTenantIdBySlug(slug: string): Promise<string | null> {
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  return tenant?.id ?? null;
}
