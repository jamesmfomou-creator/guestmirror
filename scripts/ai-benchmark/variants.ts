import type { AnalysisRequestOptions } from "@/lib/ai";

// One row per request configuration compared by the benchmark. Every variant
// is expressed as options for lib/ai.ts's buildAnalysisRequest, so each one
// is "the production request with exactly this difference".

export interface BenchmarkVariant {
  id: string;
  label: string;
  // What this variant is meant to tell us, shown in the report.
  purpose: string;
  options: AnalysisRequestOptions;
  // Left out of a run unless named in BENCH_VARIANTS (kept as a
  // reproducible record of a configuration known not to work).
  skipByDefault?: boolean;
}

// Output-length guidance tested by the "concise" variants. It asks for
// shorter wording, never for fewer sections or fewer findings: the number
// of findings feeds the "N améliorations" count on the free result page and
// the paid report's sections, which must not shrink as a side effect.
export const CONCISE_SUFFIX = `CONCISION (sans rien retirer du diagnostic) :
- Garde toutes les sections et le même nombre d'éléments que tu aurais produits sans cette consigne : raccourcis la formulation, jamais le contenu.
- Chaque champ d'explication ou de recommandation tient en 2 phrases maximum : la première porte l'observation précise, la seconde la raison ou l'action. Pas de phrase d'introduction, pas de répétition d'une observation déjà écrite dans un autre champ.
- "photo_analysis" : pour chaque photo, 2 points forts et 2 points faibles au maximum, chacun en une phrase courte et spécifique à cette photo.
- "strengths[].explanation" : une seule phrase.
- "improved_description" et "suggested_titles" ne sont pas concernés par cette consigne : garde-les complets.`;

const REFERENCE_MODEL = "claude-sonnet-5";

export const VARIANTS: BenchmarkVariant[] = [
  {
    id: "baseline",
    label: "Sonnet 5 (référence)",
    purpose: "Requête de production avant optimisation : la référence de qualité, de latence et de coût.",
    options: { model: REFERENCE_MODEL, strict: false, toolChoice: "forced" },
  },
  {
    id: "strict",
    label: "Sonnet 5 + schéma strict",
    purpose:
      "Sortie contrainte au schéma. Mesuré : l'API refuse ce schéma en mode strict (400 « compiled grammar is too large ») après 30 à 80 s. Conservé pour pouvoir reproduire le constat.",
    options: { model: REFERENCE_MODEL, strict: true, toolChoice: "forced" },
    skipByDefault: true,
  },
  {
    id: "concise",
    label: "Sonnet 5 + consigne de concision",
    purpose: "Réduire les tokens de sortie (donc la latence) à contenu constant.",
    options: { model: REFERENCE_MODEL, strict: false, toolChoice: "forced", systemSuffix: CONCISE_SUFFIX },
  },
  {
    id: "effort-low",
    label: "Sonnet 5 + effort bas",
    purpose:
      "Sans réglage, ce modèle peut réfléchir avant de répondre (réflexion adaptative, effort « high »). Effort bas : moins de réflexion et une réponse plus directe.",
    options: { model: REFERENCE_MODEL, strict: false, toolChoice: "forced", extra: { output_config: { effort: "low" } } },
  },
  {
    id: "no-thinking",
    label: "Sonnet 5 sans réflexion",
    purpose: "Réflexion désactivée, tout le reste identique : isole ce que la réflexion coûte en délai et apporte en qualité.",
    options: { model: REFERENCE_MODEL, strict: false, toolChoice: "forced", extra: { thinking: { type: "disabled" } } },
  },
  {
    id: "no-thinking-concise",
    label: "Sonnet 5 sans réflexion + concision",
    purpose: "Les deux leviers de latence combinés.",
    options: {
      model: REFERENCE_MODEL,
      strict: false,
      toolChoice: "forced",
      systemSuffix: CONCISE_SUFFIX,
      extra: { thinking: { type: "disabled" } },
    },
  },
  {
    id: "sonnet-5-5",
    label: "Sonnet 5.5",
    purpose: "Successeur au même prix. N'accepte pas le tool_choice forcé : tool_choice auto, réflexion au minimum.",
    options: {
      model: "claude-sonnet-5-5",
      strict: false,
      toolChoice: "auto",
      extra: { thinking: { type: "between_tools" } },
    },
  },
  {
    id: "haiku-5-5",
    label: "Haiku 5.5",
    purpose: "Modèle rapide et bon marché : la qualité tient-elle ?",
    options: {
      model: "claude-haiku-5-5",
      strict: false,
      toolChoice: "forced",
      extra: { thinking: { type: "disabled" } },
    },
  },
];

// USD per million tokens (input, output), prompts under 100K tokens.
// Published list prices at the time of writing -- check them before reading
// a cost column as current; override with BENCH_PRICES if they changed.
export const DEFAULT_PRICES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

export function priceFor(
  model: string,
  prices: Record<string, { input: number; output: number }>
): { input: number; output: number } {
  // The API returns dated ids ("claude-sonnet-5-20260203"); match by prefix,
  // longest first so "claude-sonnet-5-5" never falls back to "claude-sonnet-5".
  const key = Object.keys(prices)
    .sort((a, b) => b.length - a.length)
    .find((k) => model === k || model.startsWith(`${k}-`));
  if (!key) throw new Error(`No price configured for model "${model}" (set BENCH_PRICES)`);
  return prices[key];
}

export function callCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  prices: Record<string, { input: number; output: number }>
): number {
  const p = priceFor(model, prices);
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
