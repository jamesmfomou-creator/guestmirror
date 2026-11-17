import type Stripe from "stripe";
import { ADDON_PACK, CONCIERGERIE_QUOTA, OFFERS, classifyPrice, isAddonPackPrice, isOfferId, type OfferId } from "@/lib/plans";
import { unlockAnalysis, getAnalysis } from "@/lib/store";
import {
  applyPaidPeriod,
  applySubscriptionStatus,
  clearPendingUnlock,
  consumeAnalysisCredit,
  ensureConciergerieGrant,
  ensureLifetimeGrant,
  ensurePack,
  findPaymentByIntent,
  getGrantById,
  getGrantByPaymentIntent,
  getGrantBySubscriptionId,
  getPackByInvoice,
  getPackByPaymentIntent,
  setPackStatus,
  type CreditPack,
  markPayment,
  recordPaymentOnce,
  setGrantStatus,
  setReportUnlocked,
  type AccessGrant,
  type GrantStatus,
} from "@/lib/access/accessStore";
import { isConciergerieGrantUsable } from "@/lib/access/entitlements";
import { upsertSubscriptionFromCheckout, updateSubscriptionByStripeId } from "@/lib/subscriptions";

// Business handling of Stripe webhook events (pricing v2). The route
// (api/stripe/webhook) verifies the signature and journals the event id for
// idempotence; this module decides what each event grants.
//
// Rules:
//  - Rights are granted only on CONFIRMED payment: a checkout session with
//    payment_status "paid", an async payment that succeeded, or a paid
//    invoice (which alone opens a Conciergerie period of 20 analyses).
//  - Everything is idempotent (unique keys + "only move forward" updates), so
//    a redelivered or late event never grants twice nor rolls state back.
//  - The Stripe account also serves other businesses: anything that is not a
//    GuestMirror session/price is ignored.
//  - Legacy offers (4,90 € one-time, Plus 6,90 €/mois) keep their original
//    handling and promises.
//  - Payloads are read in both the current ("dahlia") and older API shapes,
//    since an endpoint can be pinned to an older version.

export interface WebhookDeps {
  /** Records an analytics event; idempotent when given a dedupe key. */
  track: (params: {
    eventName: string;
    analysisId?: string | null;
    email?: string | null;
    dedupeKey?: { field: string; value: string };
    metadata: Record<string, unknown>;
  }) => Promise<void>;
  sendUnlockEmail: (params: { to: string; analysisId: string }) => Promise<void>;
  /** Legacy Plus checkout needs the subscription's period end from Stripe. */
  retrieveSubscription?: (id: string) => Promise<Stripe.Subscription>;
  /**
   * Who a payment belongs to, when a refund/dispute arrives before the
   * checkout event that records the payment (events are not ordered).
   */
  retrievePaymentIntentMetadata?: (id: string) => Promise<Record<string, string>>;
  /**
   * The payment intent that paid an invoice, when the payload does not carry
   * it (recent API versions); used to find the order-bump pack on refunds.
   */
  retrieveInvoicePaymentIntent?: (invoiceId: string) => Promise<string | null>;
  /** Whether an invoice includes the add-on pack (refund arriving before invoice.paid). */
  invoiceHasAddonPack?: (invoiceId: string) => Promise<boolean>;
  /** The invoice a payment intent paid, if any (refunds on subscription payments). */
  invoiceIdForPaymentIntent?: (paymentIntentId: string) => Promise<string | null>;
}

/** Thrown so the route answers 500 and Stripe redelivers the event later. */
export class RetryLaterError extends Error {}

type Outcome = string;

// ---------------------------------------------------------------------------
// Payload readers (current + older API shapes)

function idOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") return (value as { id: string }).id;
  return null;
}

export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = (invoice as unknown as { parent?: { subscription_details?: { subscription?: unknown } } }).parent;
  return (
    idOf(parent?.subscription_details?.subscription) ??
    idOf((invoice as unknown as { subscription?: unknown }).subscription) ??
    null
  );
}

/** The GuestMirror line of an invoice: its price id and billed period. */
export function invoiceLine(invoice: Stripe.Invoice): { priceId: string | null; start: number | null; end: number | null } {
  const lines = (invoice.lines?.data ?? []) as unknown as Array<{
    pricing?: { price_details?: { price?: unknown } };
    price?: unknown;
    period?: { start?: number; end?: number };
  }>;
  for (const line of lines) {
    const priceId = idOf(line.pricing?.price_details?.price) ?? idOf(line.price);
    if (classifyPrice(priceId)) {
      return { priceId, start: line.period?.start ?? null, end: line.period?.end ?? null };
    }
  }
  const first = lines[0];
  return {
    priceId: first ? (idOf(first.pricing?.price_details?.price) ?? idOf(first.price)) : null,
    start: first?.period?.start ?? null,
    end: first?.period?.end ?? null,
  };
}

/** The add-on pack line of an invoice (order bump), if any. */
export function invoiceAddonLine(invoice: Stripe.Invoice): { priceId: string; amount: number | null } | null {
  const lines = (invoice.lines?.data ?? []) as unknown as Array<{
    pricing?: { price_details?: { price?: unknown } };
    price?: unknown;
    amount?: number;
  }>;
  for (const line of lines) {
    const priceId = idOf(line.pricing?.price_details?.price) ?? idOf(line.price);
    if (priceId && isAddonPackPrice(priceId)) return { priceId, amount: typeof line.amount === "number" ? line.amount : null };
  }
  return null;
}

function invoicePaymentIntentId(invoice: Stripe.Invoice): string | null {
  const legacy = idOf((invoice as unknown as { payment_intent?: unknown }).payment_intent);
  if (legacy) return legacy;
  const payments = (invoice as unknown as { payments?: { data?: Array<{ payment?: { payment_intent?: unknown } }> } }).payments;
  return idOf(payments?.data?.[0]?.payment?.payment_intent) ?? null;
}

function subscriptionPriceId(sub: Stripe.Subscription): string | null {
  return idOf(sub.items?.data?.[0]?.price) ?? null;
}

function sessionEmail(session: Stripe.Checkout.Session): string | null {
  return session.customer_details?.email || session.customer_email || null;
}

/** GuestMirror sessions carry our metadata (current: app=guestmirror; legacy: analysisId). */
function sessionOffer(session: Stripe.Checkout.Session): { offer: OfferId | "legacy_one_time" | "legacy_plus" | "legacy_lifetime"; analysisId: string | null } | null {
  const md = session.metadata ?? {};
  const analysisId = md.analysisId ?? null;
  if (md.app === "guestmirror" && isOfferId(md.offer)) return { offer: md.offer, analysisId };
  if (!analysisId) return null;
  if (md.plan === "plus") return { offer: "legacy_plus", analysisId };
  if (md.plan === "lifetime") return { offer: "legacy_lifetime", analysisId };
  return { offer: "legacy_one_time", analysisId };
}

const STRIPE_TO_GRANT_STATUS: Record<string, GrantStatus> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  unpaid: "unpaid",
  canceled: "canceled",
  incomplete: "incomplete",
  incomplete_expired: "canceled",
  paused: "suspended",
};

// ---------------------------------------------------------------------------
// Fulfilment helpers

async function unlockPendingReport(grant: AccessGrant, deps: WebhookDeps): Promise<void> {
  if (!grant.pendingUnlockAnalysisId || !isConciergerieGrantUsable(grant, Date.now())) return;
  const analysisId = grant.pendingUnlockAnalysisId;
  const res = await consumeAnalysisCredit(grant.id, analysisId);
  await clearPendingUnlock(grant.id);
  if (res.outcome === "consumed") {
    await deps.track({
      eventName: "subscription_credit_used",
      analysisId,
      email: grant.email,
      dedupeKey: { field: "credit_analysis_id", value: analysisId },
      metadata: { plan: "conciergerie", credit_analysis_id: analysisId, used: res.used, quota: res.quota, via: "subscription_checkout" },
    });
    try {
      await deps.sendUnlockEmail({ to: grant.email, analysisId });
    } catch {
      // the report is unlocked regardless of the notification email
    }
  }
}

async function fulfilPaidSession(session: Stripe.Checkout.Session, info: NonNullable<ReturnType<typeof sessionOffer>>, deps: WebhookDeps): Promise<Outcome> {
  const { analysisId } = info;
  const email = sessionEmail(session);
  const paymentIntentId = idOf(session.payment_intent);
  const customerId = idOf(session.customer);
  const isLifetime = info.offer === "lifetime" || info.offer === "legacy_lifetime";
  const plan = isLifetime ? "lifetime" : "one_time";

  if (analysisId) await unlockAnalysis(analysisId, "paid");
  if (isLifetime && email) {
    await ensureLifetimeGrant({
      email,
      checkoutSessionId: session.id,
      paymentIntentId,
      customerId,
      priceId: session.metadata?.price_id ?? null,
    });
  }

  const isNew = await recordPaymentOnce({
    analysisId,
    sessionId: session.id,
    paymentIntentId,
    amount: session.amount_total ?? null,
    status: "paid",
    plan: info.offer,
    priceId: session.metadata?.price_id ?? null,
  });

  const dedupeKey = { field: "stripe_session_id", value: session.id };
  const metadata = {
    analysis_id: analysisId,
    plan,
    offer: info.offer,
    amount: session.amount_total ?? null,
    currency: (session.currency || "eur").toUpperCase(),
    payment_status: "paid",
    stripe_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
  };
  await deps.track({ eventName: "payment_completed", analysisId, dedupeKey, metadata });
  await deps.track({ eventName: isLifetime ? "lifetime_payment_completed" : "one_time_payment_completed", analysisId, dedupeKey, metadata });

  if (isNew && analysisId) {
    try {
      const analysis = await getAnalysis(analysisId);
      const to = analysis?.email || email;
      if (to) await deps.sendUnlockEmail({ to, analysisId });
    } catch {
      // the report is unlocked regardless of the notification email
    }
  }
  return isLifetime ? "lifetime_granted" : "report_unlocked";
}

/** A pack bought on its own from the report page (checkout mode=payment). */
function isAddonSession(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.app === "guestmirror" && session.metadata?.offer === "addon_pack";
}

async function fulfilAddonSession(session: Stripe.Checkout.Session, deps: WebhookDeps): Promise<Outcome> {
  const md = session.metadata ?? {};
  // The verified email the purchase was started from (metadata, set by the
  // server), never what was typed on Stripe's page.
  const email = md.email || sessionEmail(session);
  if (!email) return "ignored_incomplete_session";
  const paymentIntentId = idOf(session.payment_intent);
  const grant = md.grant_id ? await getGrantById(md.grant_id) : null;
  const { pack, created } = await ensurePack({
    email,
    grantId: grant?.id ?? null,
    source: "account",
    credits: ADDON_PACK.credits,
    amount: session.amount_total ?? null,
    priceId: md.price_id ?? null,
    checkoutSessionId: session.id,
    paymentIntentId,
  });
  // Payment row: revenue history and refund/dispute lookups. No report attached.
  await recordPaymentOnce({
    analysisId: null,
    sessionId: session.id,
    paymentIntentId,
    amount: session.amount_total ?? null,
    status: "paid",
    plan: "addon_pack",
    priceId: md.price_id ?? null,
  });
  await deps.track({
    eventName: "addon_purchase_completed",
    analysisId: md.analysisId ?? null,
    email,
    dedupeKey: { field: "stripe_session_id", value: session.id },
    metadata: {
      source: "account",
      offer: "addon_pack",
      amount: session.amount_total ?? null,
      currency: (session.currency || "eur").toUpperCase(),
      credits: pack.credits,
      stripe_session_id: session.id,
      pack_id: pack.id,
    },
  });
  return created ? "addon_pack_granted" : "addon_pack_already_granted";
}

/** Order bump: the pack was on the first invoice of a Conciergerie subscription. */
async function grantOrderBumpPack(invoice: Stripe.Invoice, grant: AccessGrant, deps: WebhookDeps): Promise<CreditPack | null> {
  const addon = invoiceAddonLine(invoice);
  if (!addon || !invoice.id) return null;
  let paymentIntentId = invoicePaymentIntentId(invoice);
  if (!paymentIntentId && deps.retrieveInvoicePaymentIntent) {
    paymentIntentId = await deps.retrieveInvoicePaymentIntent(invoice.id).catch(() => null);
  }
  const { pack } = await ensurePack({
    email: grant.email,
    grantId: grant.id,
    source: "subscription_checkout",
    credits: ADDON_PACK.credits,
    amount: addon.amount,
    priceId: addon.priceId,
    invoiceId: invoice.id,
    paymentIntentId,
  });
  await deps.track({
    eventName: "addon_purchase_completed",
    email: grant.email,
    dedupeKey: { field: "stripe_invoice_id", value: invoice.id },
    metadata: {
      source: "subscription_checkout",
      offer: "addon_pack",
      amount: addon.amount,
      currency: (invoice.currency || "eur").toUpperCase(),
      credits: pack.credits,
      stripe_invoice_id: invoice.id,
      stripe_subscription_id: grant.stripeSubscriptionId,
      pack_id: pack.id,
    },
  });
  return pack;
}

// ---------------------------------------------------------------------------
// Event handlers

async function onCheckoutCompleted(session: Stripe.Checkout.Session, deps: WebhookDeps): Promise<Outcome> {
  if (isAddonSession(session)) {
    if (session.payment_status === "paid") return fulfilAddonSession(session, deps);
    await recordPaymentOnce({
      analysisId: null,
      sessionId: session.id,
      paymentIntentId: idOf(session.payment_intent),
      amount: session.amount_total ?? null,
      status: "pending",
      plan: "addon_pack",
      priceId: session.metadata?.price_id ?? null,
    });
    return "addon_awaiting_payment";
  }
  const info = sessionOffer(session);
  if (!info) return "ignored_not_guestmirror";

  if (session.mode === "subscription") {
    const email = sessionEmail(session);
    const subscriptionId = idOf(session.subscription);
    const customerId = idOf(session.customer);
    if (!email || !subscriptionId) return "ignored_incomplete_session";

    if (info.offer === "legacy_plus") {
      // Unchanged legacy path (no new Plus is sold, but a checkout started
      // before the switch can still complete).
      const sub = deps.retrieveSubscription ? await deps.retrieveSubscription(subscriptionId) : null;
      await upsertSubscriptionFromCheckout({
        email,
        stripeCustomerId: customerId ?? "",
        stripeSubscriptionId: subscriptionId,
        status: sub?.status ?? "active",
        currentPeriodEnd: sub?.items.data[0]?.current_period_end ?? null,
      });
      await deps.track({
        eventName: "subscription_started",
        analysisId: info.analysisId,
        email,
        dedupeKey: { field: "stripe_subscription_id", value: subscriptionId },
        metadata: { plan: "plus", offer: "legacy_plus", price: 6.9, currency: "EUR", stripe_subscription_id: subscriptionId },
      });
      return "legacy_plus_started";
    }

    const grant = await ensureConciergerieGrant({
      email,
      subscriptionId,
      customerId,
      priceId: session.metadata?.price_id ?? null,
      quotaPerPeriod: CONCIERGERIE_QUOTA,
      pendingUnlockAnalysisId: info.analysisId,
      checkoutSessionId: session.id,
    });
    if (session.payment_status === "paid") {
      await deps.track({
        eventName: "subscription_started",
        analysisId: info.analysisId,
        email,
        dedupeKey: { field: "stripe_subscription_id", value: subscriptionId },
        metadata: { plan: "conciergerie", offer: "conciergerie", price: OFFERS.conciergerie.amountEur, currency: "EUR", stripe_subscription_id: subscriptionId },
      });
    }
    // Re-read: the first invoice may have been processed concurrently. Either
    // this read sees its paid period (unlock here), or the invoice handler's
    // update sees the pending report written above (it unlocks there).
    const fresh = (await getGrantBySubscriptionId(subscriptionId)) ?? grant;
    await unlockPendingReport(fresh, deps);
    return "conciergerie_checkout_recorded";
  }

  // mode=payment: only a confirmed payment grants anything.
  if (session.payment_status !== "paid") {
    await recordPaymentOnce({
      analysisId: info.analysisId,
      sessionId: session.id,
      paymentIntentId: idOf(session.payment_intent),
      amount: session.amount_total ?? null,
      status: "pending",
      plan: info.offer,
      priceId: session.metadata?.price_id ?? null,
    });
    return "awaiting_payment";
  }
  return fulfilPaidSession(session, info, deps);
}

async function onAsyncPaymentSucceeded(session: Stripe.Checkout.Session, deps: WebhookDeps): Promise<Outcome> {
  if (isAddonSession(session)) return fulfilAddonSession(session, deps);
  const info = sessionOffer(session);
  if (!info || session.mode !== "payment") return "ignored_not_guestmirror";
  return fulfilPaidSession(session, info, deps);
}

async function onAsyncPaymentFailed(session: Stripe.Checkout.Session, deps: WebhookDeps): Promise<Outcome> {
  if (isAddonSession(session)) {
    await recordPaymentOnce({
      analysisId: null,
      sessionId: session.id,
      paymentIntentId: idOf(session.payment_intent),
      amount: session.amount_total ?? null,
      status: "failed",
      plan: "addon_pack",
      priceId: session.metadata?.price_id ?? null,
    });
    await deps.track({
      eventName: "addon_purchase_failed",
      analysisId: session.metadata?.analysisId ?? null,
      dedupeKey: { field: "stripe_session_id", value: session.id },
      metadata: { source: "account", offer: "addon_pack", stripe_session_id: session.id, reason: "async_payment_failed" },
    });
    return "addon_payment_failed";
  }
  const info = sessionOffer(session);
  if (!info) return "ignored_not_guestmirror";
  await recordPaymentOnce({
    analysisId: info.analysisId,
    sessionId: session.id,
    paymentIntentId: idOf(session.payment_intent),
    amount: session.amount_total ?? null,
    status: "failed",
    plan: info.offer,
    priceId: session.metadata?.price_id ?? null,
  });
  await deps.track({
    eventName: "payment_failed",
    analysisId: info.analysisId,
    dedupeKey: { field: "stripe_session_id", value: session.id },
    metadata: { offer: info.offer, stripe_session_id: session.id, reason: "async_payment_failed" },
  });
  return "payment_failed";
}

async function onInvoicePaid(invoice: Stripe.Invoice, deps: WebhookDeps): Promise<Outcome> {
  const subscriptionId = invoiceSubscriptionId(invoice);
  const line = invoiceLine(invoice);
  const kind = classifyPrice(line.priceId);
  if (!subscriptionId || !kind) return "ignored_not_guestmirror";

  const dedupeKey = { field: "stripe_invoice_id", value: invoice.id ?? "" };
  const renewalMetadata = (plan: string) => ({
    plan,
    offer: plan,
    amount: invoice.amount_paid ?? null,
    currency: (invoice.currency || "eur").toUpperCase(),
    payment_status: "paid",
    stripe_subscription_id: subscriptionId,
    stripe_invoice_id: invoice.id,
    billing_reason: invoice.billing_reason ?? null,
  });

  if (kind.kind === "legacy_plus") {
    if (invoice.billing_reason === "subscription_create") return "legacy_plus_first_invoice";
    await deps.track({ eventName: "payment_completed", email: invoice.customer_email ?? null, dedupeKey, metadata: renewalMetadata("plus") });
    await deps.track({ eventName: "subscription_renewed", email: invoice.customer_email ?? null, dedupeKey, metadata: renewalMetadata("plus") });
    return "legacy_plus_renewed";
  }
  if (!(kind.kind === "current" && kind.offer === "conciergerie")) return "ignored_not_subscription";
  if (line.start === null || line.end === null) return "ignored_no_period";

  let grant = await getGrantBySubscriptionId(subscriptionId);
  if (!grant) {
    const email = invoice.customer_email;
    if (!email) return "ignored_no_email";
    grant = await ensureConciergerieGrant({
      email,
      subscriptionId,
      customerId: idOf(invoice.customer),
      priceId: line.priceId,
      quotaPerPeriod: CONCIERGERIE_QUOTA,
    });
  }
  const updated = (await applyPaidPeriod({
    subscriptionId,
    periodStart: new Date(line.start * 1000),
    periodEnd: new Date(line.end * 1000),
  })) ?? grant;

  // Order bump: credited only from the paid invoice that carries the pack.
  await grantOrderBumpPack(invoice, updated, deps);

  // First invoice: counted by subscription_started (checkout). Renewals: real new money.
  if (invoice.billing_reason !== "subscription_create") {
    await deps.track({ eventName: "payment_completed", email: updated.email, dedupeKey, metadata: renewalMetadata("conciergerie") });
    await deps.track({ eventName: "subscription_renewed", email: updated.email, dedupeKey, metadata: renewalMetadata("conciergerie") });
  }
  await unlockPendingReport(updated, deps);
  return "conciergerie_period_opened";
}

async function onInvoicePaymentFailed(invoice: Stripe.Invoice, deps: WebhookDeps): Promise<Outcome> {
  const subscriptionId = invoiceSubscriptionId(invoice);
  const kind = classifyPrice(invoiceLine(invoice).priceId);
  if (!subscriptionId || !kind) return "ignored_not_guestmirror";
  const plan = kind.kind === "legacy_plus" ? "plus" : "conciergerie";
  const dedupeKey = { field: "stripe_invoice_id", value: invoice.id ?? "" };
  // No new period is opened (only invoice.paid does that); Stripe's own
  // subscription update (past_due) then blocks the credits.
  await deps.track({
    eventName: "payment_failed",
    email: invoice.customer_email ?? null,
    dedupeKey,
    metadata: { offer: plan, stripe_subscription_id: subscriptionId, stripe_invoice_id: invoice.id, reason: "invoice_payment_failed" },
  });
  if (plan === "plus") {
    await deps.track({ eventName: "subscription_payment_failed", email: invoice.customer_email ?? null, dedupeKey, metadata: { plan: "plus", stripe_subscription_id: subscriptionId } });
  }
  if (invoiceAddonLine(invoice)) {
    await deps.track({
      eventName: "addon_purchase_failed",
      email: invoice.customer_email ?? null,
      dedupeKey,
      metadata: { source: "subscription_checkout", offer: "addon_pack", stripe_invoice_id: invoice.id, reason: "invoice_payment_failed" },
    });
  }
  return "renewal_failed";
}

async function onSubscriptionChanged(sub: Stripe.Subscription, eventCreated: number, deleted: boolean, deps: WebhookDeps): Promise<Outcome> {
  const kind = classifyPrice(subscriptionPriceId(sub));
  if (!kind) return "ignored_not_guestmirror";

  if (kind.kind === "legacy_plus") {
    // Unchanged legacy behaviour.
    const record = await updateSubscriptionByStripeId({
      stripeSubscriptionId: sub.id,
      status: deleted ? "canceled" : sub.status,
      currentPeriodEnd: deleted ? null : (sub.items.data[0]?.current_period_end ?? null),
    });
    if (deleted) {
      await deps.track({
        eventName: "subscription_cancelled",
        email: record?.email ?? null,
        dedupeKey: { field: "stripe_subscription_id", value: sub.id },
        metadata: { plan: "plus", stripe_subscription_id: sub.id },
      });
    }
    return deleted ? "legacy_plus_canceled" : "legacy_plus_updated";
  }
  if (!(kind.kind === "current" && kind.offer === "conciergerie")) return "ignored_not_subscription";

  const status = deleted ? "canceled" : (STRIPE_TO_GRANT_STATUS[sub.status] ?? "suspended");
  const grant = await applySubscriptionStatus({
    subscriptionId: sub.id,
    status,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    eventAt: new Date(eventCreated * 1000),
  });
  if (!grant) return "subscription_not_yet_known";
  if (deleted) {
    await deps.track({
      eventName: "subscription_cancelled",
      email: grant.email,
      dedupeKey: { field: "stripe_subscription_id", value: sub.id },
      metadata: { plan: "conciergerie", offer: "conciergerie", stripe_subscription_id: sub.id },
    });
  }
  return `conciergerie_${status}`;
}

type ReversalAction = "refund" | "dispute_opened" | "dispute_won" | "dispute_lost";

/**
 * Refunds and disputes on an add-on pack. Unused credits are withdrawn
 * (revoked) or frozen (suspended during a dispute); reports already unlocked
 * with the pack stay unlocked.
 */
async function applyPackReversal(pack: CreditPack, action: ReversalAction, key: string, deps: WebhookDeps): Promise<Outcome> {
  const status = action === "dispute_won" ? "active" : action === "dispute_opened" ? "suspended" : "revoked";
  // A refunded pack stays revoked whatever happens to a dispute afterwards.
  if (!(pack.status === "revoked" && status !== "revoked")) await setPackStatus(pack.id, status, status === "active" ? null : action);
  await deps.track({
    eventName: action === "refund" ? "addon_refunded" : action === "dispute_opened" ? "addon_disputed" : "addon_dispute_closed",
    email: pack.email,
    dedupeKey: { field: "reversal_key", value: `${key}:${action}` },
    metadata: { offer: "addon_pack", source: pack.source, pack_id: pack.id, reversal_key: `${key}:${action}`, restored: status === "active" },
  });
  return `addon_${action}_applied`;
}

/** Full refunds and disputes on one-time / lifetime purchases. */
async function onPaymentReversal(
  paymentIntentId: string | null,
  action: ReversalAction,
  deps: WebhookDeps,
  invoiceId: string | null = null
): Promise<Outcome> {
  if (!paymentIntentId) return "ignored_no_payment_intent";
  // Add-on packs first: bought alone (their own payment) or on the first
  // subscription invoice (the subscription's payment).
  const pack = await getPackByPaymentIntent(paymentIntentId);
  if (pack) {
    const outcome = await applyPackReversal(pack, action, paymentIntentId, deps);
    if (pack.source === "subscription_checkout") return outcome; // the subscription itself: unchanged, as before
    const payment = await findPaymentByIntent(paymentIntentId);
    if (payment && action === "refund") await markPayment(payment.id, { refunded: true });
    if (payment && action === "dispute_opened") await markPayment(payment.id, { disputed: true });
    if (payment && action === "dispute_won") await markPayment(payment.id, { disputed: null });
    return outcome;
  }
  const payment = await findPaymentByIntent(paymentIntentId);
  if (!payment) {
    // Not a one-time purchase: maybe the first invoice of a subscription that
    // carried the pack (looked up by invoice; recent API versions no longer
    // put the invoice on the charge).
    const invoice = invoiceId ?? (deps.invoiceIdForPaymentIntent ? await deps.invoiceIdForPaymentIntent(paymentIntentId).catch(() => null) : null);
    if (invoice) {
      const invoicePack = await getPackByInvoice(invoice);
      if (invoicePack) return applyPackReversal(invoicePack, action, paymentIntentId, deps);
      // Pack not recorded yet (events are not ordered): ask Stripe to
      // redeliver once invoice.paid has been applied.
      if (deps.invoiceHasAddonPack && (await deps.invoiceHasAddonPack(invoice).catch(() => false))) {
        throw new RetryLaterError(`pack of invoice ${invoice} not recorded yet; retry ${action} later`);
      }
    }
    // Refunds and disputes can arrive before checkout.session.completed has
    // recorded the payment. If Stripe says the payment is ours, ask for a
    // redelivery instead of dropping it: applying it now would be undone by
    // the unlock that follows.
    const metadata = deps.retrievePaymentIntentMetadata ? await deps.retrievePaymentIntentMetadata(paymentIntentId) : {};
    if (metadata.app === "guestmirror") {
      throw new RetryLaterError(`payment ${paymentIntentId} not recorded yet; retry ${action} later`);
    }
    return "ignored_not_guestmirror_or_subscription";
  }
  const lifetime = await getGrantByPaymentIntent(paymentIntentId);
  const restore = action === "dispute_won";

  if (action === "refund") await markPayment(payment.id, { refunded: true });
  if (action === "dispute_opened") await markPayment(payment.id, { disputed: true });
  if (action === "dispute_won") await markPayment(payment.id, { disputed: null });

  if (payment.analysisId) await setReportUnlocked(payment.analysisId, restore);
  if (lifetime) {
    await setGrantStatus(
      lifetime.id,
      restore ? "active" : action === "dispute_opened" ? "suspended" : "revoked",
      restore ? null : action
    );
  }
  await deps.track({
    eventName: action === "refund" ? "payment_refunded" : action === "dispute_opened" ? "payment_disputed" : "payment_dispute_closed",
    analysisId: payment.analysisId,
    dedupeKey: { field: "reversal_key", value: `${paymentIntentId}:${action}` },
    metadata: { offer: payment.plan ?? "legacy_one_time", reversal_key: `${paymentIntentId}:${action}`, restored: restore },
  });
  return `${action}_applied`;
}

/** Older API versions put the invoice on the charge. */
function chargeInvoiceId(charge: Stripe.Charge): string | null {
  return idOf((charge as unknown as { invoice?: unknown }).invoice);
}

function disputeInvoiceId(dispute: Stripe.Dispute): string | null {
  const charge = (dispute as unknown as { charge?: unknown }).charge;
  return charge && typeof charge === "object" ? chargeInvoiceId(charge as Stripe.Charge) : null;
}

export async function handleStripeEvent(event: Stripe.Event, deps: WebhookDeps): Promise<Outcome> {
  switch (event.type) {
    case "checkout.session.completed":
      return onCheckoutCompleted(event.data.object as Stripe.Checkout.Session, deps);
    case "checkout.session.async_payment_succeeded":
      return onAsyncPaymentSucceeded(event.data.object as Stripe.Checkout.Session, deps);
    case "checkout.session.async_payment_failed":
      return onAsyncPaymentFailed(event.data.object as Stripe.Checkout.Session, deps);
    case "invoice.paid":
    case "invoice.payment_succeeded":
      return onInvoicePaid(event.data.object as Stripe.Invoice, deps);
    case "invoice.payment_failed":
      return onInvoicePaymentFailed(event.data.object as Stripe.Invoice, deps);
    case "customer.subscription.created":
    case "customer.subscription.updated":
      return onSubscriptionChanged(event.data.object as Stripe.Subscription, event.created, false, deps);
    case "customer.subscription.deleted":
      return onSubscriptionChanged(event.data.object as Stripe.Subscription, event.created, true, deps);
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = idOf(charge.payment_intent);
      const invoiceId = chargeInvoiceId(charge);
      // Only a FULL refund withdraws a right; a partial refund is a gesture --
      // except a partial refund covering the add-on pack on the first
      // subscription invoice, which withdraws the pack (its unused credits).
      if (charge.refunded) return onPaymentReversal(paymentIntentId, "refund", deps, invoiceId);
      if (paymentIntentId && (charge.amount_refunded ?? 0) > 0) {
        const invoice = invoiceId ?? (deps.invoiceIdForPaymentIntent ? await deps.invoiceIdForPaymentIntent(paymentIntentId).catch(() => null) : null);
        const pack = (await getPackByPaymentIntent(paymentIntentId)) ?? (invoice ? await getPackByInvoice(invoice) : null);
        if (pack && pack.source === "subscription_checkout" && (charge.amount_refunded ?? 0) >= (pack.amount ?? Math.round(ADDON_PACK.amountEur * 100))) {
          return applyPackReversal(pack, "refund", paymentIntentId, deps);
        }
      }
      return "partial_refund_ignored";
    }
    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute;
      return onPaymentReversal(idOf(dispute.payment_intent), "dispute_opened", deps, disputeInvoiceId(dispute));
    }
    case "charge.dispute.closed": {
      const dispute = event.data.object as Stripe.Dispute;
      return onPaymentReversal(idOf(dispute.payment_intent), dispute.status === "won" ? "dispute_won" : "dispute_lost", deps, disputeInvoiceId(dispute));
    }
    default:
      return "ignored_event_type";
  }
}
