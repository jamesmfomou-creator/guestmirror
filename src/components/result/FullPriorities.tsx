import { AnalysisResult } from "@/lib/types";
import { Section } from "./Section";
import { GoalBadge } from "./GoalBadge";

// `matches` (goal personalisation, lib/goalPersonalization.ts) is parallel to
// result.top_priorities, which may then be in goal order rather than the
// model's: the number shown is the position on this page.
export function FullPriorities({ result, matches }: { result: AnalysisResult; matches?: boolean[] }) {
  return (
    <Section title="Tes priorités" subtitle="Les changements qui auront le plus d'impact sur ta présentation.">
      <div className="space-y-4">
        {result.top_priorities.map((p, i) => (
          <div key={`${p.rank}-${i}`} className="card p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-hover">
                  {matches ? i + 1 : p.rank}
                </span>
                {matches?.[i] && <GoalBadge />}
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
