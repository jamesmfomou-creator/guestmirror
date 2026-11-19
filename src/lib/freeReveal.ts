import type { AnalysisResult } from "@/lib/types";
import { buildPaywallPreview } from "@/lib/paywallPreview";

// What the FREE result may reveal of a report (result_version "reveal_v1").
//
// This is the boundary between the stored analysis and a page shown to a
// visitor who has not paid. It returns ONLY plain strings and counts built
// here -- never an object of the report -- so nothing else can be serialized
// into the page by accident. In particular it never carries:
//   - any weakness `recommendation` (the correction), including the one of
//     the weakness it reveals;
//   - any priority (current_issue / recommended_change / expected_benefit);
//   - the other weaknesses' explanations;
//   - suggested titles, the rewritten description, photo analysis, the
//     action plan, the guest questions.
//
// The revealed insight is one REAL weakness from the analysis: its title, its
// severity and its explanation, unchanged (whitespace only). Chosen
// deterministically -- the most severe, model order within a severity -- among
// weaknesses that are complete enough to stand on their own. No reliable one:
// no insight (the page then shows the visitor's first hesitation, also from
// the analysis, or nothing). Counts are what the report really holds.

export type RevealSeverity = "high" | "medium" | "low";

export interface FreeReveal {
  insight: { title: string; explanation: string; severity: RevealSeverity } | null;
  /** Fallback when no insight: the analysis' own first-hesitation sentence. */
  hesitation: string | null;
  weaknessCount: number;
  /** Weaknesses not revealed for free. */
  otherWeaknessCount: number;
  /**
   * What the paid report really contains, one line per section (counts from
   * the report). `highlights`: what matters most (other weaknesses,
   * corrections and priorities, titles, rewritten description); `more`: the
   * rest (photo analysis, action plan), shown on demand. Never a section the
   * report does not have.
   */
  reportHighlights: string[];
  reportMore: string[];
}

const SEVERITY_RANK: Record<RevealSeverity, number> = { high: 0, medium: 1, low: 2 };
const MIN_EXPLANATION = 40;
const MAX_TITLE = 140;
const MAX_EXPLANATION = 700;

const clean = (s: unknown): string | null => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : null);
const isSeverity = (v: unknown): v is RevealSeverity => v === "high" || v === "medium" || v === "low";
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildFreeReveal(result: AnalysisResult): FreeReveal {
  const raw = result as unknown as Record<string, unknown>;
  const weaknesses = Array.isArray(raw.weaknesses) ? raw.weaknesses : [];

  const candidates = weaknesses
    .map((item, index) => {
      const w = (item ?? {}) as Record<string, unknown>;
      const title = clean(w.title);
      const explanation = clean(w.explanation);
      if (!title || !explanation || !isSeverity(w.severity)) return null;
      if (title.length > MAX_TITLE || explanation.length < MIN_EXPLANATION || explanation.length > MAX_EXPLANATION) return null;
      // Leaked markup or a model artefact is never shown as a finding.
      if (/<\/?parameter\b|\{\s*"/.test(title + explanation)) return null;
      return { title, explanation, severity: w.severity, index };
    })
    .filter((c): c is { title: string; explanation: string; severity: RevealSeverity; index: number } => c !== null)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.index - b.index);

  const pick = candidates[0] ?? null;
  const weaknessCount = weaknesses.length;
  const otherWeaknessCount = Math.max(0, weaknessCount - (pick ? 1 : 0));

  const preview = buildPaywallPreview(result);
  const reportHighlights: string[] = [];
  const reportMore: string[] = [];
  if (otherWeaknessCount > 0) {
    reportHighlights.push(
      pick
        ? `${plural(otherWeaknessCount, "autre point faible", "autres points faibles")} à découvrir, avec leur explication`
        : `${plural(otherWeaknessCount, "point faible relevé", "points faibles relevés")}, avec leur explication`
    );
  }
  const priorities =
    preview.priorityCount === 0
      ? null
      : preview.priorityCount === 1
        ? "le changement prioritaire à faire"
        : `tes ${preview.priorityCount} changements prioritaires, dans l'ordre`;
  if (weaknessCount > 0 && priorities) reportHighlights.push(`La correction de chaque point et ${priorities}`);
  else if (weaknessCount > 0) reportHighlights.push("La correction concrète de chaque point");
  else if (priorities) reportHighlights.push(priorities.charAt(0).toUpperCase() + priorities.slice(1));
  if (preview.suggestedTitleCount > 0) {
    reportHighlights.push(plural(preview.suggestedTitleCount, "titre Airbnb prêt à copier", "titres Airbnb prêts à copier"));
  }
  if (preview.hasImprovedDescription) reportHighlights.push("Ta description réécrite, prête à coller");
  if (preview.photoCount > 0) {
    reportMore.push(
      `${plural(preview.photoCount, "photo analysée", "photos analysées une par une")}${preview.hasPhotoOrder ? ", avec l'ordre recommandé" : ""}`
    );
  }
  if (preview.actionCount > 0) reportMore.push(`Un plan d'action en ${plural(preview.actionCount, "étape", "étapes")}`);

  const hesitation = clean(raw.first_hesitation);
  return {
    insight: pick ? { title: pick.title, explanation: pick.explanation, severity: pick.severity } : null,
    hesitation: pick ? null : hesitation && hesitation.length >= 20 && !/<\/?parameter\b/.test(hesitation) ? hesitation : null,
    weaknessCount,
    otherWeaknessCount,
    reportHighlights,
    reportMore,
  };
}
