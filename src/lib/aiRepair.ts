// Deterministic repair of one known malformation of the model's tool input.
//
// What happens (production audit, 2026-11-17, 62 of 803 stored analyses):
// part-way through the tool call the model switches to its internal
// `<parameter name="…">` encoding. From the first nested field on:
//   - an object field (scores, five_second_scores, title_analysis,
//     description_analysis) becomes the string
//     `\n<parameter name="<first child>">value`, and its OTHER children are
//     written at the top level of the input (photos, title, trust, issues…);
//   - an array field becomes `\n<parameter name="<same field>">[…valid JSON…]`.
// Opening tag only, never closed. The content is all there: only the
// envelope is wrong. (Rarely the whole field is a JSON text instead:
// `"{\"current_title\": …}"`.)
//
// This module puts the content back where the schema says it belongs --
// moving values, never writing one. It refuses whenever anything is
// unexpected: an unknown form, a missing child, a top-level key two fields
// could claim, a value of the wrong type, leftover keys, leftover markup.
// A refused repair leaves the response exactly as it was, so the existing
// validation and retry policy apply unchanged.
//
// Never: invents a value, fills a missing field, edits a generated text
// (only the whitespace around the markup is dropped), or touches a response
// that has no malformed field (status "not_needed", same object back).

export type ChildType = "int" | "string" | "string[]";

/** Object fields of the tool schema and the type of each child (mirrors RESULT_SCHEMA in lib/ai.ts; pinned by a test). */
export const OBJECT_FIELDS: Record<string, Record<string, ChildType>> = {
  scores: {
    cover_photo: "int",
    photos: "int",
    title: "int",
    description: "int",
    offer_clarity: "int",
    visual_attractiveness: "int",
    traveler_confidence: "int",
  },
  five_second_scores: {
    visual_impact: "int",
    differentiation: "int",
    clarity: "int",
    perceived_value: "int",
    trust: "int",
    desirability: "int",
  },
  title_analysis: { current_title: "string", issues: "string[]", suggested_titles: "string[]" },
  description_analysis: { issues: "string[]", missing_information: "string[]", improved_description: "string" },
};

/** Array fields of the tool schema (mirrors RESULT_SCHEMA; pinned by a test). */
export const ARRAY_FIELDS = [
  "guest_questions",
  "strengths",
  "weaknesses",
  "top_priorities",
  "photo_analysis",
  "recommended_photo_order",
  "action_plan",
] as const;

/** Every top-level property of the tool schema (mirrors RESULT_SCHEMA; pinned by a test). */
export const TOP_LEVEL_FIELDS = [
  "overall_score",
  "summary",
  "first_hesitation",
  ...Object.keys(OBJECT_FIELDS),
  ...ARRAY_FIELDS,
] as const;

const TOP_LEVEL = new Set<string>(TOP_LEVEL_FIELDS);
const ARRAYS = new Set<string>(ARRAY_FIELDS);
// One opening tag, then the value up to the end of the string.
const LEAK = /^\s*<parameter name="([a-z_]+)">([\s\S]*)$/;
const MARKUP = /<\/?parameter\b/;

export type RepairResult =
  | { status: "not_needed" }
  | { status: "repaired"; input: Record<string, unknown>; fields: string[] }
  | { status: "refused_ambiguous"; reason: string }
  | { status: "refused_missing"; reason: string };

type Refusal = Extract<RepairResult, { status: "refused_ambiguous" | "refused_missing" }>;
const ambiguous = (reason: string): Refusal => ({ status: "refused_ambiguous", reason });
const missing = (reason: string): Refusal => ({ status: "refused_missing", reason });

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** A child value in its expected type, or null. Strings are only trimmed when they come out of markup. */
function readChild(type: ChildType, value: unknown, fromMarkup: boolean): unknown | null {
  if (type === "int") {
    if (fromMarkup) {
      if (typeof value !== "string" || !/^\s*-?\d+\s*$/.test(value)) return null;
      return Number(value.trim());
    }
    return Number.isInteger(value) ? value : null;
  }
  if (type === "string") {
    if (typeof value !== "string") return null;
    const text = fromMarkup ? value.trim() : value;
    return text === "" ? null : text;
  }
  // string[]
  let arr: unknown = value;
  if (fromMarkup) {
    if (typeof value !== "string") return null;
    const parsed = parseJson(value.trim());
    if (!parsed.ok) return null;
    arr = parsed.value;
  }
  return Array.isArray(arr) && arr.every((x) => typeof x === "string") ? arr : null;
}

export function repairLeakedToolInput(input: unknown): RepairResult {
  if (!isRecord(input)) return { status: "not_needed" };
  const broken = [...Object.keys(OBJECT_FIELDS), ...ARRAY_FIELDS].filter((f) => typeof input[f] === "string");
  if (broken.length === 0) return { status: "not_needed" };

  const out: Record<string, unknown> = { ...input };
  const repaired: string[] = [];
  // Top-level key -> the object field that takes it. A key two fields could
  // take (e.g. `issues`, a child of both title_analysis and
  // description_analysis) is refused, never guessed.
  const claims = new Map<string, string>();

  for (const field of broken) {
    const raw = input[field] as string;
    const trimmed = raw.trim();

    // Whole field written as a JSON text.
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      if (MARKUP.test(trimmed)) return ambiguous(`markup_in_json:${field}`);
      const parsed = parseJson(trimmed);
      if (!parsed.ok) return missing(`invalid_json:${field}`);
      if (ARRAYS.has(field)) {
        if (!Array.isArray(parsed.value)) return ambiguous(`wrong_type:${field}`);
      } else {
        const spec = OBJECT_FIELDS[field];
        if (!isRecord(parsed.value)) return ambiguous(`wrong_type:${field}`);
        for (const [child, type] of Object.entries(spec)) {
          if (!(child in parsed.value)) return missing(`missing_child:${field}.${child}`);
          if (readChild(type, parsed.value[child], false) === null) return ambiguous(`wrong_type:${field}.${child}`);
        }
        if (Object.keys(parsed.value).some((k) => !(k in spec))) return ambiguous(`unexpected_child:${field}`);
      }
      out[field] = parsed.value;
      repaired.push(field);
      continue;
    }

    const m = LEAK.exec(raw);
    if (!m) return ambiguous(`unrecognized_string:${field}`);
    const [, tag, body] = m;
    if (MARKUP.test(body)) return ambiguous(`several_tags:${field}`);

    if (ARRAYS.has(field)) {
      if (tag !== field) return ambiguous(`tag_mismatch:${field}`);
      const parsed = parseJson(body.trim());
      if (!parsed.ok) return missing(`invalid_json:${field}`);
      if (!Array.isArray(parsed.value)) return ambiguous(`wrong_type:${field}`);
      out[field] = parsed.value;
      repaired.push(field);
      continue;
    }

    // Object field: the tagged child is in the string, the others at the top level.
    const spec = OBJECT_FIELDS[field];
    if (!(tag in spec)) return ambiguous(`tag_not_a_child:${field}.${tag}`);
    const first = readChild(spec[tag], body, true);
    if (first === null) return missing(`unreadable_child:${field}.${tag}`);
    const rebuilt: Record<string, unknown> = { [tag]: first };
    for (const [child, type] of Object.entries(spec)) {
      if (child === tag) continue;
      if (TOP_LEVEL.has(child)) return ambiguous(`child_named_like_a_field:${field}.${child}`);
      const owner = claims.get(child);
      if (owner && owner !== field) return ambiguous(`claimed_twice:${child}`);
      if (!(child in input)) return missing(`missing_child:${field}.${child}`);
      const value = readChild(type, input[child], false);
      if (value === null) return ambiguous(`wrong_type:${field}.${child}`);
      claims.set(child, field);
      rebuilt[child] = value;
    }
    out[field] = rebuilt;
    repaired.push(field);
  }

  // A top-level child that also belongs to an object field which came back
  // well-formed could be that field's too: refuse.
  for (const [child, field] of claims) {
    for (const [other, spec] of Object.entries(OBJECT_FIELDS)) {
      if (other !== field && child in spec && isRecord(input[other])) return ambiguous(`claimed_twice:${child}`);
    }
  }
  for (const child of claims.keys()) delete out[child];

  // Anything left that the schema does not know means we did not understand
  // the response.
  const leftover = Object.keys(out).filter((k) => !TOP_LEVEL.has(k));
  if (leftover.length > 0) return ambiguous(`unexpected_keys:${leftover.slice(0, 5).join(",")}`);
  if (MARKUP.test(JSON.stringify(out))) return ambiguous("residual_markup");

  return { status: "repaired", input: out, fields: repaired };
}

/**
 * Field NAMES only (never values) describing a response that failed
 * validation, for the logs: which fields were strings, which top-level keys
 * the schema does not know, and where an overall_score tag sits if the score
 * itself is missing.
 */
export function describeMalformation(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) return { input_type: Array.isArray(input) ? "array" : typeof input };
  const safe = (k: string) => (/^[a-z_]{1,40}$/.test(k) ? k : "(other)");
  const strings = [...Object.keys(OBJECT_FIELDS), ...ARRAY_FIELDS].filter((f) => typeof input[f] === "string");
  const markup = Object.keys(input).filter((k) => typeof input[k] === "string" && MARKUP.test(input[k] as string));
  const scoreTag = Object.keys(input).filter((k) => JSON.stringify(input[k] ?? "").includes('parameter name=\\"overall_score\\"'));
  return {
    has_overall_score: typeof input.overall_score === "number",
    container_strings: strings,
    markup_in: markup.map(safe),
    unknown_top_keys: Object.keys(input).filter((k) => !TOP_LEVEL.has(k)).slice(0, 20).map(safe),
    overall_score_tag_in: scoreTag.map(safe),
  };
}
