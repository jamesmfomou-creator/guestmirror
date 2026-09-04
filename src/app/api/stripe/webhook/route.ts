import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { unlockAnalysis } from "@/lib/store";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { upsertSubscriptionFromCheckout, updateSubscriptionByStripeId } from "@/lib/subscriptions";
import { randomUUID } from "crypto";
import type Stripe from "stripe";

/**
 * As of this Stripe API version, `current_period_end` lives on each
 * subscription item, not on the top-level Subscription object.
 */
function subscriptionPeriodEnd(subscription: Stripe.Subscription): number | null {
  return subscription.items.data[0]?.current_period_end ?? null;
}

/**
 * Records an authoritative analytics event once Stripe confirms something
 * real happened -- never inferred from a client-side success redirect.
 * Idempotent by default (dedupeKey checked against existing metadata)
 * since Stripe retries webhook deliveries.
 */
async function trackServerEvent(params: {
  eventName: string;
  analysisId?: string | null;
  email?: string | null;
  dedupeKey?: { field: string; value: string };
  metadata: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  if (params.dedupeKey) {
    const { data: existing } = await supabase
      .from("analytics_events")
      .select("id")
      .eq("event_name", params.eventName)
      .contains("metadata", { [params.dedupeKey.field]: params.dedupeKey.value })
      .maybeSingle();
    if (existing) return;
  }

  let priorEvent: { source: string | null; anonymous_id: string | null; session_id: string | null; metadata: unknown } | null = null;
  if (params.analysisId) {
    const { data } = await supabase
      .from("analytics_events")
      .select("source, anonymous_id, session_id, metadata")
      .eq("analysis_id", params.analysisId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    priorEvent = data;
  }
  const priorMetadata = (priorEvent?.metadata as Record<string, unknown> | null) ?? null;

  await supabase.from("analytics_events").insert({
    id: randomUUID(),
    event_name: params.eventName,
    analysis_id: params.analysisId ?? null,
    anonymous_id: priorEvent?.anonymous_id ?? null,
    session_id: priorEvent?.session_id ?? null,
    email: params.email ?? null,
    source: priorEvent?.source ?? "direct",
    metadata: {
      ...params.metadata,
      first_touch: priorMetadata?.first_touch ?? null,
      last_touch: priorMetadata?.last_touch ?? null,
    },
  });
}

async function handleOneTimeCheckout(session: Stripe.Checkout.Session) {
  const analysisId = session.metadata?.analysisId;
  if (!analysisId) return;

  await unlockAnalysis(analysisId, "paid");

  if (!SUPABASE_CONFIGURED) return;
  const supabase = getSupabaseAdmin()!;
  await supabase.from("payments").insert({
    id: randomUUID(),
    analysis_id: analysisId,
    stripe_session_id: session.id,
    stripe_payment_intent_id: (session.payment_intent as string) ?? null,
    amount: session.amount_total ?? null,
    status: "paid",
  });

  try {
    const dedupeKey = { field: "stripe_session_id", value: session.id };
    const metadata = {
      analysis_id: analysisId,
      plan: "one_time",
      amount: session.amount_total ?? null,
      currency: "EUR",
      payment_status: "paid",
      stripe_session_id: session.id,
      stripe_payment_intent_id: (session.payment_intent as string) ?? null,
    };
    // Keep firing the original generic event so the existing funnel table
    // in /admin/analytics keeps working unchanged, plus the new plan-
    // specific event for the one-time-vs-plus comparison.
    await trackServerEvent({ eventName: "payment_completed", analysisId, dedupeKey, metadata });
    await trackServerEvent({ eventName: "one_time_payment_completed", analysisId, dedupeKey, metadata });
  } catch {
    // analytics must never break payment confirmation handling
  }
}

async function handleSubscriptionCheckout(session: Stripe.Checkout.Session) {
  const analysisId = session.metadata?.analysisId ?? null;
  const email = session.customer_details?.email || session.customer_email;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (!email || !subscriptionId || !customerId) return;

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const periodEnd = subscriptionPeriodEnd(subscription);

  await upsertSubscriptionFromCheckout({
    email,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    status: subscription.status,
    currentPeriodEnd: periodEnd,
  });

  try {
    await trackServerEvent({
      eventName: "subscription_started",
      analysisId,
      email,
      dedupeKey: { field: "stripe_subscription_id", value: subscriptionId },
      metadata: {
        plan: "plus",
        price: 6.9,
        currency: "EUR",
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
      },
    });
  } catch {
    // analytics must never break subscription confirmation handling
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const periodEnd = subscriptionPeriodEnd(subscription);
  await updateSubscriptionByStripeId({
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodEnd: periodEnd,
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const record = await updateSubscriptionByStripeId({
    stripeSubscriptionId: subscription.id,
    status: "canceled",
    currentPeriodEnd: null,
  });

  try {
    await trackServerEvent({
      eventName: "subscription_cancelled",
      email: record?.email ?? null,
      dedupeKey: { field: "stripe_subscription_id", value: subscription.id },
      metadata: { plan: "plus", stripe_subscription_id: subscription.id },
    });
  } catch {
    // analytics must never break webhook handling
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId =
    typeof (invoice as unknown as { subscription?: string | { id: string } }).subscription === "string"
      ? (invoice as unknown as { subscription?: string }).subscription
      : (invoice as unknown as { subscription?: { id: string } }).subscription?.id;
  if (!subscriptionId || !SUPABASE_CONFIGURED) return;

  const supabase = getSupabaseAdmin()!;
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("email")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  try {
    await trackServerEvent({
      eventName: "subscription_payment_failed",
      email: sub?.email ?? null,
      metadata: { plan: "plus", stripe_subscription_id: subscriptionId },
    });
  } catch {
    // analytics must never break webhook handling
  }
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook non configuré." }, { status: 400 });
  }

  const rawBody = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription") {
          await handleSubscriptionCheckout(session);
        } else {
          await handleOneTimeCheckout(session);
        }
        break;
      }
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        break;
    }
  } catch {
    // Stripe retries on non-2xx; we've already done what we safely can.
  }

  return NextResponse.json({ received: true });
}
