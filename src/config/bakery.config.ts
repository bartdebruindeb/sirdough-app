// ─────────────────────────────────────────────────────────────────────────────
// BAKERY CONFIG — edit this file per deployment to set up a new bakery.
// Everything bakery-specific (name, branding) lives here so the rest of the
// codebase stays generic and reusable. Shops/pickup locations are no longer
// configured here — they're owner-managed on the Winkel page (see
// src/server/lib/shops.ts).
// ─────────────────────────────────────────────────────────────────────────────

export const bakeryConfig = {
  /** Product/platform name shown on the login screen and browser tab */
  productName: "Sirdough",

  /** Display name shown in sidebar, page titles (the bakery's own brand) */
  businessName: "Meneer Leffers",

  /** Short tagline under the logo in the sidebar */
  tagline: "bakkerij beheer",

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

  /** Contact e-mail for privacy/data requests. A platform address (not the bakery's own),
   * so it never reveals which bakkerij this deployment is. */
  contactEmail: "info@sirdough.com",

  /** Bakery address shown on the map and used as route start point */
  bakeryAddress: "De Weegbreestraat 23a, Rotterdam",
  bakeryLat: 51.966196,
  bakeryLng: 4.463144,

  // ── Exact Online booking codes (from the bakery's own Exact administration) ──
  /** Grootboekrekening (revenue/omzet account) sales invoices book to. For a bakery this
   * is usually the 9%/laag-tarief omzet account (e.g. "8010"). Confirm with the owner's
   * accountant — a wrong code makes invoice creation fail with "No GLAccount found". */
  exactRevenueGLCode: "8000",
  /** The 9% (laag tarief) BTW code in the bakery's Exact administration. Read it off
   * Exact's BTW-codes list. Leave "" to send no VAT code (Exact then applies its default). */
  exactVatCodeLow: "",
} as const;
