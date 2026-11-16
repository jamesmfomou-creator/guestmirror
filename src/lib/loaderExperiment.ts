/**
 * Analysis loader experiment, version 1 ("loader_immersive_v1").
 *
 * A third, independent experiment next to the "Aha moment" A/B test
 * (lib/ab.ts) and the paywall presentation test (lib/paywallExperiment.ts).
 * Own cookie, own metadata key: a visitor is in A or B, in "control" or "v2"
 * for the paywall, and separately in "control" or "immersive" here.
 *
 *   control    the loader of the visitor's A/B arm, unchanged
 *              (StepAnalyzing for A, AnalysisAhaFlow for B).
 *   immersive  AnalysisImmersive: the visitor's own photos, title and
 *              description shown while the analysis runs. Same request,
 *              same model, same result page.
 *
 * Primary question: does it reduce abandonment during the wait (and so
 * increase the share of visitors who see their score)?
 *
 * Rollback without a deploy revert: set LOADER_IMMERSIVE_SHARE to 0.
 * Visitors already assigned keep their cookie, so resolveLoaderVariant()
 * maps them back to control while the share is 0.
 */

export const LOADER_EXPERIMENT_ID = "loader_immersive_v1";
export const LOADER_COOKIE_NAME = "gm_ld";
export const LOADER_VARIANTS = ["control", "immersive"] as const;
export type LoaderVariant = (typeof LOADER_VARIANTS)[number];

/** Share of new visitors assigned to "immersive" (0 = experiment off, everyone sees control). */
export const LOADER_IMMERSIVE_SHARE = 0.5;

export function isLoaderVariant(value: unknown): value is LoaderVariant {
  return value === "control" || value === "immersive";
}

/** Draws a variant for a visitor who has none yet. `random` and `share` are injectable for tests. */
export function drawLoaderVariant(random: () => number = Math.random, share = LOADER_IMMERSIVE_SHARE): LoaderVariant {
  return random() < share ? "immersive" : "control";
}

/** What a stored cookie value means today: anything unknown, or immersive while switched off, is control. */
export function resolveLoaderVariant(
  cookieValue: string | null | undefined,
  share = LOADER_IMMERSIVE_SHARE
): LoaderVariant {
  if (share <= 0) return "control";
  return isLoaderVariant(cookieValue) ? cookieValue : "control";
}

/**
 * Client-side read. Never assigns: proxy.ts is the only place a variant is
 * drawn, so a visitor without the cookie sees control and their events say
 * control too.
 */
export function getLoaderVariant(): LoaderVariant {
  if (typeof document === "undefined") return "control";
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOADER_COOKIE_NAME}=([^;]*)`));
  return resolveLoaderVariant(match ? decodeURIComponent(match[1]) : null);
}
