import { AnalysisResult } from "@/lib/types";
import { Section } from "./Section";

export function ActionPlan({ result }: { result: AnalysisResult }) {
  if (result.action_plan.length === 0) return null;
  return (
    <Section title="Plan d'action" subtitle="Les actions concrètes à réaliser, dans l'ordre.">
      <ol className="space-y-3">
        {result.action_plan.map((step, i) => (
          <li key={step} className="card flex items-start gap-4 p-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
              {i + 1}
            </span>
            <span className="pt-0.5 text-sm text-foreground">{step}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}
