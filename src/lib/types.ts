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
}

export type PaymentStatus = "none" | "pending" | "paid";

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
