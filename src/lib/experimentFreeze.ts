/**
 * Fixed experiment configuration (owner's decision, week of 23-29 Nov 2026).
 *
 * While `active`, every visitor -- new or returning -- gets ONE combination:
 *   Aha A/B (lib/ab.ts)               -> "B"
 *   Paywall (lib/paywallExperiment.ts) -> "control"
 *   Loader (lib/loaderExperiment.ts)   -> "immersive"
 *   Onboarding (lib/onboardingExperiment.ts) -> "background" (questions while
 *     the analysis already runs; owner's decision, 22 Nov 2026 evening)
 * It is the combination of the two sales of 17 and 19 Nov 2026 (two sales
 * prove nothing: this is a deliberate one-week bet, measured in
 * /admin/analytics "Configuration figée").
 *
 * How it applies: the variant readers (getAbVariant, getAbVariantServer,
 * getPaywallVariant(Server), getLoaderVariant, getOnboardingVariant) return
 * these values, and proxy.ts rewrites the experiment cookies to them, so the
 * page, the cookies and the analytics events always agree. The draw / resolve
 * functions and every variant's code are untouched.
 *
 * Rollback: set `active: false` -- the normal random draws resume (visitors
 * keep the cookie written during the freeze until it expires; change the
 * draws' shares if that matters).
 */
export const EXPERIMENT_FREEZE = {
  active: true,
  /** Tag added to every client analytics event while active. */
  id: "fixed_2026_11_23",
  /** Start of the measured week (dashboard comparison window). */
  startsAt: "2026-11-23T00:00:00+01:00",
  ab: "B",
  paywall: "control",
  loader: "immersive",
  onboarding: "background",
} as const;

export function experimentFreezeActive(): boolean {
  return EXPERIMENT_FREEZE.active;
}
