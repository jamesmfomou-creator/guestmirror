import { Target } from "lucide-react";

/** Marks a report item the goal reordering put first (lib/goalPersonalization.ts). */
export function GoalBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent-hover">
      <Target aria-hidden size={11} />
      Lié à ton objectif
    </span>
  );
}
