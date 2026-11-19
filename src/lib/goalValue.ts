import type { Goal } from "@/lib/types";

// Journey goal_value_v1: the free result ties the ONE weakness it reveals to
// the visitor's onboarding goal. Wording only -- the weakness itself (title,
// severity, explanation) is the analysis' own, chosen by buildFreeReveal().
//
// Honesty rules:
//  - `related` comes from matchesGoal() on the weakness' own title. Only when
//    it is true may a sentence say the point is about the goal's topic
//    (e.g. photos). Otherwise the sentence stays general and true for any
//    weakness the analysis reported.
//  - No promise of results: "pourrait", never "va augmenter tes réservations".
//  - Nothing about the correction: it stays in the paid report.

export interface InsightFraming {
  /** One sentence shown above the finding. */
  intro: string;
}

const NEUTRAL = "Voici un élément de ton annonce qui pourrait faire hésiter un voyageur.";

export function insightFraming(goal: Goal | null | undefined, related: boolean): InsightFraming {
  switch (goal) {
    case "improve_appeal":
      return { intro: "Pour donner davantage envie de réserver, voici un élément de ton annonce qui pourrait freiner cet objectif." };
    case "reduce_hesitation":
      return { intro: "Tu veux comprendre ce qui peut faire hésiter les voyageurs : voici un élément que l'analyse a relevé sur ton annonce." };
    case "improve_photos":
      return related
        ? { intro: "Pour améliorer tes photos et ta présentation, voici un point que l'analyse a relevé." }
        : {
            // Only when no medium/high weakness is about the visuals: say so
            // rather than present another point as a photo problem.
            intro:
              "Tu souhaites améliorer tes photos et ta présentation. Le point le plus important relevé par l'analyse concerne toutefois un autre aspect de ton annonce :",
          };
    case "verify_improvements":
      return { intro: "Voici un point que l'analyse relève encore sur ton annonce." };
    case "optimize_multiple":
      return { intro: "Voici le point le plus important relevé sur ce logement." };
    default:
      return { intro: NEUTRAL };
  }
}

/** Shown under the finding, for every goal. Names what the paid report holds, never its content. */
export const INSIGHT_TRANSITION =
  "Ton rapport complet te montre comment corriger ce point et quelles autres améliorations traiter en priorité.";

// Optional onboarding question "Qu'est-ce qui te préoccupe le plus aujourd'hui ?"
// (journey goal_value_v1). Recorded in analytics only (event
// onboarding_concern_selected): it is not stored on the analysis and changes
// nothing in the report.
export const CONCERNS = [
  { value: "not_appealing", label: "Mon annonce ne donne peut-être pas assez envie." },
  { value: "unsure_what", label: "Je ne sais pas ce qui pourrait être amélioré." },
  { value: "photos_weak", label: "Mes photos ne mettent pas assez le logement en valeur." },
  { value: "stand_out", label: "Je veux me démarquer des annonces similaires." },
] as const;
export type Concern = (typeof CONCERNS)[number]["value"];
