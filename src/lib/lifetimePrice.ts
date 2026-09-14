import { getStripe } from "@/lib/stripe";
import { LIFETIME_CONFIGURED } from "@/lib/env";

/**
 * The Lifetime price is intentionally never hardcoded (see
 * STRIPE_PRICE_LIFETIME in .env.example) -- it's read live from the Stripe
 * Price object so changing it in Stripe is enough, no deploy required.
 * Cached in-memory for a few minutes so pages that render pricing (landing,
 * /pricing, every result page) don't each make their own Stripe API call.
 */
let cached: { label: string | null; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getLifetimePriceLabel(): Promise<string | null> {
  if (!LIFETIME_CONFIGURED) return null;
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.label;

  try {
    const stripe = getStripe();
    const price = await stripe.prices.retrieve(process.env.STRIPE_PRICE_LIFETIME!);
    const label =
      price.unit_amount != null
        ? new Intl.NumberFormat("fr-FR", {
            style: "currency",
            currency: (price.currency || "eur").toUpperCase(),
          }).format(price.unit_amount / 100)
        : null;
    cached = { label, fetchedAt: Date.now() };
    return label;
  } catch {
    cached = { label: null, fetchedAt: Date.now() };
    return null;
  }
}
