/**
 * Self-check for buildMapsUrls (src/app/bezorgen/page.tsx) — splits a delivery route
 * into multiple Google Maps links so a route with more stops than Google's consumer
 * dir/ link supports (~10 total) doesn't silently drop the tail of the list.
 * Run: npx tsx scripts/route-split-selfcheck.ts
 */
import assert from "node:assert";
import { buildMapsUrls, MAX_WAYPOINTS_PER_SEGMENT, type DeliveryRow } from "../src/app/bezorgen/routeSplit";

function rows(n: number): DeliveryRow[] {
  return Array.from({ length: n }, (_, i) => ({
    customerId: `c${i}`, name: `Klant ${i}`, city: "Rotterdam", address: `Straat ${i} 1`,
    cityOrder: 0, notes: "", isShop: false, lat: null, lng: null,
    postalCode: null, email: null, phone: null, quantities: {}, pickupLocation: null,
  }));
}

function stopCount(url: string): number {
  // origin (1) + waypoints (split on |) + destination (1)
  const wp = url.match(/waypoints=([^&]*)/)?.[1];
  const waypointCount = wp ? decodeURIComponent(wp).split("|").length : 0;
  return 1 + waypointCount + 1;
}

// A route within the limit stays a single link, unchanged from the old behavior.
const small = buildMapsUrls(rows(5));
assert.equal(small.length, 1, "5 stops fit in one link");
assert.ok(stopCount(small[0]) <= 10, "single-link route stays under Google's stop limit");

// A route with more stops than one link can hold splits into multiple links, each
// individually under the limit -- this is the actual bug being fixed: previously a
// single link silently dropped stops beyond ~10.
const big = buildMapsUrls(rows(20));
assert.ok(big.length > 1, "20 stops must split into multiple links, not one truncated link");
for (const url of big) {
  assert.ok(stopCount(url) <= MAX_WAYPOINTS_PER_SEGMENT + 2, `every segment stays under the per-link limit: ${url}`);
}

// No address left behind: every one of the 20 addresses must appear in exactly one
// segment's waypoints or destination across the whole split.
const allEncoded = big.join("&&&");
for (let i = 0; i < 20; i++) {
  const needle = encodeURIComponent(`Straat ${i} 1`);
  assert.ok(allEncoded.includes(needle), `stop ${i} must appear somewhere across the split links`);
}

// Only the final segment ends at the bakery; earlier segments end at their own last stop.
assert.ok(decodeURIComponent(big[big.length - 1]).includes("De Weegbreestraat"), "last segment's destination is the bakery");
assert.ok(!decodeURIComponent(big[0]).includes("De Weegbreestraat"), "non-final segments do not route back to the bakery early");

// No rows with no address -> no links at all (nothing to route).
assert.deepEqual(buildMapsUrls([]), [], "no stops -> no links");

console.log("route-split-selfcheck: all assertions passed");
