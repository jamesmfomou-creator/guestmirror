import { AnalysisResult, SCORE_LABELS, ScoreBreakdown } from "@/lib/types";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { ScoreBar } from "@/components/ui/ScoreBar";
import { verdictFor } from "@/lib/utils";
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

export function ScoreHeader({ result, locked }: { result: AnalysisResult; locked: boolean }) {
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

      {locked ? (
        <div className="mt-7 max-w-md">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-2">
            Ce que j&apos;ai compris en 5 secondes
          </p>
          <p className="mt-2 text-balance text-lg text-foreground">{result.summary}</p>
        </div>
      ) : (
        <>
          <p className="mx-auto mt-6 max-w-md text-balance text-lg text-foreground">{result.summary}</p>
          <div className="mt-8 w-full max-w-md space-y-3 text-left">
            {ALL_KEYS.map((key) => (
              <ScoreBar key={key} label={SCORE_LABELS[key]} score={result.scores[key]} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
