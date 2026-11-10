import { describe, expect, it } from "vitest";
import { analyzeRequestSchema } from "./validation";

describe("analyzeRequestSchema -- goal enum", () => {
  // The same 4 values live in three places that have no structural link to
  // each other: this Zod enum (server-side validation), the Goal type
  // (lib/types.ts), and StepGoal.tsx's GOAL_OPTIONS (what the UI actually
  // offers). A drift between them would mean either the UI can send a
  // value the server silently rejects, or a value the type system allows
  // but the UI never offers. This test only guards the schema side -- it
  // can't import StepGoal.tsx's values in a node environment without a
  // DOM, so the UI list must be kept in sync by hand -- but it does
  // confirm the server accepts exactly the 4 documented values and
  // nothing else.
  const EXPECTED_GOALS = ["improve_appeal", "reduce_hesitation", "verify_improvements", "optimize_multiple"];

  it("accepts each of the 4 documented goal values", () => {
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
