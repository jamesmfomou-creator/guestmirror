import { describe, expect, it } from "vitest";
import { isPaymentEvent, paymentEventRevenueEur, EventRow } from "./analytics";

function row(overrides: Partial<EventRow>): EventRow {
  return {
    event_name: "payment_completed",
    anonymous_id: "anon_1",
    session_id: "sess_1",
    source: "direct",
    metadata: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("isPaymentEvent", () => {
  it("treats payment_completed as a payment", () => {
    expect(isPaymentEvent("payment_completed")).toBe(true);
  });

  // Confirmed via a prior audit: subscription_started (a Plus conversion)
  // is real money that fires a different event than one-time purchases --
  // without this, Plus conversions silently vanished from revenue/funnel/
  // A-B stats.
  it("treats subscription_started as a payment", () => {
    expect(isPaymentEvent("subscription_started")).toBe(true);
  });

  it("does not treat checkout_started or a failed payment as a payment", () => {
    expect(isPaymentEvent("checkout_started")).toBe(false);
    expect(isPaymentEvent("subscription_payment_failed")).toBe(false);
  });
});

describe("paymentEventRevenueEur", () => {
  it("reads a one-time payment's amount in cents and converts to EUR", () => {
    const r = row({ event_name: "payment_completed", metadata: { amount: 490 } });
    expect(paymentEventRevenueEur(r)).toBe(4.9);
  });

  it("reads a subscription's price directly in EUR, not cents", () => {
    const r = row({ event_name: "subscription_started", metadata: { price: 6.9 } });
    expect(paymentEventRevenueEur(r)).toBe(6.9);
  });

  it("returns 0 rather than NaN when metadata is missing the expected field", () => {
    const r = row({ event_name: "payment_completed", metadata: {} });
    expect(paymentEventRevenueEur(r)).toBe(0);
  });
});
