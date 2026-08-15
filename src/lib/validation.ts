import { z } from "zod";

export const analyzeRequestSchema = z.object({
  email: z.string().trim().email(),
  listing_url: z.string().trim().max(500).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  property_type: z.string().trim().max(80).nullable().optional(),
  guest_capacity: z.string().trim().max(20).nullable().optional(),
  nightly_price: z.string().trim().max(20).nullable().optional(),
  previous_analysis_id: z.string().uuid().nullable().optional(),
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

export const updateAnalysisInputSchema = z.object({
  city: z.string().trim().max(120).nullable().optional(),
  property_type: z.string().trim().max(80).nullable().optional(),
  guest_capacity: z.string().trim().max(20).nullable().optional(),
  nightly_price: z.string().trim().max(20).nullable().optional(),
});

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
