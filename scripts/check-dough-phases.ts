/** Self-check for the phase maths against the Rogge 3 fase sheet. Run: npx tsx scripts/check-dough-phases.ts */
import { parsePhases, resolvePhases, phaseTotals } from "../src/lib/dough-phases";

const assert = (c: boolean, m: string) => { if (!c) throw new Error(`FAILED: ${m}`); console.log(`ok: ${m}`); };
const mix = (name: string, ingredients: any[], daysBefore = 0) => ({ name, kind: "mix", daysBefore, timing: "", instructions: "", ingredients });

const phases = parsePhases([
  mix("Stap 1", [{ name: "Roggemeel", grams: 150 }, { name: "Water", grams: 90 }, { name: "Actieve rijpe starter", grams: 8 }]),
  mix("Stap 2", [{ name: "Roggemeel", grams: 300 }, { name: "Water", grams: 300 }, { carryOver: true }]),
  mix("Stap 3", [{ name: "Roggemeel", grams: 400 }, { name: "Tarwebloem", grams: 150 }, { name: "Water", grams: 450 }, { name: "Zout", grams: 20 }, { carryOver: true }]),
  { name: "Bakken", kind: "bake", ingredients: [{ name: "ignored", grams: 5 }], instructions: "Oven 270" },
]);

const one = resolvePhases(phases);
assert(one[0].totalGrams === 248, "stap 1 = 248 g");
assert(one[1].ingredients[2].grams === 248 && one[1].totalGrams === 848, "stap 2 takes stap 1 whole (248) → 848 g");
assert(one[2].ingredients[4].grams === 848, "stap 3 takes stap 2 whole (848)");
assert(one[3].ingredients.length === 0, "bake phase has no ingredients");

const t = phaseTotals(one);
const g = (n: string) => t.ingredients.find(i => i.name === n)?.grams;
assert(g("Roggemeel") === 850 && g("Water") === 840 && g("Tarwebloem") === 150 && g("Zout") === 20, "totals: rogge 850, water 840, tarwebloem 150, zout 20");

const five = resolvePhases(phases, 5);
assert(five[1].ingredients[2].grams === 1240 && five[1].totalGrams === 4240 && five[2].totalGrams === 9340, "scales linearly with loaves (carry-over too): 5 loaves → 1240 / 4240 / 9340 g");
assert(five[0].ingredients[0].grams === 750, "5 loaves → 750 g roggemeel in step 1");
assert(parsePhases("junk").length === 0 && parsePhases([{ nope: 1 }]).length === 0, "garbage JSON parses to no phases");
const sprout = resolvePhases(parsePhases([mix("Kiem", [{ name: "Droge rogge", grams: 130, noTotal: true }], 5), mix("Deeg", [{ name: "Meel", grams: 100 }])]), 2);
assert(sprout[0].totalGrams === 0 && sprout[0].ingredients[0].grams === 260 && phaseTotals(sprout).totalGrams === 200, "noTotal ingredient scales but doesn't count in the weight");
assert(parsePhases([{ name: "x", daysBefore: 5 }])[0].daysBefore === 5 && parsePhases([{ name: "x", daysBefore: 99 }])[0].daysBefore === 7, "daysBefore 0..7, clamped");
console.log("All checks passed.");
