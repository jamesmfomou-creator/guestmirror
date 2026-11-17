import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type Stripe from "stripe";
import { SITE_URL } from "@/lib/env";
import { getAnalysis } from "@/lib/store";
import { getStripe } from "@/lib/stripe";
import { ADDON_PACK, OFFERS, PRICING_VERSION, addonPackPriceId, isOfferId, priceIdFor, stripeModeOf, type OfferId } from "@/lib/plans";
import { getAccessForEmail } from "@/lib/access/reportAccess";
import { listGrantsByEmail } from "@/lib/access/accessStore";
import { isConciergerieGrantUsable, isLifetimeGrantActive } from "@/lib/access/entitlements";
import { handleStripeEvent } from "@/lib/stripe/webhookHandlers";
import { openSession, setAccessCookie } from "@/lib/access/session";

// Starts a Stripe Checkout for one of the three offers (lib/plans.ts).
//
// The browser only sends an offer id; the price is chosen here, from the
// server-side catalogue -- never a price id or an amount from the client.
// Nothing is granted here: rights are activated by the verified webhook
// (lib/stripe/webhookHandlers.ts) once Stripe confirms the payment.

const bodySchema = z.object({
  analysisId: z.string().min(1),
  offer: z.string().optional(),
  // Pages rendered before pricing v2 still send `plan`.
  plan: z.string().optional(),
  // Conciergerie only: add the one-time "10 analyses" pack to the first payment.
  addon: z.boolean().optional(),
});

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Requête invalide." }, 400);
  const { analysisId } = parsed.data;
  const requested = parsed.data.offer ?? parsed.data.plan ?? "one_time";
  if (requested === "plus") {
    return json({ error: "Nos offres ont changé. Recharge la page pour voir les nouvelles formules.", code: "offers_changed" }, 409);
  }
  if (!isOfferId(requested)) return json({ error: "Offre inconnue." }, 400);
  const offer: OfferId = requested;
  const wantsAddon = offer === "conciergerie" && parsed.data.addon === true;

  const analysis = await getAnalysis(analysisId);
  if (!analysis) return json({ error: "Analyse introuvable." }, 404);
  const resultUrl = `/result/${analysisId}`;

  // Already readable: never charge again.
  if (analysis.is_unlocked) return json({ url: `${resultUrl}?unlocked=1` });
  const access = await getAccessForEmail(analysis.email);
  if (access.unlimited) return json({ url: resultUrl });

  // One subscription / one lifetime per email: send the owner to their existing right.
  const grants = await listGrantsByEmail(analysis.email);
  const hasConciergerie = grants.some((g) => isConciergerieGrantUsable(g, Date.now()));
  const hasLifetime = grants.some(isLifetimeGrantActive);
  if ((offer === "conciergerie" && hasConciergerie) || (offer === "lifetime" && hasLifetime) || (offer === "conciergerie" && hasLifetime)) {
    if (access.verified) return json({ url: resultUrl });
    return json(
      {
        error:
          offer === "conciergerie" && hasConciergerie
            ? "Tu as déjà un abonnement Conciergerie avec cet e-mail : vérifie ton e-mail pour l'utiliser."
            : "Tu as déjà l'accès à vie avec cet e-mail : vérifie ton e-mail pour l'utiliser.",
        code: "verify_first",
      },
      409
    );
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return simulatePurchase(offer, analysisId, analysis.email, wantsAddon);

  const mode = stripeModeOf(secretKey);
  const priceId = priceIdFor(offer, mode);
  if (!priceId) return json({ error: "Cette offre n'est pas disponible pour le moment." }, 503);

  // The pack is only ever added to a Conciergerie checkout, and only when the
  // visitor ticked it. Its price comes from the server catalogue.
  const addonPriceId = offer === "conciergerie" && wantsAddon ? addonPackPriceId(mode) : null;
  if (offer === "conciergerie" && wantsAddon && !addonPriceId) {
    return json({ error: "Le pack d'analyses n'est pas disponible pour le moment.", code: "addon_unavailable" }, 503);
  }

  const metadata = {
    app: "guestmirror",
    offer,
    analysisId,
    price_id: priceId,
    pricing_version: PRICING_VERSION,
    ...(addonPriceId ? { addon: "addon_pack", addon_price_id: addonPriceId } : {}),
  };
  const common: Stripe.Checkout.SessionCreateParams = {
    line_items: [{ price: priceId, quantity: 1 }, ...(addonPriceId ? [{ price: addonPriceId, quantity: 1 }] : [])],
    // Locks the email on Stripe's page to the one the report is tied to.
    customer_email: analysis.email || undefined,
    client_reference_id: analysisId,
    success_url: `${SITE_URL}/api/checkout/return?session_id={CHECKOUT_SESSION_ID}&analysis_id=${analysisId}`,
    cancel_url: `${SITE_URL}${resultUrl}?canceled=1`,
    metadata,
  };

  try {
    const stripe = getStripe();
    const session =
      OFFERS[offer].checkoutMode === "subscription"
        ? await stripe.checkout.sessions.create({ ...common, mode: "subscription", subscription_data: { metadata } })
        : await stripe.checkout.sessions.create({
            ...common,
            mode: "payment",
            payment_intent_data: { metadata },
            ...(offer === "lifetime" ? { customer_creation: "always" as const } : {}),
          });
    return json({ url: session.url });
  } catch (err) {
    console.error(`[checkout] session creation failed offer=${offer}:`, err instanceof Error ? err.message : err);
    return json({ error: "Le paiement n'a pas pu être initié. Merci de réessayer." }, 502);
  }
}

/**
 * Local demo only (no Stripe key): runs the very same webhook handling a real
 * payment would trigger, with synthetic events, so every offer can be tried
 * end to end without Stripe. Never reachable when a Stripe key is configured.
 */
async function simulatePurchase(offer: OfferId, analysisId: string, email: string | null, addon = false) {
  if (!email) return json({ error: "Ajoute un e-mail à ton analyse pour simuler un paiement." }, 400);
  const sessionId = `cs_sim_${analysisId}_${offer}`;
  const nowS = Math.floor(Date.now() / 1000);
  const deps = { track: async () => {}, sendUnlockEmail: async () => {} };
  const metadata = { app: "guestmirror", offer, analysisId, price_id: priceIdFor(offer, "live") ?? "" };
  const evt = (type: string, object: unknown) =>
    ({ id: `evt_sim_${type}_${sessionId}`, type, created: nowS, livemode: false, data: { object } }) as unknown as Stripe.Event;

  if (offer === "conciergerie") {
    const subscriptionId = `sub_sim_${analysisId}`;
    await handleStripeEvent(
      evt("checkout.session.completed", {
        id: sessionId,
        mode: "subscription",
        payment_status: "paid",
        subscription: subscriptionId,
        customer: `cus_sim_${analysisId}`,
        customer_details: { email },
        metadata,
      }),
      deps
    );
    await handleStripeEvent(
      evt("invoice.paid", {
        id: `in_sim_${analysisId}`,
        billing_reason: "subscription_create",
        customer_email: email,
        parent: { subscription_details: { subscription: subscriptionId } },
        lines: {
          data: [
            { pricing: { price_details: { price: metadata.price_id } }, period: { start: nowS, end: nowS + 30 * 86400 } },
            ...(addon
              ? [{ pricing: { price_details: { price: addonPackPriceId("test") } }, amount: Math.round(ADDON_PACK.amountEur * 100), period: { start: nowS, end: nowS } }]
              : []),
          ],
        },
      }),
      deps
    );
  } else {
    await handleStripeEvent(
      evt("checkout.session.completed", {
        id: sessionId,
        mode: "payment",
        payment_status: "paid",
        payment_intent: `pi_sim_${analysisId}_${offer}`,
        customer_details: { email },
        amount_total: Math.round(OFFERS[offer].amountEur * 100),
        currency: "eur",
        metadata,
      }),
      deps
    );
  }
  const res = json({ url: `/result/${analysisId}?unlocked=1&offer=${offer}&simulated=1` });
  if (offer !== "one_time") setAccessCookie(res, await openSession(email.trim().toLowerCase(), sessionId));
  return res;
}
