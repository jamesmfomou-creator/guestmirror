import { AnalysisResult } from "@/lib/types";
import { BRAND_NAME } from "@/lib/brand";
import { Section } from "./Section";
import { CopyButton } from "@/components/ui/CopyButton";

export function TitleSection({ result }: { result: AnalysisResult }) {
  const { title_analysis } = result;
  return (
    <Section title="Ton titre">
      <div className="card p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-2">Ton titre actuel</p>
        <p className="mt-2 text-lg font-medium">&ldquo;{title_analysis.current_title}&rdquo;</p>
        <p className="mt-1 text-sm text-muted">Score : {result.scores.title}/100</p>

        {title_analysis.issues.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-2">Pourquoi</p>
            <ul className="mt-2 space-y-1.5">
              {title_analysis.issues.map((issue) => (
                <li key={issue} className="text-sm text-muted">
                  • {issue}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-2">
          Propositions {BRAND_NAME}
        </p>
        <div className="mt-3 space-y-3">
          {title_analysis.suggested_titles.map((t) => (
            <div key={t} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <span className="text-sm text-foreground">{t}</span>
              <CopyButton text={t} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-2">
          Ces propositions sont des suggestions {BRAND_NAME}, pas une garantie de meilleure
          performance.
        </p>
      </div>
    </Section>
  );
}
