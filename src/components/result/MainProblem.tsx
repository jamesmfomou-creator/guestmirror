import { AnalysisResult } from "@/lib/types";

export function MainProblem({ result }: { result: AnalysisResult }) {
  const problem = result.top_priorities[0];
  if (!problem) return null;

  return (
    <div className="mx-auto mt-6 max-w-xl">
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
