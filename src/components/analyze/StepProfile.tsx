"use client";

import { Button } from "@/components/ui/Button";
import { UserType, PropertyCountRange } from "@/lib/types";

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
}: {
  propertyCountRange: PropertyCountRange | null;
  userType: UserType | null;
  onSelectPropertyCountRange: (value: PropertyCountRange) => void;
  onSelectUserType: (value: UserType) => void;
  onContinue: () => void;
}) {
  return (
    <div className="animate-fade-up">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Une dernière chose avant ton analyse
      </h1>
      <p className="mt-3 text-muted">Ça nous aide à améliorer GuestMirror. Facultatif.</p>

      <div className="card mt-8 p-6 sm:p-7">
        <p className="text-sm font-medium text-foreground">Combien de logements Airbnb gères-tu ?</p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {PROPERTY_COUNT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelectPropertyCountRange(opt.value)}
              className={`rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                propertyCountRange === opt.value
                  ? "border-accent bg-accent-soft text-accent-hover"
                  : "border-border text-foreground hover:border-accent/50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card mt-5 p-6 sm:p-7">
        <p className="text-sm font-medium text-foreground">Tu es :</p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {USER_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelectUserType(opt.value)}
              className={`rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                userType === opt.value
                  ? "border-accent bg-accent-soft text-accent-hover"
                  : "border-border text-foreground hover:border-accent/50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <Button size="lg" className="mt-6 w-full" onClick={onContinue}>
        Continuer
      </Button>
      <button
        type="button"
        onClick={onContinue}
        className="mt-3 w-full text-center text-sm font-medium text-muted transition-opacity hover:opacity-70"
      >
        Passer cette étape
      </button>
    </div>
  );
}
