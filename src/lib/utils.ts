import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function scoreTier(score: number): "low" | "mid" | "high" {
  if (score >= 75) return "high";
  if (score >= 50) return "mid";
  return "low";
}

export function scoreColor(score: number): string {
  const tier = scoreTier(score);
  if (tier === "high") return "var(--score-high)";
  if (tier === "mid") return "var(--score-mid)";
  return "var(--score-low)";
}

export function scoreLabel(score: number): string {
  if (score >= 85) return "Excellent";
  if (score >= 75) return "Très solide";
  if (score >= 60) return "Correct";
  if (score >= 45) return "À améliorer";
  return "Fragile";
}

export function scoreEmoji(score: number): string {
  if (score >= 70) return "🟢";
  if (score >= 50) return "🟠";
  return "🔴";
}

export function severityEmoji(severity: "low" | "medium" | "high"): string {
  if (severity === "high") return "🔴";
  if (severity === "medium") return "🟠";
  return "🟢";
}

export function severityLabel(severity: "low" | "medium" | "high"): string {
  if (severity === "high") return "Priorité haute";
  if (severity === "medium") return "Priorité moyenne";
  return "Priorité faible";
}

export interface Verdict {
  emoji: string;
  short: string;
  long: string;
}

/**
 * Gut-reaction verdict derived from the overall score. Short forms are for
 * tight mobile/social-card layouts, long forms for the written report.
 */
export function verdictFor(score: number): Verdict {
  if (score >= 80) return { emoji: "🔥", short: "JE CLIQUE", long: "JE CLIQUERAIS" };
  if (score >= 60) return { emoji: "👀", short: "ÇA M'INTÉRESSE", long: "ÇA M'INTÉRESSE" };
  if (score >= 40) return { emoji: "🤔", short: "J'HÉSITE", long: "J'HÉSITERAIS" };
  return { emoji: "😬", short: "JE PASSE", long: "RISQUE DE PASSER À L'ANNONCE SUIVANTE" };
}

export function lockedRecommendationCount(result: {
  top_priorities: { rank: number }[];
  weaknesses: unknown[];
  title_analysis: { suggested_titles: unknown[] };
  photo_analysis: unknown[];
  action_plan: unknown[];
}): number {
  return (
    Math.max(0, result.top_priorities.length - 1) +
    Math.max(0, result.weaknesses.length - 1) +
    result.title_analysis.suggested_titles.length +
    result.photo_analysis.length +
    result.action_plan.length
  );
}
