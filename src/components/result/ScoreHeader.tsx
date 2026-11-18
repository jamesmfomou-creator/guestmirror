import { AnalysisResult, SCORE_LABELS, ScoreBreakdown } from "@/lib/types";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { ScoreBar } from "@/components/ui/ScoreBar";
import { verdictFor, scoreSummarySentence } from "@/lib/utils";
import { BRAND_NAME } from "@/lib/brand";

const ALL_KEYS: (keyof ScoreBreakdown)[] = [
  "cover_photo",
  "photos",
  "title",
  "description",
  "offer_clarity",
  "visual_attractiveness",
  "traveler_confidence",
];

export function ScoreHeader({
  result,
  locked,
  shortSummary,
  hideBreakdown,
  attentionCount,
}: {
  result: AnalysisResult;
  locked: boolean;
  // Funnel simplification mission, variant B only: the long "Ce que j'ai
  // compris en 5 secondes" paragraph is replaced by one short, score-tier
  // sentence. Variant A's locked view (and the unlocked view, for anyone)
  // is untouched -- this prop defaults to false/unset everywhere else.
  shortSummary?: boolean;
  // Incomplete analyses only (see lib/resultShape.ts): their sub-scores
  // were never produced, and seven bars at 0 would state something the
  // analysis did not find.
  hideBreakdown?: boolean;
  // Free result reveal_v1: the real number of weaknesses the analysis found,
  // shown under the verdict. 0 / undefined: nothing is shown.
  attentionCount?: number;
}) {
  const verdict = verdictFor(result.overall_score);

  return (
    <div className="animate-fade-up flex flex-col items-center text-center">
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-2">
        {locked ? "Test des 5 secondes" : BRAND_NAME}
      </span>
      <div className="mt-4">
        <ScoreRing score={result.overall_score} size={196} showLabel={false} />
      </div>
      <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-background-alt px-4 py-1.5 text-sm font-semibold text-foreground">
        <span>{verdict.emoji}</span>
        {locked ? verdict.short : verdict.long}
      </span>
      {locked && attentionCount != null && attentionCount > 0 && (
        <p className="mt-3 text-[15px] font-medium text-foreground">
          {attentionCount === 1 ? "1 point mérite ton attention" : `${attentionCount} points méritent ton attention`}
        </p>
      )}

      {locked ? (
        shortSummary ? (
          <p className="mx-auto mt-5 max-w-sm text-balance text-base text-muted">
            {scoreSummarySentence(result.overall_score)}
          </p>
        ) : (
          <div className="mt-7 max-w-md">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-2">
              Ce que j&apos;ai compris en 5 secondes
            </p>
            <p className="mt-2 text-balance text-lg text-foreground">{result.summary}</p>
          </div>
        )
      ) : (
        <>
          <p className="mx-auto mt-6 max-w-md text-balance text-lg text-foreground">{result.summary}</p>
          {!hideBreakdown && (
            <div className="mt-8 w-full max-w-md space-y-3 text-left">
              {ALL_KEYS.map((key) => (
                <ScoreBar key={key} label={SCORE_LABELS[key]} score={result.scores[key]} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
