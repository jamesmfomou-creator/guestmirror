"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics";
import { CONCERNS, type Concern } from "@/lib/goalValue";
import { Goal } from "@/lib/types";
import { ErrorNote, OnboardingHeading, OptionTile } from "./OnboardingUI";

// Journey goal_value_v1: question and labels reworded, improve_photos added.
// Stored values are unchanged (an older analysis keeps its goal and its
// meaning); "Optimiser plusieurs logements" stays for multi-listing owners.
const GOAL_OPTIONS: { value: Goal; label: string }[] = [
  { value: "improve_appeal", label: "Donner davantage envie de réserver." },
  { value: "reduce_hesitation", label: "Comprendre ce qui peut faire hésiter les voyageurs." },
  { value: "improve_photos", label: "Améliorer mes photos et ma présentation." },
  { value: "verify_improvements", label: "Vérifier les améliorations déjà apportées." },
  { value: "optimize_multiple", label: "Optimiser plusieurs logements Airbnb." },
];

/**
 * Onboarding "objectif" question, plus -- on the same screen, once a goal is
 * chosen -- the optional "préoccupation" question (no extra step).
 *
 * Control onboarding: asked after email, before the analysis request fires;
 * a goal is required to continue (unchanged). Background onboarding: asked
 * while the analysis runs, and can be skipped.
 *
 * Neither answer reaches the AI (the analysis and its score depend on the
 * listing only). The goal orders and frames the report's own findings
 * (lib/goalPersonalization.ts, lib/goalValue.ts); the concern is recorded in
 * analytics only.
 */
export function StepGoal({
  goal,
  onSelect,
  onContinue,
  error,
  continueLabel = "Continuer vers mon diagnostic →",
  onSkip,
  concern = null,
  onSelectConcern,
}: {
  goal: Goal | null;
  onSelect: (value: Goal) => void;
  onContinue: () => void;
  error?: string | null;
  /** Background onboarding only; the defaults are the original step. */
  continueLabel?: string;
  onSkip?: () => void;
  concern?: Concern | null;
  /** null = the visitor unselected their answer. */
  onSelectConcern?: (value: Concern | null) => void;
}) {
  useEffect(() => {
    track("onboarding_goal_viewed");
  }, []);

  return (
    <div className="animate-fade-up">
      <OnboardingHeading
        title={
          <>
            Qu&apos;aimerais-tu améliorer <em>en priorité</em> sur ton annonce ?
          </>
        }
        description="Ton rapport sera organisé selon ta réponse. Le score, lui, ne dépend que de ton annonce."
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

      {goal && onSelectConcern && (
        <fieldset className="animate-fade-up mt-8">
          <legend className="text-[15px] font-semibold tracking-tight text-foreground">
            Qu&apos;est-ce qui te préoccupe le plus aujourd&apos;hui ?{" "}
            <span className="font-normal text-muted-2">Facultatif</span>
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {CONCERNS.map((c) => {
              const selected = concern === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectConcern(selected ? null : c.value)}
                  className={`min-h-11 max-w-full rounded-2xl border px-3.5 py-2 text-left text-[13.5px] leading-snug transition-colors ${
                    selected
                      ? "border-accent bg-accent-soft text-foreground"
                      : "border-border bg-card text-muted hover:border-foreground/20 hover:text-foreground"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      <Button size="lg" className="btn-sheen mt-8 w-full sm:w-full" onClick={onContinue} disabled={!goal}>
        {continueLabel}
      </Button>
      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="mt-4 w-full text-center text-sm font-medium text-muted underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Passer cette question
        </button>
      )}
    </div>
  );
}
