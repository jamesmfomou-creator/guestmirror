import { Search } from "lucide-react";
import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import type { FreeReveal } from "@/lib/freeReveal";

// "Un premier point identifié": ONE real weakness of the analysis, shown for
// free -- title, severity, explanation -- without its correction (which stays
// in the paid report). Server component: it receives only the strings
// buildFreeReveal() produced. No reliable weakness: the analysis' own first
// hesitation, or nothing at all. Never a placeholder or an invented finding.
//
// Journey goal_value_v1: the chain MY GOAL -> WHAT THE ANALYSIS FOUND -> WHY
// (its own explanation) -> WHAT THE REPORT HELPS FIX. framing.intro ties the
// point to the goal (lib/goalValue.ts, true for that point only),
// framing.transition names what the report holds without giving it away.

const SEVERITY: Record<"high" | "medium" | "low", { label: string; className: string }> = {
  high: { label: "Priorité haute", className: "bg-score-low/10 text-score-low" },
  medium: { label: "À améliorer", className: "bg-score-mid/12 text-score-mid" },
  low: { label: "Détail à soigner", className: "bg-background-alt text-muted" },
};

export function FreeInsight({ reveal, analysisId }: { reveal: FreeReveal; analysisId: string }) {
  if (reveal.insight) {
    const s = SEVERITY[reveal.insight.severity];
    return (
      <section className="animate-fade-up mx-auto mt-10 max-w-xl text-left" aria-labelledby="free-insight-title">
        <AnalyticsBeacon
          event="free_insight_viewed"
          props={{ analysisId, kind: "weakness", severity: reveal.insight.severity, related_to_goal: reveal.framing?.relatedToGoal ?? false }}
        />
        <div className="flex flex-wrap items-center gap-2.5">
          <Search aria-hidden size={18} className="shrink-0 text-muted" />
          <h2 id="free-insight-title" className="text-lg font-semibold tracking-tight text-foreground">
            Un premier point identifié
          </h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.className}`}>{s.label}</span>
        </div>
        {reveal.framing && <p className="mt-3 text-[15px] leading-relaxed text-foreground">{reveal.framing.intro}</p>}
        <div className="card mt-4 p-5 sm:p-6">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-2">Ce que l&apos;analyse a identifié</p>
          <p className="mt-1.5 text-[17px] font-semibold leading-snug text-foreground sm:text-lg">« {reveal.insight.title} »</p>
          <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{reveal.insight.explanation}</p>
          <p className="mt-4 border-t border-border pt-3 text-[13.5px] leading-relaxed text-foreground">
            {reveal.framing?.transition ?? "La correction de ce point se trouve dans ton rapport complet."}
          </p>
        </div>
      </section>
    );
  }
  if (reveal.hesitation) {
    return (
      <section className="animate-fade-up mx-auto mt-10 max-w-xl text-left">
        <AnalyticsBeacon event="free_insight_viewed" props={{ analysisId, kind: "hesitation" }} />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-2">Ce qui peut faire hésiter un voyageur</p>
        <p className="mt-2 text-lg leading-snug text-foreground">« {reveal.hesitation} »</p>
      </section>
    );
  }
  return null;
}
