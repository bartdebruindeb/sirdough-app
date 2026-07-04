// Map bread name → image in /brood/. Strip weight suffixes to find base name.
export const BREAD_IMAGES: Record<string, string> = {
  "Baguette Kaas Peper": "Baguette-Kaas-Peper.jpg",
  "Baguette":            "Baquette.jpg",
  "Boeren":              "Boeren-1kg.jpg",
  "Choco koek":          "Choco-koek.jpg",
  "Gekiemde Rogge":      "Gekiemde-Rogge.jpg",
  "Kaneel Bun":          "Kaneel-Bun.jpg",
  "Kardemon Bun":        "Kardemon-Bun.jpg",
  "Morning Buns":        "Morning-Buns.jpg",
  "Morning buns":        "Morning-Buns.jpg",
  "Olijf":               "Olijf.jpg",
  "Rozijn":              "Rozijn.jpg",
  "Sesam":               "Sesam.jpg",
  "Spelt":               "Spelt.jpg",
  "Volkoren":            "Volkoren.jpg",
  "Zaden":               "Zaden.jpg",
};

// Returns [primaryUrl, fallbackUrl|null]. Primary = uploaded file by ID (or imageFile), fallback = name-map.
//
// Uploaded images are served through /api/brood/<file> (reads the file fresh from disk on
// every request) rather than Next's static /public serving — `next start` doesn't reliably
// pick up files added to public/ after the server process started, only after a restart,
// which would mean a freshly uploaded photo doesn't appear until the next deploy. Static
// fallback images (the name-based BREAD_IMAGES map) never change at runtime, so they keep
// using plain /brood/ static serving.
export function breadImageUrls(bt: { id: string; name: string; imageFile?: string | null }): [string, string | null] {
  const uploaded = `/api/brood/${bt.imageFile ?? (bt.id + ".jpg")}`;
  const name = bt.name;
  const fallback = BREAD_IMAGES[name]
    ?? BREAD_IMAGES[name.replace(/\s*\d[,.\d]*\s*(kg|KG|g|gr)\s*$/i, "").trim()]
    ?? null;
  return [uploaded, fallback ? `/brood/${fallback}` : null];
}
