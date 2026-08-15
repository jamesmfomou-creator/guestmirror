import { AnalysisResult } from "@/lib/types";
import { BRAND_NAME } from "@/lib/brand";
import { Section } from "./Section";
import { scoreColor } from "@/lib/utils";

export function PhotoGrid({ result, images }: { result: AnalysisResult; images: string[] }) {
  if (images.length === 0) return null;

  return (
    <Section title="Tes photos" subtitle="Chaque photo évaluée individuellement.">
      <div className="grid gap-5 sm:grid-cols-2">
        {result.photo_analysis.map((p) => {
          const src = images[p.image_index - 1];
          if (!src) return null;
          return (
            <div key={p.image_index} className="card overflow-hidden">
              <div className="relative aspect-[4/3]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Photo ${p.image_index}`} className="h-full w-full object-cover" />
                <span
                  className="absolute top-3 left-3 rounded-full px-2.5 py-1 text-xs font-semibold text-white shadow"
                  style={{ background: scoreColor(p.score) }}
                >
                  {p.score}/100
                </span>
              </div>
              <div className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-2">
                  Photo #{p.image_index}
                </p>
                {p.strengths.length > 0 && (
                  <p className="mt-2 text-sm text-foreground">✓ {p.strengths.join(" · ")}</p>
                )}
                {p.weaknesses.length > 0 && (
                  <p className="mt-1 text-sm text-muted">– {p.weaknesses.join(" · ")}</p>
                )}
                <p className="mt-2 text-sm text-foreground">{p.recommendation}</p>
              </div>
            </div>
          );
        })}
      </div>

      {result.recommended_photo_order.length > 0 && (
        <div className="card mt-6 p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-2">
            Ordre recommandé
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {result.recommended_photo_order.map((idx, i) => (
              <span key={i} className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-hover">
                  {idx}
                </span>
                {i < result.recommended_photo_order.length - 1 && (
                  <span className="text-muted-2">→</span>
                )}
              </span>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-2">
            Il s&apos;agit d&apos;une recommandation {BRAND_NAME} visant à rendre la présentation
            plus claire et attractive — ce n&apos;est pas un ordre officiellement recommandé par
            Airbnb.
          </p>
        </div>
      )}
    </Section>
  );
}
