import { AnalysisResult } from "@/lib/types";
import { Section } from "./Section";
import { GoalBadge } from "./GoalBadge";

export function ActionPlan({ result, matches }: { result: AnalysisResult; matches?: boolean[] }) {
  if (result.action_plan.length === 0) return null;
  return (
    <Section title="Plan d'action" subtitle="Les actions concrètes à réaliser, dans l'ordre.">
      <ol className="space-y-3">
        {result.action_plan.map((step, i) => (
          <li key={`${i}-${step}`} className="card flex items-start gap-4 p-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
              {i + 1}
            </span>
            <span className="min-w-0 pt-0.5 text-sm text-foreground">
              {step}
              {matches?.[i] && (
                <span className="mt-1.5 block">
                  <GoalBadge />
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}
