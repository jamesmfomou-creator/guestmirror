"use client";

import { OptionTile } from "./OnboardingUI";
import type { Goal, UserType } from "@/lib/types";

// Background onboarding (questions asked while the analysis already runs):
// three short "reflection" questions, then a simple profile choice. Owner's
// wording, 22 Nov 2026. None of it reaches the AI (the analysis and its score
// depend on the listing only). Q3 -- or Q1 if Q3 is skipped -- sets the
// existing report goal (lib/goalPersonalization.ts), so the report keeps
// being ordered by what the visitor cares about; Q2 is analytics only.

export type ReflectionId = "doubt" | "projection" | "priority";

export const REFLECTION_QUESTIONS: {
  id: ReflectionId;
  title: string;
  options: { value: string; label: string; goal?: Goal }[];
}[] = [
  {
    id: "doubt",
    title: "Selon toi, qu'est-ce qui pourrait faire hésiter un voyageur à réserver ton logement ?",
    options: [
      { value: "photos", label: "Mes photos ne donnent pas assez envie", goal: "improve_photos" },
      { value: "title", label: "Mon titre ne se démarque pas", goal: "improve_appeal" },
      { value: "description", label: "Ma description ne convainc pas assez", goal: "reduce_hesitation" },
      { value: "dont_know", label: "Je ne sais pas, justement", goal: "reduce_hesitation" },
    ],
  },
  {
    id: "projection",
    title: "Imagine que ton annonce donne davantage envie de réserver. Qu'est-ce que ça changerait pour toi ?",
    options: [
      { value: "more_requests", label: "Recevoir plus de demandes de réservation" },
      { value: "fewer_empty_dates", label: "Avoir moins de dates disponibles qui restent vides" },
      { value: "keep_prices", label: "Mieux valoriser mon logement sans baisser mes prix" },
      { value: "confidence", label: "Être plus confiant dans la qualité de mon annonce" },
    ],
  },
  {
    id: "priority",
    title: "Si tu pouvais améliorer une seule chose sur ton annonce aujourd'hui, tu choisirais quoi ?",
    options: [
      { value: "first_photo", label: "Savoir quelle photo mettre en premier", goal: "improve_photos" },
      { value: "title", label: "Avoir un titre plus accrocheur", goal: "improve_appeal" },
      { value: "description", label: "Obtenir une description plus convaincante", goal: "reduce_hesitation" },
      { value: "top3", label: "Découvrir les 3 améliorations prioritaires", goal: "improve_appeal" },
    ],
  },
];

export type ReflectionAnswers = Partial<Record<ReflectionId, string>>;

/** The report goal implied by the answers: Q3 first, then Q1; null if neither. */
export function goalFromReflection(a: ReflectionAnswers): Goal | null {
  const pick = (id: ReflectionId) =>
    REFLECTION_QUESTIONS.find((q) => q.id === id)?.options.find((o) => o.value === a[id])?.goal ?? null;
  return pick("priority") ?? pick("doubt");
}

export function StepReflection({
  index,
  answer,
  onAnswer,
  onSkip,
}: {
  /** 0, 1 or 2 */
  index: number;
  answer: string | undefined;
  onAnswer: (value: string) => void;
  onSkip: () => void;
}) {
  const q = REFLECTION_QUESTIONS[index];

  return (
    <div key={q.id} className="animate-fade-up">
      <span className="inline-flex items-center rounded-full bg-foreground/[0.06] px-3 py-1 text-[12.5px] font-semibold text-foreground">
        Question {index + 1}/{REFLECTION_QUESTIONS.length}
      </span>
      <h2 className="mt-4 text-balance text-[21px] leading-[1.25] font-semibold tracking-tight text-foreground sm:text-[24px]">
        {q.title}
      </h2>
      <div className="mt-5 space-y-2.5">
        {q.options.map((opt) => (
          <OptionTile key={opt.value} selected={answer === opt.value} onClick={() => onAnswer(opt.value)} className="px-5 py-4">
            {opt.label}
          </OptionTile>
        ))}
      </div>
      <button
        type="button"
        onClick={onSkip}
        className="mt-5 w-full text-center text-sm font-medium text-muted underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        Passer cette question
      </button>
    </div>
  );
}

const PROFILE_OPTIONS: { value: UserType; label: string }[] = [
  { value: "host", label: "Propriétaire" },
  { value: "concierge", label: "Conciergerie" },
];

/** Simple profile choice (not one of the three questions). */
export function StepProfileChoice({
  userType,
  onSelect,
  onSkip,
}: {
  userType: UserType | null;
  onSelect: (value: UserType) => void;
  onSkip: () => void;
}) {
  return (
    <div className="animate-fade-up">
      <h2 className="text-balance text-[21px] leading-[1.25] font-semibold tracking-tight text-foreground sm:text-[24px]">
        Tu es propriétaire ou conciergerie ?
      </h2>
      <div className="mt-7 grid grid-cols-2 gap-2.5">
        {PROFILE_OPTIONS.map((opt) => (
          <OptionTile key={opt.value} selected={userType === opt.value} onClick={() => onSelect(opt.value)} className="justify-center px-4 py-4 text-center">
            {opt.label}
          </OptionTile>
        ))}
      </div>
      <button
        type="button"
        onClick={onSkip}
        className="mt-5 w-full text-center text-sm font-medium text-muted underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        Passer cette étape
      </button>
    </div>
  );
}
