import { describe, expect, it } from "vitest";
import { DEMO_RESULT } from "@/lib/demo-data";
import type { AnalysisResult, Goal } from "@/lib/types";
import {
  GOAL_REMINDERS,
  displayListingTitle,
  goalExplanation,
  matchesGoal,
  personalizeResult,
} from "@/lib/goalPersonalization";
import { buildPaywallPreview, lockedCategories, paywallPreviewContents } from "@/lib/paywallPreview";

const GOALS: Goal[] = ["improve_appeal", "reduce_hesitation", "verify_improvements", "optimize_multiple"];

const w = (title: string, severity: "low" | "medium" | "high") => ({
  title,
  severity,
  explanation: `explication de ${title}`,
  recommendation: `recommandation pour ${title}`,
});
const p = (rank: number, title: string) => ({
  rank,
  title,
  current_issue: `constat ${rank}`,
  recommended_change: `changement ${rank}`,
  expected_benefit: `bénéfice ${rank}`,
});

// Shaped like real stored reports (labels in the style the model writes).
const REFERENCE: AnalysisResult = {
  ...DEMO_RESULT,
  weaknesses: [
    w("Incohérence entre le titre et la capacité d'accueil", "high"),
    w("La photo de couverture ne montre pas l'atout principal", "high"),
    w("Description peu détaillée sur la localisation", "medium"),
    w("Titre peu différenciant", "medium"),
    w("Le mur rouge de la cuisine détonne", "low"),
    w("Photos de chambres redondantes", "low"),
  ],
  top_priorities: [
    p(1, "Corriger la contradiction sur le nombre de voyageurs"),
    p(2, "Aucune information sur l'accès à la plage"),
    p(3, "La photo de couverture n'est pas la plus engageante"),
    p(4, "Le titre ne montre aucun atout concret"),
  ],
  action_plan: [
    "Corrige la capacité dans la description",
    "Ajoute une phrase sur l'arrivée autonome",
    "Remplace la photo de couverture par la terrasse",
    "Réécris le titre avec l'atout vue mer",
    "Range le salon avant de reprendre les photos",
  ],
};

const UNTOUCHED_FIELDS = [
  "overall_score",
  "summary",
  "first_hesitation",
  "scores",
  "five_second_scores",
  "guest_questions",
  "strengths",
  "title_analysis",
  "description_analysis",
  "photo_analysis",
  "recommended_photo_order",
  "disclaimer",
] as const;

const canon = (items: unknown[]) => items.map((x) => JSON.stringify(x)).sort();

describe("personalizeResult: never alters the analysis", () => {
  for (const goal of GOALS) {
    it(`${goal}: same score and same texts, only reordered`, () => {
      const before = structuredClone(REFERENCE);
      const out = personalizeResult(REFERENCE, goal, { hasPrevious: false })!;
      // Input not mutated.
      expect(REFERENCE).toEqual(before);
      // Score and every non-reordered field identical.
      for (const field of UNTOUCHED_FIELDS) expect(out.result[field]).toEqual(REFERENCE[field]);
      expect(out.result.overall_score).toBe(REFERENCE.overall_score);
      // Reordered lists are permutations: nothing added, removed or edited.
      expect(canon(out.result.weaknesses)).toEqual(canon(REFERENCE.weaknesses));
      expect(canon(out.result.top_priorities)).toEqual(canon(REFERENCE.top_priorities));
      expect(canon(out.result.action_plan)).toEqual(canon(REFERENCE.action_plan));
      // The model's #1 priority and first action keep their place (the free
      // view shows priority #1 as "Problème principal").
      expect(out.result.top_priorities[0]).toEqual(REFERENCE.top_priorities[0]);
      expect(out.result.action_plan[0]).toBe(REFERENCE.action_plan[0]);
      // Flags line up with the lists.
      expect(out.weaknessMatches).toHaveLength(out.result.weaknesses.length);
      expect(out.priorityMatches).toHaveLength(out.result.top_priorities.length);
      expect(out.actionMatches).toHaveLength(out.result.action_plan.length);
      expect(out.reminder).toBe(GOAL_REMINDERS[goal]);
    });

    it(`${goal}: deterministic (reload, unlock, return give the same report)`, () => {
      expect(personalizeResult(REFERENCE, goal)).toEqual(personalizeResult(REFERENCE, goal));
    });
  }

  it("no goal (older reports, content link) or an unknown value: nothing changes", () => {
    expect(personalizeResult(REFERENCE, null)).toBeNull();
    expect(personalizeResult(REFERENCE, undefined)).toBeNull();
    expect(personalizeResult(REFERENCE, "something_else" as Goal)).toBeNull();
  });
});

describe("personalizeResult: goal ordering", () => {
  it("improve_appeal: photo and title weaknesses first, most severe first within each group", () => {
    const out = personalizeResult(REFERENCE, "improve_appeal")!;
    const titles = out.result.weaknesses.map((x) => x.title);
    const related = titles.filter((t) => matchesGoal(t, "improve_appeal"));
    const others = titles.filter((t) => !matchesGoal(t, "improve_appeal"));
    expect(titles).toEqual([...related, ...others]);
    expect(related).toContain("La photo de couverture ne montre pas l'atout principal");
    expect(related).toContain("Photos de chambres redondantes");
    expect(others).toContain("Le mur rouge de la cuisine détonne");
    // Within the related group, high before medium before low.
    const sev = out.result.weaknesses.filter((x) => matchesGoal(x.title, "improve_appeal")).map((x) => x.severity);
    expect(sev).toEqual([...sev].sort((a, b) => ["high", "medium", "low"].indexOf(a) - ["high", "medium", "low"].indexOf(b)));
    // Priorities: #1 pinned, then the photo and title ones.
    expect(out.result.top_priorities.map((x) => x.rank)).toEqual([1, 3, 4, 2]);
    expect(out.priorityMatches).toEqual([false, true, true, false]);
    // Actions: step 1 pinned, then the photo/title steps.
    expect(out.result.action_plan.slice(1, 4)).toEqual([
      "Remplace la photo de couverture par la terrasse",
      "Réécris le titre avec l'atout vue mer",
      "Range le salon avant de reprendre les photos",
    ]);
  });

  it("reduce_hesitation: missing, vague or contradictory information first", () => {
    const out = personalizeResult(REFERENCE, "reduce_hesitation")!;
    const titles = out.result.weaknesses.map((x) => x.title);
    expect(titles.slice(0, 2)).toEqual([
      "Incohérence entre le titre et la capacité d'accueil",
      "Description peu détaillée sur la localisation",
    ]);
    expect(out.result.top_priorities.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
    expect(out.priorityMatches[1]).toBe(true); // "Aucune information sur l'accès à la plage"
    expect(out.relatedWeaknessCount).toBe(2);
  });

  it("optimize_multiple: no topic, most severe problems first, nothing flagged", () => {
    const out = personalizeResult(REFERENCE, "optimize_multiple")!;
    expect(out.mode).toBe("severity");
    expect(out.result.weaknesses.map((x) => x.severity)).toEqual(["high", "high", "medium", "medium", "low", "low"]);
    expect(out.result.top_priorities).toEqual(REFERENCE.top_priorities);
    expect(out.result.action_plan).toEqual(REFERENCE.action_plan);
    expect([...out.weaknessMatches, ...out.priorityMatches, ...out.actionMatches].every((m) => !m)).toBe(true);
  });

  it("verify_improvements: compare when there is a previous analysis, otherwise invite a re-scan", () => {
    expect(personalizeResult(REFERENCE, "verify_improvements", { hasPrevious: true })!.mode).toBe("compare_previous");
    expect(personalizeResult(REFERENCE, "verify_improvements", { hasPrevious: false })!.mode).toBe("rescan");
  });

  it("two goals, same analysis: same score, different presentation", () => {
    const a = personalizeResult(REFERENCE, "improve_appeal")!;
    const b = personalizeResult(REFERENCE, "reduce_hesitation")!;
    expect(a.result.overall_score).toBe(b.result.overall_score);
    expect(a.result.scores).toEqual(b.result.scores);
    expect(a.result.weaknesses[0].title).not.toBe(b.result.weaknesses[0].title);
  });

  it("malformed stored items never throw and keep their place among the others", () => {
    const broken = {
      ...REFERENCE,
      weaknesses: [{ title: 42, severity: "huge" }, null, w("Photo sombre", "low")],
      top_priorities: [],
      action_plan: [],
    } as unknown as AnalysisResult;
    const out = personalizeResult(broken, "improve_appeal")!;
    expect(out.result.weaknesses).toHaveLength(3);
    expect((out.result.weaknesses[0] as { title: string }).title).toBe("Photo sombre");
    expect(out.result.top_priorities).toEqual([]);
  });
});

describe("goalExplanation: says only what was done", () => {
  it("topic goal with related findings", () => {
    const out = personalizeResult(REFERENCE, "improve_appeal")!;
    const n = out.relatedWeaknessCount;
    expect(goalExplanation(out, false)).toBe(
      `${n} des 6 points faibles relevés concernent tes photos ou ton titre : dans ton rapport complet, ils sont présentés en premier.`
    );
    expect(goalExplanation(out, true)).toContain("signalés « Lié à ton objectif »");
  });

  it("singular and zero cases", () => {
    const one = personalizeResult({ ...REFERENCE, weaknesses: [w("Photo sombre", "low"), w("Prix", "low")] }, "improve_appeal")!;
    expect(goalExplanation(one, true)).toBe(
      "1 des 2 points faibles relevés concerne tes photos ou ton titre : ci-dessous, il est présenté en premier et signalé « Lié à ton objectif »."
    );
    const none = personalizeResult({ ...REFERENCE, weaknesses: [w("Prix", "low")] }, "improve_appeal")!;
    expect(goalExplanation(none, false)).toMatch(/^Aucun point faible relevé ne concerne directement tes photos ou ton titre/);
  });

  it("goals without a topic", () => {
    expect(goalExplanation(personalizeResult(REFERENCE, "optimize_multiple")!, true)).toBe(
      "Ci-dessous, les problèmes les plus importants de ce logement passent en premier."
    );
    expect(goalExplanation(personalizeResult(REFERENCE, "verify_improvements", { hasPrevious: false })!, false)).toMatch(
      /relance une analyse/
    );
  });
});

describe("displayListingTitle", () => {
  const withTitles = (listing_title: unknown, current_title: unknown) =>
    ({ ...REFERENCE, listing_title, title_analysis: { ...REFERENCE.title_analysis, current_title } }) as AnalysisResult;

  it("prefers the title read from the Airbnb page, then the transcribed one", () => {
    expect(displayListingTitle(withTitles("Vue mer & terrasse", "autre"))).toBe("Vue mer & terrasse");
    expect(displayListingTitle(withTitles(undefined, "« Le Salvator » Mulhouse"))).toBe("« Le Salvator » Mulhouse");
  });

  it("never shows something that is not a listing title", () => {
    expect(displayListingTitle(withTitles(null, ""))).toBeNull();
    expect(displayListingTitle(withTitles(null, "Connexion/Inscription – Airbnb"))).toBeNull();
    expect(displayListingTitle(withTitles(null, "Titre non visible dans les captures"))).toBeNull();
    expect(displayListingTitle(withTitles(null, "x".repeat(200)))).toBeNull();
    expect(displayListingTitle(withTitles(null, undefined))).toBeNull();
  });
});

describe("locked teaser figures (lot 4)", () => {
  it("only announces sections and counts the report really has", () => {
    const sparse = {
      ...REFERENCE,
      title_analysis: { ...REFERENCE.title_analysis, suggested_titles: ["Un seul titre"] },
      photo_analysis: [],
      recommended_photo_order: [],
    } as AnalysisResult;
    const preview = buildPaywallPreview(sparse);
    const lines = paywallPreviewContents(preview);
    expect(lines).toContain("1 titre Airbnb prêt à copier");
    expect(lines.join(" ")).not.toMatch(/3 propositions|photos analysées/);
    expect(lockedCategories(preview)).not.toContain("Analyse des photos");
    expect(preview.weaknessCount).toBe(6);
  });
});

describe("matchesGoal: labels seen in real reports", () => {
  it.each([
    ["Manque de variation dans les angles de prise de vue", "reduce_hesitation", false],
    ["Photos manquantes de la salle de bain", "reduce_hesitation", true],
    ["Deux chambres pour 2 voyageurs, logique peu explicitée", "reduce_hesitation", true],
    ["Le titre ne montre aucun atout concret", "reduce_hesitation", false],
    ["Incohérence entre le titre et la capacité d'accueil", "improve_appeal", false],
    ["Incohérence entre le titre et la capacité d'accueil", "reduce_hesitation", true],
    ["Titre encombré de symboles et de répétitions", "improve_appeal", true],
    ["Peu de lumière naturelle visible sur plusieurs photos", "improve_appeal", true],
  ] as const)("%s (%s) -> %s", (label, goal, expected) => {
    expect(matchesGoal(label, goal)).toBe(expected);
  });
});
