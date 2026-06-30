// ─────────────────────────────────────────────────────────────────────────────
// BAKERY CONFIG — edit this file per deployment to set up a new bakery.
// Everything bakery-specific (name, shops, branding) lives here so the rest
// of the codebase stays generic and reusable.
// ─────────────────────────────────────────────────────────────────────────────

export type ShopConfig = {
  /** Must match the Customer.name in the database exactly */
  name: string;
  /** Used for weather lookups on the Winkel page */
  lat: number;
  lon: number;
};

export const bakeryConfig = {
  /** Product/platform name shown on the login screen and browser tab */
  productName: "Sirdough",

  /** Display name shown in sidebar, page titles (the bakery's own brand) */
  businessName: "Meneer Leffers",

  /** Short tagline under the logo in the sidebar */
  tagline: "bakkerij beheer",

  /**
   * Shop locations with daily winkel production templates.
   * Leave empty array [] for bakeries with no shop / horeca-only.
   * Each shop must exist as a Customer record (see seed script) with
   * a matching `name` so winkel templates and facturatie can link to it.
   */
  shops: [
    { name: "Winkel Delft",     lat: 52.0021, lon: 4.3698 },  // Delfgauwseweg 67
    { name: "Winkel Den Haag",  lat: 52.0798, lon: 4.3127 },  // Herengracht 16
    { name: "Winkel Rotterdam", lat: 51.9225, lon: 4.4792 },
  ] as ShopConfig[],

  /**
   * Whether this bakery does horeca/delivery routes.
   * If false, the Bezorgen page and recurring-order delivery features
   * are hidden from navigation (bakeries can still use them later if
   * customers are added — this only controls default visibility).
   */
  hasDelivery: true,

  /** Default bread categories shown when creating new bread types */
  defaultCategories: ["boeren", "baguette", "spelt", "volkoren", "rogge", "zoet"],

  /** Cutoff time (24h) for customer order changes — day before delivery */
  orderCutoffHour: 4,

  /**
   * Email of the permanent admin/developer account for this deployment.
   * This account can never be deleted, deactivated, or have its role
   * changed away from OWNER, regardless of how many other owners exist —
   * it's the guaranteed way back in if something goes wrong with the
   * bakery's own accounts. Set this to your own email, then create the
   * account via the Team page (e.g. name it "Bart (ontwikkelaar — support)"
   * so it's clear to the bakery owner what it's for).
   */
  protectedAdminEmail: "bdb785@gmail.com",

  /** Bakery address shown on the map and used as route start point */
  bakeryAddress: "De Weegbreestraat 23a, Rotterdam",
  bakeryLat: 51.966196,
  bakeryLng: 4.463144,
} as const;

/** Convenience: shop names only, for places that need a simple list */
export const SHOP_NAMES = bakeryConfig.shops.map(s => s.name);
