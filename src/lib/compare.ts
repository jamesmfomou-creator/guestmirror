import { AnalysisResult, Comparison } from "@/lib/types";

const FALLBACK_REASONS = [
  "Sa présentation donne une meilleure impression dès les premières secondes.",
  "Je comprends plus vite ce que propose ce logement.",
  "Rien ne me freine en le regardant rapidement.",
];

/**
 * Synthesizes a "why does A/B win" verdict from two already-computed
 * analyses, without an extra AI call: it just reads the winner's own
 * strengths and the loser's weakest point and top recommendation.
 */
export function buildComparison(a: AnalysisResult, b: AnalysisResult): Comparison {
  const winner: "a" | "b" = a.overall_score >= b.overall_score ? "a" : "b";
  const winnerResult = winner === "a" ? a : b;
  const loserResult = winner === "a" ? b : a;

  const whyWinner = (winnerResult.strengths ?? [])
    .slice(0, 3)
    .map((s) => s.explanation || s.title)
    .filter(Boolean);
  if (whyWinner.length === 0) whyWinner.push(...FALLBACK_REASONS.slice(0, 1));

  const loserWeaknesses = loserResult.weaknesses ?? [];
  const loserPriorities = loserResult.top_priorities ?? [];

  const mainProblem =
    loserWeaknesses[0]?.title ||
    loserPriorities[0]?.current_issue ||
    "Rien ne se démarque assez vite pour donner envie de cliquer.";

  const firstChange =
    loserPriorities[0]?.recommended_change ||
    loserWeaknesses[0]?.recommendation ||
    "Retravailler la photo de couverture pour capter l'attention plus vite.";

  return { winner, why_winner: whyWinner, main_problem: mainProblem, first_change: firstChange };
}
