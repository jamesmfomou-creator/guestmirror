import { describe, expect, it } from "vitest";
import Anthropic, { APIError, APIConnectionError, APIConnectionTimeoutError } from "@anthropic-ai/sdk";
import {
  ANALYSIS_TOOL_NAME,
  PRODUCTION_REQUEST_OPTIONS,
  RESULT_SCHEMA,
  STRICT_RESULT_SCHEMA,
  buildAnalysisRequest,
  categorizeAnthropicError,
  toStrictSchema,
  validateAiResponse,
} from "./ai";

// APIError.generate is the same factory the real SDK uses internally to
// build the right error subclass from an HTTP response -- using it here
// (rather than hand-rolling fakes) means these tests exercise real
// `instanceof` checks against the actual SDK classes categorizeAnthropicError
// switches on.
function sdkErrorFor(status: number) {
  return APIError.generate(status, { error: { message: "test" } }, "test", new Headers());
}

describe("categorizeAnthropicError", () => {
  it("maps a 429 to ai_rate_limited", () => {
    expect(categorizeAnthropicError(sdkErrorFor(429))).toBe("ai_rate_limited");
  });

  it("maps a 400 to ai_invalid_request", () => {
    expect(categorizeAnthropicError(sdkErrorFor(400))).toBe("ai_invalid_request");
  });

  it("maps a 401/403 to ai_auth_error", () => {
    expect(categorizeAnthropicError(sdkErrorFor(401))).toBe("ai_auth_error");
    expect(categorizeAnthropicError(sdkErrorFor(403))).toBe("ai_auth_error");
  });

  it("maps a 500+ to ai_overloaded", () => {
    expect(categorizeAnthropicError(sdkErrorFor(500))).toBe("ai_overloaded");
    expect(categorizeAnthropicError(sdkErrorFor(529))).toBe("ai_overloaded");
  });

  it("maps a client-side timeout to ai_timeout", () => {
    expect(categorizeAnthropicError(new APIConnectionTimeoutError())).toBe("ai_timeout");
  });

  it("maps a network-level connection failure to ai_connection_error", () => {
    expect(categorizeAnthropicError(new APIConnectionError({ message: "fetch failed" }))).toBe(
      "ai_connection_error"
    );
  });

  it("falls back to ai_error for anything unrecognized", () => {
    expect(categorizeAnthropicError(new Error("something else entirely"))).toBe("ai_error");
    expect(categorizeAnthropicError("not even an Error instance")).toBe("ai_error");
  });
});

// A complete, well-formed analysis: every container the result pages read
// is present with the right type (see lib/resultShape.ts).
function validInput(): Record<string, unknown> {
  return {
    overall_score: 72,
    summary: "Résumé de test.",
    first_hesitation: "On ne comprend pas tout de suite ce qui distingue le logement.",
    scores: {
      cover_photo: 60,
      photos: 70,
      title: 65,
      description: 75,
      offer_clarity: 70,
      visual_attractiveness: 72,
      traveler_confidence: 80,
    },
    five_second_scores: {
      visual_impact: 60,
      differentiation: 55,
      clarity: 70,
      perceived_value: 65,
      trust: 80,
      desirability: 68,
    },
    guest_questions: ["Y a-t-il un parking ?"],
    strengths: [{ title: "Lumineux", explanation: "Les pièces sont claires." }],
    weaknesses: [{ title: "Photo de couverture", severity: "high", explanation: "Sombre.", recommendation: "La refaire." }],
    top_priorities: [
      {
        rank: 1,
        title: "Photo de couverture",
        current_issue: "Elle est sombre.",
        recommended_change: "La refaire de jour.",
        expected_benefit: "Plus de clics.",
        score: 60,
      },
    ],
    title_analysis: { current_title: "Appartement", issues: ["Générique"], suggested_titles: ["T2 lumineux centre-ville"] },
    description_analysis: { issues: ["Trop courte"], missing_information: ["Parking"], improved_description: "Texte." },
    photo_analysis: [{ image_index: 0, score: 60, strengths: ["Cadrage"], weaknesses: ["Sombre"], recommendation: "Refaire." }],
    recommended_photo_order: [0],
    action_plan: ["Refaire la photo de couverture."],
  };
}

// Minimal valid tool_use response, extended per test for each failure mode.
function baseMessage(overrides: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 } as Anthropic.Usage,
    content: [
      {
        type: "tool_use",
        id: "tool_1",
        name: "submit_analysis",
        input: validInput(),
      } as Anthropic.ToolUseBlock,
    ],
    ...overrides,
  } as Anthropic.Message;
}

describe("validateAiResponse", () => {
  it("accepts a well-formed response with a tool_use block", () => {
    const result = validateAiResponse(baseMessage());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.overall_score).toBe(72);
    }
  });

  it("flags stop_reason=max_tokens as ai_truncated_response, before any content check", () => {
    const result = validateAiResponse(baseMessage({ stop_reason: "max_tokens", content: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ai_truncated_response");
  });

  it("flags stop_reason=refusal as ai_refused", () => {
    const result = validateAiResponse(baseMessage({ stop_reason: "refusal" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ai_refused");
  });

  it("flags an empty content array as ai_empty_response", () => {
    const result = validateAiResponse(baseMessage({ content: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ai_empty_response");
  });

  it("flags a missing tool_use block as ai_tool_missing", () => {
    const result = validateAiResponse(
      baseMessage({ content: [{ type: "text", text: "no tool call" } as Anthropic.TextBlock] })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ai_tool_missing");
  });

  it("flags a tool_use response missing overall_score/summary as ai_schema_mismatch", () => {
    const result = validateAiResponse(
      baseMessage({
        content: [
          { type: "tool_use", id: "tool_1", name: "submit_analysis", input: { summary: "ok" } } as Anthropic.ToolUseBlock,
        ],
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ai_schema_mismatch");
  });

  function withInput(input: Record<string, unknown>) {
    return baseMessage({
      content: [{ type: "tool_use", id: "tool_1", name: "submit_analysis", input } as Anthropic.ToolUseBlock],
    });
  }

  // The failure the 2026-11 audit found stored as a "success" 71 times: the
  // score and summary are fine, every nested field came back as a string of
  // leaked tool markup.
  it("rejects nested fields returned as strings instead of objects/arrays", () => {
    const leaked = '\n<parameter name="cover_photo">60</parameter>';
    const result = validateAiResponse(
      withInput({ ...validInput(), scores: leaked, top_priorities: leaked, weaknesses: leaked, photo_analysis: leaked })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("ai_schema_mismatch");
      // Paths and issue codes only -- the leaked content must not reach the logs.
      expect(result.reason).toContain("scores");
      expect(result.reason).not.toContain("parameter");
    }
  });

  it("rejects an analysis without any priority (the free result page is built on the first one)", () => {
    const result = validateAiResponse(withInput({ ...validInput(), top_priorities: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ai_schema_mismatch");
  });

  // A rejection costs a second full model call: leaf fields the UI renders
  // conditionally must not trigger one.
  it("accepts an analysis whose only deviation is a missing optional leaf", () => {
    const result = validateAiResponse(
      withInput({ ...validInput(), weaknesses: [{ title: "Photo de couverture" }], first_hesitation: undefined })
    );
    expect(result.ok).toBe(true);
  });
});

describe("toStrictSchema", () => {
  it("closes every object and drops the keywords strict tool use rejects", () => {
    const strict = toStrictSchema({
      type: "object",
      properties: {
        score: { type: "integer", minimum: 0, maximum: 100 },
        title: { type: "string", maxLength: 50, description: "kept" },
        items: { type: "array", items: { type: "object", properties: { n: { type: "number", multipleOf: 1 } } } },
      },
      required: ["score"],
    }) as Record<string, unknown>;

    expect(strict.additionalProperties).toBe(false);
    expect(strict.required).toEqual(["score"]);
    const props = strict.properties as Record<string, Record<string, unknown>>;
    expect(props.score).toEqual({ type: "integer" });
    expect(props.title).toEqual({ type: "string", description: "kept" });
    const item = props.items.items as Record<string, unknown>;
    expect(item.additionalProperties).toBe(false);
    expect((item.properties as Record<string, unknown>).n).toEqual({ type: "number" });
  });

  it("never mistakes a property that happens to be named like a keyword for the keyword", () => {
    const strict = toStrictSchema({
      type: "object",
      properties: { maximum: { type: "number", maximum: 10 }, minLength: { type: "string" } },
    }) as { properties: Record<string, unknown> };
    expect(strict.properties.maximum).toEqual({ type: "number" });
    expect(strict.properties.minLength).toEqual({ type: "string" });
  });

  it("leaves no unsupported keyword anywhere in the real result schema", () => {
    const unsupported = ["minimum", "maximum", "minLength", "maxLength", "multipleOf"];
    const offenders: string[] = [];
    const walk = (node: unknown, path: string, insideProperties: boolean) => {
      if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`, false));
      if (typeof node !== "object" || node === null) return;
      const obj = node as Record<string, unknown>;
      if (!insideProperties && obj.type === "object" && obj.additionalProperties !== false) offenders.push(`${path}: open object`);
      for (const [key, value] of Object.entries(obj)) {
        if (!insideProperties && unsupported.includes(key)) offenders.push(`${path}.${key}`);
        walk(value, `${path}.${key}`, !insideProperties && key === "properties");
      }
    };
    walk(STRICT_RESULT_SCHEMA, "$", false);
    expect(offenders).toEqual([]);
  });
});

// The request production sends is built by buildAnalysisRequest with
// PRODUCTION_REQUEST_OPTIONS. These pin it: a change to the model call has
// to show up here as a deliberate edit, never as a side effect of adding a
// benchmark option.
describe("buildAnalysisRequest", () => {
  const params = {
    images: [
      { base64: "AAAA", mediaType: "image/jpeg" },
      { base64: "BBBB", mediaType: "image/png" },
    ],
    input: { listing_url: null, city: "Lyon", property_type: null, guest_capacity: "4", nightly_price: null },
    extractedListingText: { title: "Titre", description: null, bedroomCount: 2 },
  };

  it("builds the production request by default", () => {
    const request = buildAnalysisRequest(params);
    expect(request.model).toBe(PRODUCTION_REQUEST_OPTIONS.model);
    expect(request.max_tokens).toBe(10_000);
    expect(request.tool_choice).toEqual({ type: "tool", name: ANALYSIS_TOOL_NAME });
    expect(request.tools).toHaveLength(1);
    const tool = request.tools![0] as Anthropic.Tool;
    expect(tool.name).toBe(ANALYSIS_TOOL_NAME);
    expect(tool.input_schema).toBe(RESULT_SCHEMA);
    expect("strict" in tool).toBe(false);
    // No field beyond the ones the production call has always sent.
    expect(Object.keys(request).sort()).toEqual(["max_tokens", "messages", "model", "system", "tool_choice", "tools"]);
  });

  it("sends one text block with the context, then the images in order", () => {
    const content = buildAnalysisRequest(params).messages[0].content as Anthropic.ContentBlockParam[];
    expect(content.map((b) => b.type)).toEqual(["text", "image", "image"]);
    const text = (content[0] as Anthropic.TextBlockParam).text;
    expect(text).toContain("Ville / destination : Lyon");
    expect(text).toContain("Nombre de voyageurs : 4");
    expect(text).toContain("Titre actuel de l'annonce");
    expect(text).toContain("Nombre de chambres annoncé par Airbnb (donnée structurée fiable) : 2");
    // Photo coverage (lib/photoCoverage.ts): no coverage passed = screenshots of unknown completeness.
    expect(text).toContain("COUVERTURE DES PHOTOS : 2 captures d'écran importées par le propriétaire");
    expect((content[2] as Anthropic.ImageBlockParam).source).toEqual({ type: "base64", media_type: "image/png", data: "BBBB" });
  });

  it("applies exactly the options it is given", () => {
    const request = buildAnalysisRequest(params, {
      model: "some-model",
      strict: true,
      toolChoice: "auto",
      systemSuffix: "SUFFIXE",
      extra: { output_config: { effort: "low" } },
    });
    const production = buildAnalysisRequest(params);
    expect(request.model).toBe("some-model");
    expect(request.tool_choice).toEqual({ type: "auto" });
    const tool = request.tools![0] as Anthropic.Tool;
    expect(tool.strict).toBe(true);
    expect(tool.input_schema).toBe(STRICT_RESULT_SCHEMA);
    expect(request.system).toBe(`${production.system as string}\n\nSUFFIXE`);
    expect((request as unknown as Record<string, unknown>).output_config).toEqual({ effort: "low" });
    expect(request.messages).toEqual(production.messages);
  });
});
