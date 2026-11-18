"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Target } from "lucide-react";
import { track } from "@/lib/analytics";
import { saveAnalysisAnswers } from "@/lib/analysisOwnership";
import { GOAL_REMINDERS } from "@/lib/goalPersonalization";
import type { Goal } from "@/lib/types";
import { useCanEditAnalysis } from "./useCanEditAnalysis";

// Shown on a result only when no goal was given (answered nowhere during
// the onboarding), and only to the browser allowed to change the analysis.
// Choosing one stores it and re-renders the page: the same report, reordered
// for that goal (lib/goalPersonalization.ts) -- no new analysis, same score.

const GOALS: Goal[] = ["improve_appeal", "reduce_hesitation", "verify_improvements", "optimize_multiple"];

export function GoalPrompt({ analysisId, serverAllowed }: { analysisId: string; serverAllowed: boolean }) {
  const router = useRouter();
  const canEdit = useCanEditAnalysis(analysisId, serverAllowed);
  const [saving, setSaving] = useState<Goal | null>(null);
  const [failed, setFailed] = useState(false);

  if (!canEdit) return null;

  async function choose(goal: Goal) {
    if (saving) return;
    setSaving(goal);
    setFailed(false);
    const ok = await saveAnalysisAnswers(analysisId, { goal });
    track("goal_saved", { analysisId, timing: "result_page", via: "result_prompt", ok });
    if (ok) {
      router.refresh();
      return;
    }
    setSaving(null);
    setFailed(true);
  }

  return (
    <div className="animate-fade-up mx-auto mb-8 w-full max-w-xl rounded-[var(--radius-lg)] border border-border bg-card px-4 py-4 text-left sm:px-5">
      <p className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
        <Target aria-hidden size={15} className="shrink-0 text-accent-hover" />
        Quel est ton objectif ?
      </p>
      <p className="mt-1 text-[13px] text-muted">Ton rapport sera organisé selon ta réponse. Le score ne change pas.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {GOALS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => void choose(g)}
            disabled={saving !== null}
            className="rounded-full border border-border bg-background px-3.5 py-1.5 text-[13px] text-foreground transition-colors hover:border-accent hover:text-accent-hover disabled:opacity-60"
          >
            {saving === g ? "Enregistrement…" : GOAL_REMINDERS[g]}
          </button>
        ))}
      </div>
      {failed && <p className="mt-2 text-[12.5px] text-score-low">L&apos;enregistrement n&apos;a pas fonctionné. Réessaie.</p>}
    </div>
  );
}
