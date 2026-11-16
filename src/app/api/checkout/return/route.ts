import { NextRequest, NextResponse } from "next/server";
import { SITE_URL } from "@/lib/env";
import { getStripe } from "@/lib/stripe";
import { getAnalysis } from "@/lib/store";
import { normalizeEmail } from "@/lib/access/accessStore";
import { openSession, setAccessCookie } from "@/lib/access/session";

// Return from Stripe Checkout. Grants NOTHING by itself (the verified webhook
// does): it only recognises the buyer of a subscription / lifetime so they do
// not have to type an emailed code right after paying. That session is
// limited to the rights bought in THIS checkout (scope), so paying with
// someone else's email never reveals their other rights.

const SESSION_ID_PATTERN = /^cs_(test|live)_[A-Za-z0-9]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id") ?? "";
  const analysisId = req.nextUrl.searchParams.get("analysis_id") ?? "";
  if (!UUID.test(analysisId)) return NextResponse.redirect(`${SITE_URL}/`);
  const target = new URL(`/result/${analysisId}`, SITE_URL);
  target.searchParams.set("unlocked", "1");
  target.searchParams.set("checkout", "success");

  if (!SESSION_ID_PATTERN.test(sessionId) || !process.env.STRIPE_SECRET_KEY) return NextResponse.redirect(target);

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    const offer = session.metadata?.offer ?? null;
    if (offer) target.searchParams.set("offer", offer);
    const analysis = await getAnalysis(analysisId);
    const buyer = normalizeEmail(session.customer_details?.email ?? session.customer_email);
    const sameReport = session.metadata?.app === "guestmirror" && session.metadata?.analysisId === analysisId;
    if (
      sameReport &&
      session.status === "complete" &&
      (offer === "conciergerie" || offer === "lifetime") &&
      buyer &&
      buyer === normalizeEmail(analysis?.email)
    ) {
      const res = NextResponse.redirect(target);
      setAccessCookie(res, await openSession(buyer, session.id));
      return res;
    }
  } catch (err) {
    console.error("[checkout/return] session lookup failed:", err instanceof Error ? err.message : err);
  }
  return NextResponse.redirect(target);
}
