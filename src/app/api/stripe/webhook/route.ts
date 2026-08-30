import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { unlockAnalysis } from "@/lib/store";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { randomUUID } from "crypto";

/**
 * Records the authoritative payment_completed analytics event once the
 * Stripe webhook confirms a real payment -- never inferred from the
 * client-side success redirect alone. Idempotent: Stripe retries webhook
 * deliveries, so this is a no-op if we've already recorded this session.
 * Best-effort attribution: reuses the source/UTM already captured on this
 * analysis's earlier funnel events (the webhook itself has no browser
 * context to read UTM params from).
 */
async function trackPaymentCompleted(params: {
  analysisId: string;
  stripeSessionId: string;
  amount: number | null;
  paymentIntentId: string | null;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { data: existing } = await supabase
    .from("analytics_events")
    .select("id")
    .eq("event_name", "payment_completed")
    .contains("metadata", { stripe_session_id: params.stripeSessionId })
    .maybeSingle();
  if (existing) return;

  const { data: priorEvent } = await supabase
    .from("analytics_events")
    .select("source, anonymous_id, session_id, email, metadata")
    .eq("analysis_id", params.analysisId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const priorMetadata = (priorEvent?.metadata as Record<string, unknown> | null) ?? null;

  await supabase.from("analytics_events").insert({
    id: randomUUID(),
    event_name: "payment_completed",
    analysis_id: params.analysisId,
    anonymous_id: priorEvent?.anonymous_id ?? null,
    session_id: priorEvent?.session_id ?? null,
    email: priorEvent?.email ?? null,
    source: priorEvent?.source ?? "direct",
    metadata: {
      analysis_id: params.analysisId,
      amount: params.amount,
      currency: "EUR",
      payment_status: "paid",
      stripe_session_id: params.stripeSessionId,
      stripe_payment_intent_id: params.paymentIntentId,
      first_touch: priorMetadata?.first_touch ?? null,
      last_touch: priorMetadata?.last_touch ?? null,
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

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as { metadata?: { analysisId?: string }; id: string; payment_intent?: string; amount_total?: number | null };
    const analysisId = session.metadata?.analysisId;

    if (analysisId) {
      await unlockAnalysis(analysisId, "paid");

      if (SUPABASE_CONFIGURED) {
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
          await trackPaymentCompleted({
            analysisId,
            stripeSessionId: session.id,
            amount: session.amount_total ?? null,
            paymentIntentId: (session.payment_intent as string) ?? null,
          });
        } catch {
          // analytics must never break payment confirmation handling
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
