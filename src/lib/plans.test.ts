import { describe, expect, it } from "vitest";
import { CONCIERGERIE_QUOTA, OFFERS, classifyPrice, formatEur, isOfferId, priceIdFor, stripeModeOf } from "./plans";

describe("plans", () => {
  it("uses the exact live price ids verified in Stripe (2026-11-16)", () => {
    expect(priceIdFor("one_time", "live")).toBe("price_1UcTtsAV5mFz3N4Js4TLWrR0");
    expect(priceIdFor("conciergerie", "live")).toBe("price_1UcTwoAV5mFz3N4JQYUbaTPp");
    expect(priceIdFor("lifetime", "live")).toBe("price_1UcU09AV5mFz3N4JYNji7dIG");
  });

  it("matches the commercial offers", () => {
    expect(OFFERS.one_time).toMatchObject({ amountEur: 7.9, checkoutMode: "payment", quotaPerPeriod: null });
    expect(OFFERS.conciergerie).toMatchObject({ amountEur: 34.9, checkoutMode: "subscription", quotaPerPeriod: 20 });
    expect(OFFERS.lifetime).toMatchObject({ amountEur: 89, checkoutMode: "payment", quotaPerPeriod: null });
    expect(CONCIERGERIE_QUOTA).toBe(20);
  });

  it("classifies current and legacy prices, and nothing else", () => {
    expect(classifyPrice("price_1UcTwoAV5mFz3N4JQYUbaTPp")).toEqual({ kind: "current", offer: "conciergerie" });
    expect(classifyPrice("price_1UBzJDAV5mFz3N4JTA0ncCco")).toEqual({ kind: "legacy_plus" });
    expect(classifyPrice("price_1UBzIcAV5mFz3N4JSnIvEAeu")).toEqual({ kind: "legacy_one_time" });
    expect(classifyPrice("price_some_other_business")).toBeNull();
    expect(classifyPrice(null)).toBeNull();
  });

  it("only accepts known offer ids from a client", () => {
    expect(isOfferId("conciergerie")).toBe(true);
    expect(isOfferId("plus")).toBe(false);
    expect(isOfferId("price_1UcTtsAV5mFz3N4Js4TLWrR0")).toBe(false);
  });

  it("detects the Stripe mode from the key prefix", () => {
    expect(stripeModeOf("sk_test_x")).toBe("test");
    expect(stripeModeOf("sk_live_x")).toBe("live");
    expect(stripeModeOf(undefined)).toBe("live");
  });

  it("formats prices the French way", () => {
    expect(formatEur(7.9)).toBe("7,90 €");
    expect(formatEur(34.9)).toBe("34,90 €");
    expect(formatEur(89)).toBe("89 €");
  });
});
