import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { STRIPE_CONFIGURED, SITE_URL } from "@/lib/env";
import { getAnalysis, unlockAnalysis } from "@/lib/store";
import { getStripe } from "@/lib/stripe";

const bodySchema = z.object({ analysisId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const { analysisId } = parsed.data;

  const analysis = await getAnalysis(analysisId);
  if (!analysis) {
    return NextResponse.json({ error: "Analyse introuvable." }, { status: 404 });
  }

  if (analysis.is_unlocked) {
    return NextResponse.json({ url: `/result/${analysisId}?unlocked=1` });
  }

  if (!STRIPE_CONFIGURED) {
    // No Stripe keys configured (demo / early dev): simulate the unlock so
    // the full flow can still be tested end to end.
    await unlockAnalysis(analysisId, "paid");
    return NextResponse.json({ url: `/result/${analysisId}?unlocked=1&simulated=1` });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      success_url: `${SITE_URL}/result/${analysisId}?unlocked=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/result/${analysisId}?canceled=1`,
      metadata: { analysisId },
    });
    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json(
      { error: "Le paiement n'a pas pu être initié. Merci de réessayer." },
      { status: 502 }
    );
  }
}
