import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { listPublicTestimonials, PublicTestimonial } from "@/lib/feedback";

export type ShowcaseItem =
  | { type: "score"; score: number }
  | { type: "testimonial"; text: string; userType: PublicTestimonial["userType"]; propertyCountRange: PublicTestimonial["propertyCountRange"] };

/**
 * Real, recent overall_score values only -- fully anonymous (no listing
 * info, no email, nothing beyond the number itself), so there's nothing
 * to consent to or fabricate. Includes low scores too: the product's
 * whole premise is an honest first-impression read, so only showing high
 * scores here would be its own quiet form of the "never invent a number"
 * rule this app has held to everywhere else.
 */
async function getRecentScores(limit = 24): Promise<number[]> {
  if (!SUPABASE_CONFIGURED) return [];
  const supabase = getSupabaseAdmin()!;
  const { data } = await supabase
    .from("analyses")
    .select("overall_score")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((row) => row.overall_score);
}

/**
 * Interleaves real scores and real testimonials into one ordered list for
 * the scrolling banner (see ScrollingShowcase). Never pads with anything
 * fabricated -- if there are no testimonials yet, the list is scores only.
 */
export async function getShowcaseItems(): Promise<ShowcaseItem[]> {
  const [scores, testimonials] = await Promise.all([getRecentScores(), listPublicTestimonials()]);

  const scoreItems: ShowcaseItem[] = scores.map((score) => ({ type: "score", score }));
  const testimonialItems: ShowcaseItem[] = testimonials.map((t) => ({
    type: "testimonial",
    text: t.text,
    userType: t.userType,
    propertyCountRange: t.propertyCountRange,
  }));

  const items: ShowcaseItem[] = [];
  let si = 0;
  let ti = 0;
  // Roughly one testimonial per 3 scores when testimonials exist, so real
  // quotes stay woven through the strip instead of clumped at one end.
  while (si < scoreItems.length || ti < testimonialItems.length) {
    for (let i = 0; i < 3 && si < scoreItems.length; i++) items.push(scoreItems[si++]);
    if (ti < testimonialItems.length) items.push(testimonialItems[ti++]);
  }
  return items;
}
