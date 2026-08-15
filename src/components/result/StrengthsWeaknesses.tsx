import { AnalysisResult } from "@/lib/types";
import { Section } from "./Section";
import { severityEmoji, severityLabel } from "@/lib/utils";

export function StrengthsWeaknesses({ result }: { result: AnalysisResult }) {
  return (
    <Section title="Points forts et points faibles">
      <div className="grid gap-8 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-score-high">
            Points forts
          </h3>
          <ul className="mt-4 space-y-4">
            {result.strengths.map((s) => (
              <li key={s.title}>
                <p className="text-sm font-medium text-foreground">{s.title}</p>
                <p className="mt-1 text-sm text-muted">{s.explanation}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-2">
            Points faibles
          </h3>
          <ul className="mt-4 space-y-5">
            {result.weaknesses.map((w) => (
              <li key={w.title}>
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <span title={severityLabel(w.severity)}>{severityEmoji(w.severity)}</span>
                  {w.title}
                </p>
                <p className="mt-1 text-sm text-muted">{w.explanation}</p>
                <p className="mt-1.5 text-sm text-foreground">
                  <span className="font-medium text-muted-2">Recommandation — </span>
                  {w.recommendation}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
