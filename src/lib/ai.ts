import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import { AnalysisInput, AnalysisResult } from "@/lib/types";
import { DEMO_MODE } from "@/lib/env";
import { DEMO_RESULT } from "@/lib/demo-data";
import { BRAND_NAME } from "@/lib/brand";
import { AIRBNB_TITLE_MAX_LENGTH, sanitizeAirbnbTitles, titleCharCount } from "@/lib/titles";

export class AnalysisError extends Error {
  code: string;
  constructor(message: string, code: string = "ai_error", cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "AnalysisError";
    this.code = code;
  }
}

// Maps the Anthropic SDK's error class hierarchy to the error_code taxonomy
// tracked in analysis_failed events (see admin/analytics.ts's error
// breakdown) -- lets the admin dashboard distinguish "the model timed out",
// "we're rate limited", "our request was malformed", etc. instead of a
// single generic "ai_error" bucket that hides which cause actually produces
// the failures.
function categorizeAnthropicError(err: unknown): string {
  if (err instanceof APIConnectionTimeoutError) return "ai_timeout";
  if (err instanceof RateLimitError) return "ai_rate_limited";
  if (err instanceof BadRequestError) return "ai_invalid_request";
  if (err instanceof AuthenticationError || err instanceof PermissionDeniedError) return "ai_auth_error";
  if (err instanceof InternalServerError) return "ai_overloaded";
  if (err instanceof APIConnectionError) return "ai_connection_error";
  return "ai_error";
}

// A *successful* API call (no exception) can still fail to produce a usable
// analysis in several structurally different ways -- collapsing all of them
// into one "ai_invalid_response" code (as a previous pass did) hides which
// one actually happens. This inspects the real response shape, in priority
// order of how diagnostic each signal is:
//  1. stop_reason tells us definitively if the model was cut off (max_tokens),
//     refused (refusal), or hit the context window -- these are causes, and
//     take priority over whatever downstream symptom they produce.
//  2. an empty content array or a missing tool_use block are structural
//     failures of forced tool_choice, not a data-shape problem.
//  3. only once we have a real tool_use with parsed input do we check
//     whether the required fields are actually present.
type ResponseValidation =
  | { ok: true; input: Partial<AnalysisResult> }
  | { ok: false; code: string; reason: string };

function validateAiResponse(response: Anthropic.Message): ResponseValidation {
  if (response.stop_reason === "max_tokens") {
    return { ok: false, code: "ai_truncated_response", reason: "stop_reason=max_tokens" };
  }
  if (response.stop_reason === "refusal") {
    return { ok: false, code: "ai_refused", reason: "stop_reason=refusal" };
  }
  if (response.stop_reason === "model_context_window_exceeded") {
    return { ok: false, code: "ai_context_exceeded", reason: "stop_reason=model_context_window_exceeded" };
  }
  if (!response.content || response.content.length === 0) {
    return { ok: false, code: "ai_empty_response", reason: "empty content array" };
  }
  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) {
    return { ok: false, code: "ai_tool_missing", reason: "no tool_use block despite forced tool_choice" };
  }
  const input = toolUse.input as Partial<AnalysisResult>;
  // "required" in the tool schema steers the model but isn't a hard
  // guarantee -- without this check, a response missing overall_score
  // (observed in testing, likely tied to hitting the tool schema's edges
  // on an unusual input) surfaced 60+ seconds later as a raw Postgres
  // not-null violation instead of the existing, fast "réessaie" retry path.
  if (typeof input.overall_score !== "number" || !input.summary) {
    return { ok: false, code: "ai_schema_mismatch", reason: "missing overall_score/summary" };
  }
  return { ok: true, input };
}

// Safe-to-log summary of an invalid response's *shape* only -- block types,
// key names, array lengths, never actual string/number content -- so a
// production log line is enough to diagnose why validation failed without
// ever writing listing details or guest-facing text to logs.
function redactedResponseShape(response: Anthropic.Message): Record<string, unknown> {
  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  const inputKeys =
    toolUse && typeof toolUse.input === "object" && toolUse.input !== null
      ? Object.keys(toolUse.input as object)
      : null;
  return {
    stop_reason: response.stop_reason,
    content_block_types: response.content.map((b) => b.type),
    tool_use_present: Boolean(toolUse),
    tool_use_input_keys: inputKeys,
  };
}

// Code-level backstop for the FIABILITÉ FACTUELLE prompt rules: the prompt
// is the primary defense, but a model can still slip. Matches a capacity
// claim of the shape "<number> <capacity noun>" (e.g. "4 lits", "2 salles
// de bain", "6 voyageurs") -- the exact fact-pattern the real bug report
// this task responds to described ("incohérence... entre sa description,
// son titre et son nombre de couchages"). Deliberately scoped to number+
// noun pairs rather than "any inconsistency keyword near any two numbers":
// an early version of this used a generic keyword+2-numbers heuristic and
// it false-positived on a legitimate, well-cited visual critique that
// happened to reference two photo indices ("la photo n°1 ... la photo
// n°3") -- those numbers have nothing to do with capacity and should never
// need to be "grounded" in guest/bed/room data. Pairing the number
// directly with a capacity noun avoids that class of false positive.
const CAPACITY_CLAIM = /(\d+)\s*(voyageurs?|personnes?|chambres?|lits?|salles?\s+de\s+bain|couchages?)/gi;

function extractNumberTokens(text: string | null | undefined): string[] {
  if (!text) return [];
  return text.match(/\d+/g) ?? [];
}

function extractCapacityClaimNumbers(text: string): string[] {
  return [...text.matchAll(CAPACITY_CLAIM)].map((m) => m[1]);
}

function buildSourceNumberSet(params: {
  input: AnalysisInput;
  extractedListingText?: {
    title: string | null;
    description: string | null;
    bedroomCount?: number | null;
    bedCount?: number | null;
    bathroomCount?: number | null;
  } | null;
}): Set<string> {
  const numbers = new Set<string>();
  for (const n of extractNumberTokens(params.input.guest_capacity)) numbers.add(n);
  for (const n of extractNumberTokens(params.input.nightly_price)) numbers.add(n);
  for (const n of extractNumberTokens(params.extractedListingText?.title)) numbers.add(n);
  for (const n of extractNumberTokens(params.extractedListingText?.description)) numbers.add(n);
  if (params.extractedListingText?.bedroomCount != null) numbers.add(String(params.extractedListingText.bedroomCount));
  if (params.extractedListingText?.bedCount != null) numbers.add(String(params.extractedListingText.bedCount));
  if (params.extractedListingText?.bathroomCount != null) numbers.add(String(params.extractedListingText.bathroomCount));
  return numbers;
}

function isUnsupportedCapacityClaim(text: string, sourceNumbers: Set<string>): boolean {
  const claimNumbers = extractCapacityClaimNumbers(text);
  // Need at least two capacity figures (e.g. "2 voyageurs" ... "4 lits")
  // for this to even be a *comparison* -- a single capacity figure stated
  // alone isn't a claimed inconsistency.
  if (claimNumbers.length < 2) return false;
  return !claimNumbers.every((n) => sourceNumbers.has(n));
}

// Drops any weakness/top_priority whose text makes an unsupported capacity
// claim. Logs when it fires (no listing content in the log) so this
// backstop's real-world frequency stays visible -- it should be rare now
// that the prompt provides real structured data and an explicit citation
// requirement. Never auto-rewritten -- a rewritten claim risks reading as
// a different, equally unverified assertion -- the whole item is dropped.
function stripUnsupportedInconsistencyClaims(
  input: Partial<AnalysisResult>,
  sourceNumbers: Set<string>,
  logTag: string
): Partial<AnalysisResult> {
  let droppedCount = 0;

  const weaknesses = (input.weaknesses ?? []).filter((w) => {
    const bad = isUnsupportedCapacityClaim(`${w.title ?? ""} ${w.explanation ?? ""} ${w.recommendation ?? ""}`, sourceNumbers);
    if (bad) droppedCount++;
    return !bad;
  });

  const topPriorities = (input.top_priorities ?? []).filter((p) => {
    const bad = isUnsupportedCapacityClaim(
      `${p.title ?? ""} ${p.current_issue ?? ""} ${p.recommended_change ?? ""} ${p.expected_benefit ?? ""}`,
      sourceNumbers
    );
    if (bad) droppedCount++;
    return !bad;
  });

  if (droppedCount > 0) {
    console.warn(`[ai] stripped_unsupported_inconsistency_claim ${logTag} count=${droppedCount}`);
  }

  return { ...input, weaknesses, top_priorities: topPriorities };
}

// Only genuinely stochastic response-shape hiccups are worth one same-prompt
// retry -- a fresh sample has a real chance of coming back clean. Truncation
// (ai_truncated_response) is NOT included: the same input at the same
// max_tokens ceiling would very likely truncate again, so retrying it would
// just double the cost/latency for no expected gain -- see MAX_OUTPUT_TOKENS
// below for how truncation is actually addressed. Refusals and context-window
// overflows are structural, not stochastic, so retrying those is equally
// pointless. SDK-level errors (timeout/rate-limit/etc.) already get one
// retry from the SDK itself (AI_MAX_RETRIES) and are deliberately not
// retried again at this layer.
const RETRYABLE_VALIDATION_CODES = new Set(["ai_tool_missing", "ai_schema_mismatch", "ai_empty_response"]);

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

const SYSTEM_PROMPT = `Tu es un consultant expert en optimisation d'annonces de location courte durée (type Airbnb). Tu analyses la PRÉSENTATION d'une annonce (photos, titre, description) du point de vue d'un voyageur qui la découvre pour la première fois, et tu produis un diagnostic structuré appelé "${BRAND_NAME}".

RÈGLES STRICTES :
- Analyse uniquement les éléments réellement visibles dans les captures fournies ou les informations données par l'utilisateur.
- N'invente JAMAIS de statistiques de réservation, de taux de conversion, de classement dans les résultats de recherche, ou de connaissance de l'algorithme secret d'Airbnb.
- N'affirme JAMAIS qu'un changement "augmentera les réservations de X %" ou garantira un résultat. Utilise des formulations prudentes ("peut aider à", "peut donner une meilleure impression").
- Distingue clairement observation (ce que tu vois) et recommandation (ce que tu suggères).
- Évite tout conseil générique interchangeable d'une annonce à l'autre. Chaque observation doit être ancrée dans ce que tu vois réellement (couleurs, cadrage, luminosité, formulation exacte du titre, structure du texte, etc.).
- Explique toujours POURQUOI un élément peut être moins convaincant, du point de vue d'un voyageur qui découvre l'annonce en quelques secondes.
- Sois concret et actionnable : donne des recommandations précises et applicables, pas des principes généraux.
- Le ton est celui d'un voyageur qui découvre l'annonce et réagit à chaud, pas celui d'un consultant marketing. Écris en français naturel et conversationnel, jamais une traduction littérale de jargon SaaS.
  Mauvais : "Votre listing présente une faible différenciation." / Bon : "En quelques secondes, je ne comprends pas encore ce qui rend ton logement différent."
  Mauvais : "Votre cover photo possède un stop scroll score faible." / Bon : "Ta première photo est correcte, mais elle ne me donne pas encore envie de m'arrêter."
  Mauvais : "Votre annonce a une forte valeur perçue." / Bon : "La présentation donne l'impression que le logement vaut son prix."
- Tutoie l'utilisateur ("ton annonce", "tu"), jamais de vouvoiement.
- Réponds uniquement en français.

FIABILITÉ FACTUELLE (TRÈS IMPORTANT) :
- Distingue toujours trois niveaux dans ce que tu écris : (1) un FAIT observé -- ce qui est écrit noir sur blanc dans les informations fournies par le propriétaire, ou visible sans ambiguïté dans une capture ; (2) une INTERPRÉTATION -- ton ressenti, l'impression que ça donne à un voyageur ; (3) une RECOMMANDATION -- une action que tu suggères. Ne présente JAMAIS une interprétation ou une supposition comme un fait établi.
- N'affirme JAMAIS qu'il existe une incohérence ou une contradiction factuelle (par exemple entre le nombre de voyageurs, de chambres, de lits ou de salles de bain annoncés) sauf si les DEUX valeurs qui se contredisent sont littéralement présentes dans les informations fournies ci-dessous (titre, description, ou données structurées). Ne déduis JAMAIS un nombre de lits, de chambres ou de couchages en comptant des lits sur une photo si une donnée structurée équivalente t'est fournie -- utilise toujours la donnée structurée en priorité, jamais une estimation visuelle, quand les deux sont disponibles.
- Si tu signales une incohérence, cite précisément et explicitement les deux éléments contradictoires que tu compares (ex: "le titre indique 6 voyageurs mais la description ne mentionne que 2 lits doubles"). Une incohérence qui ne cite pas ces deux éléments précis ne doit jamais être écrite. Si tu ne peux pas citer deux éléments réellement contradictoires, n'invente pas d'incohérence : n'en mentionne aucune.
- Si une information est absente ou ambiguë (nombre de lits, de chambres, équipements, etc.), dis-le explicitement plutôt que de deviner (ex: "Je ne vois pas clairement combien de chambres compte ce logement à partir de ce qui est fourni"). Une estimation visuelle incertaine ne doit jamais être présentée comme un fait établi.

SPÉCIFICITÉ DES RECOMMANDATIONS :
- Pour "top_priorities" et pour les "weaknesses[].recommendation" les plus importantes, ancre chaque recommandation dans une observation spécifique à CETTE annonce (un élément précis d'une photo, du titre ou de la description), explique pourquoi cela peut faire hésiter un voyageur, puis donne une action précise -- si possible avec un exemple concret adapté à cette annonce. N'écris jamais une recommandation qui pourrait s'appliquer telle quelle à n'importe quelle autre annonce Airbnb.
  Interdit (trop générique) : "Améliore tes photos." / Attendu : "Ta photo de couverture montre le salon alors que la terrasse est l'élément le plus différenciant visible dans la galerie ; teste une photo extérieure plus lumineuse en première position pour que l'atout du logement soit compris immédiatement."
- S'il n'y a pas assez d'éléments observables dans les informations fournies pour écrire une recommandation vraiment spécifique à cette annonce, préfère une observation plus courte plutôt que de remplir avec une généralité interchangeable.

CE QUE TU N'ES PAS : tu n'es pas un outil de SEO Airbnb, ni un expert de l'algorithme de recherche, ni un revenue manager. Ne mentionne JAMAIS le ranking Airbnb, un benchmark de marché, un taux d'occupation, du pricing dynamique, du revenue management, ou un audit technique d'équipements. Ta seule perspective est celle d'un voyageur qui regarde l'annonce et réagit à chaud, en quelques secondes. Formule toujours une réaction humaine et concrète, jamais un score marketing abstrait.
  Mauvais : "Votre photo principale possède un score d'optimisation de 42 %." / Bon : "Ta photo montre correctement le salon, mais en quelques secondes je ne vois pas encore ce qui rend ton logement spécial."
  Mauvais : "Votre titre manque de mots-clés." / Bon : "Ton titre m'indique où se trouve le logement, mais pas pourquoi je devrais choisir celui-ci."

- Tu dois utiliser l'outil "submit_guestmirror_analysis" pour renvoyer ta réponse, avec un JSON strictement conforme au schéma fourni.
- "summary" répond à la question "Ce que j'ai compris en 5 secondes" : 1-2 phrases sur ce que le voyageur saisit immédiatement du logement, sans jugement de valeur.
- "first_hesitation" est UNE phrase à la première personne qui exprime le doute ou l'hésitation précise que ressentirait un voyageur juste après avoir vu l'annonce (ex: "Le logement a l'air agréable, mais je ne vois pas encore pourquoi je choisirais celui-ci plutôt que les autres."). Distincte de "summary" : summary décrit ce qui est compris, first_hesitation décrit ce qui freine.
- "five_second_scores" est un test de première impression indépendant de "scores" : note en 5 secondes l'impact visuel (attire-t-il l'œil ?), la différenciation (se démarque-t-il des autres annonces ?), la clarté (comprend-on vite ce qui est montré ?), la valeur perçue (a-t-on l'impression que ça vaut le prix ?), la confiance (donne-t-il envie de faire confiance à l'hôte ?), l'envie (donne-t-il envie de cliquer ?).
- "guest_questions" liste 3 à 5 questions concrètes qu'un voyageur se poserait encore après avoir vu l'annonce, faute d'informations claires (formulées à la première personne, ex: "Est-ce que la terrasse est privée ?").
- "top_priorities[0]" doit être LE problème le plus impactant, formulé dans "current_issue" comme une observation directe et concrète (ex: "Ta terrasse semble être ton meilleur atout, mais elle n'apparaît qu'en photo n°6."), pas un principe général.
- "title_analysis.suggested_titles" : propose plusieurs titres Airbnb directement utilisables, courts, naturels et spécifiques à CE logement (jamais une formulation générique interchangeable d'une annonce à l'autre, jamais de bourrage de mots-clés). Chaque titre doit faire au maximum ${AIRBNB_TITLE_MAX_LENGTH} caractères, espaces compris — c'est une contrainte stricte d'Airbnb, pas une suggestion. En priorité, fais tenir l'atout principal du logement et l'élément différenciant dans cette limite plutôt que d'énumérer plusieurs qualités.`;

// Always the same fixed sentence (see the schema's old "disclaimer" field
// and the system prompt instruction that used to ask the model to
// reproduce it verbatim) -- generating it via the model added output
// tokens for zero benefit and a small risk of paraphrase drift. Set here
// instead, byte-for-byte guaranteed correct every time.
export const DISCLAIMER = `${BRAND_NAME} est une estimation produite à partir des éléments visibles de l'annonce. Il ne prédit ni ne garantit les clics ou les réservations.`;

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    overall_score: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    first_hesitation: { type: "string" },
    scores: {
      type: "object",
      properties: {
        cover_photo: { type: "integer", minimum: 0, maximum: 100 },
        photos: { type: "integer", minimum: 0, maximum: 100 },
        title: { type: "integer", minimum: 0, maximum: 100 },
        description: { type: "integer", minimum: 0, maximum: 100 },
        offer_clarity: { type: "integer", minimum: 0, maximum: 100 },
        visual_attractiveness: { type: "integer", minimum: 0, maximum: 100 },
        traveler_confidence: { type: "integer", minimum: 0, maximum: 100 },
      },
      required: [
        "cover_photo",
        "photos",
        "title",
        "description",
        "offer_clarity",
        "visual_attractiveness",
        "traveler_confidence",
      ],
    },
    five_second_scores: {
      type: "object",
      properties: {
        visual_impact: { type: "integer", minimum: 0, maximum: 100 },
        differentiation: { type: "integer", minimum: 0, maximum: 100 },
        clarity: { type: "integer", minimum: 0, maximum: 100 },
        perceived_value: { type: "integer", minimum: 0, maximum: 100 },
        trust: { type: "integer", minimum: 0, maximum: 100 },
        desirability: { type: "integer", minimum: 0, maximum: 100 },
      },
      required: ["visual_impact", "differentiation", "clarity", "perceived_value", "trust", "desirability"],
    },
    guest_questions: { type: "array", items: { type: "string" } },
    strengths: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, explanation: { type: "string" } },
        required: ["title", "explanation"],
      },
    },
    weaknesses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          explanation: { type: "string" },
          recommendation: { type: "string" },
        },
        required: ["title", "severity", "explanation", "recommendation"],
      },
    },
    top_priorities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rank: { type: "integer" },
          title: { type: "string" },
          current_issue: { type: "string" },
          recommended_change: { type: "string" },
          expected_benefit: { type: "string" },
          score: { type: "integer" },
        },
        required: ["rank", "title", "current_issue", "recommended_change", "expected_benefit"],
      },
    },
    title_analysis: {
      type: "object",
      properties: {
        current_title: { type: "string" },
        issues: { type: "array", items: { type: "string" } },
        suggested_titles: { type: "array", items: { type: "string", maxLength: AIRBNB_TITLE_MAX_LENGTH } },
      },
      required: ["current_title", "issues", "suggested_titles"],
    },
    description_analysis: {
      type: "object",
      properties: {
        issues: { type: "array", items: { type: "string" } },
        missing_information: { type: "array", items: { type: "string" } },
        improved_description: { type: "string" },
      },
      required: ["issues", "missing_information", "improved_description"],
    },
    photo_analysis: {
      type: "array",
      items: {
        type: "object",
        properties: {
          image_index: { type: "integer" },
          score: { type: "integer" },
          strengths: { type: "array", items: { type: "string" } },
          weaknesses: { type: "array", items: { type: "string" } },
          recommendation: { type: "string" },
        },
        required: ["image_index", "score", "strengths", "weaknesses", "recommendation"],
      },
    },
    recommended_photo_order: { type: "array", items: { type: "integer" } },
    action_plan: { type: "array", items: { type: "string" } },
  },
  required: [
    "overall_score",
    "summary",
    "first_hesitation",
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
  ],
};

// The SDK defaults to a 10-minute timeout with 2 retries -- in the worst
// case that lets a single request hang for ~30 minutes with zero feedback.
// Bounding both keeps the longest possible wait predictable.
//
// IMPORTANT: an earlier version of this file set AI_TIMEOUT_MS to 45s,
// which turned out to be *shorter* than a lot of genuinely successful
// analyses -- real production data (2026-09-07/08) showed successful
// calls landing anywhere up to ~92s, and the 45s cutoff was killing the
// majority of real requests after two truncated attempts (~91-93s of
// wasted time), then surfacing them as "analysis_failed". 110s is chosen
// with headroom above that observed ceiling so the timeout only fires on
// genuinely stuck requests, not normal slow ones. See api/analyze &
// api/compare's maxDuration (280s) and AnalyzeWizard's client-side fetch
// timeout (290s), which were raised in lockstep so neither one now cuts
// off a request before this timeout/retry pair would.
const AI_TIMEOUT_MS = 110_000;
const AI_MAX_RETRIES = 1;

// One same-prompt retry for a narrow set of recoverable response-shape
// failures (see RETRYABLE_VALIDATION_CODES) -- never for truncation, auth,
// invalid-request, or SDK-level network errors, and never more than once,
// so a single analysis can never trigger more than 2 real model calls.
const APP_MAX_RETRIES = 1;

// Raised from 8000 -- real production data (analysis_failed audit,
// 2026-09) shows several long-running (~40-60s, i.e. a full generation,
// not a fast rejection) "ai_invalid_response" failures on submissions with
// 6+ images, consistent with the model running out of output budget before
// finishing the required JSON (more images -> more required photo_analysis
// entries -> more output tokens needed). This is a bounded, minimal-risk
// increase (+25%) targeted at exactly that failure mode, not an unchecked
// bump -- stop_reason is now captured on every call (see validateAiResponse)
// so truncation frequency stays measurable after this change.
const MAX_OUTPUT_TOKENS = 10_000;

let anthropicClient: Anthropic | null = null;
function getClient() {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: AI_TIMEOUT_MS,
      maxRetries: AI_MAX_RETRIES,
    });
  }
  return anthropicClient;
}

export async function analyzeListing(params: {
  images: { base64: string; mediaType: string }[];
  input: AnalysisInput;
  // Title/description read from the Airbnb page itself when the analysis
  // came from a listing URL (see lib/airbnbExtract.ts) -- the extracted
  // photos alone carry no text, so without this the model would see the
  // listing's images but none of its actual title/description wording.
  // Not persisted anywhere; used only to build the prompt's context text
  // below, the same way city/property_type already are.
  extractedListingText?: {
    title: string | null;
    description: string | null;
    // Structured counts from Airbnb's own og:title (see
    // lib/airbnbExtract.ts) -- the one source precise enough to ground a
    // factual claim about sleeping capacity. null means genuinely unknown,
    // never zero.
    bedroomCount?: number | null;
    bedCount?: number | null;
    bathroomCount?: number | null;
  } | null;
  // Client-generated correlation id (see AnalyzeWizard.tsx) -- purely for
  // log correlation between a specific user-visible attempt and the raw
  // model call(s) it triggered. Never persisted, never sent to Anthropic.
  attemptId?: string | null;
}): Promise<{
  result: AnalysisResult;
  aiInputTokens: number | null;
  aiOutputTokens: number | null;
  parsingDurationMs: number;
  retryCount: number;
  stopReason: string | null;
}> {
  if (DEMO_MODE) {
    return {
      result: { ...DEMO_RESULT },
      aiInputTokens: null,
      aiOutputTokens: null,
      parsingDurationMs: 0,
      retryCount: 0,
      stopReason: null,
    };
  }

  if (params.images.length === 0 && !params.input.listing_url) {
    throw new AnalysisError(
      "Nous n'avons pas assez d'informations pour analyser correctement cette annonce. Ajoute 2 ou 3 captures supplémentaires.",
      "insufficient_input"
    );
  }

  const contextLines = [
    params.input.listing_url ? `Lien de l'annonce : ${params.input.listing_url}` : null,
    params.input.city ? `Ville / destination : ${params.input.city}` : null,
    params.input.property_type ? `Type de logement : ${params.input.property_type}` : null,
    params.input.guest_capacity ? `Nombre de voyageurs : ${params.input.guest_capacity}` : null,
    params.input.nightly_price ? `Prix moyen par nuit : ${params.input.nightly_price}` : null,
    params.extractedListingText?.title
      ? `Titre actuel de l'annonce (récupéré automatiquement depuis le lien) : ${params.extractedListingText.title}`
      : null,
    params.extractedListingText?.description
      ? `Description actuelle de l'annonce (récupérée automatiquement depuis le lien) : ${params.extractedListingText.description}`
      : null,
    // Structured, authoritative -- never a visual guess. See the FIABILITÉ
    // FACTUELLE rules above: these must be used in priority over any
    // photo-based estimate of sleeping capacity.
    params.extractedListingText?.bedroomCount != null
      ? `Nombre de chambres annoncé par Airbnb (donnée structurée fiable) : ${params.extractedListingText.bedroomCount}`
      : null,
    params.extractedListingText?.bedCount != null
      ? `Nombre de lits annoncé par Airbnb (donnée structurée fiable) : ${params.extractedListingText.bedCount}`
      : null,
    params.extractedListingText?.bathroomCount != null
      ? `Nombre de salles de bain annoncé par Airbnb (donnée structurée fiable) : ${params.extractedListingText.bathroomCount}`
      : null,
  ].filter(Boolean);

  const content: Anthropic.MessageParam["content"] = [
    {
      type: "text",
      text: `Voici les informations fournies par le propriétaire :\n${
        contextLines.join("\n") || "(aucune information complémentaire fournie)"
      }\n\nVoici ${params.images.length} capture(s) d'écran de l'annonce, dans l'ordre où elles apparaissent. Analyse la présentation de cette annonce et renvoie un ${BRAND_NAME} complet via l'outil submit_guestmirror_analysis.`,
    },
    ...params.images.map(
      (img): Anthropic.ImageBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: img.mediaType as "image/png", data: img.base64 },
      })
    ),
  ];

  const logTag = `attempt_id=${params.attemptId ?? "none"}`;
  const sourceNumbers = buildSourceNumberSet({ input: params.input, extractedListingText: params.extractedListingText });

  for (let attempt = 0; attempt <= APP_MAX_RETRIES; attempt++) {
    const aiStartedAt = Date.now();
    let response: Anthropic.Message;
    try {
      response = await getClient().messages.create({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: SYSTEM_PROMPT,
        tools: [
          {
            name: "submit_guestmirror_analysis",
            description: `Soumet le résultat structuré de l'analyse ${BRAND_NAME}.`,
            input_schema: RESULT_SCHEMA as Anthropic.Tool["input_schema"],
          },
        ],
        tool_choice: { type: "tool", name: "submit_guestmirror_analysis" },
        messages: [{ role: "user", content }],
      });
    } catch (err) {
      // SDK-level failures (network/5xx/timeout/auth/rate-limit) already
      // got the SDK's own AI_MAX_RETRIES retry internally -- never retried
      // again here, regardless of which loop iteration this is.
      const code = categorizeAnthropicError(err);
      console.error(
        `[ai] messages.create failed ${logTag} retry_count=${attempt} duration_ms=${Date.now() - aiStartedAt} code=${code}:`,
        err
      );
      throw new AnalysisError(
        "L'analyse n'a pas pu être réalisée pour le moment. Réessaie dans quelques instants.",
        code
      );
    }

    const parsingStartedAt = Date.now();
    const validation = validateAiResponse(response);
    const parsingDurationMs = Date.now() - parsingStartedAt;
    const toolUsePresent = response.content.some((b) => b.type === "tool_use");

    // Section 2's required per-attempt diagnostic line -- model, token
    // usage, stop_reason, tool_use presence, response size, parse/validation
    // outcome, error code, duration -- all in one grep-able log line, no
    // listing content or guest-facing text included.
    console.log(
      `[ai] response ${logTag} retry_count=${attempt} model=${MODEL} ` +
        `input_tokens=${response.usage.input_tokens} output_tokens=${response.usage.output_tokens} ` +
        `stop_reason=${response.stop_reason} tool_use_present=${toolUsePresent} ` +
        `response_length=${JSON.stringify(response.content).length} parse_success=${validation.ok} ` +
        `validation_success=${validation.ok} error_code=${validation.ok ? "" : validation.code} ` +
        `duration_ms=${Date.now() - aiStartedAt}`
    );

    if (!validation.ok) {
      console.error(
        `[ai] invalid response ${logTag} retry_count=${attempt} code=${validation.code} reason=${validation.reason} ` +
          `shape=${JSON.stringify(redactedResponseShape(response))}`
      );

      const canRetry = attempt < APP_MAX_RETRIES && RETRYABLE_VALIDATION_CODES.has(validation.code);
      if (canRetry) continue;

      throw new AnalysisError(
        "L'analyse n'a pas pu être réalisée pour le moment. Réessaie dans quelques instants.",
        validation.code
      );
    }

    const input = stripUnsupportedInconsistencyClaims(validation.input, sourceNumbers, logTag);

    // The schema's maxLength/the prompt's instruction steer the model but
    // aren't a hard guarantee (same reasoning as the overall_score check
    // above) -- re-validate every suggested title here and clean up any
    // that overshoot, rather than trusting the model's count. Never a
    // mid-word substring cut: sanitizeAirbnbTitle only drops whole trailing
    // words, and drops the title entirely (never shows a mangled one) if
    // even a single word is already over the limit.
    const rawTitles = input.title_analysis?.suggested_titles ?? [];
    const cleanTitles = sanitizeAirbnbTitles(rawTitles);
    console.log(
      `[ai] generated_title_length raw=${JSON.stringify(rawTitles.map(titleCharCount))} final=${JSON.stringify(cleanTitles.map(titleCharCount))} dropped=${rawTitles.length - cleanTitles.length}`
    );

    return {
      result: {
        ...(input as AnalysisResult),
        disclaimer: DISCLAIMER,
        title_analysis: {
          current_title: input.title_analysis?.current_title ?? "",
          issues: input.title_analysis?.issues ?? [],
          suggested_titles: cleanTitles,
        },
      },
      aiInputTokens: response.usage.input_tokens ?? null,
      aiOutputTokens: response.usage.output_tokens ?? null,
      parsingDurationMs,
      retryCount: attempt,
      stopReason: response.stop_reason,
    };
  }

  // Unreachable: the loop above always either returns on success or throws
  // once retries are exhausted. Kept only so TypeScript sees every path
  // returning/throwing.
  throw new AnalysisError(
    "L'analyse n'a pas pu être réalisée pour le moment. Réessaie dans quelques instants.",
    "ai_invalid_response"
  );
}
