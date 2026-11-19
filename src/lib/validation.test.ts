import { describe, expect, it } from "vitest";
import { analyzeRequestSchema } from "./validation";

describe("analyzeRequestSchema -- goal enum", () => {
  // The Zod enum and the Goal type now share lib/types.ts GOALS; StepGoal.tsx's
  // GOAL_OPTIONS (what the UI offers) is still kept in sync by hand. This
  // pins the exact documented set the server accepts.
  // improve_photos added with journey goal_value_v1 (database: migration 0012).
  const EXPECTED_GOALS = ["improve_appeal", "reduce_hesitation", "improve_photos", "verify_improvements", "optimize_multiple"];

  it("accepts each of the 5 documented goal values", () => {
    for (const goal of EXPECTED_GOALS) {
      const result = analyzeRequestSchema.safeParse({ email: "a@b.com", images: [], goal });
      expect(result.success, `goal=${goal} should be valid`).toBe(true);
    }
  });

  it("rejects a goal value outside the documented set", () => {
    const result = analyzeRequestSchema.safeParse({ email: "a@b.com", images: [], goal: "something_else" });
    expect(result.success).toBe(false);
  });

  it("allows a null/missing goal (variant A never sends one)", () => {
    expect(analyzeRequestSchema.safeParse({ email: "a@b.com", images: [], goal: null }).success).toBe(true);
    expect(analyzeRequestSchema.safeParse({ email: "a@b.com", images: [] }).success).toBe(true);
  });
});
