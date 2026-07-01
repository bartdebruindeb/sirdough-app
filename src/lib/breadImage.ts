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
export function breadImageUrls(bt: { id: string; name: string; imageFile?: string | null }): [string, string | null] {
  const uploaded = `/brood/${bt.imageFile ?? (bt.id + ".jpg")}`;
  const name = bt.name;
  const fallback = BREAD_IMAGES[name]
    ?? BREAD_IMAGES[name.replace(/\s*\d[,.\d]*\s*(kg|KG|g|gr)\s*$/i, "").trim()]
    ?? null;
  return [uploaded, fallback ? `/brood/${fallback}` : null];
}
