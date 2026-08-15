import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { unlockAnalysis } from "@/lib/store";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { randomUUID } from "crypto";

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
      }
    }
  }

  return NextResponse.json({ received: true });
}
