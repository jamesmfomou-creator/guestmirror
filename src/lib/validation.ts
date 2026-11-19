import { z } from "zod";
import { GOALS } from "@/lib/types";

export const analyzeRequestSchema = z.object({
  email: z.string().trim().email(),
  listing_url: z.string().trim().max(500).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  property_type: z.string().trim().max(80).nullable().optional(),
  guest_capacity: z.string().trim().max(20).nullable().optional(),
  nightly_price: z.string().trim().max(20).nullable().optional(),
  previous_analysis_id: z.string().uuid().nullable().optional(),
  user_type: z.enum(["host", "concierge", "cohost", "other"]).nullable().optional(),
  property_count_range: z.enum(["1", "2-5", "6-20", "21+"]).nullable().optional(),
  goal: z.enum(GOALS).nullable().optional(),
  promo_code: z.string().trim().max(64).nullable().optional(),
  // Client-generated correlation id (see AnalyzeWizard.tsx's attemptId,
  // already sent to /api/track) -- used for server-side log correlation
  // (lib/ai.ts, api/analyze/route.ts) between a user-visible attempt and
  // the raw AI call(s) it triggered, and persisted on the analyses row
  // (see lib/store.ts's createAnalysis) to dedupe a resubmitted attempt.
  attempt_id: z.string().max(100).nullable().optional(),
  images: z
    .array(
      z.object({
        base64: z.string().min(10),
        mediaType: z.string().regex(/^image\/(png|jpeg|jpg|webp)$/),
      })
    )
    .max(10)
    .default([]),
});

export type AnalyzeRequestBody = z.infer<typeof analyzeRequestSchema>;

export const updateAnalysisInputSchema = z
  .object({
    city: z.string().trim().max(120).nullable().optional(),
    property_type: z.string().trim().max(80).nullable().optional(),
    guest_capacity: z.string().trim().max(20).nullable().optional(),
    nightly_price: z.string().trim().max(20).nullable().optional(),
    // Answers given while (or after) the analysis runs -- same enums as
    // analyzeRequestSchema. Display only: they never touch the result.
    goal: z.enum(GOALS).nullable().optional(),
    user_type: z.enum(["host", "concierge", "cohost", "other"]).nullable().optional(),
    property_count_range: z.enum(["1", "2-5", "6-20", "21+"]).nullable().optional(),
  })
  .strict();

export type UpdateAnalysisInputBody = z.infer<typeof updateAnalysisInputSchema>;

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGES = 10;

const compareImageSchema = z
  .array(
    z.object({
      base64: z.string().min(10),
      mediaType: z.string().regex(/^image\/(png|jpeg|jpg|webp)$/),
    })
  )
  .min(1)
  .max(6);

export const compareRequestSchema = z.object({
  a: compareImageSchema,
  b: compareImageSchema,
});

export type CompareRequestBody = z.infer<typeof compareRequestSchema>;
