/**
 * Reproducible benchmark of the analysis model call.
 *
 * Runs the production request (lib/ai.ts's buildAnalysisRequest) and a set of
 * variants (variants.ts) over a folder of listing fixtures, and reports, per
 * variant: format validity, deterministic content checks (checks.ts),
 * latency, token usage, cost, and optionally a blind pairwise quality judge
 * against the reference (judge.ts).
 *
 * It makes REAL, BILLED model calls. Nothing runs unless BENCH_FIXTURES is
 * set, and spending stops at BENCH_MAX_USD. See README.md next to this file.
 *
 * Run through vitest only because it is the TypeScript runner the project
 * already has (path aliases included) -- this is not a unit test and is not
 * part of `npm test`.
 */
import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { it } from "vitest";
import {
  ANALYSIS_TOOL_NAME,
  RESULT_SCHEMA,
  buildAnalysisRequest,
  categorizeAnthropicError,
  validateAiResponse,
} from "@/lib/ai";
import { extractAirbnbListing, downloadImageAsBase64 } from "@/lib/airbnbExtract";
import { optimizeImages } from "@/lib/imageOptimize";
import { AIRBNB_TITLE_MAX_LENGTH } from "@/lib/titles";
import type { AnalysisInput } from "@/lib/types";
import { runOutputChecks, type OutputChecks } from "./checks";
import { attemptEconomics, saleEconomics } from "./economics";
import { JUDGE_CRITERIA, judgePair, type Judgment } from "./judge";
import { DEFAULT_PRICES_USD_PER_MTOK, VARIANTS, callCostUsd, type BenchmarkVariant } from "./variants";

// ---- configuration ----------------------------------------------------

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number`);
  return n;
}

const FIXTURES_DIR = process.env.BENCH_FIXTURES ?? "";
const MAX_USD = envNumber("BENCH_MAX_USD", 1);
const REPEATS = Math.max(1, Math.round(envNumber("BENCH_REPEATS", 1)));
const CONCURRENCY = Math.max(1, Math.round(envNumber("BENCH_CONCURRENCY", 3)));
const VARIANT_IDS = (process.env.BENCH_VARIANTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const FIXTURE_IDS = (process.env.BENCH_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
// "off" (default) or a model id.
const JUDGE_MODEL = process.env.BENCH_JUDGE && process.env.BENCH_JUDGE !== "off" ? process.env.BENCH_JUDGE : null;
const JUDGE_VARIANT_IDS = (process.env.BENCH_JUDGE_VARIANTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const JUDGE_EFFORT = process.env.BENCH_JUDGE_EFFORT ?? "low";
const PRICES: Record<string, { input: number; output: number }> = process.env.BENCH_PRICES
  ? { ...DEFAULT_PRICES_USD_PER_MTOK, ...JSON.parse(process.env.BENCH_PRICES) }
  : DEFAULT_PRICES_USD_PER_MTOK;
const REFERENCE_VARIANT_ID = "baseline";
// Prepare and check the fixtures (link imports are fetched and frozen) and
// stop before any model call.
const FREEZE_ONLY = process.env.BENCH_FREEZE_ONLY === "1";
// A previous results.json: its successful generations are reused instead of
// being paid for again, e.g. to add the judge or one more variant.
const REUSE_PATH = process.env.BENCH_REUSE ?? "";
const STREAM = process.env.BENCH_STREAM !== "0";
// Extra attempts after a dropped connection (never after an API error).
const NET_RETRIES = Number(process.env.BENCH_NET_RETRIES ?? 2);

// ---- fixtures ---------------------------------------------------------

interface FixtureSpec {
  id: string;
  // Free label, e.g. good | weak | few_photos | thin_description |
  // multiple_problems | link | link_and_screenshots.
  profile: string;
  listing_url?: string | null;
  // Paths relative to the fixtures folder. Empty/absent + listing_url means
  // "import from the link", exactly as the app does.
  images?: string[];
  input?: Partial<Pick<AnalysisInput, "city" | "property_type" | "guest_capacity" | "nightly_price">>;
  extracted?: {
    title: string | null;
    description: string | null;
    bedroomCount?: number | null;
    bedCount?: number | null;
    bathroomCount?: number | null;
  } | null;
}

interface LoadedFixture {
  id: string;
  profile: string;
  images: { base64: string; mediaType: string }[];
  input: AnalysisInput;
  extracted: FixtureSpec["extracted"];
}

const MEDIA_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

async function loadFixture(spec: FixtureSpec): Promise<LoadedFixture> {
  let images: { base64: string; mediaType: string }[] = [];
  let extracted = spec.extracted ?? null;
  let city = spec.input?.city ?? null;
  let guestCapacity = spec.input?.guest_capacity ?? null;

  if (spec.images && spec.images.length > 0) {
    images = spec.images.map((rel) => {
      const mediaType = MEDIA_TYPES[path.extname(rel).toLowerCase()];
      if (!mediaType) throw new Error(`fixture ${spec.id}: unsupported image type ${rel}`);
      return { base64: fs.readFileSync(path.join(FIXTURES_DIR, rel)).toString("base64"), mediaType };
    });
  } else if (spec.listing_url) {
    // Link import. The page is fetched once and frozen next to the manifest:
    // a listing changes over time, and two runs can only be compared if
    // they saw the same photos and the same text.
    const frozenPath = path.join(FIXTURES_DIR, ".frozen", `${spec.id}.json`);
    if (fs.existsSync(frozenPath)) {
      const frozen = JSON.parse(fs.readFileSync(frozenPath, "utf-8")) as Pick<LoadedFixture, "images" | "extracted"> & {
        city: string | null;
        guestCapacity: string | null;
      };
      images = frozen.images;
      extracted = frozen.extracted ?? null;
      city = frozen.city ?? city;
      guestCapacity = frozen.guestCapacity ?? guestCapacity;
    } else {
      const extraction = await extractAirbnbListing(spec.listing_url);
      if (!extraction.ok) throw new Error(`fixture ${spec.id}: link import failed (${extraction.errorCode})`);
      const downloaded = await Promise.all(extraction.data.imageUrls.map((u) => downloadImageAsBase64(u)));
      images = downloaded.filter((img): img is { base64: string; mediaType: string } => img !== null);
      if (images.length === 0) throw new Error(`fixture ${spec.id}: no image could be downloaded`);
      extracted = {
        title: extraction.data.title,
        description: extraction.data.description,
        bedroomCount: extraction.data.bedroomCount,
        bedCount: extraction.data.bedCount,
        bathroomCount: extraction.data.bathroomCount,
      };
      city = extraction.data.city ?? city;
      guestCapacity = extraction.data.guestCapacity ?? guestCapacity;
      fs.mkdirSync(path.dirname(frozenPath), { recursive: true });
      fs.writeFileSync(frozenPath, JSON.stringify({ images, extracted, city, guestCapacity }), "utf-8");
    }
  } else {
    throw new Error(`fixture ${spec.id}: needs images or a listing_url`);
  }

  return {
    id: spec.id,
    profile: spec.profile,
    // Same re-encoding as /api/analyze applies before the model call.
    images: await optimizeImages(images),
    input: {
      listing_url: spec.listing_url ?? null,
      city,
      property_type: spec.input?.property_type ?? null,
      guest_capacity: guestCapacity,
      nightly_price: spec.input?.nightly_price ?? null,
    },
    extracted,
  };
}

// ---- budget -----------------------------------------------------------

class Budget {
  private spent = 0;
  private reserved = 0;
  constructor(private readonly maxUsd: number) {}

  /** Reserves the worst case for a call, or returns false if it cannot fit. */
  reserve(usd: number): boolean {
    if (this.spent + this.reserved + usd > this.maxUsd) return false;
    this.reserved += usd;
    return true;
  }
  settle(reservedUsd: number, actualUsd: number) {
    this.reserved -= reservedUsd;
    this.spent += actualUsd;
  }
  get spentUsd() {
    return this.spent;
  }
}

// Worst case used for the reservation: a generous input size and the full
// output ceiling. The cap can therefore not be exceeded by calls in flight.
const RESERVE_INPUT_TOKENS = 25_000;

/**
 * Assumed cost of a call that lost its connection: the usual input size and
 * as much output as the model could have produced in the time elapsed. An
 * upper-range estimate, used only so that lost calls count against the cap.
 */
function droppedCallEstimateUsd(model: string, maxTokens: number, elapsedMs: number): number {
  const assumedOutput = Math.min(maxTokens, Math.round((elapsedMs / 1000) * 100));
  return callCostUsd(model, 15_000, assumedOutput, PRICES);
}

function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = err.cause as { code?: string; message?: string } | undefined;
  const causeText = cause?.code ?? cause?.message;
  return `${err.message.slice(0, 300)}${causeText ? ` [${causeText}]` : ""}`;
}

// ---- one generation call ------------------------------------------------

interface RunRecord {
  fixtureId: string;
  profile: string;
  variantId: string;
  repeat: number;
  ok: boolean;
  errorCode: string | null;
  errorDetail: string | null;
  model: string | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  // Part of outputTokens spent on reasoning before the tool call (billed as
  // output, and generated before the first useful token).
  thinkingTokens: number | null;
  costUsd: number;
  // Attempts lost to a dropped connection before this record's outcome, and
  // what they are assumed to have cost (see droppedCallEstimateUsd).
  droppedAttempts: number;
  droppedEstimateUsd: number;
  stopReason: string | null;
  contentBlockTypes: string[];
  checks: OutputChecks | null;
  // The model's tool input. Listing-derived content: stays in results.json,
  // never in report.md or on the console.
  output: unknown;
  judgment: Judgment | null;
  judgeError: string | null;
}

async function runGeneration(params: {
  client: Anthropic;
  fixture: LoadedFixture;
  variant: BenchmarkVariant;
  repeat: number;
  budget: Budget;
}): Promise<RunRecord> {
  const { client, fixture, variant, repeat, budget } = params;
  const base: RunRecord = {
    fixtureId: fixture.id,
    profile: fixture.profile,
    variantId: variant.id,
    repeat,
    ok: false,
    errorCode: null,
    errorDetail: null,
    model: null,
    latencyMs: 0,
    inputTokens: null,
    outputTokens: null,
    thinkingTokens: null,
    costUsd: 0,
    droppedAttempts: 0,
    droppedEstimateUsd: 0,
    stopReason: null,
    contentBlockTypes: [],
    checks: null,
    output: null,
    judgment: null,
    judgeError: null,
  };

  const request = buildAnalysisRequest(
    { images: fixture.images, input: fixture.input, extractedListingText: fixture.extracted },
    variant.options
  );
  const reserveUsd = callCostUsd(variant.options.model, RESERVE_INPUT_TOKENS, request.max_tokens, PRICES);
  if (!budget.reserve(reserveUsd)) return { ...base, errorCode: "budget_exhausted", errorDetail: `BENCH_MAX_USD=${MAX_USD}` };

  // A call whose connection drops returns no usage, but the provider may
  // still bill it. It is retried, and counted against the budget with an
  // estimate (droppedCallEstimateUsd) so the cap stays a real cap.
  let startedAt = Date.now();
  let response: Anthropic.Message | null = null;
  let droppedAttempts = 0;
  let droppedEstimateUsd = 0;
  for (let attempt = 0; response === null; attempt++) {
    startedAt = Date.now();
    try {
      // Streamed, unlike production's single blocking call: the tokens, the
      // cost and the total duration are the same, but a connection that
      // carries data survives networks that drop a socket left silent for a
      // minute. BENCH_STREAM=0 sends the exact production call instead.
      response = STREAM
        ? await client.messages.stream(request).finalMessage()
        : await client.messages.create(request);
    } catch (err) {
      const errorCode = categorizeAnthropicError(err);
      const elapsedMs = Date.now() - startedAt;
      const dropped = errorCode === "ai_connection_error" || errorCode === "ai_timeout";
      if (dropped) {
        droppedAttempts++;
        droppedEstimateUsd += droppedCallEstimateUsd(variant.options.model, request.max_tokens, elapsedMs);
      }
      if (dropped && attempt < NET_RETRIES) continue;
      budget.settle(reserveUsd, droppedEstimateUsd);
      return {
        ...base,
        latencyMs: elapsedMs,
        droppedAttempts,
        droppedEstimateUsd,
        errorCode,
        // API error messages describe the request, not the listing.
        errorDetail: describeError(err),
      };
    }
  }
  const latencyMs = Date.now() - startedAt;
  const costUsd = callCostUsd(response.model, response.usage.input_tokens, response.usage.output_tokens, PRICES);
  budget.settle(reserveUsd, costUsd + droppedEstimateUsd);

  // The production gate, unchanged: a variant "works" only if production
  // would have accepted its response.
  const validation = validateAiResponse(response);
  const record: RunRecord = {
    ...base,
    model: response.model,
    latencyMs,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    thinkingTokens: response.usage.output_tokens_details?.thinking_tokens ?? null,
    costUsd,
    droppedAttempts,
    droppedEstimateUsd,
    stopReason: response.stop_reason,
    contentBlockTypes: response.content.map((b) => b.type),
  };
  if (!validation.ok) return { ...record, errorCode: validation.code, errorDetail: validation.reason };

  return {
    ...record,
    ok: true,
    output: validation.input,
    checks: runOutputChecks({
      output: validation.input,
      schema: RESULT_SCHEMA,
      imageCount: fixture.images.length,
      titleMaxLength: AIRBNB_TITLE_MAX_LENGTH,
    }),
  };
}

// ---- helpers ------------------------------------------------------------

async function pool<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        results[i] = await tasks[i]();
      }
    })
  );
  return results;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
function median(xs: number[]) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const fmt = (n: number, digits = 0) => (Number.isFinite(n) ? n.toFixed(digits) : "n/a");
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// ---- report -------------------------------------------------------------

function buildReport(records: RunRecord[], variants: BenchmarkVariant[], fixtures: LoadedFixture[], spentUsd: number): string {
  const lines: string[] = [];
  const byVariant = (id: string) => records.filter((r) => r.variantId === id);
  const reference = byVariant(REFERENCE_VARIANT_ID).filter((r) => r.ok);

  lines.push(`# Benchmark de l'appel IA — ${new Date().toISOString()}`);
  lines.push("");
  lines.push(
    `${fixtures.length} annonce(s) × ${variants.length} variante(s) × ${REPEATS} passage(s). Dépense comptée : ${fmt(spentUsd, 3)} $ (plafond ${MAX_USD} $).`
  );
  const dropped = records.reduce((n, r) => n + (r.droppedAttempts ?? 0), 0);
  if (dropped > 0) {
    const estimate = records.reduce((n, r) => n + (r.droppedEstimateUsd ?? 0), 0);
    lines.push("");
    lines.push(
      `${dropped} appel(s) interrompu(s) par le réseau : leur coût réel n'est pas mesurable (aucune réponse reçue). Ils sont comptés dans la dépense pour une estimation haute de ${fmt(estimate, 3)} $.`
    );
  }
  lines.push("");
  lines.push(
    "> Lecture : quelques annonces donnent une observation, pas une conclusion statistiquement fiable. Les latences varient d'un appel à l'autre pour une même requête."
  );
  lines.push("");
  lines.push("## Annonces");
  lines.push("");
  lines.push("| Annonce | Profil | Photos | Texte importé |");
  lines.push("|---|---|---|---|");
  for (const f of fixtures) {
    lines.push(`| ${f.id} | ${f.profile} | ${f.images.length} | ${f.extracted?.title || f.extracted?.description ? "oui" : "non"} |`);
  }
  lines.push("");
  lines.push("## Par variante");
  lines.push("");
  lines.push("| Variante | Réponses valides | Latence moy. | Latence méd. | Tokens entrée | Tokens sortie | dont réflexion | Coût / appel | Sortie vs réf. | Latence vs réf. |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const v of variants) {
    const all = byVariant(v.id).filter((r) => r.errorCode !== "budget_exhausted");
    const ok = all.filter((r) => r.ok);
    // Paired on the fixtures both sides completed, so a variant that failed
    // on the hardest listing is not flattered.
    const paired = ok
      .map((r) => ({ r, ref: reference.find((x) => x.fixtureId === r.fixtureId && x.repeat === r.repeat) }))
      .filter((p): p is { r: RunRecord; ref: RunRecord } => Boolean(p.ref));
    const ratio = (pick: (r: RunRecord) => number) =>
      paired.length ? mean(paired.map((p) => pick(p.r) / pick(p.ref))) : NaN;
    const outRatio = ratio((r) => r.outputTokens ?? NaN);
    const latRatio = ratio((r) => r.latencyMs);
    lines.push(
      `| ${v.label} | ${ok.length}/${all.length} | ${fmt(mean(ok.map((r) => r.latencyMs)) / 1000, 1)} s | ${fmt(median(ok.map((r) => r.latencyMs)) / 1000, 1)} s | ${fmt(mean(ok.map((r) => r.inputTokens ?? NaN)))} | ${fmt(mean(ok.map((r) => r.outputTokens ?? NaN)))} | ${fmt(mean(ok.map((r) => r.thinkingTokens ?? NaN)))} | ${fmt(mean(ok.map((r) => r.costUsd)), 4)} $ | ${v.id === REFERENCE_VARIANT_ID ? "—" : `${fmt((outRatio - 1) * 100)} %`} | ${v.id === REFERENCE_VARIANT_ID ? "—" : `${fmt((latRatio - 1) * 100)} %`} |`
    );
  }
  lines.push("");
  const failures = records.filter((r) => !r.ok);
  if (failures.length) {
    lines.push("### Échecs");
    lines.push("");
    for (const r of failures) lines.push(`- ${r.variantId} / ${r.fixtureId} : ${r.errorCode}${r.errorDetail ? ` — ${r.errorDetail}` : ""}`);
    lines.push("");
  }

  lines.push("## Contrôles automatiques (somme sur les réponses valides)");
  lines.push("");
  lines.push("| Variante | Écarts au schéma | Réf. photo invalides | Mentions de photo hors limites | Titres trop longs | Formulations interdites | Vouvoiement | Photos analysées / fournies | Priorités | Faiblesses | Plan d'action |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const v of variants) {
    const cs = byVariant(v.id).map((r) => r.checks).filter((c): c is OutputChecks => c !== null);
    if (!cs.length) {
      lines.push(`| ${v.label} | n/a | | | | | | | | | |`);
      continue;
    }
    lines.push(
      `| ${v.label} | ${sum(cs.map((c) => c.schemaViolations))} | ${sum(cs.map((c) => c.invalidImageRefs))} | ${sum(cs.map((c) => c.outOfRangePhotoMentions))} | ${sum(cs.map((c) => c.titlesOverLimit))} | ${sum(cs.map((c) => c.forbiddenClaims))} | ${sum(cs.map((c) => c.formalAddress))} | ${sum(cs.map((c) => c.photoAnalysisCount))}/${sum(cs.map((c) => c.imageCount))} | ${fmt(mean(cs.map((c) => c.counts.top_priorities)), 1)} | ${fmt(mean(cs.map((c) => c.counts.weaknesses)), 1)} | ${fmt(mean(cs.map((c) => c.counts.action_plan)), 1)} |`
    );
  }
  lines.push("");

  lines.push("## Répartition de la sortie par section (part des caractères, moyenne)");
  lines.push("");
  const sections = Array.from(
    new Set(records.flatMap((r) => (r.checks ? Object.keys(r.checks.sectionChars) : [])))
  );
  lines.push(`| Variante | ${sections.join(" | ")} |`);
  lines.push(`|---|${sections.map(() => "---").join("|")}|`);
  for (const v of variants) {
    const cs = byVariant(v.id).map((r) => r.checks).filter((c): c is OutputChecks => c !== null);
    if (!cs.length) continue;
    const cells = sections.map((s) => {
      const share = mean(cs.map((c) => (c.sectionChars[s] ?? 0) / sum(Object.values(c.sectionChars))));
      return `${fmt(share * 100)} %`;
    });
    lines.push(`| ${v.label} | ${cells.join(" | ")} |`);
  }
  lines.push("");

  const judged = records.filter((r) => r.judgment);
  if (JUDGE_MODEL) {
    lines.push(`## Juge de qualité à l'aveugle (${JUDGE_MODEL}), candidat contre référence`);
    lines.push("");
    lines.push(
      "> Notes de 1 à 5 attribuées par un modèle qui voit les photos, le texte et les deux rapports sans savoir lequel est lequel. C'est un avis de modèle, pas une vérité terrain."
    );
    lines.push("");
    lines.push(`| Variante | Paires jugées | ${JUDGE_CRITERIA.map((c) => `${c} (cand. / réf.)`).join(" | ")} | Affirmations non étayées (cand. / réf.) | Préféré : candidat / égal / référence |`);
    lines.push(`|---|---|${JUDGE_CRITERIA.map(() => "---").join("|")}|---|---|`);
    for (const v of variants) {
      const js = judged.filter((r) => r.variantId === v.id).map((r) => r.judgment as Judgment);
      if (!js.length) continue;
      const cells = JUDGE_CRITERIA.map(
        (c) => `${fmt(mean(js.map((j) => j.candidate[c])), 2)} / ${fmt(mean(js.map((j) => j.reference[c])), 2)}`
      );
      lines.push(
        `| ${v.label} | ${js.length} | ${cells.join(" | ")} | ${sum(js.map((j) => j.candidate.unsupported_claims))} / ${sum(js.map((j) => j.reference.unsupported_claims))} | ${js.filter((j) => j.preferred === "candidate").length} / ${js.filter((j) => j.preferred === "tie").length} / ${js.filter((j) => j.preferred === "reference").length} |`
      );
    }
    const judgeErrors = records.filter((r) => r.judgeError);
    if (judgeErrors.length) {
      lines.push("");
      for (const r of judgeErrors) lines.push(`- jugement échoué ${r.variantId} / ${r.fixtureId} : ${r.judgeError}`);
    }
    lines.push("");
  }

  // Cost formulas applied to what was measured. Business inputs (retry
  // rate, success rate, fees, VAT, exchange rate, analyses per sale) are
  // read from the environment; without them the section prints formulas
  // only, never a made-up figure.
  lines.push("## Coût par analyse (formules appliquées aux mesures)");
  lines.push("");
  lines.push("- coût d'un appel = (tokens entrée × prix entrée + tokens sortie × prix sortie) / 1 000 000");
  lines.push("- coût par tentative = coût d'un appel × (1 + taux de second appel)");
  lines.push("- coût par analyse réussie = coût par tentative / taux de réussite × (1 + tentatives en double par réussite)");
  lines.push("- marge sur une vente = prix HT − frais de paiement − coût IA de l'analyse vendue − coût IA des analyses gratuites nécessaires à cette vente");
  lines.push("");
  const retryRate = process.env.BENCH_RETRY_RATE ? Number(process.env.BENCH_RETRY_RATE) : null;
  const successRate = process.env.BENCH_SUCCESS_RATE ? Number(process.env.BENCH_SUCCESS_RATE) : null;
  if (retryRate !== null && successRate !== null) {
    const duplicates = envNumber("BENCH_DUPLICATE_ATTEMPTS", 0);
    lines.push(
      `Hypothèses fournies : second appel ${fmt(retryRate * 100, 1)} %, réussite ${fmt(successRate * 100, 1)} %, tentatives en double par réussite ${duplicates}.`
    );
    lines.push("");
    lines.push("| Variante | Par appel | Par tentative | Par analyse réussie | Pour 100 | Pour 1 000 |");
    lines.push("|---|---|---|---|---|---|");
    for (const v of variants) {
      const ok = byVariant(v.id).filter((r) => r.ok);
      if (!ok.length) continue;
      const perCall = mean(ok.map((r) => r.costUsd));
      const e = attemptEconomics({ costPerCallUsd: perCall, retryRate, successRate, duplicateAttemptsPerSuccess: duplicates });
      lines.push(
        `| ${v.label} | ${fmt(perCall, 4)} $ | ${fmt(e.costPerAttemptUsd, 4)} $ | ${fmt(e.costPerSuccessfulAnalysisUsd, 4)} $ | ${fmt(e.costPer100AnalysesUsd, 2)} $ | ${fmt(e.costPer1000AnalysesUsd, 2)} $ |`
      );
    }
    lines.push("");
    if (process.env.BENCH_SALE) {
      // {"priceEur":4.9,"paymentFeePercent":..,"paymentFeeFixedEur":..,"vatRate":..,"usdToEur":..,"analysesPerSale":..}
      const sale = JSON.parse(process.env.BENCH_SALE) as Omit<Parameters<typeof saleEconomics>[0], "costPerSuccessfulAnalysisUsd">;
      lines.push(`Vente : ${JSON.stringify(sale)}`);
      lines.push("");
      lines.push("| Variante | Prix HT | Frais de paiement | IA analyse vendue | IA analyses gratuites | Marge avant acquisition | Taux |");
      lines.push("|---|---|---|---|---|---|---|");
      for (const v of variants) {
        const ok = byVariant(v.id).filter((r) => r.ok);
        if (!ok.length) continue;
        const e = attemptEconomics({
          costPerCallUsd: mean(ok.map((r) => r.costUsd)),
          retryRate,
          successRate,
          duplicateAttemptsPerSuccess: duplicates,
        });
        const s = saleEconomics({ ...sale, costPerSuccessfulAnalysisUsd: e.costPerSuccessfulAnalysisUsd });
        lines.push(
          `| ${v.label} | ${fmt(s.revenueExVatEur, 2)} € | ${fmt(s.paymentFeesEur, 2)} € | ${fmt(s.aiCostOfSoldAnalysisEur, 3)} € | ${fmt(s.aiCostOfFreeAnalysesEur, 2)} € | ${fmt(s.marginBeforeAcquisitionEur, 2)} € | ${fmt(s.marginRate * 100, 1)} % |`
        );
      }
      lines.push("");
    }
  } else {
    lines.push("Taux de second appel et taux de réussite non fournis (BENCH_RETRY_RATE, BENCH_SUCCESS_RATE) : seules les formules sont données.");
    lines.push("");
  }

  lines.push("## Variantes");
  lines.push("");
  for (const v of variants) lines.push(`- **${v.label}** (\`${v.id}\`, ${v.options.model}) — ${v.purpose}`);
  lines.push("");
  return lines.join("\n");
}

// ---- entry point --------------------------------------------------------

it(
  "ai benchmark",
  async () => {
    if (!FIXTURES_DIR) {
      throw new Error("BENCH_FIXTURES is not set. See scripts/ai-benchmark/README.md -- this makes real, billed model calls.");
    }
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");

    const manifest = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, "manifest.json"), "utf-8")) as {
      fixtures: FixtureSpec[];
    };
    const specs = manifest.fixtures.filter((f) => FIXTURE_IDS.length === 0 || FIXTURE_IDS.includes(f.id));
    const variants = VARIANTS.filter((v) => (VARIANT_IDS.length === 0 ? !v.skipByDefault : VARIANT_IDS.includes(v.id)));
    if (specs.length === 0 || variants.length === 0) throw new Error("nothing to run: no fixture or no variant selected");

    if (FREEZE_ONLY) {
      for (const spec of specs) {
        try {
          const f = await loadFixture(spec);
          console.log(
            `[bench] fixture ${f.id} (${f.profile}): ${f.images.length} photo(s), titre ${f.extracted?.title ? "oui" : "non"}, description ${f.extracted?.description ? "oui" : "non"}`
          );
        } catch (err) {
          console.log(`[bench] fixture ${spec.id} (${spec.profile}): FAILED -- ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      return;
    }

    const outDir = process.env.BENCH_OUT ?? path.join(FIXTURES_DIR, `results-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    fs.mkdirSync(outDir, { recursive: true });

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 180_000, maxRetries: 0 });
    const budget = new Budget(MAX_USD);

    const fixtures: LoadedFixture[] = [];
    for (const spec of specs) fixtures.push(await loadFixture(spec));

    const previous: RunRecord[] = REUSE_PATH
      ? (JSON.parse(fs.readFileSync(REUSE_PATH, "utf-8")) as { records: RunRecord[] }).records.filter((r) => r.ok)
      : [];

    const done: RunRecord[] = [];
    const saveResults = (records: RunRecord[]) =>
      fs.writeFileSync(
        path.join(outDir, "results.json"),
        JSON.stringify({ toolName: ANALYSIS_TOOL_NAME, spentUsd: budget.spentUsd, records }, null, 2),
        "utf-8"
      );

    const tasks: (() => Promise<RunRecord>)[] = [];
    for (let repeat = 0; repeat < REPEATS; repeat++) {
      for (const fixture of fixtures) {
        for (const variant of variants) {
          const reused = previous.find(
            (r) => r.fixtureId === fixture.id && r.variantId === variant.id && r.repeat === repeat
          );
          if (reused) {
            done.push(reused);
            tasks.push(async () => reused);
            continue;
          }
          tasks.push(async () => {
            const r = await runGeneration({ client, fixture, variant, repeat, budget });
            console.log(
              `[bench] ${variant.id} / ${fixture.id} #${repeat} -> ${r.ok ? "ok" : `${r.errorCode} (${r.errorDetail ?? ""})`} ${fmt(r.latencyMs / 1000, 1)}s in=${r.inputTokens ?? "-"} out=${r.outputTokens ?? "-"} think=${r.thinkingTokens ?? "-"} spent=${fmt(budget.spentUsd, 3)}$`
            );
            // Saved after every call: an interrupted run (closed laptop,
            // lost network) keeps what it paid for and can be resumed with
            // BENCH_REUSE.
            done.push(r);
            saveResults(done);
            return r;
          });
        }
      }
    }
    const records = await pool(tasks, CONCURRENCY);

    if (JUDGE_MODEL) {
      const judgeTasks: (() => Promise<void>)[] = [];
      for (const record of records) {
        if (!record.ok || record.judgment || record.variantId === REFERENCE_VARIANT_ID) continue;
        if (JUDGE_VARIANT_IDS.length > 0 && !JUDGE_VARIANT_IDS.includes(record.variantId)) continue;
        const reference = records.find(
          (r) => r.ok && r.variantId === REFERENCE_VARIANT_ID && r.fixtureId === record.fixtureId && r.repeat === record.repeat
        );
        const fixture = fixtures.find((f) => f.id === record.fixtureId);
        if (!reference || !fixture) continue;
        judgeTasks.push(async () => {
          const reserveUsd = callCostUsd(JUDGE_MODEL, 40_000, 6_000, PRICES);
          if (!budget.reserve(reserveUsd)) {
            record.judgeError = "budget_exhausted";
            return;
          }
          try {
            const listingContent = buildAnalysisRequest({
              images: fixture.images,
              input: fixture.input,
              extractedListingText: fixture.extracted,
            }).messages[0].content as Anthropic.ContentBlockParam[];
            const judgment = await judgePair({
              client,
              model: JUDGE_MODEL,
              listingContent,
              reference: reference.output,
              candidate: record.output,
              seed: `${record.fixtureId}:${record.variantId}:${record.repeat}`,
              extra: JUDGE_EFFORT === "default" ? undefined : { output_config: { effort: JUDGE_EFFORT } },
            });
            budget.settle(reserveUsd, callCostUsd(judgment.model, judgment.inputTokens, judgment.outputTokens, PRICES));
            record.judgment = judgment;
            console.log(
              `[bench] judge ${record.variantId} / ${record.fixtureId} -> ${judgment.preferred} spent=${fmt(budget.spentUsd, 3)}$`
            );
          } catch (err) {
            budget.settle(reserveUsd, 0);
            record.judgeError = err instanceof Error ? err.message.slice(0, 300) : String(err);
            console.log(`[bench] judge ${record.variantId} / ${record.fixtureId} -> failed`);
          }
        });
      }
      await pool(judgeTasks, CONCURRENCY);
    }

    saveResults(records);
    const report = buildReport(records, variants, fixtures, budget.spentUsd);
    fs.writeFileSync(path.join(outDir, "report.md"), report, "utf-8");
    console.log(`\n${report}\n[bench] written to ${outDir}`);
  },
  60 * 60 * 1000
);
