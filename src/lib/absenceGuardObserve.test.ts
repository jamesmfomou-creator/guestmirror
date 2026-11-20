// The absence guard is in observation mode (lib/photoCoverage.ts,
// ABSENCE_GUARD_REWRITES = false): it counts, it never changes a report.
// The Anthropic SDK is mocked -- no network, nothing billed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisResult } from "./types";

const createMock = vi.fn();
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class FakeAnthropic {
    messages = { create: createMock };
  }
  Object.assign(FakeAnthropic, actual.default);
  return { ...actual, default: FakeAnthropic };
});

async function modelReport(): Promise<AnalysisResult> {
  const { DEMO_RESULT } = await import("./demo-data");
  const r = structuredClone(DEMO_RESULT);
  // The real false positive from production: a cover critique whose
  // explanation says "je ne vois pas".
  r.weaknesses = [
    {
      title: "La photo de couverture ne montre pas l'atout principal",
      explanation: 'En quelques secondes de scroll, je ne vois pas ce qui justifie le mot "superbe terrasse" du titre.',
      recommendation: "Mets la terrasse en première photo.",
      severity: "high",
    },
    {
      title: "Aucune photo de la salle de bain",
      explanation: "La galerie ne montre pas la salle de bain.",
      recommendation: "Ajoute une photo de la salle de bain.",
      severity: "medium",
    },
    ...r.weaknesses.slice(0, 1),
  ] as AnalysisResult["weaknesses"];
  r.action_plan = ["Ajouter une photo de la salle de bain", ...r.action_plan.slice(0, 2)];
  return r;
}

describe("absence guard, observation mode", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-used");
    vi.stubEnv("DEMO_MODE", "false");
    createMock.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is off by default", async () => {
    const { ABSENCE_GUARD_REWRITES, ABSENCE_GUARD_MODE } = await import("./photoCoverage");
    expect(ABSENCE_GUARD_REWRITES).toBe(false);
    expect(ABSENCE_GUARD_MODE).toBe("observe");
  });

  it("applyAbsenceGuard counts but returns the report untouched; rewrite=true still hedges", async () => {
    const { applyAbsenceGuard, buildUrlCoverage } = await import("./photoCoverage");
    const r = await modelReport();
    const before = structuredClone(r);
    const cov = buildUrlCoverage(12, [true, true, true, true, true]);
    const observed = applyAbsenceGuard(r, cov);
    expect(observed.flagged).toBeGreaterThan(0);
    expect(observed.result).toBe(r);
    expect(r).toEqual(before);
    const rewritten = applyAbsenceGuard(structuredClone(r), cov, true);
    expect(JSON.stringify(rewritten.result)).toContain("À vérifier");
  });

  it("analyzeListing returns exactly what the model wrote (scores, weaknesses, priorities, plan) and reports the count", async () => {
    const report = await modelReport();
    const { ANALYSIS_TOOL_NAME, analyzeListing } = await import("./ai");
    const { buildUrlCoverage } = await import("./photoCoverage");
    createMock.mockResolvedValue({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "test-model",
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
      content: [{ type: "tool_use", id: "tu_1", name: ANALYSIS_TOOL_NAME, input: structuredClone(report) }],
    });
    const out = await analyzeListing({
      images: [{ mediaType: "image/jpeg", data: "AAAA" }] as never,
      input: { goal: null, guest_capacity: null, city: null } as never,
      extractedListingText: null,
      photoCoverage: buildUrlCoverage(12, [true, true, true, true, true]),
    });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(out.absenceClaimsHedged).toBeGreaterThan(0);
    expect(JSON.stringify(out.result)).not.toContain("À vérifier");
    expect(out.result.overall_score).toBe(report.overall_score);
    expect(out.result.scores).toEqual(report.scores);
    expect(out.result.weaknesses.map((w) => [w.title, w.severity])).toEqual(report.weaknesses.map((w) => [w.title, w.severity]));
    expect(out.result.top_priorities.map((p) => p.title)).toEqual(report.top_priorities.map((p) => p.title));
    expect(out.result.action_plan).toEqual(report.action_plan);
  });
});
