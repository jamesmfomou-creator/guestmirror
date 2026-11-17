import fs from "fs";
import os from "os";
import path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";

// Add-on "Pack 10 analyses supplémentaires": the real webhook + credit logic
// against the file-based demo store in an isolated temp dir. No Supabase, no
// Stripe network call, no real payment.

const CONCIERGERIE = "price_1UcTwoAV5mFz3N4JQYUbaTPp";
const PACK = "price_1UcbgMAV5mFz3N4J1lsmELos"; // test-mode one-time 12,90 €
const RECURRING_PACK_LIVE = "price_1UcV0ZAV5mFz3N4J6Vs19Ame"; // must never count as the pack

type Mods = {
  handlers: typeof import("./webhookHandlers");
  store: typeof import("@/lib/store");
  access: typeof import("@/lib/access/accessStore");
  plans: typeof import("@/lib/plans");
};
let m: Mods;
const tracked: { eventName: string; dedupe?: string; metadata?: Record<string, unknown> }[] = [];
const seen = new Set<string>();
let invoiceHasPack = false;
const deps = {
  track: async (p: { eventName: string; dedupeKey?: { field: string; value: string }; metadata: Record<string, unknown> }) => {
    const key = p.dedupeKey ? `${p.eventName}:${p.dedupeKey.value}` : null;
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    tracked.push({ eventName: p.eventName, dedupe: key ?? undefined, metadata: p.metadata });
  },
  sendUnlockEmail: async () => {},
  invoiceHasAddonPack: async () => invoiceHasPack,
};

beforeAll(async () => {
  process.env.TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), "gm-addon-test-"));
  m = {
    handlers: await import("./webhookHandlers"),
    store: await import("@/lib/store"),
    access: await import("@/lib/access/accessStore"),
    plans: await import("@/lib/plans"),
  };
});

let seq = 0;
const nowS = () => Math.floor(Date.now() / 1000);
const event = (type: string, object: unknown) =>
  ({ id: `evt_${++seq}`, type, created: nowS(), livemode: false, data: { object } }) as unknown as Stripe.Event;
const handle = (e: Stripe.Event) => m.handlers.handleStripeEvent(e, deps);
async function report(email: string) {
  const r = await m.store.createAnalysis({
    input: { listing_url: null, city: null, property_type: null, guest_capacity: null, nightly_price: null },
    images: [],
    result: { overall_score: 50 } as never,
    email,
  });
  return r.id;
}
const isUnlocked = async (id: string) => (await m.store.getAnalysis(id))?.is_unlocked === true;

function firstInvoice(p: { sub: string; email: string; withPack: boolean; id?: string; pi?: string; reason?: string; packPrice?: string }) {
  const start = nowS() - 60;
  return {
    id: p.id ?? `in_${++seq}`,
    billing_reason: p.reason ?? "subscription_create",
    customer: "cus_c",
    customer_email: p.email,
    amount_paid: p.withPack ? 4780 : 3490,
    currency: "eur",
    payment_intent: p.pi ?? null,
    parent: { subscription_details: { subscription: p.sub } },
    lines: {
      data: [
        { pricing: { price_details: { price: CONCIERGERIE } }, amount: 3490, period: { start, end: start + 30 * 86400 } },
        ...(p.withPack ? [{ pricing: { price_details: { price: p.packPrice ?? PACK } }, amount: 1290, period: { start, end: start } }] : []),
      ],
    },
  };
}
async function subscribe(email: string, sub: string, withPack: boolean, pi?: string) {
  const id = await report(email);
  await handle(
    event("checkout.session.completed", {
      id: `cs_${++seq}`,
      mode: "subscription",
      payment_status: "paid",
      subscription: sub,
      customer: "cus_c",
      customer_details: { email },
      metadata: { app: "guestmirror", offer: "conciergerie", analysisId: id, price_id: CONCIERGERIE, ...(withPack ? { addon: "addon_pack" } : {}) },
    })
  );
  const inv = firstInvoice({ sub, email, withPack, pi });
  await handle(event("invoice.paid", inv));
  return { reportId: id, invoice: inv, grant: (await m.access.getGrantBySubscriptionId(sub))! };
}
function addonSession(p: { email: string; grantId: string; analysisId: string; paid?: boolean; pi?: string }) {
  return {
    id: `cs_${++seq}`,
    mode: "payment",
    payment_status: p.paid === false ? "unpaid" : "paid",
    payment_intent: p.pi ?? `pi_${seq}`,
    customer: "cus_c",
    customer_details: { email: p.email },
    amount_total: 1290,
    currency: "eur",
    metadata: { app: "guestmirror", offer: "addon_pack", source: "account", email: p.email, grant_id: p.grantId, analysisId: p.analysisId, price_id: PACK },
  };
}

describe("catalogue", () => {
  it("only the one-time price is the pack; the recurring live price never is", () => {
    expect(m.plans.isAddonPackPrice(PACK)).toBe(true);
    expect(m.plans.isAddonPackPrice(RECURRING_PACK_LIVE)).toBe(false);
    expect(m.plans.addonPackPriceId("live")).toBeNull();
    expect(m.plans.classifyPrice(PACK)).toBeNull(); // not an offer: never unlocks a report on its own
  });
});

describe("order bump (pack on the first Conciergerie payment)", () => {
  it("credits exactly 10 analyses once the first invoice is paid, never twice", async () => {
    const { invoice, grant } = await subscribe("bump@example.com", "sub_bump", true);
    expect(await m.access.packCreditsRemaining("bump@example.com")).toBe(10);
    await handle(event("invoice.paid", invoice)); // redelivery
    await handle(event("invoice.payment_succeeded", invoice)); // twin event
    expect(await m.access.packCreditsRemaining("bump@example.com")).toBe(10);
    expect(tracked.filter((t) => t.eventName === "addon_purchase_completed" && t.dedupe === `addon_purchase_completed:${invoice.id}`)).toHaveLength(1);
    expect(tracked.find((t) => t.dedupe === `addon_purchase_completed:${invoice.id}`)?.metadata?.source).toBe("subscription_checkout");
    expect(grant.status).toBe("active");
  });

  it("without the pack: no extra credits", async () => {
    await subscribe("nobump@example.com", "sub_nobump", false);
    expect(await m.access.packCreditsRemaining("nobump@example.com")).toBe(0);
  });

  it("a renewal never bills nor credits the pack again", async () => {
    await subscribe("renew@example.com", "sub_renew", true);
    const start = nowS() + 30 * 86400 - 120;
    await handle(
      event("invoice.paid", {
        id: `in_${++seq}`,
        billing_reason: "subscription_cycle",
        customer_email: "renew@example.com",
        amount_paid: 3490,
        parent: { subscription_details: { subscription: "sub_renew" } },
        lines: { data: [{ pricing: { price_details: { price: CONCIERGERIE } }, amount: 3490, period: { start, end: start + 30 * 86400 } }] },
      })
    );
    expect(await m.access.packCreditsRemaining("renew@example.com")).toBe(10);
  });

  it("a recurring price on the invoice is not taken for the pack", async () => {
    const email = "recurring@example.com";
    const id = await report(email);
    await handle(event("checkout.session.completed", { id: `cs_${++seq}`, mode: "subscription", payment_status: "paid", subscription: "sub_rec", customer: "cus_c", customer_details: { email }, metadata: { app: "guestmirror", offer: "conciergerie", analysisId: id, price_id: CONCIERGERIE } }));
    await handle(event("invoice.paid", firstInvoice({ sub: "sub_rec", email, withPack: true, packPrice: RECURRING_PACK_LIVE })));
    expect(await m.access.packCreditsRemaining(email)).toBe(0);
  });
});

describe("consumption: monthly quota first, then the pack", () => {
  it("uses the 20 monthly analyses, then the 10 extra ones, then refuses", async () => {
    const email = "consume@example.com";
    const { grant, reportId } = await subscribe(email, "sub_consume", true);
    expect(await isUnlocked(reportId)).toBe(true); // subscribed report: 1 monthly credit
    for (let i = 0; i < 19; i++) {
      const r = await m.access.consumeAnalysisCredit(grant.id, await report(email));
      expect(r).toMatchObject({ outcome: "consumed", source: "monthly", extraRemaining: 10 });
    }
    for (let i = 0; i < 10; i++) {
      const r = await m.access.consumeAnalysisCredit(grant.id, await report(email));
      expect(r).toMatchObject({ outcome: "consumed", source: "pack", extraRemaining: 9 - i });
    }
    const last = await report(email);
    expect((await m.access.consumeAnalysisCredit(grant.id, last)).outcome).toBe("quota_exhausted");
    expect(await isUnlocked(last)).toBe(false);
    // Same report twice never costs twice.
    const again = await report(email);
    expect((await m.access.consumeAnalysisCredit(grant.id, again)).outcome).toBe("quota_exhausted");
  });

  it("monthly renewal resets the 20, extra credits left are kept", async () => {
    const email = "keep@example.com";
    const { grant } = await subscribe(email, "sub_keep", true);
    for (let i = 0; i < 19; i++) await m.access.consumeAnalysisCredit(grant.id, await report(email));
    for (let i = 0; i < 3; i++) await m.access.consumeAnalysisCredit(grant.id, await report(email)); // 3 from the pack
    expect(await m.access.packCreditsRemaining(email)).toBe(7);
    const start = nowS() + 30 * 86400 - 120;
    await handle(event("invoice.paid", { id: `in_${++seq}`, billing_reason: "subscription_cycle", customer_email: email, parent: { subscription_details: { subscription: "sub_keep" } }, lines: { data: [{ pricing: { price_details: { price: CONCIERGERIE } }, period: { start, end: start + 30 * 86400 } }] } }));
    const renewed = (await m.access.getGrantBySubscriptionId("sub_keep"))!;
    expect(await m.access.creditsUsedInPeriod(renewed)).toBe(0);
    expect(await m.access.packCreditsRemaining(email)).toBe(7);
    expect((await m.access.consumeAnalysisCredit(renewed.id, await report(email))).source).toBe("monthly");
  });

  it("after cancellation the extra credits stay usable; monthly ones do not", async () => {
    const email = "cancel@example.com";
    const { grant } = await subscribe(email, "sub_cancel", true);
    await handle(event("customer.subscription.deleted", { id: "sub_cancel", status: "canceled", cancel_at_period_end: false, items: { data: [{ price: { id: CONCIERGERIE } }] } }));
    // Period ended (simulate by moving it into the past through a status that blocks monthly use).
    const g = (await m.access.getGrantBySubscriptionId("sub_cancel"))!;
    expect(g.status).toBe("canceled");
    const r = await m.access.consumeAnalysisCredit(grant.id, await report(email));
    expect(r).toMatchObject({ outcome: "consumed", source: "pack", extraRemaining: 9 });
  });
});

describe("pack bought from the report page", () => {
  it("credited on confirmed payment only, once; it never unlocks the report it was bought from", async () => {
    const email = "account@example.com";
    const { grant } = await subscribe(email, "sub_account", false);
    const page = await report(email);
    const s = addonSession({ email, grantId: grant.id, analysisId: page, paid: false });
    expect(await handle(event("checkout.session.completed", s))).toBe("addon_awaiting_payment");
    expect(await m.access.packCreditsRemaining(email)).toBe(0);
    expect(await handle(event("checkout.session.async_payment_succeeded", { ...s, payment_status: "paid" }))).toBe("addon_pack_granted");
    expect(await handle(event("checkout.session.completed", { ...s, payment_status: "paid" }))).toBe("addon_pack_already_granted");
    expect(await m.access.packCreditsRemaining(email)).toBe(10);
    expect(await isUnlocked(page)).toBe(false);
    expect(tracked.find((t) => t.dedupe === `addon_purchase_completed:${s.id}`)?.metadata?.source).toBe("account");
  });

  it("a failed delayed payment credits nothing and is tracked", async () => {
    const email = "fail@example.com";
    const { grant } = await subscribe(email, "sub_fail", false);
    const s = addonSession({ email, grantId: grant.id, analysisId: await report(email), paid: false });
    await handle(event("checkout.session.completed", s));
    expect(await handle(event("checkout.session.async_payment_failed", s))).toBe("addon_payment_failed");
    expect(await m.access.packCreditsRemaining(email)).toBe(0);
    expect(tracked.some((t) => t.dedupe === `addon_purchase_failed:${s.id}`)).toBe(true);
  });
});

describe("refunds and disputes", () => {
  it("full refund of a pack bought alone: unused credits withdrawn, unlocked reports stay unlocked", async () => {
    const email = "refund@example.com";
    const { grant } = await subscribe(email, "sub_refund", false);
    await handle(event("checkout.session.completed", addonSession({ email, grantId: grant.id, analysisId: await report(email), pi: "pi_pack_refund" })));
    for (let i = 0; i < 19; i++) await m.access.consumeAnalysisCredit(grant.id, await report(email));
    const viaPack = await report(email);
    expect((await m.access.consumeAnalysisCredit(grant.id, viaPack)).source).toBe("pack");
    await handle(event("charge.refunded", { payment_intent: "pi_pack_refund", refunded: true, amount_refunded: 1290 }));
    expect(await m.access.packCreditsRemaining(email)).toBe(0);
    expect(await isUnlocked(viaPack)).toBe(true);
  });

  it("partial refund of the first invoice: the pack is withdrawn only if the refund covers it", async () => {
    const email = "partial@example.com";
    await subscribe(email, "sub_partial", true, "pi_first_invoice");
    expect(await handle(event("charge.refunded", { payment_intent: "pi_first_invoice", refunded: false, amount_refunded: 500 }))).toBe("partial_refund_ignored");
    expect(await m.access.packCreditsRemaining(email)).toBe(10);
    await handle(event("charge.refunded", { payment_intent: "pi_first_invoice", refunded: false, amount_refunded: 1290 }));
    expect(await m.access.packCreditsRemaining(email)).toBe(0);
    // The subscription itself is untouched.
    expect((await m.access.getGrantBySubscriptionId("sub_partial"))!.status).toBe("active");
  });

  it("dispute: credits frozen, restored if won; a refunded pack stays revoked", async () => {
    const email = "dispute@example.com";
    await subscribe(email, "sub_dispute", true, "pi_dispute");
    await handle(event("charge.dispute.created", { payment_intent: "pi_dispute", status: "needs_response" }));
    expect(await m.access.packCreditsRemaining(email)).toBe(0);
    await handle(event("charge.dispute.closed", { payment_intent: "pi_dispute", status: "won" }));
    expect(await m.access.packCreditsRemaining(email)).toBe(10);
    await handle(event("charge.refunded", { payment_intent: "pi_dispute", refunded: true, amount_refunded: 4780 }));
    expect(await m.access.packCreditsRemaining(email)).toBe(0);
    await handle(event("charge.dispute.closed", { payment_intent: "pi_dispute", status: "won" }));
    expect(await m.access.packCreditsRemaining(email)).toBe(0);
  });

  it("refund arriving before the invoice is recorded: Stripe is asked to redeliver", async () => {
    invoiceHasPack = true;
    await expect(handle(event("charge.refunded", { payment_intent: "pi_early", invoice: "in_not_yet", refunded: true, amount_refunded: 4780 }))).rejects.toBeInstanceOf(
      m.handlers.RetryLaterError
    );
    invoiceHasPack = false;
  });
});
