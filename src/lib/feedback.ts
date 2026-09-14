import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { UserType, PropertyCountRange } from "@/lib/types";

export type FeedbackRating = "positive" | "negative";
export type FeedbackPlan = "one_time" | "plus" | "lifetime";

export interface FeedbackInput {
  analysisId: string | null;
  email: string | null;
  feedbackRating: FeedbackRating | null;
  feedbackText: string | null;
  testimonialText: string | null;
  testimonialPermission: boolean;
  plan: FeedbackPlan | null;
  userType: UserType | null;
  propertyCountRange: PropertyCountRange | null;
}

export interface FeedbackRow extends FeedbackInput {
  id: string;
  createdAt: string;
}

/** Post-purchase feedback/testimonial -- always optional, never blocks access to the report. */
export async function createFeedback(input: FeedbackInput): Promise<{ id: string } | null> {
  if (!SUPABASE_CONFIGURED) return null;
  const supabase = getSupabaseAdmin()!;
  const id = randomUUID();
  const { error } = await supabase.from("feedback").insert({
    id,
    analysis_id: input.analysisId,
    email: input.email,
    feedback_rating: input.feedbackRating,
    feedback_text: input.feedbackText,
    testimonial_text: input.testimonialText,
    testimonial_permission: input.testimonialPermission,
    plan: input.plan,
    user_type: input.userType,
    property_count_range: input.propertyCountRange,
  });
  if (error) return null;
  return { id };
}

export interface PublicTestimonial {
  id: string;
  text: string;
  userType: UserType | null;
  propertyCountRange: PropertyCountRange | null;
}

/**
 * Only rows with explicit testimonial_permission=true and real text --
 * see the "J'accepte que mon témoignage soit affiché" checkbox in
 * PostPurchaseFeedback. Never auto-published: consent is required at
 * write time, this just reads what was already consented to.
 */
export async function listPublicTestimonials(limit = 12): Promise<PublicTestimonial[]> {
  if (!SUPABASE_CONFIGURED) return [];
  const supabase = getSupabaseAdmin()!;
  const { data } = await supabase
    .from("feedback")
    .select("id, testimonial_text, user_type, property_count_range")
    .eq("testimonial_permission", true)
    .not("testimonial_text", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? [])
    .filter((row) => row.testimonial_text && row.testimonial_text.trim().length > 0)
    .map((row) => ({
      id: row.id,
      text: row.testimonial_text as string,
      userType: row.user_type as UserType | null,
      propertyCountRange: row.property_count_range as PropertyCountRange | null,
    }));
}

export async function listFeedback(): Promise<FeedbackRow[]> {
  if (!SUPABASE_CONFIGURED) return [];
  const supabase = getSupabaseAdmin()!;
  const { data } = await supabase
    .from("feedback")
    .select(
      "id, analysis_id, email, feedback_rating, feedback_text, testimonial_text, testimonial_permission, plan, user_type, property_count_range, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? []).map((row) => ({
    id: row.id,
    analysisId: row.analysis_id,
    email: row.email,
    feedbackRating: row.feedback_rating as FeedbackRating | null,
    feedbackText: row.feedback_text,
    testimonialText: row.testimonial_text,
    testimonialPermission: row.testimonial_permission,
    plan: row.plan as FeedbackPlan | null,
    userType: row.user_type as UserType | null,
    propertyCountRange: row.property_count_range as PropertyCountRange | null,
    createdAt: row.created_at,
  }));
}
