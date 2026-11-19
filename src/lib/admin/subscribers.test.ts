import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { summarize, toSubscriberRow } from "./subscribers";

const PLUS = "price_1UBzJDAV5mFz3N4JTA0ncCco";
const CONC_LIVE = "price_1UcTwoAV5mFz3N4JQYUbaTPp";
const CONC_TEST = "price_1UcUuCAV5mFz3N4JQeP49r9B";
const t = (d: string) => Math.floor(new Date(d).getTime() / 1000);

function sub(p: {
  id?: string;
  price: string;
  amount: number;
  status?: Stripe.Subscription.Status;
  cancelAtPeriodEnd?: boolean;
  periodEnd?: string;
  invoice?: { status: string; paid: number; due: number };
  reason?: string;
  coupon?: Partial<Stripe.Coupon>;
}): Stripe.Subscription {
  return {
    id: p.id ?? `sub_${Math.random().toString(36).slice(2)}`,
    status: p.status ?? "active",
    cancel_at_period_end: p.cancelAtPeriodEnd ?? false,
    created: t("2026-10-01"),
    start_date: t("2026-10-01"),
    canceled_at: p.status === "canceled" ? t("2026-11-04") : null,
    cancellation_details: p.reason ? { reason: p.reason } : null,
    customer: { id: "cus_1", object: "customer", name: "Client Test", email: "client@example.com" },
    latest_invoice: p.invoice ? { status: p.invoice.status, amount_paid: p.invoice.paid * 100, amount_due: p.invoice.due * 100, created: t("2026-11-01") } : null,
    discounts: p.coupon ? [{ coupon: p.coupon }] : [],
    items: { data: [{ price: { id: p.price, unit_amount: p.amount * 100, recurring: { interval: "month", interval_count: 1 } }, quantity: 1, current_period_end: t(p.periodEnd ?? "2026-12-01") }] },
  } as unknown as Stripe.Subscription;
}

describe("admin subscribers (Stripe snapshot)", () => {
  it("keeps only GuestMirror subscriptions (shared Stripe account)", () => {
    expect(toSubscriberRow(sub({ price: "price_someone_else", amount: 50 }))).toBeNull();
    expect(toSubscriberRow(sub({ price: PLUS, amount: 6.9 }))?.offer).toBe("legacy_plus");
    expect(toSubscriberRow(sub({ price: CONC_LIVE, amount: 34.9 }))?.offer).toBe("conciergerie");
    expect(toSubscriberRow(sub({ price: CONC_TEST, amount: 34.9 }))?.offer).toBe("conciergerie");
  });

  it("MRR counts active / trialing / past_due, never canceled; flags what needs attention", () => {
    const rows = [
      sub({ price: PLUS, amount: 6.9, periodEnd: "2026-12-08", invoice: { status: "paid", paid: 6.9, due: 6.9 } }),
      sub({ price: PLUS, amount: 6.9, periodEnd: "2026-11-29", invoice: { status: "paid", paid: 6.9, due: 6.9 } }),
      sub({ price: CONC_LIVE, amount: 34.9, cancelAtPeriodEnd: true }),
      sub({ price: CONC_LIVE, amount: 34.9, status: "past_due", invoice: { status: "open", paid: 0, due: 34.9 } }),
      sub({ price: PLUS, amount: 6.9, status: "canceled", reason: "payment_failed", invoice: { status: "open", paid: 0, due: 6.9 } }),
    ].map((s) => toSubscriberRow(s)!);
    const snap = summarize(rows);
    expect(snap.mrrEur).toBe(83.6); // 6,90 + 6,90 + 34,90 + 34,90
    expect(snap.payingCount).toBe(4);
    expect(snap.mrrEndingEur).toBe(34.9);
    expect(snap.rows[0].periodEnd?.startsWith("2026-11-29")).toBe(true); // next renewal first
    expect(snap.rows.at(-1)?.status).toBe("canceled"); // ended ones last
    expect(rows.map((r) => r.alert)).toEqual([null, null, "cancel_scheduled", "payment_failed", "payment_failed"]);
  });

  it("applies a recurring coupon to the monthly amount, ignores a one-off one", () => {
    expect(toSubscriberRow(sub({ price: CONC_LIVE, amount: 34.9, coupon: { percent_off: 50, duration: "forever" } }))?.monthlyEur).toBe(17.45);
    expect(toSubscriberRow(sub({ price: CONC_LIVE, amount: 34.9, coupon: { amount_off: 1000, duration: "repeating" } }))?.monthlyEur).toBe(24.9);
    expect(toSubscriberRow(sub({ price: CONC_LIVE, amount: 34.9, coupon: { percent_off: 100, duration: "once" } }))?.monthlyEur).toBe(34.9);
  });
});
