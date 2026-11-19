import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStripe } from "@/lib/stripe";
import { getAnalysis } from "@/lib/store";
import { getAccessForEmail } from "@/lib/access/reportAccess";
import { currentIdentity } from "@/lib/access/session";
import { SITE_URL } from "@/lib/env";

// Opens the Stripe billing portal (cancel, invoices, card) for the
// subscription tied to a report's email -- only for a visitor who has proved
// they own that email (lib/access/session.ts). It used to accept any typed
// email, which let anyone open anyone's portal.

// analysisId: from a report page (rights of that report's email). Absent:
// from Mon espace (/espace), the rights of the email this browser proved.
const bodySchema = z.object({ analysisId: z.string().uuid().optional() });
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400, headers: NO_STORE });
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "Non disponible." }, { status: 400, headers: NO_STORE });

  let email: string | null;
  let returnPath: string;
  if (parsed.data.analysisId) {
    const analysis = await getAnalysis(parsed.data.analysisId);
    if (!analysis) return NextResponse.json({ error: "Rapport introuvable." }, { status: 404, headers: NO_STORE });
    email = analysis.email;
    returnPath = `/result/${analysis.id}`;
  } else {
    const identity = await currentIdentity();
    // A checkout-return session (scoped) proves a payment, not the mailbox.
    if (!identity || identity.scopeCheckoutSessionId) {
      return NextResponse.json({ error: "Connecte-toi d'abord à ton espace." }, { status: 403, headers: NO_STORE });
    }
    email = identity.email;
    returnPath = "/espace";
  }
  const access = await getAccessForEmail(email);
  if (!access.verified || !access.portalCustomerId) {
    return NextResponse.json({ error: "Vérifie d'abord ton e-mail." }, { status: 403, headers: NO_STORE });
  }

  try {
    const portal = await getStripe().billingPortal.sessions.create({
      customer: access.portalCustomerId,
      return_url: `${SITE_URL}${returnPath}`,
    });
    return NextResponse.json({ url: portal.url }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Impossible d'ouvrir le portail d'abonnement pour le moment." }, { status: 502, headers: NO_STORE });
  }
}
