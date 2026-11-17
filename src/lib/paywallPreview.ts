import type { AnalysisResult } from "@/lib/types";

/**
 * What the locked result page may say about a report that has not been
 * paid for, in the paywall "v2" presentation (lib/paywallExperiment.ts).
 *
 * This is the boundary between the stored analysis and a client component:
 * everything returned here is serialized into the page of a visitor who has
 * not paid. It therefore carries only
 *   - how many of each thing the analysis produced, and
 *   - the *name* and severity of up to three weaknesses it found.
 * Never an explanation, a recommendation, a suggested title, the rewritten
 * description, a photo score or an action -- those are the paid report.
 *
 * Every figure is a count of what is really stored, so the paywall cannot
 * announce something the analysis did not find: a section that is empty
 * yields 0 / false and is simply not mentioned.
 */

export type WeaknessSeverity = "low" | "medium" | "high";

export interface PaywallPreviewWeakness {
  title: string;
  severity: WeaknessSeverity;
}

export interface PaywallPreview {
  weaknessCount: number;
  highSeverityCount: number;
  /** The most severe ones first, at most MAX_WEAKNESSES_SHOWN. Names only. */
  weaknesses: PaywallPreviewWeakness[];
  priorityCount: number;
  photoCount: number;
  hasPhotoOrder: boolean;
  suggestedTitleCount: number;
  hasImprovedDescription: boolean;
  actionCount: number;
  guestQuestionCount: number;
}

export const MAX_WEAKNESSES_SHOWN = 3;
// A weakness name is a short label. If the model wrote a paragraph in that
// field, it is cut rather than shown whole.
export const MAX_WEAKNESS_TITLE_LENGTH = 80;

const SEVERITY_RANK: Record<WeaknessSeverity, number> = { high: 0, medium: 1, low: 2 };

function isSeverity(value: unknown): value is WeaknessSeverity {
  return value === "low" || value === "medium" || value === "high";
}

function listLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function shorten(title: string): string {
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean.length <= MAX_WEAKNESS_TITLE_LENGTH) return clean;
  return `${clean.slice(0, MAX_WEAKNESS_TITLE_LENGTH - 1).trimEnd()}…`;
}

export function buildPaywallPreview(result: AnalysisResult): PaywallPreview {
  // Stored results come from a model and from older versions of the schema:
  // read defensively instead of trusting the type.
  const raw = result as unknown as Record<string, unknown>;

  const named: PaywallPreviewWeakness[] = [];
  let highSeverityCount = 0;
  const weaknesses = Array.isArray(raw.weaknesses) ? raw.weaknesses : [];
  for (const item of weaknesses) {
    const w = (item ?? {}) as Record<string, unknown>;
    if (w.severity === "high") highSeverityCount++;
    if (typeof w.title === "string" && w.title.trim() !== "" && isSeverity(w.severity)) {
      named.push({ title: shorten(w.title), severity: w.severity });
    }
  }
  // Stable sort: the model's own order is kept within a severity.
  const shown = [...named].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]).slice(0, MAX_WEAKNESSES_SHOWN);

  const titleAnalysis = (raw.title_analysis ?? {}) as Record<string, unknown>;
  const descriptionAnalysis = (raw.description_analysis ?? {}) as Record<string, unknown>;
  const improved = descriptionAnalysis.improved_description;

  return {
    weaknessCount: weaknesses.length,
    highSeverityCount,
    weaknesses: shown,
    priorityCount: listLength(raw.top_priorities),
    photoCount: listLength(raw.photo_analysis),
    hasPhotoOrder: listLength(raw.recommended_photo_order) > 0,
    suggestedTitleCount: listLength(titleAnalysis.suggested_titles),
    hasImprovedDescription: typeof improved === "string" && improved.trim() !== "",
    actionCount: listLength(raw.action_plan),
    guestQuestionCount: listLength(raw.guest_questions),
  };
}

/**
 * The lines of "what the report contains", in French, for the sections that
 * exist in this analysis. Each line maps to a section rendered after unlock
 * in app/result/[id]/page.tsx -- do not add one without a matching section.
 */
export function paywallPreviewContents(preview: PaywallPreview): string[] {
  const lines: string[] = [];
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

  if (preview.weaknessCount > 0) {
    lines.push(
      `L'explication et la correction ${preview.weaknessCount === 1 ? "du point faible relevé" : `des ${preview.weaknessCount} points faibles relevés`}`
    );
  }
  if (preview.priorityCount > 0) {
    lines.push(
      preview.priorityCount === 1
        ? "Le changement prioritaire à faire, expliqué"
        : `Tes ${preview.priorityCount} changements prioritaires, dans l'ordre`
    );
  }
  if (preview.photoCount > 0) {
    lines.push(
      `${n(preview.photoCount, "photo analysée", "photos analysées une par une")}${preview.hasPhotoOrder ? ", avec l'ordre recommandé" : ""}`
    );
  }
  if (preview.suggestedTitleCount > 0) {
    lines.push(n(preview.suggestedTitleCount, "titre Airbnb prêt à copier", "titres Airbnb prêts à copier"));
  }
  if (preview.hasImprovedDescription) lines.push("Ta description réécrite, prête à coller");
  if (preview.actionCount > 0) {
    lines.push(`Un plan d'action en ${n(preview.actionCount, "étape", "étapes")}`);
  }
  if (preview.guestQuestionCount > 0) {
    lines.push(
      preview.guestQuestionCount === 1
        ? "La question qu'un voyageur se pose devant ton annonce"
        : `Les ${preview.guestQuestionCount} questions qu'un voyageur se pose devant ton annonce`
    );
  }
  return lines;
}

/**
 * Section names for the compact locked card (A/B variant B, LockedPreviewB),
 * only for the sections this report really contains.
 */
export function lockedCategories(preview: PaywallPreview): string[] {
  const categories: string[] = [];
  if (preview.photoCount > 0 || preview.hasPhotoOrder) categories.push("Analyse des photos");
  if (preview.suggestedTitleCount > 0 || preview.hasImprovedDescription) categories.push("Titre et description");
  if (preview.weaknessCount > 0 || preview.guestQuestionCount > 0) categories.push("Points de friction");
  if (preview.priorityCount > 0 || preview.actionCount > 0) categories.push("Actions prioritaires");
  return categories;
}
