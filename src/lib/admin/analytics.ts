import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/env";

export type Period = "today" | "7d" | "30d";

// upload_started/upload_completed used to sit here, but upload_completed
// fired for URL-only submissions too (no screenshot involved), which is
// what produced impossible numbers like "completed" outnumbering
// "started". listing_input_submitted fires exactly once per method (see
// AnalyzeWizard.goToEmail) and replaces both as the funnel step -- the
// old events still fire unchanged elsewhere, just not used here anymore.
export const FUNNEL_STEPS: { key: string; label: string }[] = [
  { key: "landing_view", label: "Landing views" },
  { key: "cta_test_clicked", label: "CTA clicks" },
  { key: "listing_input_submitted", label: "Annonce soumise" },
  { key: "email_submitted", label: "Emails soumis" },
  { key: "analysis_started", label: "Analyses démarrées" },
  { key: "analysis_completed", label: "Analyses complétées" },
  { key: "free_result_viewed", label: "Résultats vus" },
  { key: "paywall_viewed", label: "Paywalls vus" },
  { key: "unlock_clicked", label: "Unlock clicks" },
  { key: "checkout_started", label: "Checkouts démarrés" },
  { key: "payment_completed", label: "Paiements complétés" },
];

interface EventRow {
  event_name: string;
  anonymous_id: string | null;
  session_id: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface AnalysisRow {
  id: string;
  email: string | null;
  overall_score: number;
  created_at: string;
}

interface PaymentRow {
  amount: number | null;
  status: string;
  created_at: string;
}

export interface FunnelStepResult {
  key: string;
  label: string;
  count: number;
  rateFromPrevious: number | null;
}

export interface SourceRow {
  source: string;
  views: number;
  analyses: number;
  paywalls: number;
  payments: number;
  revenue: number;
}

export interface CampaignRow {
  campaign: string;
  views: number;
  analyses: number;
  paywalls: number;
  payments: number;
  revenue: number;
}

export interface UserRow {
  email: string;
  analysisCount: number;
  lastScore: number;
  firstSeen: string;
  lastSeen: string;
}

const PLUS_PRICE_EUR = 6.9;

export interface PricingFunnelStep {
  key: string;
  label: string;
  count: number;
}

export interface PricingStats {
  // period-scoped
  oneTimeOfferClicks: number;
  plusOfferClicks: number;
  oneTimePayments: number;
  oneTimeRevenue: number;
  newSubscriptions: number;
  newSubscriptionRevenue: number;
  cancellations: number;
  paymentFailures: number;
  revenueTotal: number;
  funnel: PricingFunnelStep[];
  // all-time snapshot (not period-scoped -- these describe current state)
  activePlusSubscriptions: number;
  mrr: number;
}

export interface AnalysisPerformanceStats {
  // Attempts are deduplicated by the client-generated attemptId carried on
  // analysis_started/analysis_progress_90/analysis_completed/analysis_failed
  // (shipped alongside this instrumentation -- older events predating it
  // have no attemptId and are counted individually rather than matched).
  attemptsStarted: number;
  attemptsCompleted: number;
  attemptsFailed: number;
  attemptsAbandoned: number;
  completionRate: number | null;
  avgDurationS: number | null;
  medianDurationS: number | null;
  p75DurationS: number | null;
  p90DurationS: number | null;
  avgTimeBefore90S: number | null;
  avgFinalizingS: number | null;
  // Of the abandoned attempts, how many never reached the "finalizing"
  // (~90%) phase vs. abandoned while already finalizing.
  abandonedBeforeFinalizing: number;
  abandonedDuringFinalizing: number;
}

// Server-side step breakdown of a single analysis, read from the timings
// object /api/analyze returns and the client forwards onto its own
// analysis_completed event (see AnalyzeWizard.finishAndRedirect). Only
// analyses run after this instrumentation shipped carry these fields --
// older completed rows are simply excluded from each step's sample
// (sampleSize reflects that) rather than skewing the stats with zeros.
export interface StepTimingStats {
  avgS: number | null;
  medianS: number | null;
  p75S: number | null;
  p90S: number | null;
  sampleSize: number;
}

export interface StepTimings {
  urlExtraction: StepTimingStats;
  imagePreprocessing: StepTimingStats;
  aiCall: StepTimingStats;
  imageStorage: StepTimingStats;
  database: StepTimingStats;
  finalization: StepTimingStats;
  total: StepTimingStats;
}

// Per-method (lien Airbnb / capture / capture+lien) breakdown. Every
// relevant event carries its own input_method field (see
// AnalyzeWizard.inputMethod() and its propagation into payment_completed
// via the Stripe webhook's trackServerEvent), so each metric below is a
// direct group-by on that field -- no cross-referencing between event
// types needed.
export interface MethodStats {
  submissions: number;
  started: number;
  completed: number;
  failed: number;
  payments: number;
}

export interface MethodBreakdown {
  airbnbUrl: MethodStats;
  screenshot: MethodStats;
  mixed: MethodStats;
}

// "Aha moment" pre-paywall A/B test (marketing experiment -- distinct from
// GuestMirror's own A/B photo compare product feature). Only events that
// carry an ab_variant are counted; older events without one are ignored
// rather than mis-bucketed.
export interface AbVariantStats {
  visitors: number;
  analysesCompleted: number;
  resultsViewed: number;
  ahaMomentsViewed: number;
  unlockCtaClicks: number;
  paywallsViewed: number;
  unlockClicks: number;
  checkoutsStarted: number;
  paymentsCompleted: number;
  revenue: number;
  resultToPaywallRate: number | null;
  paywallToUnlockRate: number | null;
  unlockToCheckoutRate: number | null;
  checkoutToPaymentRate: number | null;
  resultToPaymentRate: number | null;
  revenuePerVisitor: number | null;
  revenuePerAnalysis: number | null;
  revenuePerPaywall: number | null;
}

export interface AbTestStats {
  A: AbVariantStats;
  B: AbVariantStats;
}

// Cross-tab for the "Profil des utilisateurs" admin block: how many
// biens/quel profil converts into which plan. Built entirely from
// analytics_events' own metadata (paywall_viewed / {plan}_offer_clicked /
// payment_completed already carry user_type + property_count_range, see
// StepProfile + Paywall.tsx + the webhook's trackServerEvent propagation)
// -- no join against the analyses table needed.
export interface ProfileSegmentStats {
  analysesCompleted: number;
  paywallsViewed: number;
  oneTimeChosen: number;
  plusChosen: number;
  lifetimeChosen: number;
  payments: number;
  revenue: number;
}

export type PropertyCountKey = "1" | "2-5" | "6-20" | "21+";
export type UserTypeKey = "host" | "concierge" | "cohost" | "other";

export interface UserProfileStats {
  byPropertyCount: Record<PropertyCountKey, ProfileSegmentStats>;
  byUserType: Record<UserTypeKey, ProfileSegmentStats>;
}

export interface AnalyticsDashboard {
  configured: boolean;
  period: Period;
  since: string;
  uniqueVisitors: number;
  funnel: FunnelStepResult[];
  globalConversionRate: number | null;
  revenue: number;
  bySource: SourceRow[];
  byCampaign: CampaignRow[];
  users: UserRow[];
  pricing: PricingStats;
  analysisPerformance: AnalysisPerformanceStats;
  stepTimings: StepTimings;
  methodBreakdown: MethodBreakdown;
  userProfile: UserProfileStats;
  abTest: AbTestStats;
  repeatUsage: {
    uniqueAnalysisUsers: number;
    totalAnalyses: number;
    avgAnalysesPerUser: number;
    usersWith2Plus: number;
    usersWith3Plus: number;
  };
}

const PAGE_SIZE = 1000;

/**
 * Supabase/PostgREST caps every response at a fixed max-rows setting
 * (1000 by default) regardless of any `.limit()` requested in code, and
 * truncates silently rather than erroring. analytics_events routinely
 * exceeds that within a 7d/30d window, so without pagination the
 * unordered/oldest-first truncation was silently dropping the most
 * recent rows -- including same-day unlock_clicked/checkout_started/
 * payment_completed events -- from every metric computed below.
 */
async function fetchAllRows<T>(
  query: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data } = await query(from, from + PAGE_SIZE - 1);
    const page = (data as T[] | null) ?? [];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

function periodSince(period: Period): Date {
  const now = new Date();
  if (period === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const days = period === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function distinctVisitor(row: EventRow): string {
  return row.anonymous_id || row.session_id || "unknown";
}

function metadataString(meta: Record<string, unknown> | null, path: string[]): string | null {
  let cur: unknown = meta;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === "string" && cur ? cur : null;
}

function metadataNumber(meta: Record<string, unknown> | null, key: string): number {
  const v = meta?.[key];
  return typeof v === "number" ? v : 0;
}

function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.floor(p * sortedAsc.length));
  return sortedAsc[idx];
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function emptyMethodStats(): MethodStats {
  return { submissions: 0, started: 0, completed: 0, failed: 0, payments: 0 };
}

function emptyProfileSegmentStats(): ProfileSegmentStats {
  return { analysesCompleted: 0, paywallsViewed: 0, oneTimeChosen: 0, plusChosen: 0, lifetimeChosen: 0, payments: 0, revenue: 0 };
}

function emptyStepTimingStats(): StepTimingStats {
  return { avgS: null, medianS: null, p75S: null, p90S: null, sampleSize: 0 };
}

function stepTimingStatsFor(rowsForEvent: EventRow[], field: string): StepTimingStats {
  const valuesS = rowsForEvent
    .map((r) => metadataNumber(r.metadata, field))
    .filter((ms) => ms > 0)
    .map((ms) => ms / 1000)
    .sort((a, b) => a - b);
  return {
    avgS: average(valuesS),
    medianS: percentile(valuesS, 0.5),
    p75S: percentile(valuesS, 0.75),
    p90S: percentile(valuesS, 0.9),
    sampleSize: valuesS.length,
  };
}

function emptyAbVariantStats(): AbVariantStats {
  return {
    visitors: 0,
    analysesCompleted: 0,
    resultsViewed: 0,
    ahaMomentsViewed: 0,
    unlockCtaClicks: 0,
    paywallsViewed: 0,
    unlockClicks: 0,
    checkoutsStarted: 0,
    paymentsCompleted: 0,
    revenue: 0,
    resultToPaywallRate: null,
    paywallToUnlockRate: null,
    unlockToCheckoutRate: null,
    checkoutToPaymentRate: null,
    resultToPaymentRate: null,
    revenuePerVisitor: null,
    revenuePerAnalysis: null,
    revenuePerPaywall: null,
  };
}

export async function getAnalyticsDashboard(period: Period): Promise<AnalyticsDashboard> {
  const empty: AnalyticsDashboard = {
    configured: false,
    period,
    since: periodSince(period).toISOString(),
    uniqueVisitors: 0,
    funnel: FUNNEL_STEPS.map((s) => ({ ...s, count: 0, rateFromPrevious: null })),
    globalConversionRate: null,
    revenue: 0,
    bySource: [],
    byCampaign: [],
    users: [],
    analysisPerformance: {
      attemptsStarted: 0,
      attemptsCompleted: 0,
      attemptsFailed: 0,
      attemptsAbandoned: 0,
      completionRate: null,
      avgDurationS: null,
      medianDurationS: null,
      p75DurationS: null,
      p90DurationS: null,
      avgTimeBefore90S: null,
      avgFinalizingS: null,
      abandonedBeforeFinalizing: 0,
      abandonedDuringFinalizing: 0,
    },
    stepTimings: {
      urlExtraction: emptyStepTimingStats(),
      imagePreprocessing: emptyStepTimingStats(),
      aiCall: emptyStepTimingStats(),
      imageStorage: emptyStepTimingStats(),
      database: emptyStepTimingStats(),
      finalization: emptyStepTimingStats(),
      total: emptyStepTimingStats(),
    },
    methodBreakdown: {
      airbnbUrl: emptyMethodStats(),
      screenshot: emptyMethodStats(),
      mixed: emptyMethodStats(),
    },
    userProfile: {
      byPropertyCount: {
        "1": emptyProfileSegmentStats(),
        "2-5": emptyProfileSegmentStats(),
        "6-20": emptyProfileSegmentStats(),
        "21+": emptyProfileSegmentStats(),
      },
      byUserType: {
        host: emptyProfileSegmentStats(),
        concierge: emptyProfileSegmentStats(),
        cohost: emptyProfileSegmentStats(),
        other: emptyProfileSegmentStats(),
      },
    },
    abTest: { A: emptyAbVariantStats(), B: emptyAbVariantStats() },
    pricing: {
      oneTimeOfferClicks: 0,
      plusOfferClicks: 0,
      oneTimePayments: 0,
      oneTimeRevenue: 0,
      newSubscriptions: 0,
      newSubscriptionRevenue: 0,
      cancellations: 0,
      paymentFailures: 0,
      revenueTotal: 0,
      funnel: [],
      activePlusSubscriptions: 0,
      mrr: 0,
    },
    repeatUsage: {
      uniqueAnalysisUsers: 0,
      totalAnalyses: 0,
      avgAnalysesPerUser: 0,
      usersWith2Plus: 0,
      usersWith3Plus: 0,
    },
  };

  if (!SUPABASE_CONFIGURED) return empty;
  const supabase = getSupabaseAdmin()!;
  const since = periodSince(period);

  const [events, analyses, activeSubs] = await Promise.all([
    fetchAllRows<EventRow>((from, to) =>
      supabase
        .from("analytics_events")
        .select("event_name, anonymous_id, session_id, source, metadata, created_at")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<AnalysisRow>((from, to) =>
      supabase.from("analyses").select("id, email, overall_score, created_at").range(from, to)
    ),
    fetchAllRows<{ subscription_status: string }>((from, to) =>
      supabase
        .from("subscriptions")
        .select("subscription_status")
        .in("subscription_status", ["active", "trialing"])
        .range(from, to)
    ),
  ]);

  const rows = events as EventRow[];
  const allAnalyses = analyses as AnalysisRow[];

  // ---- Funnel: distinct visitors per step, in order ----
  const visitorsByStep = new Map<string, Set<string>>();
  for (const step of FUNNEL_STEPS) visitorsByStep.set(step.key, new Set());
  const allVisitors = new Set<string>();

  for (const row of rows) {
    const visitor = distinctVisitor(row);
    allVisitors.add(visitor);
    const set = visitorsByStep.get(row.event_name);
    if (set) set.add(visitor);
  }

  const funnel: FunnelStepResult[] = FUNNEL_STEPS.map((step, i) => {
    const count = visitorsByStep.get(step.key)?.size ?? 0;
    const prevCount = i > 0 ? (visitorsByStep.get(FUNNEL_STEPS[i - 1].key)?.size ?? 0) : null;
    const rateFromPrevious = prevCount && prevCount > 0 ? count / prevCount : i === 0 ? null : 0;
    return { key: step.key, label: step.label, count, rateFromPrevious };
  });

  const landingCount = funnel[0]?.count ?? 0;
  const paymentCount = funnel[funnel.length - 1]?.count ?? 0;
  const globalConversionRate = landingCount > 0 ? paymentCount / landingCount : null;

  // ---- Revenue (from payment_completed events, amount is in cents) ----
  const paymentRows = rows.filter((r) => r.event_name === "payment_completed");
  const revenue = paymentRows.reduce((sum, r) => sum + metadataNumber(r.metadata, "amount") / 100, 0);

  // ---- By source ----
  const sourceMap = new Map<string, SourceRow>();
  function sourceBucket(source: string | null): SourceRow {
    const key = source || "direct";
    if (!sourceMap.has(key)) {
      sourceMap.set(key, { source: key, views: 0, analyses: 0, paywalls: 0, payments: 0, revenue: 0 });
    }
    return sourceMap.get(key)!;
  }
  const seenBySource: Record<string, Set<string>> = {};
  for (const row of rows) {
    const key = row.source || "direct";
    seenBySource[key] ??= new Set();
    const bucket = sourceBucket(row.source);
    const visitor = distinctVisitor(row);
    if (row.event_name === "landing_view" && !seenBySource[key].has(`v:${visitor}`)) {
      seenBySource[key].add(`v:${visitor}`);
      bucket.views += 1;
    }
    if (row.event_name === "analysis_completed" && !seenBySource[key].has(`a:${visitor}`)) {
      seenBySource[key].add(`a:${visitor}`);
      bucket.analyses += 1;
    }
    if (row.event_name === "paywall_viewed" && !seenBySource[key].has(`p:${visitor}`)) {
      seenBySource[key].add(`p:${visitor}`);
      bucket.paywalls += 1;
    }
    if (row.event_name === "payment_completed") {
      bucket.payments += 1;
      bucket.revenue += metadataNumber(row.metadata, "amount") / 100;
    }
  }
  const bySource = Array.from(sourceMap.values()).sort((a, b) => b.revenue - a.revenue || b.views - a.views);

  // ---- By campaign (from last_touch.campaign) ----
  const campaignMap = new Map<string, CampaignRow>();
  const seenByCampaign: Record<string, Set<string>> = {};
  for (const row of rows) {
    const campaign = metadataString(row.metadata, ["last_touch", "campaign"]) || "sans campagne";
    seenByCampaign[campaign] ??= new Set();
    if (!campaignMap.has(campaign)) {
      campaignMap.set(campaign, { campaign, views: 0, analyses: 0, paywalls: 0, payments: 0, revenue: 0 });
    }
    const bucket = campaignMap.get(campaign)!;
    const visitor = distinctVisitor(row);
    if (row.event_name === "landing_view" && !seenByCampaign[campaign].has(`v:${visitor}`)) {
      seenByCampaign[campaign].add(`v:${visitor}`);
      bucket.views += 1;
    }
    if (row.event_name === "analysis_completed" && !seenByCampaign[campaign].has(`a:${visitor}`)) {
      seenByCampaign[campaign].add(`a:${visitor}`);
      bucket.analyses += 1;
    }
    if (row.event_name === "paywall_viewed" && !seenByCampaign[campaign].has(`p:${visitor}`)) {
      seenByCampaign[campaign].add(`p:${visitor}`);
      bucket.paywalls += 1;
    }
    if (row.event_name === "payment_completed") {
      bucket.payments += 1;
      bucket.revenue += metadataNumber(row.metadata, "amount") / 100;
    }
  }
  const byCampaign = Array.from(campaignMap.values())
    .filter((c) => c.views > 0 || c.payments > 0)
    .sort((a, b) => b.revenue - a.revenue || b.views - a.views);

  // ---- Pricing: one-time vs Plus, which offer actually converts ----
  const countEvent = (name: string) => new Set(rows.filter((r) => r.event_name === name).map(distinctVisitor)).size;
  const oneTimePaymentRows = rows.filter((r) => r.event_name === "one_time_payment_completed");
  const oneTimeRevenue = oneTimePaymentRows.reduce((sum, r) => sum + metadataNumber(r.metadata, "amount") / 100, 0);
  const newSubscriptions = countEvent("subscription_started");
  const newSubscriptionRevenue = newSubscriptions * PLUS_PRICE_EUR;

  const pricingFunnel: PricingFunnelStep[] = [
    { key: "paywall_viewed", label: "Paywall vu", count: countEvent("paywall_viewed") },
    { key: "one_time_offer_clicked", label: "Analyse unique cliquée", count: countEvent("one_time_offer_clicked") },
    { key: "plus_offer_clicked", label: "Plus cliqué", count: countEvent("plus_offer_clicked") },
    { key: "one_time_payment_completed", label: "Paiement analyse unique", count: countEvent("one_time_payment_completed") },
    { key: "subscription_started", label: "Abonnement démarré", count: countEvent("subscription_started") },
  ];

  const pricing: PricingStats = {
    oneTimeOfferClicks: countEvent("one_time_offer_clicked"),
    plusOfferClicks: countEvent("plus_offer_clicked"),
    oneTimePayments: countEvent("one_time_payment_completed"),
    oneTimeRevenue,
    newSubscriptions,
    newSubscriptionRevenue,
    cancellations: countEvent("subscription_cancelled"),
    paymentFailures: countEvent("subscription_payment_failed"),
    revenueTotal: oneTimeRevenue + newSubscriptionRevenue,
    funnel: pricingFunnel,
    activePlusSubscriptions: activeSubs?.length ?? 0,
    mrr: (activeSubs?.length ?? 0) * PLUS_PRICE_EUR,
  };

  // ---- Analysis loading performance: how long it really takes, and where
  // people give up. Attempts are matched by the client-generated attemptId
  // carried on analysis_started / analysis_progress_90 / analysis_completed
  // / analysis_failed (see AnalyzeWizard.tsx) rather than by session, which
  // breaks down across retries and rescans within the same session. ----
  const startedRows = rows.filter((r) => r.event_name === "analysis_started");
  const completedRows = rows.filter((r) => r.event_name === "analysis_completed");
  const failedRows = rows.filter((r) => r.event_name === "analysis_failed");
  const progress90Rows = rows.filter((r) => r.event_name === "analysis_progress_90");

  function distinctAttemptCount(rowsForEvent: EventRow[]): number {
    const seen = new Set<string>();
    let count = 0;
    for (const r of rowsForEvent) {
      const id = metadataString(r.metadata, ["attemptId"]);
      if (id) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      count++;
    }
    return count;
  }

  const startedAtByAttempt = new Map<string, number>();
  for (const r of startedRows) {
    const id = metadataString(r.metadata, ["attemptId"]);
    if (id && !startedAtByAttempt.has(id)) startedAtByAttempt.set(id, new Date(r.created_at).getTime());
  }
  const progress90AtByAttempt = new Map<string, number>();
  for (const r of progress90Rows) {
    const id = metadataString(r.metadata, ["attemptId"]);
    if (id) progress90AtByAttempt.set(id, new Date(r.created_at).getTime());
  }
  const resolvedAttemptIds = new Set<string>();
  for (const r of [...completedRows, ...failedRows]) {
    const id = metadataString(r.metadata, ["attemptId"]);
    if (id) resolvedAttemptIds.add(id);
  }

  const durationsS = completedRows
    .map((r) => metadataNumber(r.metadata, "duration_ms"))
    .filter((ms) => ms > 0)
    .map((ms) => ms / 1000)
    .sort((a, b) => a - b);

  const timeBefore90S: number[] = [];
  for (const [id, at] of progress90AtByAttempt.entries()) {
    const startMs = startedAtByAttempt.get(id);
    if (startMs != null) timeBefore90S.push((at - startMs) / 1000);
  }

  const finalizingDurationsS: number[] = [];
  for (const r of [...completedRows, ...failedRows]) {
    const id = metadataString(r.metadata, ["attemptId"]);
    const p90At = id ? progress90AtByAttempt.get(id) : undefined;
    if (p90At != null) {
      finalizingDurationsS.push((new Date(r.created_at).getTime() - p90At) / 1000);
    }
  }

  // An attempt is "abandoned" once it started, was never resolved
  // (completed or failed), and it's been at least 5 minutes since it
  // started -- comfortably above the observed p90 (~90s) so a genuinely
  // slow-but-still-running analysis isn't miscounted as a drop-off.
  const ABANDON_THRESHOLD_MS = 5 * 60 * 1000;
  const nowMs = Date.now();
  let abandonedBeforeFinalizing = 0;
  let abandonedDuringFinalizing = 0;
  for (const [id, startMs] of startedAtByAttempt.entries()) {
    if (resolvedAttemptIds.has(id)) continue;
    if (nowMs - startMs < ABANDON_THRESHOLD_MS) continue;
    if (progress90AtByAttempt.has(id)) abandonedDuringFinalizing++;
    else abandonedBeforeFinalizing++;
  }
  const attemptsAbandoned = abandonedBeforeFinalizing + abandonedDuringFinalizing;

  const attemptsStarted = distinctAttemptCount(startedRows);
  const attemptsCompleted = distinctAttemptCount(completedRows);
  const attemptsFailed = distinctAttemptCount(failedRows);

  const analysisPerformance: AnalysisPerformanceStats = {
    attemptsStarted,
    attemptsCompleted,
    attemptsFailed,
    attemptsAbandoned,
    completionRate: attemptsStarted > 0 ? attemptsCompleted / attemptsStarted : null,
    avgDurationS: average(durationsS),
    medianDurationS: percentile(durationsS, 0.5),
    p75DurationS: percentile(durationsS, 0.75),
    p90DurationS: percentile(durationsS, 0.9),
    avgTimeBefore90S: average(timeBefore90S),
    avgFinalizingS: average(finalizingDurationsS),
    abandonedBeforeFinalizing,
    abandonedDuringFinalizing,
  };

  // ---- Server-side step breakdown (see /api/analyze's `timings` return
  // value, forwarded into analysis_completed's metadata) -- where the
  // total analysis time is actually spent, independent of the client-side
  // 90%-cap progress bar used above. ----
  const stepTimings: StepTimings = {
    urlExtraction: stepTimingStatsFor(completedRows, "url_extraction_duration_ms"),
    imagePreprocessing: stepTimingStatsFor(completedRows, "image_preprocessing_duration_ms"),
    aiCall: stepTimingStatsFor(completedRows, "ai_call_duration_ms"),
    imageStorage: stepTimingStatsFor(completedRows, "image_storage_duration_ms"),
    database: stepTimingStatsFor(completedRows, "database_duration_ms"),
    finalization: stepTimingStatsFor(completedRows, "finalization_duration_ms"),
    total: stepTimingStatsFor(completedRows, "total_duration_ms"),
  };

  // ---- Per-method breakdown (lien Airbnb / capture / capture+lien).
  // Every event below carries its own input_method field directly (see
  // AnalyzeWizard.inputMethod() and its propagation into payment_completed
  // via the webhook), so this is just a group-by per event type -- no
  // cross-referencing between event types, and no risk of a screenshot
  // submission ever counting toward the airbnb_url bucket or vice versa. ----
  const METHOD_KEYS = ["airbnb_url", "screenshot", "mixed"] as const;
  type MethodKey = (typeof METHOD_KEYS)[number];

  function methodOf(r: EventRow): MethodKey | null {
    const m = metadataString(r.metadata, ["input_method"]);
    return m === "airbnb_url" || m === "screenshot" || m === "mixed" ? (m as MethodKey) : null;
  }
  // attemptId when present (started/completed/failed all carry one),
  // falling back to visitor for events that don't (listing_input_submitted
  // fires before attemptId exists).
  function methodDedupeKey(r: EventRow): string {
    return metadataString(r.metadata, ["attemptId"]) || distinctVisitor(r);
  }

  function countRowsByMethod(rowsForEvent: EventRow[]): Record<MethodKey, number> {
    const result: Record<MethodKey, number> = { airbnb_url: 0, screenshot: 0, mixed: 0 };
    for (const key of METHOD_KEYS) {
      result[key] = new Set(
        rowsForEvent.filter((r) => methodOf(r) === key).map(methodDedupeKey)
      ).size;
    }
    return result;
  }

  const submissionRows = rows.filter((r) => r.event_name === "listing_input_submitted");
  const paymentCompletedRows = rows.filter((r) => r.event_name === "payment_completed");

  const submissionsByMethod = countRowsByMethod(submissionRows);
  const startedByMethod = countRowsByMethod(startedRows);
  const completedByMethod = countRowsByMethod(completedRows);
  const failedByMethod = countRowsByMethod(failedRows);
  const paymentsByMethod: Record<MethodKey, number> = { airbnb_url: 0, screenshot: 0, mixed: 0 };
  for (const key of METHOD_KEYS) {
    paymentsByMethod[key] = paymentCompletedRows.filter((r) => methodOf(r) === key).length;
  }

  function methodStatsFor(key: MethodKey): MethodStats {
    return {
      submissions: submissionsByMethod[key],
      started: startedByMethod[key],
      completed: completedByMethod[key],
      failed: failedByMethod[key],
      payments: paymentsByMethod[key],
    };
  }

  const methodBreakdown: MethodBreakdown = {
    airbnbUrl: methodStatsFor("airbnb_url"),
    screenshot: methodStatsFor("screenshot"),
    mixed: methodStatsFor("mixed"),
  };

  // ---- User profile cross-tab (nombre de biens / type d'utilisateur x
  // analyses / paywalls / plan choisi / paiements). Every event below
  // already carries user_type + property_count_range directly in its
  // metadata (see StepProfile, Paywall.tsx, and the webhook's
  // trackServerEvent propagation for payment_completed) -- same
  // attemptId-or-visitor dedupe as methodDedupeKey above for analyses/
  // paywalls; clicks and payments are counted as raw events since each is
  // already a single discrete action. ----
  const PROPERTY_COUNT_KEYS = ["1", "2-5", "6-20", "21+"] as const;
  const USER_TYPE_KEYS = ["host", "concierge", "cohost", "other"] as const;

  function propertyCountOf(r: EventRow): PropertyCountKey | null {
    const v = metadataString(r.metadata, ["property_count_range"]);
    return (PROPERTY_COUNT_KEYS as readonly string[]).includes(v ?? "") ? (v as PropertyCountKey) : null;
  }
  function userTypeOf(r: EventRow): UserTypeKey | null {
    const v = metadataString(r.metadata, ["user_type"]);
    return (USER_TYPE_KEYS as readonly string[]).includes(v ?? "") ? (v as UserTypeKey) : null;
  }

  const paywallRows = rows.filter((r) => r.event_name === "paywall_viewed");
  const oneTimeClickRows = rows.filter((r) => r.event_name === "one_time_offer_clicked");
  const plusClickRows = rows.filter((r) => r.event_name === "plus_offer_clicked");
  const lifetimeClickRows = rows.filter((r) => r.event_name === "lifetime_offer_clicked");

  function distinctCountBySegment<K extends string>(
    rowsForEvent: EventRow[],
    segmentOf: (r: EventRow) => K | null,
    keys: readonly K[],
    dedupeKeyFn: (r: EventRow) => string
  ): Record<K, number> {
    const result = {} as Record<K, number>;
    const seen = {} as Record<K, Set<string>>;
    for (const k of keys) {
      result[k] = 0;
      seen[k] = new Set();
    }
    for (const r of rowsForEvent) {
      const seg = segmentOf(r);
      if (!seg) continue;
      const dk = dedupeKeyFn(r);
      if (seen[seg].has(dk)) continue;
      seen[seg].add(dk);
      result[seg]++;
    }
    return result;
  }

  function rawCountBySegment<K extends string>(
    rowsForEvent: EventRow[],
    segmentOf: (r: EventRow) => K | null,
    keys: readonly K[]
  ): Record<K, number> {
    const result = {} as Record<K, number>;
    for (const k of keys) result[k] = 0;
    for (const r of rowsForEvent) {
      const seg = segmentOf(r);
      if (seg) result[seg]++;
    }
    return result;
  }

  function revenueBySegment<K extends string>(
    rowsForEvent: EventRow[],
    segmentOf: (r: EventRow) => K | null,
    keys: readonly K[]
  ): Record<K, number> {
    const result = {} as Record<K, number>;
    for (const k of keys) result[k] = 0;
    for (const r of rowsForEvent) {
      const seg = segmentOf(r);
      if (seg) result[seg] += metadataNumber(r.metadata, "amount") / 100;
    }
    return result;
  }

  function buildUserProfileDimension<K extends string>(
    segmentOf: (r: EventRow) => K | null,
    keys: readonly K[]
  ): Record<K, ProfileSegmentStats> {
    const completed = distinctCountBySegment(completedRows, segmentOf, keys, methodDedupeKey);
    const paywalls = distinctCountBySegment(paywallRows, segmentOf, keys, distinctVisitor);
    const oneTime = rawCountBySegment(oneTimeClickRows, segmentOf, keys);
    const plus = rawCountBySegment(plusClickRows, segmentOf, keys);
    const lifetime = rawCountBySegment(lifetimeClickRows, segmentOf, keys);
    const payments = rawCountBySegment(paymentCompletedRows, segmentOf, keys);
    const revenue = revenueBySegment(paymentCompletedRows, segmentOf, keys);
    const result = {} as Record<K, ProfileSegmentStats>;
    for (const k of keys) {
      result[k] = {
        analysesCompleted: completed[k],
        paywallsViewed: paywalls[k],
        oneTimeChosen: oneTime[k],
        plusChosen: plus[k],
        lifetimeChosen: lifetime[k],
        payments: payments[k],
        revenue: revenue[k],
      };
    }
    return result;
  }

  const userProfile: UserProfileStats = {
    byPropertyCount: buildUserProfileDimension(propertyCountOf, PROPERTY_COUNT_KEYS),
    byUserType: buildUserProfileDimension(userTypeOf, USER_TYPE_KEYS),
  };

  // ---- "Aha moment" pre-paywall A/B test ----
  function computeAbVariantStats(variant: "A" | "B"): AbVariantStats {
    const variantRows = rows.filter((r) => r.metadata?.ab_variant === variant);
    const countDistinct = (eventName: string) =>
      new Set(variantRows.filter((r) => r.event_name === eventName).map(distinctVisitor)).size;

    const visitors = new Set(variantRows.map(distinctVisitor)).size;
    const analysesCompleted = countDistinct("analysis_completed");
    const resultsViewed = countDistinct("result_viewed");
    const ahaMomentsViewed = countDistinct("aha_viewed");
    const unlockCtaClicks = countDistinct("unlock_cta_clicked");
    const paywallsViewed = countDistinct("paywall_viewed");
    const unlockClicks = countDistinct("unlock_clicked");
    const checkoutsStarted = countDistinct("checkout_started");
    const paymentRows = variantRows.filter((r) => r.event_name === "payment_completed");
    const paymentsCompleted = paymentRows.length;
    const revenue = paymentRows.reduce((sum, r) => sum + metadataNumber(r.metadata, "amount") / 100, 0);

    return {
      visitors,
      analysesCompleted,
      resultsViewed,
      ahaMomentsViewed,
      unlockCtaClicks,
      paywallsViewed,
      unlockClicks,
      checkoutsStarted,
      paymentsCompleted,
      revenue,
      resultToPaywallRate: resultsViewed > 0 ? paywallsViewed / resultsViewed : null,
      paywallToUnlockRate: paywallsViewed > 0 ? unlockClicks / paywallsViewed : null,
      unlockToCheckoutRate: unlockClicks > 0 ? checkoutsStarted / unlockClicks : null,
      checkoutToPaymentRate: checkoutsStarted > 0 ? paymentsCompleted / checkoutsStarted : null,
      resultToPaymentRate: resultsViewed > 0 ? paymentsCompleted / resultsViewed : null,
      revenuePerVisitor: visitors > 0 ? revenue / visitors : null,
      revenuePerAnalysis: analysesCompleted > 0 ? revenue / analysesCompleted : null,
      revenuePerPaywall: paywallsViewed > 0 ? revenue / paywallsViewed : null,
    };
  }

  const abTest: AbTestStats = { A: computeAbVariantStats("A"), B: computeAbVariantStats("B") };

  // ---- Repeat usage + user list (all-time, from the analyses table itself) ----
  const perEmail = new Map<string, AnalysisRow[]>();
  for (const a of allAnalyses) {
    const key = a.email || `anon:${a.id}`;
    if (!perEmail.has(key)) perEmail.set(key, []);
    perEmail.get(key)!.push(a);
  }
  const counts = Array.from(perEmail.values()).map((v) => v.length);
  const uniqueAnalysisUsers = perEmail.size;
  const totalAnalyses = allAnalyses.length;

  const users: UserRow[] = Array.from(perEmail.entries())
    .filter(([email]) => !email.startsWith("anon:"))
    .map(([email, userAnalyses]) => {
      const sorted = [...userAnalyses].sort((a, b) => a.created_at.localeCompare(b.created_at));
      return {
        email,
        analysisCount: sorted.length,
        lastScore: sorted[sorted.length - 1].overall_score,
        firstSeen: sorted[0].created_at,
        lastSeen: sorted[sorted.length - 1].created_at,
      };
    })
    .sort((a, b) => b.analysisCount - a.analysisCount || b.lastSeen.localeCompare(a.lastSeen));

  return {
    configured: true,
    period,
    since: since.toISOString(),
    uniqueVisitors: allVisitors.size,
    funnel,
    globalConversionRate,
    revenue,
    bySource,
    byCampaign,
    users,
    pricing,
    analysisPerformance,
    stepTimings,
    methodBreakdown,
    userProfile,
    abTest,
    repeatUsage: {
      uniqueAnalysisUsers,
      totalAnalyses,
      avgAnalysesPerUser: uniqueAnalysisUsers > 0 ? totalAnalyses / uniqueAnalysisUsers : 0,
      usersWith2Plus: counts.filter((c) => c >= 2).length,
      usersWith3Plus: counts.filter((c) => c >= 3).length,
    },
  };
}
