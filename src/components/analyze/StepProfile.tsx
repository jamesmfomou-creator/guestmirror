"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { UserType, PropertyCountRange } from "@/lib/types";
import { OnboardingHeading, OptionTile, Surface } from "./OnboardingUI";

const PROPERTY_COUNT_OPTIONS: { value: PropertyCountRange; label: string }[] = [
  { value: "1", label: "1 logement" },
  { value: "2-5", label: "2 à 5" },
  { value: "6-20", label: "6 à 20" },
  { value: "21+", label: "21 et +" },
];

const USER_TYPE_OPTIONS: { value: UserType; label: string }[] = [
  { value: "host", label: "Hôte / propriétaire" },
  { value: "concierge", label: "Conciergerie" },
  { value: "cohost", label: "Co-hôte" },
  { value: "other", label: "Autre" },
];

/**
 * Short, optional, button-only profile question asked right after import
 * (before email) -- purely for segmentation (see /admin/analytics "Profil
 * des utilisateurs"), never a blocker: answering either question advances
 * immediately, and "Passer cette étape" always works.
 */
export function StepProfile({
  propertyCountRange,
  userType,
  onSelectPropertyCountRange,
  onSelectUserType,
  onContinue,
  onSkip,
}: {
  propertyCountRange: PropertyCountRange | null;
  userType: UserType | null;
  onSelectPropertyCountRange: (value: PropertyCountRange) => void;
  onSelectUserType: (value: UserType) => void;
  onContinue: () => void;
  /** "Passer cette étape" (defaults to onContinue). */
  onSkip?: () => void;
}) {
  return (
    <div className="animate-fade-up">
      <OnboardingHeading
        title={
          <>
            Parlons un peu <em>de ton activité</em>
          </>
        }
        description="Deux questions facultatives, pour mieux connaître ta situation."
      />

      <Surface className="mt-9">
        <p className="text-[16px] font-semibold tracking-tight text-foreground">Combien de logements Airbnb gères-tu ?</p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {PROPERTY_COUNT_OPTIONS.map((opt) => (
            <OptionTile
              key={opt.value}
              selected={propertyCountRange === opt.value}
              onClick={() => onSelectPropertyCountRange(opt.value)}
            >
              {opt.label}
            </OptionTile>
          ))}
        </div>
      </Surface>

      <Surface className="mt-4">
        <p className="text-[16px] font-semibold tracking-tight text-foreground">Tu es :</p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {USER_TYPE_OPTIONS.map((opt) => (
            <OptionTile key={opt.value} selected={userType === opt.value} onClick={() => onSelectUserType(opt.value)}>
              {opt.label}
            </OptionTile>
          ))}
        </div>
      </Surface>

      <Button size="lg" className="btn-sheen group mt-8 w-full sm:w-full" onClick={onContinue}>
        Continuer
        <ArrowRight aria-hidden size={18} className="transition-transform duration-300 group-hover:translate-x-0.5" />
      </Button>
      <button
        type="button"
        onClick={onSkip ?? onContinue}
        className="mt-4 w-full text-center text-sm font-medium text-muted underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        Passer cette étape
      </button>
    </div>
  );
}
