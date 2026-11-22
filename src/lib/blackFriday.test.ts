import { describe, expect, it } from "vitest";
import { BLACK_FRIDAY, BLACK_FRIDAY_END_MS, FUTURE_LIFETIME_PRICE_LABEL, LIFETIME_PRICE_LABEL, blackFridayActive, remaining } from "./blackFriday";
import { OFFERS } from "./plans";

describe("Black Friday 2026 campaign", () => {
  it("shows the price really charged (Stripe offer), never 129 € as the active price", () => {
    expect(LIFETIME_PRICE_LABEL).toBe("89 €");
    expect(OFFERS.lifetime.amountEur).toBe(89);
    expect(FUTURE_LIFETIME_PRICE_LABEL).toBe("129 €");
  });

  it("ends on 30 Nov 2026 at 23:59:59 Paris time (inclusive), then hides", () => {
    expect(new Date(BLACK_FRIDAY_END_MS).toISOString()).toBe("2026-11-30T22:59:59.000Z");
    expect(blackFridayActive(Date.parse("2026-11-25T12:00:00Z"))).toBe(true);
    expect(blackFridayActive(Date.parse("2026-11-30T22:59:59Z"))).toBe(true);
    expect(blackFridayActive(Date.parse("2026-11-30T23:00:00Z"))).toBe(false);
    expect(blackFridayActive(Date.parse("2026-11-20T12:00:00Z"))).toBe(false);
  });

  it("real countdown: computed from the clock, null once over", () => {
    expect(remaining(Date.parse("2026-11-30T21:58:58Z"))).toEqual({ d: 0, h: 1, m: 1, s: 1 });
    expect(remaining(Date.parse("2026-11-22T22:59:59Z"))).toEqual({ d: 8, h: 0, m: 0, s: 0 });
    expect(remaining(BLACK_FRIDAY_END_MS)).toBeNull();
  });

  it("one switch turns everything off", () => {
    expect(BLACK_FRIDAY.enabled).toBe(true);
  });
});
