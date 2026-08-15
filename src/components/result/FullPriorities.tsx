import { AnalysisResult } from "@/lib/types";
import { Section } from "./Section";

export function FullPriorities({ result }: { result: AnalysisResult }) {
  return (
    <Section title="Tes priorités" subtitle="Les changements qui auront le plus d'impact sur ta présentation.">
      <div className="space-y-4">
        {result.top_priorities.map((p) => (
          <div key={p.rank} className="card p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-hover">
                {p.rank}
              </span>
              {typeof p.score === "number" && (
                <span className="text-sm font-semibold text-muted">{p.score}/100</span>
              )}
            </div>
            <h3 className="mt-3 text-lg font-semibold">{p.title}</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="font-medium text-muted-2">Constat</dt>
                <dd className="mt-0.5 text-foreground">{p.current_issue}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-2">Recommandation</dt>
                <dd className="mt-0.5 text-foreground">{p.recommended_change}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-2">Bénéfice attendu</dt>
                <dd className="mt-0.5 text-foreground">{p.expected_benefit}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </Section>
  );
}
