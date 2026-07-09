export type DeliveryRow = {
  customerId: string; name: string; city: string; address: string;
  cityOrder: number; notes: string; isShop: boolean;
  lat: number | null; lng: number | null;
  postalCode: string | null; email: string | null; phone: string | null;
  quantities: Record<string, number>;
  pickupLocation: string | null;
};

// Google Maps' consumer dir/ link (and the app it deep-links into) silently drops or
// refuses stops beyond roughly 10 total (origin + waypoints + destination) — with more
// delivery addresses than that, the driver would open a route missing the tail end of
// the list with no warning. Bypass by splitting into multiple links of at most
// MAX_WAYPOINTS_PER_SEGMENT waypoints each (well under the limit), same technique as
// https://www.windowsdigitals.com/google-maps-add-more-than-10-stops/ — each link's own
// destination becomes the end of that chunk, so the driver opens link 1, delivers that
// stretch, then opens link 2 starting from wherever they physically are (origin stays
// "My Location" each time — GPS-based, no need to chain an explicit start address).
export const MAX_WAYPOINTS_PER_SEGMENT = 8;

// origin=My+Location: Google Maps starts the route from the driver's current GPS
// position and uses it to order the stops. If the driver denies location access,
// Maps just asks them to pick a start — we don't inject the bakery as a fake first/last
// stop, since it isn't a delivery address and showed up as a stray "Rotterdam" pin.
const ORIGIN = "My+Location";

// The street name alone is ambiguous — many Dutch street names (e.g. "Herengracht")
// exist in multiple cities, and Google Maps has to guess which one without more
// context, sometimes guessing wrong. Postcode is the precise disambiguator (same
// reason PDOK's own lookups key on postcode + huisnummer), so every stop always
// includes it alongside the street/city for a human-readable destination label.
function fullAddress(r: DeliveryRow): string {
  return [r.address, r.postalCode, r.city].filter(Boolean).join(", ");
}

export function buildMapsUrls(rows: DeliveryRow[]): string[] {
  const addresses = rows.filter(r => r.address).map(r => encodeURIComponent(fullAddress(r)));
  if (addresses.length === 0) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < addresses.length; i += MAX_WAYPOINTS_PER_SEGMENT) {
    chunks.push(addresses.slice(i, i + MAX_WAYPOINTS_PER_SEGMENT));
  }

  return chunks.map(chunk => {
    // Every chunk drives through its addresses and ends AT its own last delivery stop
    // (so that stop is the destination, not also a waypoint). No bakery endpoint — the
    // route is delivery stops only, started from the driver's current location.
    const stops = chunk.slice(0, -1);
    const destination = chunk[chunk.length - 1];
    let url = `https://www.google.com/maps/dir/?api=1&origin=${ORIGIN}&destination=${destination}`;
    if (stops.length > 0) url += `&waypoints=${stops.join("|")}`;
    url += "&travelmode=driving";
    return url;
  });
}
