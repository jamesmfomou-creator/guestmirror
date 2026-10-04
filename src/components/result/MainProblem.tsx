"use client";

import { track } from "@/lib/analytics";
import { useInViewOnce } from "@/lib/tracking/useInViewOnce";

// Takes only the one sentence it displays, not the whole AnalysisResult:
// this is a client component, so every prop is serialized into the page
// HTML -- passing the full result leaked paid recommendations to locked
// (non-paying) visitors even though nothing rendered them.
export function MainProblem({
  issue,
  analysisId,
}: {
  issue: string | null;
  analysisId: string;
}) {
  const ref = useInViewOnce<HTMLDivElement>(() => {
    track("main_problem_viewed", { analysisId });
  });

  if (!issue) return null;

  return (
    <div ref={ref} className="mx-auto mt-6 max-w-xl">
      <div className="card p-7 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-score-low/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-score-low">
          🔴 Problème principal
        </span>
        <p className="mx-auto mt-4 max-w-md text-xl font-semibold leading-snug text-foreground">
          &ldquo;{issue}&rdquo;
        </p>
      </div>
    </div>
  );
}
