/**
 * Multi-step dough recipes ("Rogge 3 fase": voordeeg → tussendeeg → eindeeg → bakken).
 * Stored as JSON on DoughType.phases. Amounts are GRAMS PER LOAF; the production sheet
 * multiplies by the number of loaves. Shared by the recipe editor, the recipe view and the
 * production plan, so the carry-over maths lives in one place.
 */

export type PhaseIngredient = {
  name: string;
  grams: number;
  /** "Volledige stap N": the whole previous mixing phase goes in. grams is ignored, the amount is derived. */
  carryOver?: boolean;
};

export type DoughPhase = {
  name: string;            // "Stap 1", "Bakken"
  kind: "mix" | "bake";    // bake = instructions only, no ingredients
  /** 0 = done on the production day, 1 = the day before (shows up in "voor morgen klaarzetten"). */
  daysBefore: 0 | 1;
  timing: string;          // free text: "overnacht 15-18 uur", "3 uur laten staan"
  instructions: string;    // one step per line
  ingredients: PhaseIngredient[];
};

export type ResolvedIngredient = { name: string; grams: number; carryOver: boolean };
export type ResolvedPhase = Omit<DoughPhase, "ingredients"> & { ingredients: ResolvedIngredient[]; totalGrams: number };

/** Tolerant read of the JSON column — never throws, drops anything malformed. */
export function parsePhases(raw: unknown): DoughPhase[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((p: any): DoughPhase[] => {
    if (!p || typeof p !== "object" || typeof p.name !== "string") return [];
    const kind = p.kind === "bake" ? "bake" : "mix";
    return [{
      name: p.name,
      kind,
      daysBefore: p.daysBefore === 1 ? 1 : 0,
      timing: typeof p.timing === "string" ? p.timing : "",
      instructions: typeof p.instructions === "string" ? p.instructions : "",
      ingredients: kind === "bake" || !Array.isArray(p.ingredients) ? [] : p.ingredients.flatMap((i: any): PhaseIngredient[] =>
        i && typeof i === "object"
          ? [{ name: typeof i.name === "string" ? i.name : "", grams: Math.max(0, Number(i.grams) || 0), carryOver: !!i.carryOver }]
          : []),
    }];
  });
}

/** Scale to `loaves` and resolve carry-over lines ("volledige stap 1" = everything in the previous mixing phase). */
export function resolvePhases(phases: DoughPhase[], loaves = 1): ResolvedPhase[] {
  let prevTotal = 0;
  let prevName = "";
  return phases.map(p => {
    const ingredients: ResolvedIngredient[] = p.ingredients.map(i =>
      i.carryOver
        ? { name: `Volledige ${prevName.toLowerCase() || "vorige stap"}`, grams: prevTotal, carryOver: true }
        : { name: i.name, grams: i.grams * loaves, carryOver: false });
    const totalGrams = ingredients.reduce((s, i) => s + i.grams, 0);
    if (p.kind === "mix" && ingredients.length > 0) { prevTotal = totalGrams; prevName = p.name; }
    return { ...p, ingredients, totalGrams };
  });
}

/** Whole-recipe totals per ingredient (carry-over lines skipped — they'd count everything twice). */
export function phaseTotals(resolved: ResolvedPhase[]): { ingredients: { name: string; grams: number }[]; totalGrams: number } {
  const byName = new Map<string, { name: string; grams: number }>();
  for (const p of resolved) for (const i of p.ingredients) {
    if (i.carryOver || !i.name.trim()) continue;
    const key = i.name.trim().toLowerCase();
    const cur = byName.get(key);
    if (cur) cur.grams += i.grams; else byName.set(key, { name: i.name.trim(), grams: i.grams });
  }
  const ingredients = [...byName.values()];
  return { ingredients, totalGrams: ingredients.reduce((s, i) => s + i.grams, 0) };
}

export const fmtGrams = (g: number) => `${Math.round(g * 10) / 10} g`;
