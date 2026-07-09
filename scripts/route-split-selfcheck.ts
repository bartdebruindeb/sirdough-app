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

// The bakery is never injected as a stop — the route is delivery addresses only, and
// the driver's own current location is the origin. (Regression: the bakery address was
// force-appended as the destination and Google rendered it as a stray "Rotterdam" pin.)
for (const url of big) {
  assert.ok(!decodeURIComponent(url).includes("Weegbreestraat"), `no segment routes through the bakery: ${url}`);
  assert.ok(url.includes("origin=My+Location"), "every segment starts from the driver's current location");
}
// Each segment's destination is its own last delivery stop, not a shared endpoint.
assert.ok(decodeURIComponent(big[big.length - 1]).includes("Straat 19 1"), "last segment ends at the final delivery stop");

// No rows with no address -> no links at all (nothing to route).
assert.deepEqual(buildMapsUrls([]), [], "no stops -> no links");

// Every stop must include its postcode, not just the bare street name -- a street
// name alone is ambiguous (many exist in multiple Dutch cities) and Google Maps can
// resolve to the wrong city with nothing else to disambiguate it by. This is the
// reported bug: street name correct, city wrong.
const withPostcode = buildMapsUrls([{
  customerId: "c1", name: "Klant", city: "Den Haag", address: "Herengracht 16",
  cityOrder: 0, notes: "", isShop: false, lat: null, lng: null,
  postalCode: "2511 EG", email: null, phone: null, quantities: {}, pickupLocation: null,
}]);
const decoded = decodeURIComponent(withPostcode[0]);
assert.ok(decoded.includes("2511 EG"), "the stop's postcode must be sent to Google Maps, not just the street name");
assert.ok(decoded.includes("Den Haag"), "the stop's city must be sent to Google Maps too");

console.log("route-split-selfcheck: all assertions passed");
