import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getLatestUnlockedAnalysisByEmail } from "@/lib/store";
import { getSubscriptionByEmail, isPlusActive, isLifetimeActive } from "@/lib/subscriptions";

const querySchema = z.object({ email: z.string().trim().email() });

/**
 * Lets the analyze form nudge a returning customer toward their existing
 * unlocked report instead of unknowingly starting (and possibly paying
 * for) a brand new one -- see the support case where a customer forgot
 * she already had a paid analysis and reran the test.
 *
 * Deliberately returns as little as possible (just enough to link to the
 * report): this app has no auth, so an analysisId already doubles as the
 * sole access token for viewing a report anywhere else (share links,
 * Stripe success redirects) -- this endpoint doesn't introduce a new
 * capability beyond that, but there's no reason to also leak the score.
 */
export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse({ email: req.nextUrl.searchParams.get("email") });
  if (!parsed.success) {
    return NextResponse.json({ found: false });
  }
  const { email } = parsed.data;

  const subscription = await getSubscriptionByEmail(email);
  if (isPlusActive(subscription) || isLifetimeActive(subscription)) {
    const latest = await getLatestUnlockedAnalysisByEmail(email);
    if (latest) return NextResponse.json({ found: true, analysisId: latest.id });
    // Active Plus but no unlocked analysis on file yet (edge case, e.g.
    // subscribed without ever running a test) -- nothing to link to.
    return NextResponse.json({ found: false });
  }

  const latest = await getLatestUnlockedAnalysisByEmail(email);
  if (!latest) return NextResponse.json({ found: false });
  return NextResponse.json({ found: true, analysisId: latest.id });
}
