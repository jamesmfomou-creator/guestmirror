import Anthropic from "@anthropic-ai/sdk";
import { AnalysisInput, AnalysisResult } from "@/lib/types";
import { DEMO_MODE } from "@/lib/env";
import { DEMO_RESULT } from "@/lib/demo-data";
import { BRAND_NAME } from "@/lib/brand";

export class AnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisError";
  }
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
- Le champ "disclaimer" doit toujours contenir : "${BRAND_NAME} est une estimation produite à partir des éléments visibles de l'annonce. Il ne prédit ni ne garantit les clics ou les réservations."`;

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
        suggested_titles: { type: "array", items: { type: "string" } },
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
    disclaimer: { type: "string" },
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
    "disclaimer",
  ],
};

let anthropicClient: Anthropic | null = null;
function getClient() {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

export async function analyzeListing(params: {
  images: { base64: string; mediaType: string }[];
  input: AnalysisInput;
}): Promise<AnalysisResult> {
  if (DEMO_MODE) {
    return { ...DEMO_RESULT };
  }

  if (params.images.length === 0 && !params.input.listing_url) {
    throw new AnalysisError(
      "Nous n'avons pas assez d'informations pour analyser correctement cette annonce. Ajoute 2 ou 3 captures supplémentaires."
    );
  }

  const contextLines = [
    params.input.listing_url ? `Lien de l'annonce : ${params.input.listing_url}` : null,
    params.input.city ? `Ville / destination : ${params.input.city}` : null,
    params.input.property_type ? `Type de logement : ${params.input.property_type}` : null,
    params.input.guest_capacity ? `Nombre de voyageurs : ${params.input.guest_capacity}` : null,
    params.input.nightly_price ? `Prix moyen par nuit : ${params.input.nightly_price}` : null,
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
  } catch {
    throw new AnalysisError(
      "L'analyse n'a pas pu être réalisée pour le moment. Réessaie dans quelques instants."
    );
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) {
    throw new AnalysisError(
      "L'analyse n'a pas pu être réalisée pour le moment. Réessaie dans quelques instants."
    );
  }

  return toolUse.input as AnalysisResult;
}
