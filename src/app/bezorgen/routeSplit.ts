import { bakeryConfig } from "@/config/bakery.config";

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

export function buildMapsUrls(rows: DeliveryRow[]): string[] {
  const addresses = rows.filter(r => r.address).map(r => encodeURIComponent(r.address));
  if (addresses.length === 0) return [];

  const bakeryDest = encodeURIComponent(bakeryConfig.bakeryAddress);
  const chunks: string[][] = [];
  for (let i = 0; i < addresses.length; i += MAX_WAYPOINTS_PER_SEGMENT) {
    chunks.push(addresses.slice(i, i + MAX_WAYPOINTS_PER_SEGMENT));
  }

  return chunks.map((chunk, i) => {
    const isLastChunk = i === chunks.length - 1;
    // Every chunk but the last drives through all its addresses and ends AT the last
    // one (so it's not also listed as a waypoint); the final chunk's destination is
    // always the bakery, same as the single-link version.
    const stops = isLastChunk ? chunk : chunk.slice(0, -1);
    const destination = isLastChunk ? bakeryDest : chunk[chunk.length - 1];
    let url = `https://www.google.com/maps/dir/?api=1&origin=My+Location&destination=${destination}`;
    if (stops.length > 0) url += `&waypoints=${stops.join("|")}`;
    url += "&travelmode=driving";
    return url;
  });
}
