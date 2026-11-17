"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics";
import { Goal } from "@/lib/types";
import { ErrorNote, OnboardingHeading, OptionTile } from "./OnboardingUI";

const GOAL_OPTIONS: { value: Goal; label: string }[] = [
  { value: "improve_appeal", label: "Améliorer mon annonce pour donner davantage envie de réserver." },
  { value: "reduce_hesitation", label: "Identifier ce qui peut faire hésiter les voyageurs." },
  { value: "verify_improvements", label: "Vérifier les améliorations apportées à mon annonce." },
  { value: "optimize_multiple", label: "Optimiser plusieurs logements Airbnb." },
];

/**
 * Onboarding "objectif" question -- asked to everyone right after
 * email, before the real analysis request fires (see AnalyzeWizard.tsx).
 * A choice is required to continue (no skip link, unlike StepProfile):
 * the brief for this step specifies exactly one button, no "passer cette
 * étape".
 *
 * The answer never reaches the AI (the analysis and its score depend on the
 * listing only). The result page uses it to present the report's own
 * findings in goal order (lib/goalPersonalization.ts) -- the description
 * below says exactly that, nothing more.
 */
export function StepGoal({
  goal,
  onSelect,
  onContinue,
  error,
}: {
  goal: Goal | null;
  onSelect: (value: Goal) => void;
  onContinue: () => void;
  error?: string | null;
}) {
  useEffect(() => {
    track("onboarding_goal_viewed");
  }, []);

  return (
    <div className="animate-fade-up">
      <OnboardingHeading
        title={
          <>
            Quel est ton objectif avec <em>cette annonce</em> ?
          </>
        }
        description="Ton rapport sera organisé selon cet objectif. Le score, lui, ne dépend que de ton annonce."
      />

      <div className="mt-9 space-y-2.5">
        {GOAL_OPTIONS.map((opt) => (
          <OptionTile
            key={opt.value}
            selected={goal === opt.value}
            onClick={() => onSelect(opt.value)}
            className="px-5 py-4"
          >
            {opt.label}
          </OptionTile>
        ))}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <Button size="lg" className="btn-sheen mt-8 w-full sm:w-full" onClick={onContinue} disabled={!goal}>
        Continuer vers mon diagnostic →
      </Button>
    </div>
  );
}
