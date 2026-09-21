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
  extractedListingText?: { title: string | null; description: string | null } | null;
}): Promise<{
  result: AnalysisResult;
  aiInputTokens: number | null;
  aiOutputTokens: number | null;
  parsingDurationMs: number;
}> {
  if (DEMO_MODE) {
    return { result: { ...DEMO_RESULT }, aiInputTokens: null, aiOutputTokens: null, parsingDurationMs: 0 };
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

  let response;
  const aiStartedAt = Date.now();
  try {
    response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 8000,
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
    console.log(
      `[ai] messages.create ok duration_ms=${Date.now() - aiStartedAt} images=${params.images.length} ` +
        `input_tokens=${response.usage.input_tokens} output_tokens=${response.usage.output_tokens}`
    );
  } catch (err) {
    const code = categorizeAnthropicError(err);
    console.error(`[ai] messages.create failed duration_ms=${Date.now() - aiStartedAt} code=${code}:`, err);
    throw new AnalysisError(
      "L'analyse n'a pas pu être réalisée pour le moment. Réessaie dans quelques instants.",
      code
    );
  }

  const parsingStartedAt = Date.now();
  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) {
    throw new AnalysisError(
      "L'analyse n'a pas pu être réalisée pour le moment. Réessaie dans quelques instants.",
      "ai_invalid_response"
    );
  }

  const input = toolUse.input as Partial<AnalysisResult>;
  // "required" in the tool schema steers the model but isn't a hard
  // guarantee -- without this check, a response missing overall_score
  // (observed in testing, likely tied to hitting the tool schema's edges
  // on an unusual input) surfaced 60+ seconds later as a raw Postgres
  // not-null violation instead of the existing, fast "réessaie" retry path.
  if (typeof input.overall_score !== "number" || !input.summary) {
    console.error(`[ai] incomplete tool response duration_ms=${Date.now() - aiStartedAt}`);
    throw new AnalysisError(
      "L'analyse n'a pas pu être réalisée pour le moment. Réessaie dans quelques instants.",
      "ai_invalid_response"
    );
  }

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

  const parsingDurationMs = Date.now() - parsingStartedAt;

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
  };
}
