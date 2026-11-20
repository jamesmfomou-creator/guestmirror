export interface ScoreBreakdown {
  cover_photo: number;
  photos: number;
  title: number;
  description: number;
  offer_clarity: number;
  visual_attractiveness: number;
  traveler_confidence: number;
}

/** Quick "gut reaction" sub-scores shown in the Test des 5 secondes teaser. */
export interface FiveSecondScores {
  visual_impact: number;
  differentiation: number;
  clarity: number;
  perceived_value: number;
  trust: number;
  desirability: number;
}

export interface Strength {
  title: string;
  explanation: string;
}

export type Severity = "low" | "medium" | "high";

export interface Weakness {
  title: string;
  severity: Severity;
  explanation: string;
  recommendation: string;
}

export interface TopPriority {
  rank: number;
  title: string;
  current_issue: string;
  recommended_change: string;
  expected_benefit: string;
  score?: number;
}

export interface TitleAnalysis {
  current_title: string;
  issues: string[];
  suggested_titles: string[];
}

export interface DescriptionAnalysis {
  issues: string[];
  missing_information: string[];
  improved_description: string;
}

export interface PhotoAnalysis {
  image_index: number;
  score: number;
  strengths: string[];
  weaknesses: string[];
  recommendation: string;
}

export interface AnalysisResult {
  overall_score: number;
  summary: string;
  first_hesitation: string;
  scores: ScoreBreakdown;
  five_second_scores: FiveSecondScores;
  guest_questions: string[];
  strengths: Strength[];
  weaknesses: Weakness[];
  top_priorities: TopPriority[];
  title_analysis: TitleAnalysis;
  description_analysis: DescriptionAnalysis;
  photo_analysis: PhotoAnalysis[];
  recommended_photo_order: number[];
  action_plan: string[];
  disclaimer: string;
  // The listing's title as read from the Airbnb page itself (link
  // submissions only, set server side in api/analyze -- never produced by
  // the model). Absent on older reports and screenshot submissions.
  listing_title?: string | null;
  // Which photos the AI actually saw (lib/photoCoverage.ts), set server side
  // in api/analyze -- never produced by the model. Absent on older reports.
  photo_coverage?: import("@/lib/photoCoverage").PhotoCoverage | null;
}

export type PaymentStatus = "none" | "pending" | "paid";

export type UserType = "host" | "concierge" | "cohost" | "other";
export type PropertyCountRange = "1" | "2-5" | "6-20" | "21+";
// Onboarding "objectif" question (asked to everyone after email -- see
// StepGoal.tsx). Never sent to the AI: the analysis and its score depend on
// the listing only. The result page uses it to ORDER and flag what the
// analysis found (lib/goalPersonalization.ts), without changing any of it.
// improve_photos: added with journey goal_value_v1 (2026-11-19); the database
// accepts it from supabase/migrations/0012_goal_improve_photos.sql (until that
// migration runs, lib/store.ts drops it rather than failing the write).
export const GOALS = ["improve_appeal", "reduce_hesitation", "improve_photos", "verify_improvements", "optimize_multiple"] as const;
export type Goal = (typeof GOALS)[number];

export interface AnalysisInput {
  listing_url: string | null;
  city: string | null;
  property_type: string | null;
  guest_capacity: string | null;
  nightly_price: string | null;
}

export interface AnalysisRecord {
  id: string;
  user_id: string | null;
  email: string | null;
  listing_url: string | null;
  city: string | null;
  property_type: string | null;
  guest_capacity: string | null;
  nightly_price: string | null;
  overall_score: number;
  result: AnalysisResult;
  images: string[];
  is_unlocked: boolean;
  payment_status: PaymentStatus;
  previous_analysis_id: string | null;
  user_type: UserType | null;
  property_count_range: PropertyCountRange | null;
  promo_code: string | null;
  goal: Goal | null;
  created_at: string;
  updated_at: string;
}

export interface Comparison {
  winner: "a" | "b";
  why_winner: string[];
  main_problem: string;
  first_change: string;
}

export const SCORE_LABELS: Record<keyof ScoreBreakdown, string> = {
  cover_photo: "Photo de couverture",
  photos: "Photos",
  title: "Titre",
  description: "Description",
  offer_clarity: "Clarté de l'offre",
  visual_attractiveness: "Attractivité",
  traveler_confidence: "Confiance voyageur",
};

export const FIVE_SECOND_LABELS: Record<keyof FiveSecondScores, string> = {
  visual_impact: "Impact visuel",
  differentiation: "Différenciation",
  clarity: "Clarté",
  perceived_value: "Valeur perçue",
  trust: "Confiance",
  desirability: "Envie",
};
