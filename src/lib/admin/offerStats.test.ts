import { describe, expect, it } from "vitest";
import type { EventRow } from "./analytics";
import { computeOfferStats } from "./offerStats";
import { PRICING_VERSION } from "@/lib/plans";

let clock = 0;
const row = (event_name: string, visitor: string, metadata: Record<string, unknown>): EventRow => ({
  event_name,
  anonymous_id: visitor,
  session_id: null,
  source: "direct",
  metadata,
  created_at: new Date(Date.UTC(2026, 10, 20) + clock++ * 1000).toISOString(),
});
const v2 = { pricing_version: PRICING_VERSION };

describe("computeOfferStats", () => {
  it("counts clicks, checkouts, confirmed purchases and revenue per offer", () => {
    const s = computeOfferStats([
      row("paywall_viewed", "a", v2),
      row("paywall_viewed", "b", v2),
      row("unlock_clicked", "a", { ...v2, plan: "one_time" }),
      row("checkout_started", "a", { ...v2, plan: "one_time" }),
      row("one_time_payment_completed", "a", { offer: "one_time", amount: 790 }),
      row("unlock_clicked", "b", { ...v2, plan: "conciergerie" }),
      row("subscription_started", "b", { offer: "conciergerie", plan: "conciergerie", price: 34.9 }),
      row("subscription_renewed", "b", { offer: "conciergerie", amount: 3490 }),
      row("lifetime_payment_completed", "c", { offer: "lifetime", amount: 8900 }),
    ]);
    expect(s.paywallViewers).toBe(2);
    expect(s.byOffer.one_time).toMatchObject({ clicks: 1, checkoutsStarted: 1, purchases: 1, revenue: 7.9 });
    expect(s.byOffer.conciergerie).toMatchObject({ clicks: 1, purchases: 1, renewals: 1, revenue: 69.8 });
    expect(s.byOffer.lifetime).toMatchObject({ purchases: 1, revenue: 89 });
    expect(s.byOffer.one_time.conversionPerPaywallViewer.rate).toBe(0.5);
  });

  it("ignores events from before the price change (legacy 4,90 / Plus 6,90)", () => {
    const s = computeOfferStats([
      row("unlock_clicked", "x", { plan: "one_time" }),
      row("one_time_payment_completed", "x", { plan: "one_time", amount: 490 }),
      row("subscription_started", "y", { plan: "plus", price: 6.9 }),
    ]);
    expect(s.byOffer.one_time).toMatchObject({ clicks: 0, purchases: 0, revenue: 0 });
    expect(s.byOffer.conciergerie.purchases).toBe(0);
  });

  it("never counts a checkout start as a purchase", () => {
    const s = computeOfferStats([row("checkout_started", "a", { ...v2, plan: "lifetime" })]);
    expect(s.byOffer.lifetime).toMatchObject({ checkoutsStarted: 1, purchases: 0, revenue: 0 });
  });
});
