/**
 * The order the Recepten page shows bread types in: grouped by category (categories in order
 * of first appearance when sorted by sortOrder), sortOrder within a category, name as the
 * tie-break. Lists that should "look like Recepten" (e.g. the availability manager) use this
 * so toggling a box never reshuffles rows — equal sortOrders used to come back in whatever
 * order Postgres felt like, which changed after every update.
 */
export function sortLikeRecepten<T extends { category: string; sortOrder: number; name: string }>(list: T[]): T[] {
  const base = [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const cats = [...new Set(base.map(b => b.category))];
  return cats.flatMap(c => base.filter(b => b.category === c));
}
