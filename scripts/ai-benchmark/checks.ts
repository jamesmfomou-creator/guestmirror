// Automatic, deterministic checks on one model output. Pure functions: no
// network, no model. They measure what a program can measure honestly
// (format, completeness, references to photos that exist, claims the prompt
// forbids). Whether a finding is *true* of the listing is not something a
// regex can decide -- that part is the judge's job (judge.ts) and is
// reported separately.

export interface CheckIssue {
  check: string;
  detail: string;
}

export interface OutputChecks {
  // Leaves the tool schema marks "required" that are missing or mistyped.
  // Stricter than the production gate (lib/resultShape.ts), which tolerates
  // a few optional-in-practice leaves.
  schemaViolations: number;
  photoAnalysisCount: number;
  imageCount: number;
  // image_index / recommended_photo_order values pointing at no real photo.
  invalidImageRefs: number;
  // "photo n°7" written in a text field when 5 photos were supplied.
  outOfRangePhotoMentions: number;
  // Suggested titles over Airbnb's limit, before the app's own clean-up.
  titlesOverLimit: number;
  // Wording the system prompt forbids (booking-rate promises, ranking,
  // algorithm, occupancy...).
  forbiddenClaims: number;
  // "vous / votre / vos" where the prompt requires "tu".
  formalAddress: number;
  counts: {
    top_priorities: number;
    weaknesses: number;
    strengths: number;
    guest_questions: number;
    action_plan: number;
    suggested_titles: number;
  };
  // Share of the output's characters per top-level section: where the
  // output tokens (and so the latency) go.
  sectionChars: Record<string, number>;
  totalChars: number;
  issues: CheckIssue[];
}

type Json = unknown;

function isRecord(v: Json): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Minimal JSON-Schema walk (type / required / enum / items / properties):
 * the subset the analysis tool schema uses. Returns one message per
 * violation, with the path but never the value.
 */
export function schemaViolations(schema: Json, value: Json, path = "$"): string[] {
  if (!isRecord(schema)) return [];
  const type = schema.type;
  if (type === "object") {
    if (!isRecord(value)) return [`${path}: expected object`];
    const out: string[] = [];
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    for (const key of required) {
      if (value[key] === undefined || value[key] === null) out.push(`${path}.${key}: missing`);
    }
    const properties = isRecord(schema.properties) ? schema.properties : {};
    for (const [key, sub] of Object.entries(properties)) {
      if (value[key] !== undefined && value[key] !== null) out.push(...schemaViolations(sub, value[key], `${path}.${key}`));
    }
    return out;
  }
  if (type === "array") {
    if (!Array.isArray(value)) return [`${path}: expected array`];
    return value.flatMap((item, i) => schemaViolations(schema.items, item, `${path}[${i}]`));
  }
  if (type === "string") {
    if (typeof value !== "string") return [`${path}: expected string`];
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return [`${path}: not in enum`];
    return [];
  }
  if (type === "integer" || type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return [`${path}: expected number`];
    if (typeof schema.minimum === "number" && value < schema.minimum) return [`${path}: below minimum`];
    if (typeof schema.maximum === "number" && value > schema.maximum) return [`${path}: above maximum`];
    return [];
  }
  return [];
}

// Each pattern is something the system prompt explicitly rules out.
const FORBIDDEN_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "chiffre de réservation / conversion", re: /\d+\s?%\s+(?:de\s+)?(?:réservations?|clics?|conversions?|vues?)/i },
  { name: "promesse de résultat", re: /\b(?:garanti\w*|augmentera|doublera|boostera)\b/i },
  { name: "algorithme / classement", re: /\b(?:algorithme|ranking|référencement|SEO|classement dans)\b/i },
  { name: "revenue management", re: /\b(?:taux d['’]occupation|revenue management|pricing dynamique|tarification dynamique)\b/i },
];

const FORMAL_ADDRESS = /\b(?:vous|votre|vos)\b/gi;
// "photo n°6", "photo 6", "photo #6", "photos 6 et 7" -> the first number.
const PHOTO_MENTION = /\bphotos?\s*(?:n[°o]\s*|#\s*|numéro\s*)?(\d{1,2})\b/gi;

function collectStrings(value: Json, into: string[]) {
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, into));
  else if (isRecord(value)) Object.values(value).forEach((v) => collectStrings(v, into));
}

function asArray(v: Json): Json[] {
  return Array.isArray(v) ? v : [];
}

export function runOutputChecks(params: { output: Json; schema: Json; imageCount: number; titleMaxLength: number }): OutputChecks {
  const { output, schema, imageCount, titleMaxLength } = params;
  const issues: CheckIssue[] = [];
  const root = isRecord(output) ? output : {};

  const violations = schemaViolations(schema, output);
  violations.slice(0, 10).forEach((detail) => issues.push({ check: "schema", detail }));

  // ---- references to photos ------------------------------------------
  const photoAnalysis = asArray(root.photo_analysis).filter(isRecord);
  const validIndex = (n: Json) => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= imageCount;
  let invalidImageRefs = 0;
  const seen = new Set<number>();
  for (const p of photoAnalysis) {
    const idx = p.image_index;
    if (!validIndex(idx) || seen.has(idx as number)) {
      invalidImageRefs++;
      issues.push({ check: "image_ref", detail: `photo_analysis.image_index=${String(idx)} (photos: ${imageCount})` });
    } else {
      seen.add(idx as number);
    }
  }
  const order = asArray(root.recommended_photo_order);
  const seenOrder = new Set<Json>();
  for (const idx of order) {
    if (!validIndex(idx) || seenOrder.has(idx)) {
      invalidImageRefs++;
      issues.push({ check: "image_ref", detail: `recommended_photo_order contains ${String(idx)} (photos: ${imageCount})` });
    }
    seenOrder.add(idx);
  }

  // ---- text-level checks -----------------------------------------------
  // The rewritten description speaks to travelers ("vous" is correct there)
  // and guest questions are written from the traveler's side: both are
  // excluded from the form-of-address check, not from the others.
  const allStrings: string[] = [];
  collectStrings(root, allStrings);
  const hostFacing: string[] = [];
  for (const [key, value] of Object.entries(root)) {
    if (key === "guest_questions") continue;
    if (key === "description_analysis" && isRecord(value)) {
      collectStrings({ ...value, improved_description: undefined }, hostFacing);
      continue;
    }
    if (key === "title_analysis" && isRecord(value)) {
      collectStrings({ ...value, suggested_titles: undefined, current_title: undefined }, hostFacing);
      continue;
    }
    collectStrings(value, hostFacing);
  }

  let forbiddenClaims = 0;
  for (const text of hostFacing) {
    for (const { name, re } of FORBIDDEN_PATTERNS) {
      if (re.test(text)) {
        forbiddenClaims++;
        issues.push({ check: "forbidden_claim", detail: name });
      }
    }
  }

  const formalAddress = hostFacing.reduce((n, text) => n + (text.match(FORMAL_ADDRESS)?.length ?? 0), 0);
  if (formalAddress > 0) issues.push({ check: "formal_address", detail: `${formalAddress} occurrence(s)` });

  let outOfRangePhotoMentions = 0;
  for (const text of hostFacing) {
    for (const match of text.matchAll(PHOTO_MENTION)) {
      const n = Number(match[1]);
      if (n < 1 || n > imageCount) {
        outOfRangePhotoMentions++;
        issues.push({ check: "photo_mention", detail: `mentions photo ${n} (photos: ${imageCount})` });
      }
    }
  }

  const titleAnalysis = isRecord(root.title_analysis) ? root.title_analysis : {};
  const titles = asArray(titleAnalysis.suggested_titles);
  const titlesOverLimit = titles.filter((t) => typeof t !== "string" || Array.from(t).length > titleMaxLength).length;
  if (titlesOverLimit > 0) issues.push({ check: "title_length", detail: `${titlesOverLimit} title(s) over ${titleMaxLength}` });

  const sectionChars: Record<string, number> = {};
  for (const [key, value] of Object.entries(root)) sectionChars[key] = JSON.stringify(value ?? null).length;

  return {
    schemaViolations: violations.length,
    photoAnalysisCount: photoAnalysis.length,
    imageCount,
    invalidImageRefs,
    outOfRangePhotoMentions,
    titlesOverLimit,
    forbiddenClaims,
    formalAddress,
    counts: {
      top_priorities: asArray(root.top_priorities).length,
      weaknesses: asArray(root.weaknesses).length,
      strengths: asArray(root.strengths).length,
      guest_questions: asArray(root.guest_questions).length,
      action_plan: asArray(root.action_plan).length,
      suggested_titles: titles.length,
    },
    sectionChars,
    totalChars: allStrings.reduce((n, s) => n + s.length, 0),
    issues,
  };
}
