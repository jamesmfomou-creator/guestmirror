import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/env";

export type InputMethod = "airbnb_url" | "screenshot" | "mixed";

/**
 * Reads the input method actually submitted by the user (screenshot,
 * Airbnb URL, or both) from the analysis_completed event tracked for this
 * analysis. Deliberately NOT re-derived from analysis.images: a pure-URL
 * submission also ends up with stored images (the ones extracted from the
 * listing page, see lib/airbnbExtract.ts), which would otherwise look
 * indistinguishable from a real "mixed" (screenshot + URL) submission.
 * analysis_completed's own input_method (set client-side, before any
 * server-side extraction) is the ground truth.
 */
export async function getInputMethodForAnalysis(analysisId: string): Promise<InputMethod | null> {
  if (!SUPABASE_CONFIGURED) return null;
  const supabase = getSupabaseAdmin()!;
  const { data } = await supabase
    .from("analytics_events")
    .select("metadata")
    .eq("analysis_id", analysisId)
    .eq("event_name", "analysis_completed")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const method = (data?.metadata as Record<string, unknown> | null)?.input_method;
  return method === "airbnb_url" || method === "screenshot" || method === "mixed" ? method : null;
}
