import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { STRIPE_CONFIGURED, SUPABASE_CONFIGURED, SITE_URL } from "@/lib/env";
import { getAnalysis, unlockAnalysis } from "@/lib/store";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { upsertSubscriptionFromCheckout, hasActivePlusSubscription } from "@/lib/subscriptions";

const bodySchema = z.object({
  analysisId: z.string().min(1),
  plan: z.enum(["one_time", "plus"]).default("one_time"),
});

async function trackSimulatedPayment(params: {
  analysisId: string;
  eventName: "payment_completed" | "one_time_payment_completed" | "subscription_started";
  plan: "one_time" | "plus";
  price: number;
}) {
  if (!SUPABASE_CONFIGURED) return;
  try {
    const supabase = getSupabaseAdmin()!;
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
      event_name: params.eventName,
      analysis_id: params.analysisId,
      anonymous_id: priorEvent?.anonymous_id ?? null,
      session_id: priorEvent?.session_id ?? null,
      email: priorEvent?.email ?? null,
      source: priorEvent?.source ?? "direct",
      metadata: {
        analysis_id: params.analysisId,
        plan: params.plan,
        price: params.price,
        currency: "EUR",
        payment_status: "paid",
        simulated: true,
        first_touch: priorMetadata?.first_touch ?? null,
        last_touch: priorMetadata?.last_touch ?? null,
      },
    });
  } catch {
    // analytics must never break checkout
  }
}

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const { analysisId, plan } = parsed.data;

  const analysis = await getAnalysis(analysisId);
  if (!analysis) {
    return NextResponse.json({ error: "Analyse introuvable." }, { status: 404 });
  }

  if (analysis.is_unlocked) {
    return NextResponse.json({ url: `/result/${analysisId}?unlocked=1` });
  }

  if (plan === "plus" && (await hasActivePlusSubscription(analysis.email))) {
    return NextResponse.json({ url: `/result/${analysisId}?unlocked=1&plus=1` });
  }

  if (!STRIPE_CONFIGURED) {
    // No Stripe keys configured (demo / early dev): simulate the unlock so
    // the full flow can still be tested end to end.
    if (plan === "plus") {
      if (analysis.email) {
        await upsertSubscriptionFromCheckout({
          email: analysis.email,
          stripeCustomerId: `sim_cus_${analysisId}`,
          stripeSubscriptionId: `sim_sub_${analysisId}`,
          status: "active",
          currentPeriodEnd: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        });
      }
      await trackSimulatedPayment({ analysisId, eventName: "subscription_started", plan, price: 6.9 });
      return NextResponse.json({ url: `/result/${analysisId}?unlocked=1&plus=1&simulated=1` });
    }

    await unlockAnalysis(analysisId, "paid");
    await trackSimulatedPayment({ analysisId, eventName: "payment_completed", plan, price: 4.9 });
    await trackSimulatedPayment({ analysisId, eventName: "one_time_payment_completed", plan, price: 4.9 });
    return NextResponse.json({ url: `/result/${analysisId}?unlocked=1&simulated=1` });
  }

  try {
    const stripe = getStripe();

    if (plan === "plus") {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: process.env.STRIPE_PRICE_PLUS_MONTHLY!, quantity: 1 }],
        customer_email: analysis.email || undefined,
        success_url: `${SITE_URL}/result/${analysisId}?unlocked=1&plus=1&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${SITE_URL}/result/${analysisId}?canceled=1`,
        metadata: { analysisId, plan: "plus" },
        subscription_data: { metadata: { analysisId, plan: "plus" } },
      });
      return NextResponse.json({ url: session.url });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: process.env.STRIPE_PRICE_ONE_TIME!, quantity: 1 }],
      success_url: `${SITE_URL}/result/${analysisId}?unlocked=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/result/${analysisId}?canceled=1`,
      metadata: { analysisId, plan: "one_time" },
    });
    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json(
      { error: "Le paiement n'a pas pu être initié. Merci de réessayer." },
      { status: 502 }
    );
  }
}
