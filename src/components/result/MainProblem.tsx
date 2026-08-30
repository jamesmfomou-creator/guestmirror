"use client";

import { AnalysisResult } from "@/lib/types";
import { track } from "@/lib/analytics";
import { useInViewOnce } from "@/lib/tracking/useInViewOnce";

export function MainProblem({
  result,
  analysisId,
}: {
  result: AnalysisResult;
  analysisId: string;
}) {
  const ref = useInViewOnce<HTMLDivElement>(() => {
    track("main_problem_viewed", { analysisId });
  });

  const problem = result.top_priorities[0];
  if (!problem) return null;

  return (
    <div ref={ref} className="mx-auto mt-6 max-w-xl">
      <div className="card p-7 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-score-low/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-score-low">
          🔴 Problème principal
        </span>
        <p className="mx-auto mt-4 max-w-md text-xl font-semibold leading-snug text-foreground">
          &ldquo;{problem.current_issue}&rdquo;
        </p>
      </div>
    </div>
  );
}
