import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { DEMO_RESULT } from "@/lib/demo-data";
import { RESULT_SCHEMA, attemptOutcome, validateAiResponse } from "@/lib/ai";
import {
  ARRAY_FIELDS,
  OBJECT_FIELDS,
  TOP_LEVEL_FIELDS,
  describeMalformation,
  repairLeakedToolInput,
} from "@/lib/aiRepair";

function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

// The model's tool input for the demo report (the server adds `disclaimer`).
const VALID = omit(DEMO_RESULT, "disclaimer");

const message = (input: unknown) =>
  ({
    id: "msg",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
    content: [{ type: "tool_use", id: "tu", name: "submit_guestmirror_analysis", input }],
  }) as unknown as Anthropic.Message;

const enc = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : JSON.stringify(v));

/**
 * Reproduces the malformation seen in production: an object field becomes
 * `\n<parameter name="<first child>">value` with its other children at the
 * top level; an array field becomes `\n<parameter name="<field>">[json]`.
 */
function leak(input: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };
  for (const f of fields) {
    if (f in OBJECT_FIELDS) {
      const obj = input[f] as Record<string, unknown>;
      const [first, ...rest] = Object.keys(OBJECT_FIELDS[f]);
      out[f] = `\n<parameter name="${first}">${enc(obj[first])}`;
      for (const c of rest) out[c] = obj[c];
    } else {
      out[f] = `\n<parameter name="${f}">${JSON.stringify(input[f])}`;
    }
  }
  return out;
}

// The production pattern: everything from `scores` on, title and description included.
const PRODUCTION_PATTERN = [
  "scores",
  "five_second_scores",
  "guest_questions",
  "strengths",
  "weaknesses",
  "top_priorities",
  "title_analysis",
  "description_analysis",
  "photo_analysis",
  "recommended_photo_order",
  "action_plan",
];

describe("whitelist mirrors the real tool schema", () => {
  const props = RESULT_SCHEMA.properties as Record<string, { type: string; properties?: Record<string, { type: string; items?: { type: string } }> }>;

  it("same top-level fields", () => {
    expect([...TOP_LEVEL_FIELDS].sort()).toEqual(Object.keys(props).sort());
  });

  it("same object fields, children and child types", () => {
    const fromSchema = Object.fromEntries(
      Object.entries(props)
        .filter(([, p]) => p.type === "object")
        .map(([k, p]) => [
          k,
          Object.fromEntries(
            Object.entries(p.properties!).map(([c, cp]) => [c, cp.type === "integer" ? "int" : cp.type === "array" ? `${cp.items!.type}[]` : cp.type])
          ),
        ])
    );
    expect(OBJECT_FIELDS).toEqual(fromSchema);
  });

  it("same array fields", () => {
    expect([...ARRAY_FIELDS].sort()).toEqual(Object.entries(props).filter(([, p]) => p.type === "array").map(([k]) => k).sort());
  });
});

describe("well-formed responses are never touched", () => {
  it("returns not_needed and the validation keeps the very same object", () => {
    expect(repairLeakedToolInput(VALID)).toEqual({ status: "not_needed" });
    const v = validateAiResponse(message(VALID));
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.input).toBe(VALID);
      expect(v.repair).toBe("not_needed");
      expect(attemptOutcome(v)).toBe("valid");
    }
  });

  it("non-objects are left to the existing checks", () => {
    expect(repairLeakedToolInput(null).status).toBe("not_needed");
    expect(repairLeakedToolInput("text").status).toBe("not_needed");
    expect(repairLeakedToolInput([1]).status).toBe("not_needed");
  });
});

describe("repair of the production malformation", () => {
  it("rebuilds exactly the original input (round trip), without mutating what it received", () => {
    const leaked = leak(VALID, PRODUCTION_PATTERN);
    const snapshot = JSON.stringify(leaked);
    const r = repairLeakedToolInput(leaked);
    expect(r.status).toBe("repaired");
    if (r.status !== "repaired") return;
    expect(r.input).toEqual(VALID);
    expect(r.fields.sort()).toEqual([...PRODUCTION_PATTERN].sort());
    expect(JSON.stringify(leaked)).toBe(snapshot);
  });

  it("works for every single field leaking alone (title_analysis alone is refused, see refusals)", () => {
    for (const f of PRODUCTION_PATTERN.filter((x) => x !== "title_analysis")) {
      const r = repairLeakedToolInput(leak(VALID, [f]));
      expect(r.status, f).toBe("repaired");
      if (r.status === "repaired") expect(r.input, f).toEqual(VALID);
    }
  });

  it("is idempotent", () => {
    const r = repairLeakedToolInput(leak(VALID, PRODUCTION_PATTERN));
    if (r.status !== "repaired") throw new Error("expected a repair");
    expect(repairLeakedToolInput(r.input)).toEqual({ status: "not_needed" });
  });

  it("only drops the whitespace around the markup, never edits a text", () => {
    const leaked = leak(VALID, ["title_analysis", "description_analysis"]);
    leaked.title_analysis = `\n<parameter name="current_title">  ${VALID.title_analysis.current_title}\n`;
    const r = repairLeakedToolInput(leaked);
    expect(r.status === "repaired" && (r.input.title_analysis as { current_title: string }).current_title).toBe(VALID.title_analysis.current_title);
  });

  it("accepts a field written as a complete JSON text", () => {
    const r = repairLeakedToolInput({ ...VALID, title_analysis: JSON.stringify(VALID.title_analysis), action_plan: JSON.stringify(VALID.action_plan) });
    expect(r.status === "repaired" && r.input).toEqual(VALID);
  });

  it("goes through the same validation as any response", () => {
    const v = validateAiResponse(message(leak(VALID, PRODUCTION_PATTERN)));
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.repair).toBe("repaired");
      expect(v.input).toEqual(VALID);
      expect(attemptOutcome(v)).toBe("repaired");
    }
  });
});

describe("refusals: an uncertain repair is never made", () => {
  const leaked = () => leak(VALID, PRODUCTION_PATTERN);

  it("a child missing from the top level (never filled in)", () => {
    const input = leaked();
    delete input.trust;
    expect(repairLeakedToolInput(input)).toEqual({ status: "refused_missing", reason: "missing_child:five_second_scores.trust" });
  });

  it("a top-level key two fields could own (issues: title or description?)", () => {
    const input = leak(VALID, ["title_analysis"]);
    // description_analysis leaks with a different first child: both now need a top-level `issues`.
    input.description_analysis = `\n<parameter name="missing_information">${JSON.stringify(VALID.description_analysis.missing_information)}`;
    input.improved_description = VALID.description_analysis.improved_description;
    expect(repairLeakedToolInput(input)).toMatchObject({ status: "refused_ambiguous", reason: "claimed_twice:issues" });
  });

  it("a top-level child that may belong to a well-formed field", () => {
    const input = leak(VALID, ["title_analysis"]);
    // description_analysis is well-formed and also has an `issues` child.
    expect(repairLeakedToolInput(input)).toMatchObject({ status: "refused_ambiguous", reason: "claimed_twice:issues" });
  });

  it("a child of the wrong type (a text where a score is expected)", () => {
    const input = leaked();
    input.title = "Un titre";
    expect(repairLeakedToolInput(input)).toMatchObject({ status: "refused_ambiguous", reason: "wrong_type:scores.title" });
  });

  it("a non-numeric score inside the markup (never guessed)", () => {
    const input = leaked();
    input.scores = '\n<parameter name="cover_photo">environ 60';
    expect(repairLeakedToolInput(input)).toMatchObject({ status: "refused_missing", reason: "unreadable_child:scores.cover_photo" });
  });

  it("a tag that does not name the field", () => {
    const input = leaked();
    input.guest_questions = `\n<parameter name="questions">${JSON.stringify(VALID.guest_questions)}`;
    expect(repairLeakedToolInput(input)).toMatchObject({ status: "refused_ambiguous", reason: "tag_mismatch:guest_questions" });
  });

  it("truncated or invalid JSON", () => {
    const input = leaked();
    input.weaknesses = (input.weaknesses as string).slice(0, -10);
    expect(repairLeakedToolInput(input)).toMatchObject({ status: "refused_missing", reason: "invalid_json:weaknesses" });
  });

  it("markup nested inside a value", () => {
    const input = leaked();
    input.action_plan = `\n<parameter name="action_plan">["a", "<parameter name=\\"x\\">b"]`;
    expect(repairLeakedToolInput(input)).toMatchObject({ status: "refused_ambiguous", reason: "several_tags:action_plan" });
  });

  it("a string that is neither markup nor JSON", () => {
    expect(repairLeakedToolInput({ ...VALID, strengths: "Belle terrasse" })).toMatchObject({ status: "refused_ambiguous", reason: "unrecognized_string:strengths" });
  });

  it("leftover top-level keys the schema does not know", () => {
    const input = { ...leaked(), something_else: 1 };
    expect(repairLeakedToolInput(input)).toMatchObject({ status: "refused_ambiguous", reason: "unexpected_keys:something_else" });
  });

  it("markup left in a text after repair", () => {
    const input = { ...leaked(), summary: 'Résumé\n<parameter name="first_hesitation">…' };
    expect(repairLeakedToolInput(input)).toEqual({ status: "refused_ambiguous", reason: "residual_markup" });
  });

  it("a JSON text with a child the schema does not have", () => {
    const input = { ...VALID, title_analysis: JSON.stringify({ ...VALID.title_analysis, extra: [] }) };
    expect(repairLeakedToolInput(input)).toMatchObject({ status: "refused_ambiguous", reason: "unexpected_child:title_analysis" });
  });

  it("a refused repair leaves the response to the existing checks and retry policy", () => {
    const input = leaked();
    delete input.trust;
    const v = validateAiResponse(message(input));
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.code).toBe("ai_schema_mismatch");
      expect(v.repair).toBe("refused_missing");
      expect(attemptOutcome(v)).toBe("repair_refused_missing");
    }
  });
});

describe("never invents a score", () => {
  it("a leaked response without overall_score is repaired but still rejected", () => {
    const noScore = omit(VALID, "overall_score");
    const v = validateAiResponse(message(leak(noScore, PRODUCTION_PATTERN)));
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toBe("missing overall_score/summary");
      expect(v.repair).toBe("repaired");
      expect(attemptOutcome(v)).toBe("invalid_after_repair:ai_schema_mismatch");
    }
  });

  it("a plain response without overall_score is not repaired at all", () => {
    const noScore = omit(VALID, "overall_score");
    const v = validateAiResponse(message(noScore));
    expect(!v.ok && v.repair).toBe("not_needed");
    expect(!v.ok && attemptOutcome(v)).toBe("invalid:ai_schema_mismatch");
  });
});

describe("describeMalformation logs names, never content", () => {
  it("lists field names only", () => {
    const noScore = omit(VALID, "overall_score");
    const input = { ...leak(noScore, ["scores"]), summary: 'Texte privé <parameter name="overall_score">52' };
    const d = describeMalformation(input);
    expect(d).toEqual({
      has_overall_score: false,
      container_strings: ["scores"],
      markup_in: ["summary", "scores"],
      unknown_top_keys: ["photos", "title", "description", "offer_clarity", "visual_attractiveness", "traveler_confidence"],
      overall_score_tag_in: ["summary"],
    });
    expect(JSON.stringify(d)).not.toMatch(/Texte privé|52/);
  });
});
