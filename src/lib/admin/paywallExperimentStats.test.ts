import { describe, expect, it } from "vitest";
import { isPaymentEvent, paymentEventRevenueEur, type EventRow } from "./analytics";
import {
  MIN_PAYWALL_VIEWERS,
  computePaywallExperimentStats,
  emptyPaywallExperimentStats,
  paywallVerdict,
  proportion,
} from "./paywallExperimentStats";

const helpers = { isPayment: isPaymentEvent, revenueEur: paymentEventRevenueEur };

let clock = 0;
function row(event_name: string, visitor: string, metadata: Record<string, unknown>): EventRow {
  return {
    event_name,
    anonymous_id: visitor,
    session_id: null,
    source: "direct",
    metadata,
    created_at: new Date(Date.UTC(2026, 0, 1) + clock++ * 1000).toISOString(),
  };
}

describe("proportion", () => {
  it("returns nulls without a denominator", () => {
    expect(proportion(0, 0)).toEqual({ successes: 0, trials: 0, rate: null, low: null, high: null });
  });

  it("matches the known Wilson interval for 3 out of 38", () => {
    const p = proportion(3, 38);
    expect(p.rate).toBeCloseTo(3 / 38, 10);
    expect(p.low).toBeCloseTo(0.0272, 3);
    expect(p.high).toBeCloseTo(0.2081, 3);
  });

  it("gives a non-degenerate interval at 0 % and never exceeds 100 %", () => {
    const zero = proportion(0, 20);
    expect(zero.rate).toBe(0);
    expect(zero.low).toBe(0);
    expect(zero.high).toBeGreaterThan(0.1);
    const over = proportion(7, 5);
    expect(over.rate).toBe(1);
    expect(over.high).toBe(1);
  });
});

describe("paywallVerdict", () => {
  it("refuses to conclude below the minimum number of paywall viewers", () => {
    // 1/20 against 2/18: the figures this experiment starts from.
    expect(paywallVerdict(proportion(1, 20), proportion(2, 18))).toBe("insufficient_data");
    expect(paywallVerdict(proportion(0, MIN_PAYWALL_VIEWERS - 1), proportion(90, 500))).toBe("insufficient_data");
  });

  it("is inconclusive when the intervals overlap", () => {
    expect(paywallVerdict(proportion(8, 100), proportion(13, 100))).toBe("inconclusive");
  });

  it("reports a difference only when the intervals are disjoint, in either direction", () => {
    expect(paywallVerdict(proportion(40, 500), proportion(75, 500))).toBe("difference");
    expect(paywallVerdict(proportion(75, 500), proportion(40, 500))).toBe("difference");
  });
});

describe("computePaywallExperimentStats", () => {
  it("is all zeros and insufficient on no data", () => {
    const stats = emptyPaywallExperimentStats();
    expect(stats.verdict).toBe("insufficient_data");
    expect(stats.control.visitors).toBe(0);
    expect(stats.v2.unlockPerPaywallViewer.rate).toBeNull();
    expect(stats.byAbVariant.B.v2.revenue).toBe(0);
  });

  it("buckets by paywall_variant, counts distinct visitors and ignores events without a variant", () => {
    const c = { paywall_variant: "control", ab_variant: "A" };
    const v = { paywall_variant: "v2", ab_variant: "B" };
    const rows: EventRow[] = [
      // Before the experiment: no paywall_variant.
      row("result_viewed", "old", { ab_variant: "A" }),
      row("paywall_viewed", "old", { ab_variant: "A" }),
      // Control: two visitors see the paywall, nobody clicks.
      row("analysis_completed", "c1", c),
      row("result_viewed", "c1", c),
      row("result_viewed", "c1", c), // reload: still one visitor
      row("locked_preview_viewed", "c1", c),
      row("paywall_viewed", "c1", c),
      row("result_viewed", "c2", c),
      row("paywall_viewed", "c2", c),
      // v2: two visitors see it, one clicks, starts checkout and pays.
      row("analysis_completed", "v1", v),
      row("result_viewed", "v1", v),
      row("locked_preview_viewed", "v1", v),
      row("paywall_viewed", "v1", v),
      row("unlock_clicked", "v1", v),
      row("unlock_clicked", "v1", v), // double click
      row("checkout_started", "v1", v),
      row("payment_completed", "v1", { ...v, amount: 490 }),
      row("result_viewed", "v2", v),
      row("paywall_viewed", "v2", v),
    ];
    const stats = computePaywallExperimentStats(rows, helpers);

    expect(stats.control).toMatchObject({
      visitors: 2,
      analysesCompleted: 1,
      resultsViewed: 2,
      previewsViewed: 1,
      paywallsViewed: 2,
      unlockClicks: 0,
      checkoutsStarted: 0,
      paymentsCompleted: 0,
      payingVisitors: 0,
      revenue: 0,
    });
    expect(stats.v2).toMatchObject({
      visitors: 2,
      analysesCompleted: 1,
      resultsViewed: 2,
      previewsViewed: 1,
      paywallsViewed: 2,
      unlockClicks: 1,
      checkoutsStarted: 1,
      paymentsCompleted: 1,
      payingVisitors: 1,
    });
    expect(stats.v2.revenue).toBeCloseTo(4.9, 10);
    expect(stats.v2.unlockPerPaywallViewer.rate).toBe(0.5);
    expect(stats.v2.paymentPerResultViewer.rate).toBe(0.5);
    expect(stats.v2.paymentPerAnalysis.rate).toBe(1);
    expect(stats.v2.paymentPerPaywallViewer.rate).toBe(0.5);
    expect(stats.v2.revenuePerResultViewer).toBeCloseTo(2.45, 10);
    expect(stats.control.unlockPerPaywallViewer.rate).toBe(0);

    // The 2x2 cells partition the same rows.
    expect(stats.byAbVariant.A.control.resultsViewed).toBe(2);
    expect(stats.byAbVariant.A.v2.resultsViewed).toBe(0);
    expect(stats.byAbVariant.B.v2.payingVisitors).toBe(1);
    expect(stats.byAbVariant.B.control.resultsViewed).toBe(0);

    // Two viewers per side: an observation, never a conclusion.
    expect(stats.verdict).toBe("insufficient_data");
  });

  it("counts a subscription as a payment and a double payer once in conversion", () => {
    const v = { paywall_variant: "v2", ab_variant: "A" };
    const rows: EventRow[] = [
      row("result_viewed", "v1", v),
      row("paywall_viewed", "v1", v),
      row("payment_completed", "v1", { ...v, amount: 490 }),
      row("subscription_started", "v1", { ...v, price: 6.9 }),
    ];
    const stats = computePaywallExperimentStats(rows, helpers);
    expect(stats.v2.paymentsCompleted).toBe(2);
    expect(stats.v2.payingVisitors).toBe(1);
    expect(stats.v2.revenue).toBeCloseTo(11.8, 10);
    expect(stats.v2.paymentPerPaywallViewer.rate).toBe(1);
  });
});
