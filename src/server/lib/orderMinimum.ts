/**
 * Pure minimum-delivery-amount math, split out from the DB-fetching wrapper in
 * mijn/bestellingen/route.ts so the actual pricing/discount/pickup-exemption logic can
 * be tested without a database. Pickup is always exempt from the minimum; delivery
 * orders totalling less than `min` (and more than zero — an all-zero basket isn't a
 * "too small" order, it's an empty one, handled elsewhere) are rejected.
 */
export function isBelowMinimumDelivery(
  activeLines: { breadTypeId: string; quantity: number }[],
  priceById: Map<string, number>,
  discountPercent: number,
  pickupLocation: string | null | undefined,
  min: number | null,
): boolean {
  if (pickupLocation || min === null || activeLines.length === 0) return false;
  const total = activeLines.reduce((sum, l) => sum + (priceById.get(l.breadTypeId) ?? 0) * l.quantity * (1 - discountPercent / 100), 0);
  return total > 0 && total < min;
}
