import { z } from "zod";
import type { AnalysisResult } from "./types";

// Full shape of a usable AI analysis.
//
// Why this exists (production audit, 2026-11-15): the only check on the
// model's tool output used to be "overall_score is a number and summary is
// non-empty". 71 of 772 stored analyses (8 of the last 59) passed that
// check while every nested field (scores, top_priorities, weaknesses,
// photo_analysis, ...) had come back as a *string* of leaked
// `<parameter ...>` markup instead of an object/array. Those rows were
// stored and counted as successes, but rendered a result page with no main
// problem, no recommendation and a meaningless "N améliorations" count --
// and would have crashed the paid report (`.map` on a string).
//
// Two uses:
//  - aiResultSchema: gate at generation time (lib/ai.ts) so a malformed
//    response is retried / failed honestly instead of being stored.
//  - normalizeAnalysisResult: tolerant read path (lib/store.ts) so the rows
//    already stored that way render safely instead of crashing.

const int = z.number().finite();
const text = z.string();

// What is enforced, and what deliberately is not. Measured against the 772
// analyses stored at the time of writing: requiring every leaf the tool
// schema marks "required" would also have rejected ~45 perfectly usable
// analyses whose only deviation was a weakness without a `recommendation`
// or an off-list `severity`. A rejection costs a second full model call
// (~55 s), so the gate only enforces what the product actually depends on:
// every container has the right type (object vs array vs string) and the
// fields the free result page is built from are present. Leaf fields the
// UI already renders conditionally stay optional.
export const aiResultSchema = z.object({
  overall_score: int,
  summary: text.min(1),
  first_hesitation: text.optional(),
  scores: z.object({
    cover_photo: int,
    photos: int,
    title: int,
    description: int,
    offer_clarity: int,
    visual_attractiveness: int,
    traveler_confidence: int,
  }),
  five_second_scores: z.object({
    visual_impact: int,
    differentiation: int,
    clarity: int,
    perceived_value: int,
    trust: int,
    desirability: int,
  }),
  guest_questions: z.array(text),
  strengths: z.array(z.object({ title: text, explanation: text.optional() })),
  weaknesses: z.array(
    z.object({
      title: text,
      severity: text.optional(),
      explanation: text.optional(),
      recommendation: text.optional(),
    })
  ),
  // At least one, with its two displayed sentences: top_priorities[0] is
  // what the free result page is built around (main problem + first
  // recommendation).
  top_priorities: z
    .array(
      z.object({
        rank: int.optional(),
        title: text,
        current_issue: text,
        recommended_change: text,
        expected_benefit: text.optional(),
        score: int.optional(),
      })
    )
    .min(1),
  title_analysis: z.object({
    current_title: text.optional(),
    issues: z.array(text),
    // Element type deliberately not checked here: lib/ai.ts already
    // sanitizes this list fail-open (drops non-strings / over-long titles)
    // and a stray bad title must not reject an otherwise valid analysis.
    suggested_titles: z.array(z.unknown()),
  }),
  description_analysis: z.object({
    issues: z.array(text),
    missing_information: z.array(text),
    improved_description: text,
  }),
  photo_analysis: z.array(
    z.object({
      image_index: int,
      score: int.optional(),
      strengths: z.array(text),
      weaknesses: z.array(text),
      recommendation: text.optional(),
    })
  ),
  recommended_photo_order: z.array(int),
  action_plan: z.array(text),
});

/**
 * Field paths + expected/received types only -- never values -- so the
 * string is safe to write to logs (no listing content, no guest-facing
 * text). e.g. "scores: expected object, received string".
 */
export function describeShapeIssues(error: z.ZodError, max = 6): string {
  return error.issues
    .slice(0, max)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.code}`)
    .join("; ");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function arrayOr<T>(v: unknown, itemOk: (item: unknown) => boolean): T[] {
  if (!Array.isArray(v)) return [];
  return v.every(itemOk) ? (v as T[]) : (v.filter(itemOk) as T[]);
}

const isString = (v: unknown) => typeof v === "string";
const isNumber = (v: unknown) => typeof v === "number" && Number.isFinite(v);

const ZERO_SCORES: AnalysisResult["scores"] = {
  cover_photo: 0,
  photos: 0,
  title: 0,
  description: 0,
  offer_clarity: 0,
  visual_attractiveness: 0,
  traveler_confidence: 0,
};

const ZERO_FIVE_SECOND_SCORES: AnalysisResult["five_second_scores"] = {
  visual_impact: 0,
  differentiation: 0,
  clarity: 0,
  perceived_value: 0,
  trust: 0,
  desirability: 0,
};

/**
 * Read-path safety net for rows stored before aiResultSchema gated
 * generation. Strictly type-repairing: a field whose stored type is already
 * correct is returned untouched (same reference), so a well-formed analysis
 * comes out identical. A field of the wrong type becomes its empty value --
 * the content is unrecoverable, and an empty section is honest where a
 * crash or a garbage count is not.
 */
export function normalizeAnalysisResult(raw: unknown): AnalysisResult {
  const r = isRecord(raw) ? raw : {};

  const title = isRecord(r.title_analysis) ? r.title_analysis : {};
  const description = isRecord(r.description_analysis) ? r.description_analysis : {};

  return {
    ...(r as Partial<AnalysisResult>),
    overall_score: isNumber(r.overall_score) ? (r.overall_score as number) : 0,
    summary: isString(r.summary) ? (r.summary as string) : "",
    first_hesitation: isString(r.first_hesitation) ? (r.first_hesitation as string) : "",
    scores: isRecord(r.scores) ? (r.scores as unknown as AnalysisResult["scores"]) : ZERO_SCORES,
    five_second_scores: isRecord(r.five_second_scores)
      ? (r.five_second_scores as unknown as AnalysisResult["five_second_scores"])
      : ZERO_FIVE_SECOND_SCORES,
    guest_questions: arrayOr<string>(r.guest_questions, isString),
    strengths: arrayOr<AnalysisResult["strengths"][number]>(r.strengths, isRecord),
    weaknesses: arrayOr<AnalysisResult["weaknesses"][number]>(r.weaknesses, isRecord),
    top_priorities: arrayOr<AnalysisResult["top_priorities"][number]>(r.top_priorities, isRecord),
    title_analysis: {
      ...(title as Partial<AnalysisResult["title_analysis"]>),
      current_title: isString(title.current_title) ? (title.current_title as string) : "",
      issues: arrayOr<string>(title.issues, isString),
      suggested_titles: arrayOr<string>(title.suggested_titles, isString),
    },
    description_analysis: {
      ...(description as Partial<AnalysisResult["description_analysis"]>),
      issues: arrayOr<string>(description.issues, isString),
      missing_information: arrayOr<string>(description.missing_information, isString),
      improved_description: isString(description.improved_description)
        ? (description.improved_description as string)
        : "",
    },
    photo_analysis: arrayOr<AnalysisResult["photo_analysis"][number]>(r.photo_analysis, isRecord).map((p) => {
      const photo = p as unknown as Record<string, unknown>;
      return Array.isArray(photo.strengths) && Array.isArray(photo.weaknesses)
        ? p
        : { ...p, strengths: arrayOr<string>(photo.strengths, isString), weaknesses: arrayOr<string>(photo.weaknesses, isString) };
    }),
    recommended_photo_order: arrayOr<number>(r.recommended_photo_order, isNumber),
    action_plan: arrayOr<string>(r.action_plan, isString),
    disclaimer: isString(r.disclaimer) ? (r.disclaimer as string) : "",
  } as AnalysisResult;
}

/**
 * True when an analysis has nothing actionable left to show or sell: no
 * priority, no weakness, no photo analysis, no action plan. Only ever the
 * case for the malformed legacy rows described above -- used by the result
 * page to offer a free re-run instead of putting an empty report behind
 * the paywall.
 */
export function isIncompleteResult(result: AnalysisResult): boolean {
  return (
    result.top_priorities.length === 0 &&
    result.weaknesses.length === 0 &&
    result.photo_analysis.length === 0 &&
    result.action_plan.length === 0
  );
}
