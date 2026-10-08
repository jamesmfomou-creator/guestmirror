"use client";

import { track } from "@/lib/analytics";
import { getAbVariant } from "@/lib/ab";
import { useInViewOnce } from "@/lib/tracking/useInViewOnce";
import { UserType, PropertyCountRange } from "@/lib/types";

// Shared by both A/B variants: one short, already-personalized action from
// the analysis, shown free to demonstrate the report's quality before the
// paywall. Takes only the one string it displays (see MainProblem's same
// pattern) -- never the full AnalysisResult -- so nothing beyond this one
// recommendation is ever serialized into the page HTML for a non-paying
// visitor.
export function FreeRecommendation({
  recommendation,
  analysisId,
  inputMethod,
  userType,
  propertyCountRange,
}: {
  recommendation: string | null;
  analysisId: string;
  inputMethod?: "airbnb_url" | "screenshot" | "mixed";
  userType?: UserType | null;
  propertyCountRange?: PropertyCountRange | null;
}) {
  const ref = useInViewOnce<HTMLDivElement>(() => {
    track("free_recommendation_viewed", {
      analysisId,
      ab_variant: getAbVariant(),
      input_method: inputMethod,
      user_type: userType,
      property_count_range: propertyCountRange,
    });
  });

  if (!recommendation) return null;

  return (
    <div ref={ref} className="mx-auto mt-6 max-w-xl">
      <div className="card border-accent/30 bg-accent-soft p-5">
        <span className="inline-flex items-center gap-2 rounded-full bg-background px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent-hover">
          💡 Une recommandation pour commencer
        </span>
        <p className="mt-3 text-[15px] leading-relaxed text-foreground">{recommendation}</p>
      </div>
    </div>
  );
}
