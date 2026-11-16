import fs from "fs";
import os from "os";
import path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";

// Runs the real webhook logic against the file-based demo store in an
// isolated temp dir: no Supabase, no Stripe network call, no real payment.

const LIVE = {
  one_time: "price_1UcTtsAV5mFz3N4Js4TLWrR0",
  conciergerie: "price_1UcTwoAV5mFz3N4JQYUbaTPp",
  lifetime: "price_1UcU09AV5mFz3N4JYNji7dIG",
  legacyPlus: "price_1UBzJDAV5mFz3N4JTA0ncCco",
};

type Mods = {
  handlers: typeof import("./webhookHandlers");
  store: typeof import("@/lib/store");
  access: typeof import("@/lib/access/accessStore");
};
let m: Mods;
const tracked: { eventName: string; dedupe?: string }[] = [];
const emails: string[] = [];
const seenDedupe = new Set<string>();
const deps = {
  track: async (p: { eventName: string; dedupeKey?: { field: string; value: string } }) => {
    const key = p.dedupeKey ? `${p.eventName}:${p.dedupeKey.value}` : null;
    if (key && seenDedupe.has(key)) return;
    if (key) seenDedupe.add(key);
    tracked.push({ eventName: p.eventName, dedupe: key ?? undefined });
  },
  sendUnlockEmail: async (p: { to: string; analysisId: string }) => {
    emails.push(p.analysisId);
  },
};

beforeAll(async () => {
  process.env.TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), "gm-webhook-test-"));
  m = {
    handlers: await import("./webhookHandlers"),
    store: await import("@/lib/store"),
    access: await import("@/lib/access/accessStore"),
  };
});

let seq = 0;
const nowS = () => Math.floor(Date.now() / 1000);
function event(type: string, object: unknown, created = nowS()): Stripe.Event {
  return { id: `evt_${++seq}`, type, created, livemode: false, data: { object } } as unknown as Stripe.Event;
}
async function report(email = "client@example.com") {
  const r = await m.store.createAnalysis({
    input: { listing_url: null, city: null, property_type: null, guest_capacity: null, nightly_price: null },
    images: [],
    result: { overall_score: 50 } as never,
    email,
  });
  return r.id;
}
const isUnlocked = async (id: string) => (await m.store.getAnalysis(id))?.is_unlocked === true;
const handle = (e: Stripe.Event) => m.handlers.handleStripeEvent(e, deps);

function paymentSession(p: { offer: string; analysisId: string; paid?: boolean; email?: string; pi?: string; id?: string }) {
  return {
    id: p.id ?? `cs_${++seq}`,
    mode: "payment",
    payment_status: p.paid === false ? "unpaid" : "paid",
    payment_intent: p.pi ?? `pi_${seq}`,
    customer: "cus_1",
    customer_details: { email: p.email ?? "client@example.com" },
    amount_total: p.offer === "lifetime" ? 8900 : 790,
    currency: "eur",
    metadata: { app: "guestmirror", offer: p.offer, analysisId: p.analysisId, price_id: LIVE[p.offer as "one_time"] },
  };
}
function subSession(p: { analysisId: string; sub: string; email?: string }) {
  return {
    id: `cs_${++seq}`,
    mode: "subscription",
    payment_status: "paid",
    subscription: p.sub,
    customer: "cus_c",
    customer_details: { email: p.email ?? "conciergerie@example.com" },
    metadata: { app: "guestmirror", offer: "conciergerie", analysisId: p.analysisId, price_id: LIVE.conciergerie },
  };
}
function invoice(p: { sub: string; start: number; end: number; reason?: string; price?: string; id?: string }) {
  return {
    id: p.id ?? `in_${++seq}`,
    billing_reason: p.reason ?? "subscription_cycle",
    customer: "cus_c",
    customer_email: "conciergerie@example.com",
    amount_paid: 3490,
    currency: "eur",
    parent: { subscription_details: { subscription: p.sub } },
    lines: { data: [{ pricing: { price_details: { price: p.price ?? LIVE.conciergerie } }, period: { start: p.start, end: p.end } }] },
  };
}
function subscription(p: { id: string; status: string; cancelAtPeriodEnd?: boolean; price?: string }) {
  return {
    id: p.id,
    status: p.status,
    cancel_at_period_end: p.cancelAtPeriodEnd ?? false,
    items: { data: [{ price: { id: p.price ?? LIVE.conciergerie }, current_period_end: nowS() + 30 * 86400 }] },
  };
}

describe("one-time purchase (7,90 €)", () => {
  it("unlocks the report only once the payment is confirmed, and only once", async () => {
    const id = await report();
    const s = paymentSession({ offer: "one_time", analysisId: id });
    expect(await handle(event("checkout.session.completed", s))).toBe("report_unlocked");
    expect(await isUnlocked(id)).toBe(true);
    const before = emails.length;
    await handle(event("checkout.session.completed", s)); // redelivery
    expect(emails.length).toBe(before);
    expect(tracked.filter((t) => t.dedupe === `payment_completed:${s.id}`)).toHaveLength(1);
  });

  it("delayed payment: nothing until it succeeds; a failure never unlocks", async () => {
    const id = await report();
    const s = paymentSession({ offer: "one_time", analysisId: id, paid: false });
    expect(await handle(event("checkout.session.completed", s))).toBe("awaiting_payment");
    expect(await isUnlocked(id)).toBe(false);
    expect(await handle(event("checkout.session.async_payment_succeeded", { ...s, payment_status: "paid" }))).toBe("report_unlocked");
    expect(await isUnlocked(id)).toBe(true);

    const id2 = await report();
    const s2 = paymentSession({ offer: "one_time", analysisId: id2, paid: false });
    await handle(event("checkout.session.completed", s2));
    expect(await handle(event("checkout.session.async_payment_failed", s2))).toBe("payment_failed");
    expect(await isUnlocked(id2)).toBe(false);
  });

  it("a full refund relocks the report; a partial refund does not", async () => {
    const id = await report();
    await handle(event("checkout.session.completed", paymentSession({ offer: "one_time", analysisId: id, pi: "pi_refund" })));
    expect(await handle(event("charge.refunded", { payment_intent: "pi_refund", refunded: false }))).toBe("partial_refund_ignored");
    expect(await isUnlocked(id)).toBe(true);
    await handle(event("charge.refunded", { payment_intent: "pi_refund", refunded: true }));
    expect(await isUnlocked(id)).toBe(false);
  });
});

describe("lifetime (89 €)", () => {
  it("grants unlimited access, suspended by a dispute and restored if won", async () => {
    const id = await report("lifetime@example.com");
    await handle(event("checkout.session.completed", paymentSession({ offer: "lifetime", analysisId: id, email: "lifetime@example.com", pi: "pi_life" })));
    let [g] = await m.access.listGrantsByEmail("lifetime@example.com");
    expect(g).toMatchObject({ kind: "lifetime", status: "active", quotaPerPeriod: null });
    expect(await isUnlocked(id)).toBe(true);

    await handle(event("charge.dispute.created", { payment_intent: "pi_life", status: "needs_response" }));
    [g] = await m.access.listGrantsByEmail("lifetime@example.com");
    expect(g.status).toBe("suspended");
    expect(await isUnlocked(id)).toBe(false);

    await handle(event("charge.dispute.closed", { payment_intent: "pi_life", status: "won" }));
    [g] = await m.access.listGrantsByEmail("lifetime@example.com");
    expect(g.status).toBe("active");
    expect(await isUnlocked(id)).toBe(true);
  });
});

describe("Conciergerie (34,90 €/mois, 20 analyses)", () => {
  it("opens 20 credits only when the first invoice is paid, whatever the event order", async () => {
    const start = nowS() - 60;
    const end = start + 30 * 86400;
    // Order A: checkout first, then invoice.
    const idA = await report("conciergerie@example.com");
    await handle(event("checkout.session.completed", subSession({ analysisId: idA, sub: "sub_A" })));
    expect(await isUnlocked(idA)).toBe(false); // nothing paid yet as far as we know
    await handle(event("invoice.paid", invoice({ sub: "sub_A", start, end, reason: "subscription_create" })));
    expect(await isUnlocked(idA)).toBe(true);
    // Order B: invoice first, then checkout.
    const idB = await report("conciergerie@example.com");
    await handle(event("invoice.paid", invoice({ sub: "sub_B", start, end, reason: "subscription_create" })));
    await handle(event("checkout.session.completed", subSession({ analysisId: idB, sub: "sub_B" })));
    expect(await isUnlocked(idB)).toBe(true);
    const gB = await m.access.getGrantBySubscriptionId("sub_B");
    expect(await m.access.creditsUsedInPeriod(gB!)).toBe(1);
  });

  it("20 per paid period, refused beyond, reset on renewal without carry-over", async () => {
    const start = nowS() - 60;
    await handle(event("checkout.session.completed", subSession({ analysisId: await report("q@example.com"), sub: "sub_Q", email: "q@example.com" })));
    await handle(event("invoice.paid", invoice({ sub: "sub_Q", start, end: start + 30 * 86400, reason: "subscription_create" })));
    const g = (await m.access.getGrantBySubscriptionId("sub_Q"))!;
    for (let i = 0; i < 19; i++) expect((await m.access.consumeCredit(g.id, await report("q@example.com"))).outcome).toBe("consumed");
    expect((await m.access.consumeCredit(g.id, await report("q@example.com"))).outcome).toBe("quota_exhausted");
    // Renewal paid: a new period of 20 (not 20 + unused).
    await handle(event("invoice.paid", invoice({ sub: "sub_Q", start: start + 30 * 86400 - 120, end: start + 60 * 86400 })));
    // Simulate being inside the new period by moving it to now.
    const renewed = (await m.access.getGrantBySubscriptionId("sub_Q"))!;
    expect(new Date(renewed.paidPeriodEnd!).getTime()).toBeGreaterThan(Date.now() + 50 * 86400 * 1000);
    expect(await m.access.creditsUsedInPeriod(renewed)).toBe(0);
    expect((await m.access.consumeCredit(renewed.id, await report("q@example.com"))).outcome).toBe("consumed");
  });

  it("failed renewal opens no period and blocks credits; late older events never roll back", async () => {
    const start = nowS() - 60;
    await handle(event("checkout.session.completed", subSession({ analysisId: await report("f@example.com"), sub: "sub_F", email: "f@example.com" })));
    await handle(event("invoice.paid", invoice({ sub: "sub_F", start, end: start + 30 * 86400, reason: "subscription_create" })));
    const failedInvoice = invoice({ sub: "sub_F", start: start + 30 * 86400, end: start + 60 * 86400 });
    expect(await handle(event("invoice.payment_failed", failedInvoice))).toBe("renewal_failed");
    const t = nowS();
    await handle(event("customer.subscription.updated", subscription({ id: "sub_F", status: "past_due" }), t));
    let g = (await m.access.getGrantBySubscriptionId("sub_F"))!;
    expect(g.status).toBe("past_due");
    expect((await m.access.consumeCredit(g.id, await report("f@example.com"))).outcome).toBe("inactive");
    // An older "active" update delivered late is ignored.
    await handle(event("customer.subscription.updated", subscription({ id: "sub_F", status: "active" }), t - 3600));
    g = (await m.access.getGrantBySubscriptionId("sub_F"))!;
    expect(g.status).toBe("past_due");
  });

  it("cancellation keeps credits until the end of the paid period", async () => {
    const start = nowS() - 60;
    await handle(event("checkout.session.completed", subSession({ analysisId: await report("c@example.com"), sub: "sub_C", email: "c@example.com" })));
    await handle(event("invoice.paid", invoice({ sub: "sub_C", start, end: start + 30 * 86400, reason: "subscription_create" })));
    await handle(event("customer.subscription.updated", subscription({ id: "sub_C", status: "active", cancelAtPeriodEnd: true })));
    let g = (await m.access.getGrantBySubscriptionId("sub_C"))!;
    expect(g).toMatchObject({ status: "active", cancelAtPeriodEnd: true });
    expect((await m.access.consumeCredit(g.id, await report("c@example.com"))).outcome).toBe("consumed");
    await handle(event("customer.subscription.deleted", subscription({ id: "sub_C", status: "canceled" }), nowS() + 1));
    g = (await m.access.getGrantBySubscriptionId("sub_C"))!;
    expect(g.status).toBe("canceled");
  });
});

describe("safety", () => {
  it("ignores other businesses on the same Stripe account", async () => {
    const before = (await m.access.listGrantsByEmail("other@example.com")).length;
    expect(await handle(event("checkout.session.completed", { id: "cs_other", mode: "payment", payment_status: "paid", metadata: {} }))).toBe("ignored_not_guestmirror");
    expect(await handle(event("invoice.paid", invoice({ sub: "sub_other", start: 1, end: 2, price: "price_not_ours" })))).toBe("ignored_not_guestmirror");
    expect(await handle(event("charge.refunded", { payment_intent: "pi_not_ours", refunded: true }))).toBe("ignored_not_guestmirror_or_subscription");
    expect((await m.access.listGrantsByEmail("other@example.com")).length).toBe(before);
  });

  it("a dispute arriving before the payment is recorded is retried later, not dropped", async () => {
    const id = await report();
    const early = event("charge.dispute.created", { payment_intent: "pi_early", status: "needs_response" });
    const withLookup = { ...deps, retrievePaymentIntentMetadata: async () => ({ app: "guestmirror" }) };
    await expect(m.handlers.handleStripeEvent(early, withLookup)).rejects.toBeInstanceOf(m.handlers.RetryLaterError);
    // The checkout event then records and unlocks the payment...
    await handle(event("checkout.session.completed", paymentSession({ offer: "one_time", analysisId: id, pi: "pi_early" })));
    expect(await isUnlocked(id)).toBe(true);
    // ...and Stripe's redelivery of the dispute now applies.
    expect(await m.handlers.handleStripeEvent(early, withLookup)).toBe("dispute_opened_applied");
    expect(await isUnlocked(id)).toBe(false);
    // A payment that is not ours is still ignored.
    const foreign = { ...deps, retrievePaymentIntentMetadata: async () => ({}) };
    expect(await m.handlers.handleStripeEvent(event("charge.dispute.created", { payment_intent: "pi_other_biz" }), foreign)).toBe("ignored_not_guestmirror_or_subscription");
  });

  it("legacy Plus renewals keep their original handling", async () => {
    expect(await handle(event("invoice.paid", invoice({ sub: "sub_legacy", start: 1, end: 2, price: LIVE.legacyPlus })))).toBe("legacy_plus_renewed");
    expect(await handle(event("invoice.paid", invoice({ sub: "sub_legacy", start: 1, end: 2, price: LIVE.legacyPlus, reason: "subscription_create" })))).toBe("legacy_plus_first_invoice");
  });

  it("reads the older invoice shape too (subscription and price at the top level)", async () => {
    const old = { id: "in_old", lines: { data: [{ price: { id: LIVE.conciergerie }, period: { start: 10, end: 20 } }] }, subscription: "sub_old" };
    expect(m.handlers.invoiceSubscriptionId(old as never)).toBe("sub_old");
    expect(m.handlers.invoiceLine(old as never)).toEqual({ priceId: LIVE.conciergerie, start: 10, end: 20 });
  });
});
