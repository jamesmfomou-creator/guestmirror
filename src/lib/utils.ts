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

/**
 * One short, score-tier sentence for the compact free diagnostic screen
 * (funnel simplification mission) -- same thresholds as verdictFor so the
 * two stay consistent. Never artificially negative for a high score.
 */
export function scoreSummarySentence(score: number): string {
  if (score >= 80) {
    return "Ton annonce fait déjà une très bonne première impression. Découvre comment aller encore plus loin.";
  }
  if (score >= 60) {
    return "Ton annonce donne déjà envie d'en savoir plus. Découvre comment la renforcer encore.";
  }
  if (score >= 40) {
    return "Ton annonce présente des points à améliorer. Découvre ce qui peut faire hésiter les voyageurs.";
  }
  return "Ton annonce présente plusieurs points à améliorer. Découvre ce qui freine les voyageurs.";
}
