import { AnalysisResult } from "@/lib/types";
import { Section } from "./Section";
import { scoreColor } from "@/lib/utils";

function fallbackComment(score: number): string {
  if (score >= 70) return "Ta première photo capte bien l'attention et donne une bonne première impression.";
  if (score >= 50)
    return "Ta photo est propre, mais elle ne montre pas encore immédiatement ce qui rend ton logement spécial.";
  return "Ta photo de couverture manque d'impact : rien n'arrête vraiment le regard en quelques secondes.";
}

export function CoverPhotoImpact({ result }: { result: AnalysisResult }) {
  const score = result.scores.cover_photo;
  const cover = result.photo_analysis.find((p) => p.image_index === 1);
  const comment = cover?.recommendation ? cover.weaknesses[0] || fallbackComment(score) : fallbackComment(score);

  return (
    <Section title="Impact de ta première photo">
      <div className="card flex flex-col items-center p-8 text-center">
        <div className="flex items-baseline gap-1">
          <span className="text-6xl font-semibold tracking-tight" style={{ color: scoreColor(score) }}>
            {score}
          </span>
          <span className="text-lg text-muted">/100</span>
        </div>
        <p className="mx-auto mt-4 max-w-sm text-[15px] text-foreground">&ldquo;{comment}&rdquo;</p>
        {cover?.recommendation && (
          <div className="mt-6 w-full border-t border-border pt-5 text-left">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-2">
              Comment l&apos;améliorer
            </p>
            <p className="mt-2 text-sm text-foreground">{cover.recommendation}</p>
          </div>
        )}
      </div>
    </Section>
  );
}
