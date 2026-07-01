// PDOK — official Dutch address registry, no API key required, safe to call server-side.
export async function geocodeAddress(street: string, postalCode: string, city: string): Promise<{ lat: number; lng: number } | null> {
  const q = encodeURIComponent(`${street} ${postalCode} ${city}`.trim());
  try {
    const res = await fetch(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${q}&fq=type:adres&fl=centroide_ll&rows=1`);
    const data = await res.json();
    const doc = data.response?.docs?.[0];
    const m = doc?.centroide_ll?.match(/POINT\(([^ ]+) ([^ ]+)\)/);
    if (!m) return null;
    return { lat: parseFloat(m[2]), lng: parseFloat(m[1]) };
  } catch {
    return null;
  }
}
