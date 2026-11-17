// GuestMirror offers and their Stripe prices -- the single place that maps an
// offer to a price and a price back to what it grants.
//
// Pricing v2 (2026-11): Analyse unique 7,90 €, Conciergerie 34,90 €/mois (20
// analyses per paid month), Accès à vie 89 € (unlimited). Earlier prices stay
// listed as LEGACY so that what their buyers were promised keeps working:
//  - legacy one-time 4,90 €: the report bought stays unlocked;
//  - legacy Plus 6,90 €/mois: unlimited unlocks while the subscription is
//    active, unchanged (never migrated to the new price);
//  - legacy Lifetime 89 € (never sold): same rights as the new lifetime.
//
// Price ids are not secrets; they live here (server side) rather than in new
// environment variables. The browser only ever sends an OfferId: the server
// picks the price, never trusting a price id or an amount from a client.
//
// Server-only constants are safe to import client side (they are public
// ids), but nothing here talks to Stripe.

export const PRICING_VERSION = "v2_2026_11";

export type OfferId = "one_time" | "conciergerie" | "lifetime";
export const OFFER_IDS: readonly OfferId[] = ["one_time", "conciergerie", "lifetime"];

export interface Offer {
  id: OfferId;
  name: string;
  /** Euros, for display and analytics only -- Stripe charges the price object. */
  amountEur: number;
  checkoutMode: "payment" | "subscription";
  /** Analyses per paid period; null = unlimited / not applicable. */
  quotaPerPeriod: number | null;
}

export const OFFERS: Record<OfferId, Offer> = {
  one_time: { id: "one_time", name: "Analyse unique", amountEur: 7.9, checkoutMode: "payment", quotaPerPeriod: null },
  conciergerie: { id: "conciergerie", name: "Conciergerie", amountEur: 34.9, checkoutMode: "subscription", quotaPerPeriod: 20 },
  lifetime: { id: "lifetime", name: "Accès à vie", amountEur: 89, checkoutMode: "payment", quotaPerPeriod: null },
};

export const CONCIERGERIE_QUOTA = OFFERS.conciergerie.quotaPerPeriod as number;

export type StripeMode = "live" | "test";

/** Current prices, per Stripe mode. Test ids are created in test mode only. */
const CURRENT_PRICES: Record<StripeMode, Record<OfferId, string | null>> = {
  live: {
    one_time: "price_1UcTtsAV5mFz3N4Js4TLWrR0",
    conciergerie: "price_1UcTwoAV5mFz3N4JQYUbaTPp",
    lifetime: "price_1UcU09AV5mFz3N4JYNji7dIG",
  },
  // Created in Stripe test mode (2026-11-16) for end-to-end tests; no money.
  test: {
    one_time: "price_1UcUuCAV5mFz3N4J9TJ9eKXL",
    conciergerie: "price_1UcUuCAV5mFz3N4JQeP49r9B",
    lifetime: "price_1UcUuDAV5mFz3N4J6XWZAgDW",
  },
};

/** What a price grants, for every price GuestMirror has ever sold (live). */
export type PriceKind =
  | { kind: "current"; offer: OfferId }
  | { kind: "legacy_one_time" }
  | { kind: "legacy_plus" }
  | { kind: "legacy_lifetime" };

const LEGACY_PRICES: Record<string, PriceKind> = {
  price_1UBzIcAV5mFz3N4JSnIvEAeu: { kind: "legacy_one_time" }, // 4,90 €
  price_1UBzJDAV5mFz3N4JTA0ncCco: { kind: "legacy_plus" }, // 6,90 €/mois
  price_1UFezQAV5mFz3N4JEXfXKNCg: { kind: "legacy_lifetime" }, // 89 €, never sold
};

export function stripeModeOf(secretKey: string | undefined | null): StripeMode {
  return secretKey?.startsWith("sk_test") || secretKey?.startsWith("rk_test") ? "test" : "live";
}

/** The price to charge for an offer, or null when it is not configured in this mode. */
export function priceIdFor(offer: OfferId, mode: StripeMode): string | null {
  return CURRENT_PRICES[mode][offer];
}

export function isOfferId(value: unknown): value is OfferId {
  return typeof value === "string" && (OFFER_IDS as readonly string[]).includes(value);
}

/** What a Stripe price id grants, or null if it is not a GuestMirror price. */
export function classifyPrice(priceId: string | null | undefined): PriceKind | null {
  if (!priceId) return null;
  for (const mode of ["live", "test"] as const) {
    for (const offer of OFFER_IDS) {
      if (CURRENT_PRICES[mode][offer] === priceId) return { kind: "current", offer };
    }
  }
  return LEGACY_PRICES[priceId] ?? null;
}

// ---------------------------------------------------------------------------
// Add-on: "Pack 10 analyses supplémentaires" (one-time), for Conciergerie
// subscribers only. Bought with the first subscription payment (order bump)
// or later from the report page. Never offered with lifetime / legacy Plus.

export const ADDON_PACK = {
  name: "Pack 10 analyses supplémentaires",
  amountEur: 12.9,
  credits: 10,
} as const;

/**
 * One-time price of the pack, per Stripe mode. null = the add-on is not
 * offered in that mode (the Conciergerie checkout then works exactly as
 * before). Never use the archived recurring price price_1UcV0Z… (monthly).
 */
const ADDON_PACK_PRICES: Record<StripeMode, string | null> = {
  // prod_VdmZepPKQfMtlZ, one-time 12,90 € TTC (verified 2026-11-17).
  live: "price_1UciXzAV5mFz3N4JBykiNjyx",
  // Created in Stripe test mode (2026-11-17), one-time 12,90 € TTC.
  test: "price_1UcbgMAV5mFz3N4J1lsmELos",
};

export function addonPackPriceId(mode: StripeMode): string | null {
  return ADDON_PACK_PRICES[mode];
}

export function isAddonPackPrice(priceId: string | null | undefined): boolean {
  return Boolean(priceId) && (ADDON_PACK_PRICES.live === priceId || ADDON_PACK_PRICES.test === priceId);
}

/** Whether the add-on can be sold with the Stripe key configured on this server. */
export function addonPackAvailable(secretKey: string | undefined | null = process.env.STRIPE_SECRET_KEY): boolean {
  // Without a Stripe key (local demo) the purchase is simulated.
  if (!secretKey) return true;
  return addonPackPriceId(stripeModeOf(secretKey)) !== null;
}

/** Display label, French format: "7,90 €", "34,90 €", "89 €". */
export function formatEur(amount: number): string {
  return `${Number.isInteger(amount) ? amount : amount.toFixed(2).replace(".", ",")} €`;
}
