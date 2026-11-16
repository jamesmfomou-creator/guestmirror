import type { EventRow } from "./analytics";
import { proportion, type Proportion } from "./paywallExperimentStats";
import { OFFER_IDS, PRICING_VERSION, type OfferId } from "@/lib/plans";

// Pricing v2 dashboard figures, per offer. Pure (unit-tested).
//
// Only the current pricing version counts: client events carry
// pricing_version; server payment events (written by the Stripe webhook)
// carry the offer they were bought with, which only v2 checkouts set.
// Purchases are payment events confirmed by Stripe -- never a redirect.

export interface OfferFigures {
  clicks: number;
  checkoutsStarted: number;
  /** Confirmed first purchases (subscription start for Conciergerie). */
  purchases: number;
  /** Conciergerie only: paid renewals. */
  renewals: number;
  revenue: number;
  /** Visitors who bought this offer / visitors who saw the paywall. */
  conversionPerPaywallViewer: Proportion;
}

export interface OfferStats {
  pricingVersion: string;
  paywallViewers: number;
  byOffer: Record<OfferId, OfferFigures>;
  creditsUsed: number;
  paymentFailures: number;
  refunds: number;
  disputes: number;
}

function meta(row: EventRow, key: string): unknown {
  return row.metadata?.[key];
}

function num(row: EventRow, key: string): number {
  const v = meta(row, key);
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function visitorOf(row: EventRow): string {
  return row.anonymous_id || row.session_id || "unknown";
}

function isV2(row: EventRow): boolean {
  if (meta(row, "pricing_version") === PRICING_VERSION) return true;
  const offer = meta(row, "offer");
  return typeof offer === "string" && (OFFER_IDS as readonly string[]).includes(offer);
}

export function computeOfferStats(allRows: EventRow[]): OfferStats {
  const rows = allRows.filter(isV2);
  const of = (name: string) => rows.filter((r) => r.event_name === name);
  const paywallViewers = new Set(of("paywall_viewed").map(visitorOf)).size;

  const firstPurchaseRows: Record<OfferId, EventRow[]> = {
    one_time: of("one_time_payment_completed").filter((r) => meta(r, "offer") === "one_time"),
    lifetime: of("lifetime_payment_completed").filter((r) => meta(r, "offer") === "lifetime"),
    conciergerie: of("subscription_started").filter((r) => meta(r, "offer") === "conciergerie"),
  };
  const renewalRows = of("subscription_renewed").filter((r) => meta(r, "offer") === "conciergerie");

  const byOffer = {} as Record<OfferId, OfferFigures>;
  for (const offer of OFFER_IDS) {
    const purchases = firstPurchaseRows[offer];
    const firstRevenue = purchases.reduce(
      (sum, r) => sum + (offer === "conciergerie" ? num(r, "price") : num(r, "amount") / 100),
      0
    );
    const renewals = offer === "conciergerie" ? renewalRows : [];
    const renewalRevenue = renewals.reduce((sum, r) => sum + num(r, "amount") / 100, 0);
    const buyers = new Set(purchases.map(visitorOf)).size;
    byOffer[offer] = {
      clicks: of("unlock_clicked").filter((r) => meta(r, "plan") === offer).length,
      checkoutsStarted: of("checkout_started").filter((r) => meta(r, "plan") === offer).length,
      purchases: purchases.length,
      renewals: renewals.length,
      revenue: firstRevenue + renewalRevenue,
      conversionPerPaywallViewer: proportion(buyers, paywallViewers),
    };
  }

  return {
    pricingVersion: PRICING_VERSION,
    paywallViewers,
    byOffer,
    creditsUsed: of("subscription_credit_used").length,
    paymentFailures: of("payment_failed").length,
    refunds: of("payment_refunded").length,
    disputes: of("payment_disputed").length,
  };
}

export function emptyOfferStats(): OfferStats {
  return computeOfferStats([]);
}
