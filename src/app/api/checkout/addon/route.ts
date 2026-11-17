import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type Stripe from "stripe";
import { SITE_URL } from "@/lib/env";
import { getAnalysis } from "@/lib/store";
import { getStripe } from "@/lib/stripe";
import { ADDON_PACK, PRICING_VERSION, addonPackPriceId, stripeModeOf } from "@/lib/plans";
import { getAccessForEmail } from "@/lib/access/reportAccess";
import { getGrantById } from "@/lib/access/accessStore";
import { handleStripeEvent } from "@/lib/stripe/webhookHandlers";

// Buys the one-time "10 analyses" pack from the report page, for a verified
// Conciergerie subscriber in a paid period. The browser only sends the report
// it is on; who may buy, the price and the email credited are decided here.
// The credits are granted by the verified webhook once Stripe confirms the
// payment (lib/stripe/webhookHandlers.ts), never by the return redirect.

const bodySchema = z.object({ analysisId: z.string().min(1) });
const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Requête invalide." }, 400);
  const { analysisId } = parsed.data;

  const analysis = await getAnalysis(analysisId);
  if (!analysis) return json({ error: "Analyse introuvable." }, 404);

  const access = await getAccessForEmail(analysis.email);
  if (!access.verified || !access.email) return json({ error: "Vérifie d'abord ton e-mail.", code: "verify_first" }, 403);
  // Unlimited rights (lifetime, legacy Plus): a pack would be useless.
  if (access.unlimited) return json({ error: "Tes analyses sont déjà illimitées.", code: "unlimited" }, 409);
  if (!access.conciergerie?.canBuyAddon) {
    return json({ error: "Le pack est réservé aux abonnés Conciergerie actifs.", code: "not_subscriber" }, 403);
  }
  const grant = await getGrantById(access.conciergerie.grantId);
  if (!grant) return json({ error: "Abonnement introuvable." }, 404);

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return simulateAddonPurchase(analysisId, access.email, grant.id);

  const priceId = addonPackPriceId(stripeModeOf(secretKey));
  if (!priceId) return json({ error: "Le pack d'analyses n'est pas disponible pour le moment." }, 503);

  const metadata = {
    app: "guestmirror",
    offer: "addon_pack",
    source: "account",
    email: access.email,
    grant_id: grant.id,
    analysisId,
    price_id: priceId,
    pricing_version: PRICING_VERSION,
  };
  const resultUrl = `${SITE_URL}/result/${analysisId}`;
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    // Same Stripe customer as the subscription when known (saved card, one history).
    ...(grant.stripeCustomerId ? { customer: grant.stripeCustomerId } : { customer_email: access.email }),
    client_reference_id: analysisId,
    success_url: `${resultUrl}?addon=success`,
    cancel_url: `${resultUrl}?addon=canceled`,
    metadata,
    payment_intent_data: { metadata },
  };
  try {
    const session = await getStripe().checkout.sessions.create(params);
    return json({ url: session.url });
  } catch (err) {
    console.error("[checkout/addon] session creation failed:", err instanceof Error ? err.message : err);
    return json({ error: "Le paiement n'a pas pu être initié. Merci de réessayer." }, 502);
  }
}

/** Local demo only (no Stripe key): the same webhook handling a real payment triggers. */
async function simulateAddonPurchase(analysisId: string, email: string, grantId: string) {
  const sessionId = `cs_sim_addon_${analysisId}_${Date.now()}`;
  await handleStripeEvent(
    {
      id: `evt_sim_${sessionId}`,
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      data: {
        object: {
          id: sessionId,
          mode: "payment",
          payment_status: "paid",
          payment_intent: `pi_sim_${sessionId}`,
          customer_details: { email },
          amount_total: Math.round(ADDON_PACK.amountEur * 100),
          currency: "eur",
          metadata: { app: "guestmirror", offer: "addon_pack", source: "account", email, grant_id: grantId, analysisId, price_id: addonPackPriceId("test") ?? "" },
        },
      },
    } as unknown as Stripe.Event,
    { track: async () => {}, sendUnlockEmail: async () => {} }
  );
  return json({ url: `/result/${analysisId}?addon=success&simulated=1` });
}
