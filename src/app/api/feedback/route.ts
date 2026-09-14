import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAnalysis } from "@/lib/store";
import { createFeedback } from "@/lib/feedback";

const bodySchema = z.object({
  analysisId: z.string().uuid().nullable().optional(),
  plan: z.enum(["one_time", "plus", "lifetime"]).nullable().optional(),
  userType: z.enum(["host", "concierge", "cohost", "other"]).nullable().optional(),
  propertyCountRange: z.enum(["1", "2-5", "6-20", "21+"]).nullable().optional(),
  feedbackRating: z.enum(["positive", "negative"]).nullable().optional(),
  feedbackText: z.string().trim().max(2000).nullable().optional(),
  testimonialText: z.string().trim().max(2000).nullable().optional(),
  testimonialPermission: z.boolean().optional(),
});

/**
 * Always optional, never blocks report access (see PostPurchaseFeedback) --
 * this endpoint mirrors that by never surfacing an error the UI would act
 * on; a failed save here is a lost data point, not a broken product flow.
 */
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
  const data = parsed.data;

  const email = data.analysisId ? (await getAnalysis(data.analysisId))?.email ?? null : null;

  await createFeedback({
    analysisId: data.analysisId ?? null,
    email,
    feedbackRating: data.feedbackRating ?? null,
    feedbackText: data.feedbackText ?? null,
    testimonialText: data.testimonialText ?? null,
    testimonialPermission: Boolean(data.testimonialText) && Boolean(data.testimonialPermission),
    plan: data.plan ?? null,
    userType: data.userType ?? null,
    propertyCountRange: data.propertyCountRange ?? null,
  });

  return NextResponse.json({ ok: true });
}
