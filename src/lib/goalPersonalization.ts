import type { AnalysisResult, Goal } from "@/lib/types";

// Goal-based personalisation of a report that already exists.
//
// The onboarding goal (StepGoal.tsx) never reaches the model: the analysis,
// its score and every finding are produced from the listing alone, exactly as
// before. What the goal changes is the ORDER in which the report presents what
// the analysis really found, and which of those items are flagged as related
// to the goal. Deterministic and pure, so:
//   - no extra AI call, no prompt change, no cost or latency change;
//   - the score and every text are untouched (same strings, same numbers);
//   - nothing is created: the output arrays are permutations of the input;
//   - the same analysis always renders the same way (reload, unlock, return).
//
// Rules (see personalizeResult):
//   - top_priorities[0] stays first: it is the model's "most impactful"
//     problem, shown for free as "Problème principal", so the free view and the
//     paid report never disagree on what matters most. The other priorities
//     follow, goal-related ones first, model order kept within each group.
//   - weaknesses: goal-related first, then the others; most severe first
//     within each group. For goals without a topic, simply most severe first.
//   - action_plan: step 1 stays first (it usually acts on priority #1), then
//     goal-related steps, then the others, order kept within each group.
//   - no goal (older analyses, content link): the result is returned as is.
//
// "Related" is a keyword match on the item's own short label (a weakness or
// priority title, an action sentence), never on the explanations, which talk
// about hesitation and photos for almost everything. A miss is harmless: the
// item keeps its place in the "others" group.

export type GoalTopic = "visual" | "clarity";

const TOPIC_PATTERNS: Record<GoalTopic, RegExp[]> = {
  // What makes a listing attractive at first glance: photos and title.
  visual: [
    /photos?\b/i,
    /couverture/i,
    /galerie/i,
    /\bimages?\b/i,
    /visuel/i,
    /cadrage/i,
    /lumi[eè]re|lumineu|[ée]clairage|sombre/i,
    /\btitres?\b/i,
  ],
  // What leaves a traveller unsure: missing, vague or contradictory
  // information, and the description that should answer it.
  clarity: [
    /description/i,
    /incoh[ée]ren|contradic|d[ée]calage/i,
    /capacit[ée]|couchages?|literie|configuration/i,
    /pr[ée]cis|clarif|ambigu|flou|peu clair|explicit/i,
    /\bpas de (photo|visuel|vue|mention|pr[ée]cision)/i,
    /informations?\b|pratiques?\b/i,
    // "manque" only as missing information ("Manque de variation dans les
    // angles" is a photo critique, not a gap).
    /absen|manquant|il manque|manque d'(info|indic|pr[ée]cision|d[ée]tail|explic)|invisible|n'appara[iî]t|non (visible|confirm|montr)/i,
    /aucune? (information|photo|mention|pr[ée]cision|indication|d[ée]tail|vue)/i,
  ],
};

// A label that matches these is about something else even if it names a
// topic word: "Incohérence entre le titre et la capacité" is a factual
// contradiction, not a question of attractiveness.
const TOPIC_EXCLUSIONS: Record<GoalTopic, RegExp[]> = {
  visual: [/incoh[ée]ren|contradic|capacit[ée]|couchages?|voyageurs/i],
  clarity: [],
};

const GOAL_TOPICS: Record<Goal, GoalTopic[]> = {
  improve_appeal: ["visual"],
  reduce_hesitation: ["clarity"],
  verify_improvements: [],
  optimize_multiple: [],
};

/** Second-person reminder of the goal, for the result page. */
export const GOAL_REMINDERS: Record<Goal, string> = {
  improve_appeal: "Donner davantage envie de réserver",
  reduce_hesitation: "Identifier ce qui peut faire hésiter les voyageurs",
  verify_improvements: "Vérifier les améliorations apportées à ton annonce",
  optimize_multiple: "Optimiser plusieurs logements Airbnb",
};

/** What the related items are about, in French, for goals that have a topic. */
const TOPIC_PHRASES: Record<GoalTopic, string> = {
  visual: "tes photos ou ton titre",
  clarity: "des informations manquantes, floues ou contradictoires",
};

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function isGoal(value: unknown): value is Goal {
  return typeof value === "string" && value in GOAL_TOPICS;
}

/** Whether a short label (title, action) is about one of the goal's topics. */
export function matchesGoal(text: unknown, goal: Goal): boolean {
  if (typeof text !== "string" || text.trim() === "") return false;
  return GOAL_TOPICS[goal].some(
    (topic) =>
      TOPIC_PATTERNS[topic].some((re) => re.test(text)) && !TOPIC_EXCLUSIONS[topic].some((re) => re.test(text))
  );
}

interface Ranked<T> {
  item: T;
  index: number;
  match: boolean;
}

/** Stable: goal-related first, then `tie` (if any), then original order. */
function order<T>(items: Ranked<T>[], tie?: (x: Ranked<T>) => number): Ranked<T>[] {
  return [...items].sort(
    (a, b) => Number(b.match) - Number(a.match) || (tie ? tie(a) - tie(b) : 0) || a.index - b.index
  );
}

function severityOf(item: unknown): number {
  const s = (item as { severity?: unknown } | null)?.severity;
  return typeof s === "string" && s in SEVERITY_RANK ? SEVERITY_RANK[s] : SEVERITY_RANK.low + 1;
}

function titleOf(item: unknown): unknown {
  return (item as { title?: unknown } | null)?.title;
}

export type GoalMode =
  | "topic" // the goal has a topic: related items first, flagged
  | "severity" // no topic: most important problems first
  | "compare_previous" // verify_improvements, with a previous analysis to compare to
  | "rescan"; // verify_improvements, nothing to compare to yet

export interface GoalPersonalization {
  goal: Goal;
  reminder: string;
  mode: GoalMode;
  /** The report, reordered. Same score, same texts, nothing added or removed. */
  result: AnalysisResult;
  /** Parallel to result.top_priorities / weaknesses / action_plan. */
  priorityMatches: boolean[];
  weaknessMatches: boolean[];
  actionMatches: boolean[];
  /** Counts only (safe for a locked page): how many weaknesses relate to the goal. */
  relatedWeaknessCount: number;
  weaknessCount: number;
  /** "tes photos ou ton titre" -- only for mode "topic". */
  topicPhrase: string | null;
}

export function personalizeResult(
  result: AnalysisResult,
  goal: Goal | null | undefined,
  options: { hasPrevious?: boolean } = {}
): GoalPersonalization | null {
  if (!isGoal(goal)) return null;
  const topics = GOAL_TOPICS[goal];
  const hasTopic = topics.length > 0;

  const priorities = Array.isArray(result.top_priorities) ? result.top_priorities : [];
  const weaknesses = Array.isArray(result.weaknesses) ? result.weaknesses : [];
  const actions = Array.isArray(result.action_plan) ? result.action_plan : [];

  const rank = <T,>(list: T[], label: (x: T) => unknown): Ranked<T>[] =>
    list.map((item, index) => ({ item, index, match: hasTopic && matchesGoal(label(item), goal) }));

  // Priorities and actions: the first one stays first.
  const pinFirst = <T,>(ranked: Ranked<T>[]): Ranked<T>[] =>
    ranked.length === 0 ? ranked : [ranked[0], ...order(ranked.slice(1))];

  const p = pinFirst(rank(priorities, titleOf));
  const w = order(rank(weaknesses, titleOf), (x) => severityOf(x.item));
  const a = pinFirst(rank(actions, (s) => s));

  const mode: GoalMode = hasTopic
    ? "topic"
    : goal === "verify_improvements"
      ? options.hasPrevious
        ? "compare_previous"
        : "rescan"
      : "severity";

  return {
    goal,
    reminder: GOAL_REMINDERS[goal],
    mode,
    result: {
      ...result,
      top_priorities: p.map((x) => x.item),
      weaknesses: w.map((x) => x.item),
      action_plan: a.map((x) => x.item),
    },
    priorityMatches: p.map((x) => x.match),
    weaknessMatches: w.map((x) => x.match),
    actionMatches: a.map((x) => x.match),
    relatedWeaknessCount: w.filter((x) => x.match).length,
    weaknessCount: weaknesses.length,
    topicPhrase: hasTopic ? TOPIC_PHRASES[topics[0]] : null,
  };
}

/**
 * The one honest sentence under "Ton objectif : …". `unlocked` says whether
 * the report is on this page or behind the paywall. Never claims more than
 * personalizeResult actually did.
 */
export function goalExplanation(p: GoalPersonalization, unlocked: boolean): string {
  const where = unlocked ? "ci-dessous" : "dans ton rapport complet";
  switch (p.mode) {
    case "topic":
    {
      const n = p.relatedWeaknessCount;
      const total = p.weaknessCount;
      if (n === 0 || total === 0) {
        return `Aucun point faible relevé ne concerne directement ${p.topicPhrase} : ${where}, les problèmes les plus importants passent en premier.`;
      }
      const subject =
        n === total
          ? total === 1
            ? "Le point faible relevé concerne"
            : `Les ${total} points faibles relevés concernent`
          : `${n} des ${total} points faibles relevés ${n === 1 ? "concerne" : "concernent"}`;
      const verb = n === 1 ? "il est présenté en premier" : "ils sont présentés en premier";
      const flag = unlocked ? (n === 1 ? " et signalé « Lié à ton objectif »" : " et signalés « Lié à ton objectif »") : "";
      return `${subject} ${p.topicPhrase} : ${where}, ${verb}${flag}.`;
    }
    case "severity":
      return `${unlocked ? "Ci-dessous" : "Dans ton rapport complet"}, les problèmes les plus importants de ce logement passent en premier.`;
    case "compare_previous":
      return unlocked
        ? "La comparaison avec ta précédente analyse est en tête de ton rapport."
        : "Ton rapport complet compare ce résultat à ta précédente analyse.";
    case "rescan":
      return "Pour vérifier tes améliorations, relance une analyse après tes modifications : on comparera les deux résultats.";
  }
}

// ---------------------------------------------------------------------------
// The listing's own title, for "Ton diagnostic pour : …".

const NOT_A_LISTING_TITLE = [
  /connexion|inscription|log ?in|sign ?up/i, // the link led to Airbnb's login page
  /non (visible|fourni|disponible|lisible|indiqu)/i,
  /aucun titre|pas de titre|titre (absent|inconnu|manquant)/i,
  /^(airbnb|inconnu|n\/a|-+)$/i,
];
const MAX_DISPLAY_TITLE = 120;

/**
 * The title to show, or null. Prefers the title read from the Airbnb page
 * itself (stored as result.listing_title since this change), falls back to
 * the title the analysis transcribed (title_analysis.current_title, for older
 * reports). Anything that is not plausibly a real listing title is dropped.
 */
export function displayListingTitle(result: AnalysisResult): string | null {
  const candidates = [result.listing_title, result.title_analysis?.current_title];
  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    const title = raw.replace(/\s+/g, " ").trim();
    if (!title || title.length > MAX_DISPLAY_TITLE) continue;
    if (NOT_A_LISTING_TITLE.some((re) => re.test(title))) continue;
    return title;
  }
  return null;
}
