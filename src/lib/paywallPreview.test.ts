import { describe, expect, it } from "vitest";
import { DEMO_RESULT } from "@/lib/demo-data";
import type { AnalysisResult } from "@/lib/types";
import {
  MAX_WEAKNESSES_SHOWN,
  MAX_WEAKNESS_TITLE_LENGTH,
  buildPaywallPreview,
  paywallPreviewContents,
} from "@/lib/paywallPreview";

function resultWith(overrides: Record<string, unknown>): AnalysisResult {
  return { ...DEMO_RESULT, ...overrides } as unknown as AnalysisResult;
}

const weakness = (title: string, severity: string) => ({
  title,
  severity,
  explanation: `EXPLICATION SECRÈTE de ${title}`,
  recommendation: `RECOMMANDATION SECRÈTE pour ${title}`,
});

describe("buildPaywallPreview", () => {
  it("counts what the analysis really contains", () => {
    const preview = buildPaywallPreview(DEMO_RESULT);
    expect(preview.weaknessCount).toBe(DEMO_RESULT.weaknesses.length);
    expect(preview.highSeverityCount).toBe(DEMO_RESULT.weaknesses.filter((w) => w.severity === "high").length);
    expect(preview.priorityCount).toBe(DEMO_RESULT.top_priorities.length);
    expect(preview.photoCount).toBe(DEMO_RESULT.photo_analysis.length);
    expect(preview.hasPhotoOrder).toBe(DEMO_RESULT.recommended_photo_order.length > 0);
    expect(preview.suggestedTitleCount).toBe(DEMO_RESULT.title_analysis.suggested_titles.length);
    expect(preview.actionCount).toBe(DEMO_RESULT.action_plan.length);
    expect(preview.guestQuestionCount).toBe(DEMO_RESULT.guest_questions.length);
  });

  it("names at most three weaknesses, the most severe first, in the model's order within a severity", () => {
    const preview = buildPaywallPreview(
      resultWith({
        weaknesses: [
          weakness("Faible 1", "low"),
          weakness("Moyen 1", "medium"),
          weakness("Haut 1", "high"),
          weakness("Moyen 2", "medium"),
          weakness("Haut 2", "high"),
        ],
      })
    );
    expect(preview.weaknessCount).toBe(5);
    expect(preview.highSeverityCount).toBe(2);
    expect(preview.weaknesses).toHaveLength(MAX_WEAKNESSES_SHOWN);
    expect(preview.weaknesses.map((w) => w.title)).toEqual(["Haut 1", "Haut 2", "Moyen 1"]);
  });

  it("carries no paid text: no explanation, recommendation, title, description or action", () => {
    const result = resultWith({
      weaknesses: [weakness("Photo de couverture sombre", "high")],
      top_priorities: [
        { rank: 1, title: "PRIORITÉ SECRÈTE", current_issue: "CONSTAT SECRET", recommended_change: "CHANGEMENT SECRET", expected_benefit: "BÉNÉFICE SECRET" },
      ],
      title_analysis: { current_title: "x", issues: ["PROBLÈME DE TITRE SECRET"], suggested_titles: ["TITRE SECRET"] },
      description_analysis: { issues: [], missing_information: [], improved_description: "DESCRIPTION SECRÈTE" },
      action_plan: ["ACTION SECRÈTE"],
      guest_questions: ["QUESTION SECRÈTE"],
      photo_analysis: [{ image_index: 1, score: 12, strengths: ["FORCE SECRÈTE"], weaknesses: ["FAIBLESSE SECRÈTE"], recommendation: "CONSEIL SECRET" }],
    });
    const preview = buildPaywallPreview(result);
    const serialized = JSON.stringify(preview) + paywallPreviewContents(preview).join(" ");
    expect(serialized).not.toMatch(/SECR[EÈ]TE?/);
    expect(serialized).toContain("Photo de couverture sombre");
    // Only the declared keys leave the server.
    expect(Object.keys(preview).sort()).toEqual(
      [
        "actionCount",
        "guestQuestionCount",
        "hasImprovedDescription",
        "hasPhotoOrder",
        "highSeverityCount",
        "photoCount",
        "priorityCount",
        "suggestedTitleCount",
        "weaknessCount",
        "weaknesses",
      ].sort()
    );
    expect(Object.keys(preview.weaknesses[0]).sort()).toEqual(["severity", "title"]);
  });

  it("cuts a weakness name that is really a paragraph", () => {
    const preview = buildPaywallPreview(resultWith({ weaknesses: [weakness("x".repeat(400), "medium")] }));
    expect(preview.weaknesses[0].title.length).toBeLessThanOrEqual(MAX_WEAKNESS_TITLE_LENGTH);
    expect(preview.weaknesses[0].title.endsWith("…")).toBe(true);
  });

  it("announces nothing for sections the analysis did not produce", () => {
    const preview = buildPaywallPreview(
      resultWith({
        weaknesses: [],
        top_priorities: [],
        photo_analysis: [],
        recommended_photo_order: [],
        title_analysis: { current_title: null, issues: [], suggested_titles: [] },
        description_analysis: { issues: [], missing_information: [], improved_description: "  " },
        action_plan: [],
        guest_questions: [],
      })
    );
    expect(preview).toMatchObject({
      weaknessCount: 0,
      highSeverityCount: 0,
      weaknesses: [],
      priorityCount: 0,
      photoCount: 0,
      hasPhotoOrder: false,
      suggestedTitleCount: 0,
      hasImprovedDescription: false,
      actionCount: 0,
      guestQuestionCount: 0,
    });
    expect(paywallPreviewContents(preview)).toEqual([]);
  });

  it("does not throw on a malformed stored result", () => {
    const preview = buildPaywallPreview({ weaknesses: "oops", title_analysis: null, photo_analysis: [null] } as unknown as AnalysisResult);
    expect(preview.weaknessCount).toBe(0);
    expect(preview.photoCount).toBe(1);
    expect(preview.suggestedTitleCount).toBe(0);

    const odd = buildPaywallPreview(resultWith({ weaknesses: [null, { title: 3, severity: "high" }, { title: "Ok", severity: "critical" }] }));
    expect(odd.weaknessCount).toBe(3);
    expect(odd.highSeverityCount).toBe(1);
    expect(odd.weaknesses).toEqual([]);
  });
});

describe("paywallPreviewContents", () => {
  it("uses the real counts and agrees in number", () => {
    const lines = paywallPreviewContents({
      weaknessCount: 4,
      highSeverityCount: 1,
      weaknesses: [],
      priorityCount: 3,
      photoCount: 5,
      hasPhotoOrder: true,
      suggestedTitleCount: 1,
      hasImprovedDescription: true,
      actionCount: 1,
      guestQuestionCount: 2,
    });
    expect(lines).toEqual([
      "L'explication et la correction des 4 points faibles relevés",
      "Tes 3 changements prioritaires, dans l'ordre",
      "5 photos analysées une par une, avec l'ordre recommandé",
      "1 titre Airbnb prêt à copier",
      "Ta description réécrite, prête à coller",
      "Un plan d'action en 1 étape",
      "Les 2 questions qu'un voyageur se pose devant ton annonce",
    ]);
  });
});
