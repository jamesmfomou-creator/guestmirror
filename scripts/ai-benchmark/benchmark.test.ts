import { describe, expect, it } from "vitest";
import { RESULT_SCHEMA, buildAnalysisRequest } from "@/lib/ai";
import { runOutputChecks, schemaViolations } from "./checks";
import { attemptEconomics, costPerCallUsd, saleEconomics } from "./economics";
import { candidateGoesFirst } from "./judge";
import { DEFAULT_PRICES_USD_PER_MTOK, VARIANTS, callCostUsd, priceFor } from "./variants";

// Pure-logic tests of the benchmark helpers. No model call, no network.

const photo = (image_index: number) => ({
  image_index,
  score: 70,
  strengths: ["Lumière naturelle"],
  weaknesses: ["Cadrage serré"],
  recommendation: "Recule d'un pas pour montrer toute la pièce.",
});

// Shaped like the real tool schema (lib/ai.ts's RESULT_SCHEMA), so the
// "clean output" test also proves the schema walk accepts a valid result.
function validOutput(imageCount = 3): Record<string, unknown> {
  return {
    overall_score: 62,
    summary: "Une annonce claire mais dont la première photo ne montre pas l'atout principal.",
    first_hesitation: "On ne comprend pas tout de suite où dorment les voyageurs.",
    scores: {
      cover_photo: 55,
      photos: 60,
      title: 55,
      description: 65,
      offer_clarity: 60,
      visual_attractiveness: 62,
      traveler_confidence: 70,
    },
    five_second_scores: {
      visual_impact: 60,
      differentiation: 50,
      clarity: 62,
      perceived_value: 64,
      trust: 70,
      desirability: 61,
    },
    guest_questions: ["Où se gare-t-on ?"],
    strengths: [{ title: "Lumière", explanation: "Le salon est lumineux." }],
    weaknesses: [{ title: "Titre générique", severity: "medium", explanation: "x", recommendation: "y" }],
    top_priorities: [
      { rank: 1, title: "Changer la photo de couverture", current_issue: "x", recommended_change: "y", expected_benefit: "z" },
      { rank: 2, title: "Préciser le couchage", current_issue: "x", recommended_change: "y", expected_benefit: "z" },
    ],
    title_analysis: {
      current_title: "Appartement centre",
      issues: ["Le titre ne dit pas ce qui distingue le logement."],
      suggested_titles: ["Salon lumineux à deux pas du centre"],
    },
    description_analysis: {
      issues: ["Le couchage n'est pas précisé."],
      missing_information: ["Stationnement"],
      improved_description: "Vous serez accueillis dans un salon lumineux.",
    },
    photo_analysis: Array.from({ length: imageCount }, (_, i) => photo(i + 1)),
    recommended_photo_order: Array.from({ length: imageCount }, (_, i) => i + 1),
    action_plan: ["Mets la photo 2 en couverture."],
  };
}

describe("schemaViolations", () => {
  const schema = {
    type: "object",
    required: ["score", "items"],
    properties: {
      score: { type: "integer", minimum: 0, maximum: 100 },
      level: { type: "string", enum: ["low", "high"] },
      items: { type: "array", items: { type: "object", required: ["title"], properties: { title: { type: "string" } } } },
    },
  };

  it("accepts a conforming value", () => {
    expect(schemaViolations(schema, { score: 50, level: "low", items: [{ title: "a" }] })).toEqual([]);
  });

  it("reports missing, mistyped, out-of-range and out-of-enum leaves by path", () => {
    expect(schemaViolations(schema, { score: 140, level: "medium", items: [{}, { title: 3 }] })).toEqual([
      "$.score: above maximum",
      "$.level: not in enum",
      "$.items[0].title: missing",
      "$.items[1].title: expected string",
    ]);
    expect(schemaViolations(schema, { items: "<parameter>" })).toEqual(["$.score: missing", "$.items: expected array"]);
  });

  it("never echoes the offending value", () => {
    const messages = schemaViolations(schema, { score: "contenu privé", items: [] });
    expect(messages.join(" ")).not.toContain("contenu privé");
  });
});

describe("runOutputChecks", () => {
  const run = (output: unknown, imageCount = 3) =>
    runOutputChecks({ output, schema: RESULT_SCHEMA, imageCount, titleMaxLength: 50 });

  it("reports nothing on a clean output", () => {
    const checks = run(validOutput());
    expect(checks.issues).toEqual([]);
    expect(checks.schemaViolations).toBe(0);
    expect(checks.invalidImageRefs).toBe(0);
    expect(checks.outOfRangePhotoMentions).toBe(0);
    expect(checks.titlesOverLimit).toBe(0);
    expect(checks.forbiddenClaims).toBe(0);
    expect(checks.formalAddress).toBe(0);
    expect(checks.photoAnalysisCount).toBe(3);
    expect(checks.counts).toMatchObject({ top_priorities: 2, weaknesses: 1, action_plan: 1, suggested_titles: 1 });
  });

  it("counts image indexes that are out of range, zero-based or repeated", () => {
    const output = validOutput();
    output.photo_analysis = [photo(0), photo(2), photo(2), photo(4)];
    output.recommended_photo_order = [1, 2, 2, 9];
    // 0, the repeated 2 and 4 in photo_analysis; the repeated 2 and 9 in the order.
    expect(run(output).invalidImageRefs).toBe(5);
  });

  it("counts a text mention of a photo that was not supplied", () => {
    const output = validOutput();
    output.action_plan = ["Mets la photo n°7 avant la photo 2."];
    expect(run(output).outOfRangePhotoMentions).toBe(1);
  });

  it("counts suggested titles over the limit", () => {
    const output = validOutput();
    (output.title_analysis as Record<string, unknown>).suggested_titles = ["Court", "x".repeat(51)];
    expect(run(output).titlesOverLimit).toBe(1);
  });

  it("flags wording the prompt forbids", () => {
    const output = validOutput();
    output.summary = "Tu obtiendras 30 % de réservations en plus, c'est garanti par l'algorithme.";
    expect(run(output).forbiddenClaims).toBe(3);
  });

  it("flags 'vous' addressed to the host but not in the traveler-facing description", () => {
    const clean = run(validOutput());
    expect(clean.formalAddress).toBe(0); // improved_description says "Vous" and is exempt

    const output = validOutput();
    output.summary = "Votre annonce est claire, vous pouvez améliorer vos photos.";
    expect(run(output).formalAddress).toBe(3);
  });

  it("describes issues without quoting the listing", () => {
    const output = validOutput();
    output.summary = "Texte privé garanti.";
    const issues = run(output).issues.map((i) => `${i.check} ${i.detail}`).join(" ");
    expect(issues).not.toContain("Texte privé");
  });

  it("does not throw on a malformed output", () => {
    const checks = run({ photo_analysis: "<parameter>", top_priorities: null });
    expect(checks.schemaViolations).toBeGreaterThan(0);
    expect(checks.photoAnalysisCount).toBe(0);
  });
});

describe("economics", () => {
  it("prices one call from tokens and per-million prices", () => {
    expect(costPerCallUsd({ inputTokens: 10_000, outputTokens: 5_000, inputUsdPerMTok: 2, outputUsdPerMTok: 10 })).toBeCloseTo(0.07, 10);
  });

  it("derives per-attempt and per-success cost", () => {
    const e = attemptEconomics({ costPerCallUsd: 0.1, retryRate: 0.1, successRate: 0.8, duplicateAttemptsPerSuccess: 0.25 });
    expect(e.costPerAttemptUsd).toBeCloseTo(0.11, 10);
    expect(e.costOfRetriesPerAttemptUsd).toBeCloseTo(0.01, 10);
    expect(e.costPerSuccessfulAnalysisUsd).toBeCloseTo((0.11 / 0.8) * 1.25, 10);
    expect(e.costPer1000AnalysesUsd).toBeCloseTo(e.costPerSuccessfulAnalysisUsd * 1000, 10);
  });

  it("rejects an impossible success rate", () => {
    expect(() => attemptEconomics({ costPerCallUsd: 0.1, retryRate: 0, successRate: 0, duplicateAttemptsPerSuccess: 0 })).toThrow();
  });

  it("keeps payment fees separate from model cost in the sale margin", () => {
    const s = saleEconomics({
      priceEur: 4.9,
      paymentFeePercent: 0.015,
      paymentFeeFixedEur: 0.25,
      vatRate: 0,
      usdToEur: 1,
      costPerSuccessfulAnalysisUsd: 0.1,
      analysesPerSale: 19,
    });
    expect(s.revenueExVatEur).toBeCloseTo(4.9, 10);
    expect(s.paymentFeesEur).toBeCloseTo(4.9 * 0.015 + 0.25, 10);
    expect(s.aiCostOfSoldAnalysisEur).toBeCloseTo(0.1, 10);
    expect(s.aiCostOfFreeAnalysesEur).toBeCloseTo(1.8, 10);
    expect(s.marginBeforeAcquisitionEur).toBeCloseTo(4.9 - s.paymentFeesEur - 1.9, 10);
  });

  it("removes VAT from revenue when a rate is given", () => {
    const s = saleEconomics({
      priceEur: 4.9,
      paymentFeePercent: 0,
      paymentFeeFixedEur: 0,
      vatRate: 0.2,
      usdToEur: 1,
      costPerSuccessfulAnalysisUsd: 0,
      analysesPerSale: 1,
    });
    expect(s.revenueExVatEur).toBeCloseTo(4.9 / 1.2, 10);
  });
});

describe("variants", () => {
  it("has unique ids and a baseline that is the production request", () => {
    expect(new Set(VARIANTS.map((v) => v.id)).size).toBe(VARIANTS.length);
    const baseline = VARIANTS.find((v) => v.id === "baseline");
    expect(baseline?.options).toEqual({ model: "claude-sonnet-5", strict: false, toolChoice: "forced" });
  });

  it("has a price for every variant model", () => {
    for (const v of VARIANTS) expect(() => priceFor(v.options.model, DEFAULT_PRICES_USD_PER_MTOK)).not.toThrow();
  });

  it("matches dated model ids without confusing Sonnet 5 and Sonnet 5.5", () => {
    const prices = { "claude-sonnet-5": { input: 1, output: 1 }, "claude-sonnet-5-5": { input: 9, output: 9 } };
    expect(priceFor("claude-sonnet-5-20260203", prices).input).toBe(1);
    expect(priceFor("claude-sonnet-5-5-20260901", prices).input).toBe(9);
    expect(priceFor("claude-sonnet-5-5", prices).input).toBe(9);
    expect(() => priceFor("some-other-model", prices)).toThrow();
  });

  it("computes a call cost", () => {
    expect(callCostUsd("claude-sonnet-5", 12_824, 5_246, DEFAULT_PRICES_USD_PER_MTOK)).toBeCloseTo(0.078108, 6);
  });

  it("only ever changes the request the way a variant says it does", () => {
    const params = { images: [{ base64: "AAAA", mediaType: "image/jpeg" }], input: { listing_url: null, city: null, property_type: null, guest_capacity: null, nightly_price: null } };
    const production = buildAnalysisRequest(params);
    for (const v of VARIANTS) {
      const request = buildAnalysisRequest(params, v.options);
      // Same listing content and same output ceiling for every variant.
      expect(request.messages).toEqual(production.messages);
      expect(request.max_tokens).toBe(production.max_tokens);
      expect(typeof request.system === "string" && request.system.startsWith(production.system as string)).toBe(true);
    }
  });
});

describe("candidateGoesFirst", () => {
  it("is deterministic for a seed and not constant across seeds", () => {
    expect(candidateGoesFirst("a:b:0")).toBe(candidateGoesFirst("a:b:0"));
    const flips = Array.from({ length: 40 }, (_, i) => candidateGoesFirst(`fixture-${i}:variant:0`));
    expect(flips.some(Boolean)).toBe(true);
    expect(flips.every(Boolean)).toBe(false);
  });
});
