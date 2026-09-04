import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStripe } from "@/lib/stripe";
import { getSubscriptionByEmail } from "@/lib/subscriptions";
import { SITE_URL, STRIPE_CONFIGURED } from "@/lib/env";

const bodySchema = z.object({ email: z.string().trim().email() });

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (!STRIPE_CONFIGURED) {
    return NextResponse.json({ error: "Non disponible." }, { status: 400 });
  }

  const subscription = await getSubscriptionByEmail(parsed.data.email);
  if (!subscription?.stripe_customer_id) {
    return NextResponse.json({ error: "Aucun abonnement trouvé." }, { status: 404 });
  }

  try {
    const stripe = getStripe();
    const portal = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${SITE_URL}/`,
    });
    return NextResponse.json({ url: portal.url });
  } catch {
    return NextResponse.json(
      { error: "Impossible d'ouvrir le portail d'abonnement pour le moment." },
      { status: 502 }
    );
  }
}
