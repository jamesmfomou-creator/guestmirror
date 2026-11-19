import { describe, expect, it } from "vitest";
import { DEMO_RESULT } from "@/lib/demo-data";
import type { AnalysisResult } from "@/lib/types";
import { buildFreeReveal } from "@/lib/freeReveal";
import { normalizeAnalysisResult } from "@/lib/resultShape";

const w = (title: string, severity: string, explanation: string, recommendation: string) => ({ title, severity, explanation, recommendation });
const LONG = "Cette explication décrit précisément ce qu'un voyageur remarque en découvrant l'annonce.";
const withWeaknesses = (weaknesses: unknown[]) => ({ ...DEMO_RESULT, weaknesses }) as unknown as AnalysisResult;

/** Every string of the paid report that must never reach a locked page. */
function premiumStrings(r: AnalysisResult): string[] {
  return [
    ...r.weaknesses.map((x) => x.recommendation),
    ...r.top_priorities.flatMap((p) => [p.current_issue, p.recommended_change, p.expected_benefit]),
    ...r.title_analysis.suggested_titles,
    r.description_analysis.improved_description,
    ...r.description_analysis.missing_information,
    ...r.action_plan,
    ...r.photo_analysis.flatMap((p) => [p.recommendation, ...p.strengths, ...p.weaknesses]),
    ...r.guest_questions,
  ].filter((s): s is string => typeof s === "string" && s.length > 12);
}

describe("buildFreeReveal: what is revealed", () => {
  it("reveals the most severe real weakness: title, severity, explanation -- unchanged", () => {
    const r = withWeaknesses([
      w("Point moyen", "medium", LONG + " (moyen)", "CORRECTION-1"),
      w("Point grave", "high", LONG + " (grave)", "CORRECTION-2"),
      w("Autre grave", "high", LONG + " (autre)", "CORRECTION-3"),
    ]);
    const out = buildFreeReveal(r);
    expect(out.insight).toEqual({ title: "Point grave", explanation: LONG + " (grave)", severity: "high" });
    expect(out.weaknessCount).toBe(3);
    expect(out.otherWeaknessCount).toBe(2);
  });

  it("skips weaknesses too thin or malformed to stand on their own", () => {
    const r = withWeaknesses([
      w("Trop court", "high", "Court.", "C1"),
      w("Balise", "high", '<parameter name="x">' + LONG, "C2"),
      { title: 5, severity: "high", explanation: LONG },
      w("Gravité inconnue", "huge", LONG, "C3"),
      w("Valable", "low", LONG, "C4"),
    ]);
    expect(buildFreeReveal(r).insight?.title).toBe("Valable");
  });

  it("no reliable weakness: no insight, the analysis' own first hesitation instead", () => {
    const out = buildFreeReveal(withWeaknesses([]));
    expect(out.insight).toBeNull();
    expect(out.hesitation).toBe(DEMO_RESULT.first_hesitation);
    expect([...out.reportHighlights, ...out.reportMore].join(" ")).not.toMatch(/point faible/);
  });

  it("nothing at all to show: no insight, no hesitation, no invented text", () => {
    const out = buildFreeReveal({ ...withWeaknesses([]), first_hesitation: "" } as AnalysisResult);
    expect(out.insight).toBeNull();
    expect(out.hesitation).toBeNull();
  });
});

describe("buildFreeReveal: counts come from the report", () => {
  it("a section the report does not have is never listed", () => {
    const out = buildFreeReveal({
      ...DEMO_RESULT,
      title_analysis: { ...DEMO_RESULT.title_analysis, suggested_titles: [] },
      description_analysis: { ...DEMO_RESULT.description_analysis, improved_description: "" },
      photo_analysis: [],
      action_plan: [],
    } as AnalysisResult);
    expect([...out.reportHighlights, ...out.reportMore].join(" ")).not.toMatch(/titre|description réécrite|photo|plan d'action/);
    expect(out.reportMore).toEqual([]);
  });

  it("lists only sections the report has, with their real numbers", () => {
    const out = buildFreeReveal(DEMO_RESULT);
    const others = DEMO_RESULT.weaknesses.length - 1;
    expect(out.reportHighlights).toEqual([
      `${others} autres points faibles à découvrir, avec leur explication`,
      `La correction de chaque point et tes ${DEMO_RESULT.top_priorities.length} changements prioritaires, dans l'ordre`,
      `${DEMO_RESULT.title_analysis.suggested_titles.length} titres Airbnb prêts à copier`,
      "Ta description réécrite, prête à coller",
    ]);
    expect(out.reportMore).toEqual([
      `${DEMO_RESULT.photo_analysis.length} photos analysées une par une, avec l'ordre recommandé`,
      `Un plan d'action en ${DEMO_RESULT.action_plan.length} étapes`,
    ]);
  });

  it("one weakness only: 0 others, singular wording, no fake 'autres'", () => {
    const out = buildFreeReveal({
      ...withWeaknesses([w("Seul point", "medium", LONG, "C")]),
      title_analysis: { ...DEMO_RESULT.title_analysis, suggested_titles: ["Un titre"] },
    } as AnalysisResult);
    expect(out.otherWeaknessCount).toBe(0);
    expect(out.reportHighlights.join(" ")).not.toMatch(/autres? points? faibles?/);
    expect(out.reportHighlights).toContain("1 titre Airbnb prêt à copier");
  });
});

describe("buildFreeReveal: never leaks the paid report", () => {
  const fixtures: [string, AnalysisResult][] = [
    ["demo report", DEMO_RESULT],
    ["one weakness", withWeaknesses([w("Seul", "high", LONG, "LA-CORRECTION-SECRETE")])],
    ["no weakness", withWeaknesses([])],
    ["legacy malformed row", normalizeAnalysisResult({ ...DEMO_RESULT, weaknesses: "<parameter>x</parameter>", top_priorities: "y" })],
  ];
  for (const [name, r] of fixtures) {
    it(`${name}: no correction, priority, rewrite, photo analysis, plan or question in the projection`, () => {
      const serialized = JSON.stringify(buildFreeReveal(r));
      for (const secret of premiumStrings(r)) expect(serialized).not.toContain(secret);
      expect(serialized).not.toContain("LA-CORRECTION-SECRETE");
    });
  }

  it("only plain strings and numbers leave the function", () => {
    const out = buildFreeReveal(DEMO_RESULT);
    expect(Object.keys(out).sort()).toEqual(["hesitation", "insight", "otherWeaknessCount", "reportHighlights", "reportMore", "weaknessCount"]);
    expect(Object.keys(out.insight!).sort()).toEqual(["explanation", "severity", "title"]);
  });
});
