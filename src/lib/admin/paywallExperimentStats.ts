import type { EventRow } from "./analytics";

// Pure aggregation for the paywall presentation experiment
// (lib/paywallExperiment.ts), kept out of analytics.ts so the counting
// rules and the "is this conclusive" rule can be unit-tested without a
// database.
//
// Only events that carry a paywall_variant are counted: traffic from before
// the experiment has none and is ignored rather than mis-bucketed. Each
// step counts distinct visitors, so a visitor who reloads the page or opens
// the paywall twice is counted once.

export type PaywallVariantKey = "control" | "v2";
export type AbVariantKey = "A" | "B";

/** A share with its 95 % confidence interval (Wilson). All null when there is no denominator. */
export interface Proportion {
  successes: number;
  trials: number;
  rate: number | null;
  low: number | null;
  high: number | null;
}

export interface PaywallCellStats {
  visitors: number;
  analysesCompleted: number;
  resultsViewed: number;
  previewsViewed: number;
  paywallsViewed: number;
  unlockClicks: number;
  checkoutsStarted: number;
  /** Payment events (a visitor can pay twice: one-time, then Plus). */
  paymentsCompleted: number;
  /** Distinct visitors with at least one payment -- the numerator of every conversion below. */
  payingVisitors: number;
  revenue: number;
  /** The experiment's primary metric: visitors who clicked a plan / visitors who saw the paywall. */
  unlockPerPaywallViewer: Proportion;
  checkoutPerPaywallViewer: Proportion;
  /** Conversion per exposed visitor (saw a locked result page). */
  paymentPerResultViewer: Proportion;
  paymentPerAnalysis: Proportion;
  paymentPerPaywallViewer: Proportion;
  revenuePerResultViewer: number | null;
}

/**
 *  - insufficient_data: at least one variant has fewer than
 *    MIN_PAYWALL_VIEWERS paywall viewers; the rates are anecdotes.
 *  - inconclusive: enough viewers, but the two 95 % intervals overlap.
 *  - difference: the intervals do not overlap (a stricter test than
 *    p < 0.05). Still to be confirmed on payments, which are rarer.
 */
export type PaywallVerdict = "insufficient_data" | "inconclusive" | "difference";

export interface PaywallExperimentStats {
  control: PaywallCellStats;
  v2: PaywallCellStats;
  /** The same figures inside each arm of the "Aha moment" A/B test. */
  byAbVariant: Record<AbVariantKey, Record<PaywallVariantKey, PaywallCellStats>>;
  verdict: PaywallVerdict;
  minPaywallViewers: number;
}

export const MIN_PAYWALL_VIEWERS = 100;

const Z_95 = 1.96;

/** Wilson score interval: stays meaningful at small n and at 0 % / 100 %, unlike the normal approximation. */
export function proportion(successes: number, trials: number): Proportion {
  if (trials <= 0) return { successes, trials, rate: null, low: null, high: null };
  // A later step can count a visitor the earlier one missed (an event lost
  // on a bad connection): never report more than 100 %.
  const s = Math.min(successes, trials);
  const p = s / trials;
  const z2 = Z_95 * Z_95;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const half = (Z_95 * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / denominator;
  return { successes: s, trials, rate: p, low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

export function paywallVerdict(control: Proportion, v2: Proportion, minTrials = MIN_PAYWALL_VIEWERS): PaywallVerdict {
  if (control.trials < minTrials || v2.trials < minTrials) return "insufficient_data";
  if (control.low === null || control.high === null || v2.low === null || v2.high === null) return "insufficient_data";
  return control.high < v2.low || v2.high < control.low ? "difference" : "inconclusive";
}

function visitorOf(row: EventRow): string {
  return row.anonymous_id || row.session_id || "unknown";
}

interface Helpers {
  isPayment: (eventName: string) => boolean;
  revenueEur: (row: EventRow) => number;
}

function cellStats(rows: EventRow[], helpers: Helpers): PaywallCellStats {
  const distinct = (eventName: string) =>
    new Set(rows.filter((r) => r.event_name === eventName).map(visitorOf)).size;

  const analysesCompleted = distinct("analysis_completed");
  const resultsViewed = distinct("result_viewed");
  const paywallsViewed = distinct("paywall_viewed");
  const unlockClicks = distinct("unlock_clicked");
  const checkoutsStarted = distinct("checkout_started");
  const paymentRows = rows.filter((r) => helpers.isPayment(r.event_name));
  const payingVisitors = new Set(paymentRows.map(visitorOf)).size;
  const revenue = paymentRows.reduce((sum, r) => sum + helpers.revenueEur(r), 0);

  return {
    visitors: new Set(rows.map(visitorOf)).size,
    analysesCompleted,
    resultsViewed,
    previewsViewed: distinct("locked_preview_viewed"),
    paywallsViewed,
    unlockClicks,
    checkoutsStarted,
    paymentsCompleted: paymentRows.length,
    payingVisitors,
    revenue,
    unlockPerPaywallViewer: proportion(unlockClicks, paywallsViewed),
    checkoutPerPaywallViewer: proportion(checkoutsStarted, paywallsViewed),
    paymentPerResultViewer: proportion(payingVisitors, resultsViewed),
    paymentPerAnalysis: proportion(payingVisitors, analysesCompleted),
    paymentPerPaywallViewer: proportion(payingVisitors, paywallsViewed),
    revenuePerResultViewer: resultsViewed > 0 ? revenue / resultsViewed : null,
  };
}

export function computePaywallExperimentStats(rows: EventRow[], helpers: Helpers): PaywallExperimentStats {
  const of = (paywall: PaywallVariantKey, ab?: AbVariantKey) =>
    cellStats(
      rows.filter(
        (r) => r.metadata?.paywall_variant === paywall && (ab === undefined || r.metadata?.ab_variant === ab)
      ),
      helpers
    );

  const control = of("control");
  const v2 = of("v2");
  return {
    control,
    v2,
    byAbVariant: {
      A: { control: of("control", "A"), v2: of("v2", "A") },
      B: { control: of("control", "B"), v2: of("v2", "B") },
    },
    verdict: paywallVerdict(control.unlockPerPaywallViewer, v2.unlockPerPaywallViewer),
    minPaywallViewers: MIN_PAYWALL_VIEWERS,
  };
}

export function emptyPaywallExperimentStats(): PaywallExperimentStats {
  return computePaywallExperimentStats([], { isPayment: () => false, revenueEur: () => 0 });
}
