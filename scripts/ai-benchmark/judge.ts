import type Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";

// Blind pairwise judge: the reference report and a candidate report for the
// same listing, in an order the judge cannot infer, graded against the
// listing's own photos and text. This is the only part of the benchmark
// that says anything about whether a finding is *true*; the deterministic
// checks (checks.ts) cannot.
//
// Limits worth keeping in mind when reading its numbers: it is a model's
// opinion, not ground truth; a handful of listings is an observation, not a
// statistically reliable conclusion; and a judge from the same model family
// as a candidate may favour that candidate's style.

export const JUDGE_CRITERIA = ["accuracy", "no_invention", "relevance", "image_precision", "completeness"] as const;
export type JudgeCriterion = (typeof JUDGE_CRITERIA)[number];

export type ReportScores = Record<JudgeCriterion, number> & { unsupported_claims: number };

export interface Judgment {
  reference: ReportScores;
  candidate: ReportScores;
  preferred: "reference" | "candidate" | "tie";
  reason: string;
  // Which position the candidate was shown in, for auditing position bias.
  candidatePosition: 1 | 2;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

const JUDGE_TOOL = "submit_judgment";

const scoresSchema = {
  type: "object",
  properties: {
    accuracy: { type: "integer", enum: [1, 2, 3, 4, 5] },
    no_invention: { type: "integer", enum: [1, 2, 3, 4, 5] },
    relevance: { type: "integer", enum: [1, 2, 3, 4, 5] },
    image_precision: { type: "integer", enum: [1, 2, 3, 4, 5] },
    completeness: { type: "integer", enum: [1, 2, 3, 4, 5] },
    unsupported_claims: { type: "integer" },
  },
  required: ["accuracy", "no_invention", "relevance", "image_precision", "completeness", "unsupported_claims"],
  additionalProperties: false,
};

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    report_1: scoresSchema,
    report_2: scoresSchema,
    preferred: { type: "string", enum: ["1", "2", "egal"] },
    reason: { type: "string" },
  },
  required: ["report_1", "report_2", "preferred", "reason"],
  additionalProperties: false,
};

const JUDGE_SYSTEM = `Tu évalues deux diagnostics d'une même annonce de location courte durée. Ils ont été produits par deux systèmes différents à partir d'exactement les mêmes éléments : les informations fournies par le propriétaire et les photos ci-dessous, numérotées à partir de 1 dans l'ordre où elles apparaissent. Tu ne sais pas quel système a produit quel rapport, et tu n'as pas à le deviner.

Vérifie chaque rapport contre les photos et le texte fournis, puis note-le de 1 (mauvais) à 5 (excellent) sur :
- accuracy : ce que le rapport affirme sur les photos, le titre et la description correspond à ce qui est réellement visible ou écrit.
- no_invention : le rapport n'avance aucune information, aucun chiffre et aucune incohérence qui ne figure pas dans les éléments fournis (5 = aucune invention).
- relevance : les recommandations sont spécifiques à cette annonce, applicables telles quelles, et portent sur ce qui compte le plus pour un voyageur qui la découvre.
- image_precision : quand le rapport cite une photo par son numéro, il décrit bien ce que montre cette photo.
- completeness : le rapport couvre les photos, le titre, la description et un plan d'action, sans section vide ou expédiée.

La longueur n'est pas un critère : un rapport plus court n'est ni meilleur ni moins bon en soi. Ne pénalise que ce qui manque réellement à l'hôte.

Pour chaque rapport, compte aussi dans unsupported_claims le nombre d'affirmations factuelles que tu as vérifiées comme fausses ou non étayées par les éléments fournis.

Indique enfin dans preferred lequel des deux rapports tu remettrais à l'hôte ("1", "2", ou "egal" s'ils se valent), et dans reason pourquoi, en une ou deux phrases qui ne recopient pas le contenu de l'annonce.

Réponds uniquement en appelant l'outil ${JUDGE_TOOL}.`;

/** Deterministic coin flip, so a re-run shows the same order to the judge. */
export function candidateGoesFirst(seed: string): boolean {
  return createHash("sha256").update(seed).digest()[0] % 2 === 0;
}

function serializeReport(output: unknown): string {
  const report = { ...(output as Record<string, unknown>) };
  // Constant sentence added by the app, identical in both reports.
  delete report.disclaimer;
  return JSON.stringify(report);
}

function toScores(v: unknown): ReportScores {
  const r = v as Record<string, number>;
  return {
    accuracy: r.accuracy,
    no_invention: r.no_invention,
    relevance: r.relevance,
    image_precision: r.image_precision,
    completeness: r.completeness,
    unsupported_claims: r.unsupported_claims,
  };
}

export async function judgePair(params: {
  client: Anthropic;
  model: string;
  // The listing exactly as the generators saw it: the first user content
  // block (context text) followed by the image blocks.
  listingContent: Anthropic.ContentBlockParam[];
  reference: unknown;
  candidate: unknown;
  seed: string;
  extra?: Record<string, unknown>;
}): Promise<Judgment> {
  const candidateFirst = candidateGoesFirst(params.seed);
  const first = candidateFirst ? params.candidate : params.reference;
  const second = candidateFirst ? params.reference : params.candidate;

  const response = await params.client.messages.create({
    model: params.model,
    max_tokens: 6_000,
    system: JUDGE_SYSTEM,
    tools: [
      {
        name: JUDGE_TOOL,
        description: "Enregistre l'évaluation comparée des deux rapports.",
        input_schema: JUDGE_SCHEMA as Anthropic.Tool["input_schema"],
        strict: true,
      },
    ],
    // "auto", not a forced call: the current Opus / Sonnet models reject
    // forced tool choice. A missing call is treated as a failed judgment.
    tool_choice: { type: "auto" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "ÉLÉMENTS DE L'ANNONCE (identiques pour les deux rapports) :" },
          ...params.listingContent,
          { type: "text", text: `RAPPORT 1 :\n${serializeReport(first)}` },
          { type: "text", text: `RAPPORT 2 :\n${serializeReport(second)}` },
        ],
      },
    ],
    ...(params.extra ?? {}),
  } as Anthropic.MessageCreateParamsNonStreaming);

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) throw new Error(`judge returned no ${JUDGE_TOOL} call (stop_reason=${response.stop_reason})`);
  const input = toolUse.input as { report_1: unknown; report_2: unknown; preferred: "1" | "2" | "egal"; reason: string };

  const candidateKey = candidateFirst ? "1" : "2";
  return {
    reference: toScores(candidateFirst ? input.report_2 : input.report_1),
    candidate: toScores(candidateFirst ? input.report_1 : input.report_2),
    preferred: input.preferred === "egal" ? "tie" : input.preferred === candidateKey ? "candidate" : "reference",
    reason: input.reason,
    candidatePosition: candidateFirst ? 1 : 2,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    model: response.model,
  };
}
