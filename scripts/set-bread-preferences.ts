// One-time script to populate Customer.preferredBread from a known list.
// Run with: npx tsx scripts/set-bread-preferences.ts
//
// Matches customers by name (case-insensitive, trimmed, whitespace-collapsed).
// Entries with no preference text are skipped. Any names that don't match
// an existing customer are printed at the end so they can be fixed by hand
// on the Klanten page.

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const PREFERENCES: { name: string; pref: string }[] = [
  { name: "Azurite", pref: "kilo broden, focaccia" },
  { name: "Baardman", pref: "1 kg" },
  { name: "Bar Bowie", pref: "1.5kg" },
  { name: "Bar Pulpo", pref: "sesam & zaden" },
  { name: "Barsil", pref: "baguette" },
  { name: "Bayonne restaurant", pref: "1,5 kg" },
  { name: "Blend", pref: "1,5 kg" },
  { name: "Blend Artwork", pref: "sesam 1 kg" },
  { name: "Bodegon", pref: "1 kilo" },
  { name: "Barbarossa", pref: "1.5 kg" },
  { name: "Boomhuttenclub", pref: "1,5kg sesam, zaden, 1,5kg, 1kg" },
  { name: "Booon", pref: "buns" },
  { name: "Buza", pref: "1kg" },
  { name: "Cafe Drie", pref: "1 kg" },
  { name: "Café Johannes", pref: "1,5kg" },
  { name: "Caipi Cafe", pref: "1 kg" },
  { name: "Central Park", pref: "1 kg" },
  { name: "Cozy Homemade Food", pref: "1 kg" },
  { name: "Cru", pref: "zaden / rozijn" },
  { name: "De Bongaard", pref: "1,5kg" },
  { name: "De Buurvrouw", pref: "1kg" },
  { name: "De Coterie", pref: "1.5 kg" },
  { name: "De Gist", pref: "1kg" },
  { name: "De Pizzeria", pref: "baguette" },
  { name: "De Plesman", pref: "focaccia" },
  { name: "De Wilde mossel", pref: "1,5 kg" },
  { name: "Delfts Brouwhuis", pref: "1 kg" },
  { name: "Diepnoord", pref: "1kg" },
  { name: "Fat Mermaid", pref: "1,5 kilo" },
  { name: "Flow", pref: "750gr" },
  { name: "Franklin", pref: "baguette & bollen" },
  { name: "Gaia", pref: "1,5 kg" },
  { name: "Gallery 61", pref: "1,5 kg" },
  { name: "Giraffe Coffeeroasters", pref: "buns" },
  { name: "Hanno", pref: "1,5kg" },
  { name: "Heroine", pref: "1 kg" },
  { name: "Het puntje", pref: "1,5 kg" },
  { name: "Jacob's bar & grill", pref: "1 kg" },
  { name: "Joelia", pref: "bollen" },
  { name: "Kantoor1643", pref: "1 kg" },
  { name: "Lalou", pref: "1 kg" },
  { name: "Le Frique", pref: "1 kg" },
  { name: "LOT", pref: "buns" },
  { name: "Louise", pref: "baguette / ssm" },
  { name: "Morgan en Mees", pref: "1,5 kg" },
  { name: "Niah brunch", pref: "1,5kg" },
  { name: "Palmette", pref: "1,5kg" },
  { name: "Piece of Cake", pref: "1,5kg" },
  { name: "Plenty", pref: "1 kg" },
  { name: "Putaine", pref: "1 kg" },
  { name: "Rode Rozen & Tortillas", pref: "1kg / baguette" },
  { name: "Runners", pref: "Zp/baguette" },
  { name: "Stumpf & van Dongen", pref: "1kg" },
  { name: "Supernova Hotel", pref: "1kg" },
  { name: "The Social Hub", pref: "1,5 kg" },
  { name: "Vakwerk", pref: "1,5 kg" },
  { name: "Vienna", pref: "1,5 kg" },
  { name: "Voco", pref: "1,5 kg" },
  { name: "Walter Benedict", pref: "1,5 kg" },
  { name: "Wijnbar Proef", pref: "1,5 kg, morning buns" },
  // Entries with no preference in the source list (BROOD VOOR RDAM, Heinde en
  // Verre, Meneer Leffers, New Wave catering, Pelicaan, Restaurant aan de
  // Zweth, Secrid, Susan Bijl, Website/Winkel entries) are intentionally
  // omitted — nothing to set.
];

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

async function main() {
  const customers = await prisma.customer.findMany({ select: { id: true, name: true } });
  const byName = new Map(customers.map(c => [normalize(c.name), c]));

  let updated = 0;
  const unmatched: string[] = [];

  for (const { name, pref } of PREFERENCES) {
    const match = byName.get(normalize(name));
    if (!match) { unmatched.push(name); continue; }
    await prisma.customer.update({ where: { id: match.id }, data: { preferredBread: pref } });
    updated++;
    console.log(`✓ ${match.name} → ${pref}`);
  }

  console.log(`\n${updated} klanten bijgewerkt.`);
  if (unmatched.length) {
    console.log(`\n⚠ Geen match gevonden voor (handmatig invoeren via Klanten-pagina):`);
    for (const n of unmatched) console.log(`  - ${n}`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
