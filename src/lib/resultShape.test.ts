import { describe, expect, it } from "vitest";
import { isIncompleteResult, normalizeAnalysisResult } from "./resultShape";

function wellFormed() {
  return {
    overall_score: 72,
    summary: "Résumé.",
    first_hesitation: "Hésitation.",
    scores: { cover_photo: 60, photos: 70, title: 65, description: 75, offer_clarity: 70, visual_attractiveness: 72, traveler_confidence: 80 },
    five_second_scores: { visual_impact: 60, differentiation: 55, clarity: 70, perceived_value: 65, trust: 80, desirability: 68 },
    guest_questions: ["Parking ?"],
    strengths: [{ title: "Lumineux", explanation: "Clair." }],
    weaknesses: [{ title: "Couverture", severity: "high", explanation: "Sombre.", recommendation: "Refaire." }],
    top_priorities: [{ rank: 1, title: "Couverture", current_issue: "Sombre.", recommended_change: "Refaire.", expected_benefit: "Clics.", score: 60 }],
    title_analysis: { current_title: "Appartement", issues: ["Générique"], suggested_titles: ["T2 lumineux"] },
    description_analysis: { issues: ["Courte"], missing_information: ["Parking"], improved_description: "Texte." },
    photo_analysis: [{ image_index: 0, score: 60, strengths: ["Cadrage"], weaknesses: ["Sombre"], recommendation: "Refaire." }],
    recommended_photo_order: [0],
    action_plan: ["Refaire la couverture."],
    disclaimer: "Avis indicatif.",
  };
}

describe("normalizeAnalysisResult", () => {
  it("returns a well-formed analysis unchanged, field for field", () => {
    const raw = wellFormed();
    const normalized = normalizeAnalysisResult(raw);
    expect(normalized).toEqual(raw);
    // Correctly typed containers are passed through, not copied.
    expect(normalized.scores).toBe(raw.scores);
    expect(normalized.top_priorities).toBe(raw.top_priorities);
    expect(normalized.photo_analysis[0]).toBe(raw.photo_analysis[0]);
  });

  // The stored shape the audit found: nested fields as strings of leaked
  // tool markup. Every page does .map / .length / property reads on these.
  it("turns wrongly typed containers into their empty value instead of crashing readers", () => {
    const leaked = '\n<parameter name="x">1</parameter>';
    const normalized = normalizeAnalysisResult({
      overall_score: 64,
      summary: "Résumé.",
      scores: leaked,
      five_second_scores: leaked,
      guest_questions: leaked,
      strengths: leaked,
      weaknesses: leaked,
      top_priorities: leaked,
      title_analysis: leaked,
      description_analysis: leaked,
      photo_analysis: leaked,
      recommended_photo_order: leaked,
      action_plan: leaked,
    });

    expect(normalized.overall_score).toBe(64);
    expect(normalized.summary).toBe("Résumé.");
    expect(normalized.top_priorities).toEqual([]);
    expect(normalized.weaknesses).toEqual([]);
    expect(normalized.photo_analysis).toEqual([]);
    expect(normalized.action_plan).toEqual([]);
    expect(normalized.title_analysis.suggested_titles).toEqual([]);
    expect(normalized.description_analysis.improved_description).toBe("");
    expect(normalized.scores.cover_photo).toBe(0);
    expect(normalized.five_second_scores.trust).toBe(0);
    expect(isIncompleteResult(normalized)).toBe(true);
  });

  it("drops only the malformed items of an otherwise valid list", () => {
    const normalized = normalizeAnalysisResult({
      ...wellFormed(),
      guest_questions: ["Parking ?", 42, null],
      photo_analysis: [{ image_index: 0, strengths: "oops", weaknesses: ["Sombre"] }, "garbage"],
    });
    expect(normalized.guest_questions).toEqual(["Parking ?"]);
    expect(normalized.photo_analysis).toHaveLength(1);
    expect(normalized.photo_analysis[0].strengths).toEqual([]);
    expect(normalized.photo_analysis[0].weaknesses).toEqual(["Sombre"]);
  });

  it("survives input that is not an object at all", () => {
    for (const raw of [null, undefined, "text", 3, []]) {
      const normalized = normalizeAnalysisResult(raw);
      expect(normalized.top_priorities).toEqual([]);
      expect(normalized.overall_score).toBe(0);
    }
  });
});

describe("isIncompleteResult", () => {
  it("is false for a real analysis, even a short one", () => {
    expect(isIncompleteResult(normalizeAnalysisResult(wellFormed()))).toBe(false);
    expect(
      isIncompleteResult(normalizeAnalysisResult({ ...wellFormed(), weaknesses: [], photo_analysis: [], action_plan: [] }))
    ).toBe(false);
  });
});
