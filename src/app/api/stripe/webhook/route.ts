import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendUnlockEmail } from "@/lib/email";
import { claimStripeEvent, completeStripeEvent } from "@/lib/access/accessStore";
import { handleStripeEvent } from "@/lib/stripe/webhookHandlers";
import { randomUUID } from "crypto";
import type Stripe from "stripe";

// Stripe webhook (pricing v2). This route only:
//  1. verifies the signature (STRIPE_WEBHOOK_SECRET) -- nothing unsigned is
//     ever trusted;
//  2. journals the event id (stripe_events), so a redelivered event that was
//     already processed is acknowledged without being applied twice;
//  3. hands the event to lib/stripe/webhookHandlers.ts, which grants rights
//     only on confirmed payments and ignores non-GuestMirror events.
// A handler failure returns 500 so Stripe retries; the event stays
// unprocessed in the journal and is applied in full on the retry.

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

  // Paywall presentation experiment (lib/paywallExperiment.ts): a payment
  // belongs to the paywall that was on screen when checkout started. That
  // is the latest checkout_started of this analysis, not its earliest
  // event -- an analysis can be created in one browser and paid from
  // another, each with its own assignment.
  let paywallVariant: unknown = priorMetadata?.paywall_variant ?? null;
  if (params.analysisId) {
    const { data: checkoutEvent } = await supabase
      .from("analytics_events")
      .select("metadata")
      .eq("analysis_id", params.analysisId)
      .eq("event_name", "checkout_started")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const checkoutMetadata = (checkoutEvent?.metadata as Record<string, unknown> | null) ?? null;
    paywallVariant = checkoutMetadata?.paywall_variant ?? paywallVariant;
  }

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
      // Same propagation pattern as first_touch/last_touch: webhook events
      // have no browser cookie to read, so the A/B variant is carried over
      // from the earliest client-side event tracked against this analysis
      // (e.g. aha_moment_viewed / free_result_viewed on first page view).
      ab_variant: priorMetadata?.ab_variant ?? null,
      paywall_variant: paywallVariant,
      // Same idea for airbnb_url vs screenshot vs mixed (see
      // AnalyzeWizard's inputMethod()) -- lets /admin/analytics compare
      // payment_completed by method without a second lookup.
      input_method: priorMetadata?.input_method ?? null,
      // Same idea again for the profile question (see StepProfile) --
      // lets /admin/analytics cross plan choice x payments with property
      // count / user type without a second lookup.
      user_type: priorMetadata?.user_type ?? null,
      property_count_range: priorMetadata?.property_count_range ?? null,
    },
  });
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
    const claim = await claimStripeEvent(event);
    if (claim === "already_processed") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    const outcome = await handleStripeEvent(event, {
      track: (params) =>
        trackServerEvent(params).catch((err: unknown) => {
          // analytics must never break payment handling
          console.error(`[stripe] analytics failed event=${event.id}:`, err instanceof Error ? err.message : err);
        }),
      sendUnlockEmail,
      retrieveSubscription: (id) => stripe.subscriptions.retrieve(id),
      retrievePaymentIntentMetadata: async (id) => (await stripe.paymentIntents.retrieve(id)).metadata ?? {},
    });
    await completeStripeEvent(event.id, outcome);
    console.log(`[stripe] event=${event.id} type=${event.type} outcome=${outcome}`);
  } catch (err) {
    // Real failure (e.g. a database write): 500 so Stripe redelivers. The
    // journal row stays unprocessed, so the retry applies the event in full;
    // every write in the handlers is idempotent.
    console.error(`[stripe] webhook handling failed event=${event.id} type=${event.type}:`, err);
    return NextResponse.json({ error: "Traitement du webhook échoué." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
